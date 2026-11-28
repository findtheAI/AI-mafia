import { randomBytes, randomInt } from 'node:crypto';
import type { GamePhase, GameState, PublicRoom, RoomStatus } from '@ai-mafia/shared';
import { generateNickname } from './nicknames.js';
import fs from 'node:fs'; 

// 방 상태: waiting(대기실) -> playing(채팅·투표 진행) -> ended(결과 공개)
// 상태가 바뀌면 소켓으로 room:statusChanged를 보내서 화면을 옮기게 한다. (socket.ts의 announceStatus)
export type { PublicPlayer, PublicRoom, RoomStatus } from '@ai-mafia/shared';

export interface Player {
  id: number; // 방 안에서 1, 2, 3... 순서로 붙는 번호. 화면에서 "나"를 찾는 데만 쓴다. (추측 가능하므로 본인 확인용 아님)
  token: string; // 본인 확인용 비밀 값. REST 응답으로 본인에게만 주고, 방 정보(toPublicRoom)에는 절대 넣지 않는다.
  nickname: string;
  isHost: boolean;
  joinedAt: number;
  connections: number; // 지금 열려 있는 소켓 연결 수 (탭을 여러 개 열 수 있다)
  lastSeenAt: number; // 마지막으로 연결되거나 끊긴 시각
  announced: boolean; // room:playerJoined를 이미 보냈는지 (화면을 옮기며 재연결해도 알림이 겹치지 않게)
}

// AI는 players에 들어가지 않는다. (게임 시작 때 합류하고, 결과 공개 전에는 화면에 보내지 않는다)
export interface AiPlayer {
  nickname: string;
}

export interface Room {
  code: string;
  status: RoomStatus;
  players: Player[];
  nextPlayerId: number;
  // 아래 두 값은 채팅/투표 담당 코드가 채운다. 결과 API는 이 값을 읽어서 계산만 한다.
  ai: AiPlayer | null;
  votes: Record<string, string>; // 투표한 닉네임 -> 투표 받은 닉네임
  createdAt: number;
  lastActiveAt: number;
  theme: string;
  gameState: GameState;
}

export class RoomError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// 헷갈리는 문자(0/O, 1/I/L)를 뺀 방 코드용 문자 집합
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export const MAX_PLAYERS = 6; // 기능 정의서: 정원 6명
export const MIN_PLAYERS_TO_START = 3; // 기능 정의서: 사람 3명부터 시작 가능
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 마지막 활동 후 2시간
// 방 만들기/입장(REST) 뒤에 소켓이 연결되지 않은 채로 이 시간이 지나면, 대기실에서는 나간 것으로 본다.
export const STALE_PLAYER_MS = 15 * 1000;

const rooms = new Map<string, Room>(); // code -> room

function generateCode(): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += ALPHABET.charAt(randomInt(ALPHABET.length));
    }
    if (!rooms.has(code)) return code;
  }
  throw new RoomError(503, 'CODE_EXHAUSTED', 'Could not generate a room code. Try again.');
}

// 주제 파일을 읽고 랜덤하게 뽑아서 리턴하는 도우미 함수
function getTheme() {
  const themes = fs.readFileSync('./src/resources/themes.txt', 'utf8')
      .split('\n')
      .map((line: string) => line.trim())
      .filter(Boolean);
  return themes[Math.floor(Math.random() * themes.length)];
}

// 주제를 새로고침해주는 함수 (theme API 에 사용된다)
export function updateTheme(rawCode: string){
  const code = normalizeCode(rawCode);
  const room = getRoom(code);
  var newTheme = getTheme(); 
  while(newTheme == room.theme){
    newTheme = getTheme() // 중복이 아닐때까지 새로고침
  }
  room.theme = newTheme;
  return room;
}

function normalizeCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

function takenNicknames(room: Room): Set<string> {
  const taken = new Set(room.players.map((p) => p.nickname));
  if (room.ai) taken.add(room.ai.nickname);
  return taken;
}

function addPlayer(room: Room, isHost: boolean): Player {
  const player: Player = {
    id: room.nextPlayerId,
    token: randomBytes(16).toString('hex'),
    nickname: generateNickname(takenNicknames(room)),
    isHost,
    joinedAt: Date.now(),
    connections: 0,
    lastSeenAt: Date.now(),
    announced: false,
  };
  room.nextPlayerId += 1;
  room.players.push(player);
  room.lastActiveAt = Date.now();
  return player;
}

function parsePlayerId(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new RoomError(400, 'INVALID_PLAYER_ID', 'playerId must be an integer.');
  }
  return raw;
}

function requireMember(room: Room, rawPlayerId: unknown): Player {
  const playerId = parsePlayerId(rawPlayerId);
  const player = room.players.find((p) => p.id === playerId);
  if (!player) {
    throw new RoomError(403, 'NOT_A_MEMBER', 'You are not in this room.');
  }
  return player;
}

// 방 만들기: 만든 사람이 방장으로 들어가고, 닉네임은 서버가 정해준다.
export function createRoom(): { room: Room; player: Player } {
  const now = Date.now();
  const defaultPhase: GamePhase = 'wait'
  const votesRecord: Record<string, string> = {}
  const gameState: GameState = {
    phase: defaultPhase,
    phaseEndsAt: null,
    votes: votesRecord,
  }
  
  const room: Room = {
    code: generateCode(),
    status: 'waiting',
    players: [],
    nextPlayerId: 1,
    ai: null,
    votes: {},
    createdAt: now,
    lastActiveAt: now,
    theme: getTheme(),
    gameState: gameState,
  };
  const player = addPlayer(room, true);
  rooms.set(room.code, room);
  return { room, player };
}

export function getRoom(rawCode: unknown): Room {
  const code = normalizeCode(rawCode);
  if (code === '') {
    throw new RoomError(400, 'ROOM_CODE_REQUIRED', 'Room code required.');
  }
  const room = rooms.get(code);
  if (!room) {
    throw new RoomError(404, 'ROOM_NOT_FOUND', 'Invalid room code or room does not exist.');
  }
  return room;
}

export function joinRoom(rawCode: unknown): { room: Room; player: Player } {
  const room = getRoom(rawCode);
  if (room.status !== 'waiting') {
    throw new RoomError(409, 'ROOM_NOT_JOINABLE', 'The game has already started.');
  }
  if (room.players.length >= MAX_PLAYERS) {
    throw new RoomError(409, 'ROOM_FULL', 'The room is full.');
  }
  const player = addPlayer(room, false);
  return { room, player };
}

// 다시 하기: 결과가 나온 방을 대기실 상태로 되돌린다. 닉네임은 모두 새로 뽑는다.
// 이미 대기실이면 아무것도 바꾸지 않고(reset: false) 그대로 돌려준다. (누가 먼저 눌러도 같은 결과가 되도록)
export function rematchRoom(
  rawCode: unknown,
  rawPlayerId: unknown,
): { room: Room; player: Player; reset: boolean } {
  const room = getRoom(rawCode);
  const player = requireMember(room, rawPlayerId);

  if (room.status === 'playing') {
    throw new RoomError(409, 'ROOM_NOT_ENDED', 'The game is still in progress.');
  }
  let reset = false;
  if (room.status === 'ended') {
    room.status = 'waiting';
    room.ai = null;
    room.votes = {};
    const taken = new Set<string>();
    for (const p of room.players) {
      p.nickname = generateNickname(taken);
      taken.add(p.nickname);
    }
    reset = true;
  }
  room.lastActiveAt = Date.now();
  return { room, player, reset };
}

// 방에서 한 명을 빼낸다. 방장이 나가면 다음 사람이 방장이 되고, 마지막 사람이 나가면 방이 사라진다.
// 반환: 남은 방(방이 사라졌으면 null)과 나간 사람
function detachPlayer(room: Room, index: number): { room: Room | null; player: Player } | null {
  const player = room.players[index];
  if (!player) return null;

  room.players.splice(index, 1);
  if (room.players.length === 0) {
    rooms.delete(room.code);
    return { room: null, player };
  }
  if (player.isHost) {
    const nextHost = room.players[0];
    if (nextHost) nextHost.isHost = true;
  }
  room.lastActiveAt = Date.now();
  return { room, player };
}

// 나가기. 이미 없는 방/플레이어여도 에러 없이 null을 돌려준다. (나가기 버튼은 몇 번 눌려도 괜찮아야 한다)
export function leaveRoom(rawCode: unknown, rawPlayerId: unknown): { room: Room | null; player: Player } | null {
  const playerId = parsePlayerId(rawPlayerId);
  const room = rooms.get(normalizeCode(rawCode));
  if (!room) return null;
  return detachPlayer(room, room.players.findIndex((p) => p.id === playerId));
}

// 소켓 연결 검사: 이 연결이 어느 방의 누구인지 token으로 찾는다. (?roomCode=...&token=...)
// playerId나 닉네임은 다른 사람도 알 수 있는 값이라 본인 확인에 쓰지 않는다.
export function resolveMember(rawCode: unknown, rawToken: unknown): { room: Room; player: Player } {
  const room = getRoom(rawCode);
  const player = typeof rawToken === 'string' && rawToken !== '' ? room.players.find((p) => p.token === rawToken) : undefined;
  if (!player) {
    throw new RoomError(403, 'NOT_A_MEMBER', 'You are not in this room.');
  }
  return { room, player };
}

// 소켓이 연결됐다. firstConnect가 true면 이 플레이어의 첫 연결이라 room:playerJoined를 보내야 한다.
export function markConnected(
  rawCode: unknown,
  playerId: number,
): { room: Room; player: Player; firstConnect: boolean } {
  const room = getRoom(rawCode);
  const player = requireMember(room, playerId);
  const now = Date.now();
  player.connections += 1;
  player.lastSeenAt = now;
  room.lastActiveAt = now;
  const firstConnect = !player.announced;
  player.announced = true;
  return { room, player, firstConnect };
}

// 소켓이 끊겼다. 방이나 플레이어가 이미 없으면 아무것도 하지 않는다.
export function markDisconnected(rawCode: unknown, playerId: number): void {
  const room = rooms.get(normalizeCode(rawCode));
  const player = room?.players.find((p) => p.id === playerId);
  if (!player) return;
  player.connections = Math.max(0, player.connections - 1);
  player.lastSeenAt = Date.now();
}

// 대기실에서 소켓 연결 없이 STALE_PLAYER_MS가 지난 사람을 내보낸다. (방 만들기/입장만 하고 떠난 경우)
// 게임 중(playing/ended)에는 새로고침하고 돌아올 수 있으니 내보내지 않는다.
export function removeStalePlayers(now: number = Date.now()): { room: Room | null; player: Player }[] {
  const removed: { room: Room | null; player: Player }[] = [];
  for (const room of [...rooms.values()]) {
    if (room.status !== 'waiting') continue;
    for (const player of [...room.players]) {
      if (player.connections > 0 || now - player.lastSeenAt <= STALE_PLAYER_MS) continue;
      const result = detachPlayer(room, room.players.indexOf(player));
      if (result) removed.push(result);
    }
  }
  return removed;
}

// 닉네임 같은 화면용 정보만 반환. AI 정보와 투표 내용은 절대 넣지 않는다.
export function toPublicRoom(room: Room): PublicRoom {
  return {
    code: room.code,
    status: room.status,
    maxPlayers: MAX_PLAYERS,
    minPlayersToStart: MIN_PLAYERS_TO_START,
    playerCount: room.players.length,
    players: room.players.map((p) => ({ id: p.id, nickname: p.nickname, isHost: p.isHost })),
    theme: room.theme,
  };
}

export function cleanupExpiredRooms(now: number = Date.now()): number {
  let removed = 0;
  for (const [code, room] of rooms) {
    if (now - room.lastActiveAt > ROOM_TTL_MS) {
      rooms.delete(code);
      removed++;
    }
  }
  return removed;
}

// 테스트에서 방 목록을 비울 때만 사용
export function resetRoomsForTest(): void {
  rooms.clear();
}
