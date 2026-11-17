import { randomInt, randomUUID } from 'node:crypto';

// 방 상태: waiting(대기) -> playing(진행) -> ended(종료)
export type RoomStatus = 'waiting' | 'playing' | 'ended';

export interface Player {
  id: string;
  token: string; // 이후 소켓 접속 시 본인 확인용 (화면에 내려주지 않는다)
  nickname: string;
  isHost: boolean;
  joinedAt: number;
}

export interface Room {
  code: string;
  status: RoomStatus;
  maxPlayers: number;
  players: Player[];
  createdAt: number;
  lastActiveAt: number;
}

export interface PublicPlayer {
  id: string;
  nickname: string;
  isHost: boolean;
}

export interface PublicRoom {
  code: string;
  status: RoomStatus;
  maxPlayers: number;
  playerCount: number;
  players: PublicPlayer[];
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

// 헷갈리는 문자(0/O, 1/I/L)를 뺀 초대 코드용 문자 집합
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 6;
const DEFAULT_MAX_PLAYERS = 5;
const NICKNAME_MAX_LENGTH = 12;
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 마지막 활동 후 2시간

const rooms = new Map<string, Room>(); // code -> room

function generateCode(): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += ALPHABET.charAt(randomInt(ALPHABET.length));
    }
    if (!rooms.has(code)) return code;
  }
  throw new RoomError(503, 'CODE_EXHAUSTED', '방 코드를 만들지 못했어요. 잠시 후 다시 시도해주세요.');
}

function validateNickname(raw: unknown): string {
  const nickname = typeof raw === 'string' ? raw.trim() : '';
  if (nickname.length < 1 || nickname.length > NICKNAME_MAX_LENGTH) {
    throw new RoomError(400, 'INVALID_NICKNAME', `닉네임은 1~${NICKNAME_MAX_LENGTH}자여야 해요.`);
  }
  return nickname;
}

function addPlayer(room: Room, nickname: string, isHost: boolean): Player {
  const player: Player = {
    id: randomUUID(),
    token: randomUUID(),
    nickname,
    isHost,
    joinedAt: Date.now(),
  };
  room.players.push(player);
  room.lastActiveAt = Date.now();
  return player;
}

export function createRoom(input: { nickname: unknown; maxPlayers: unknown }): { room: Room; player: Player } {
  const hostNickname = validateNickname(input.nickname);

  const max = input.maxPlayers === undefined ? DEFAULT_MAX_PLAYERS : Number(input.maxPlayers);
  if (!Number.isInteger(max) || max < MIN_PLAYERS || max > MAX_PLAYERS) {
    throw new RoomError(400, 'INVALID_MAX_PLAYERS', `최대 인원은 ${MIN_PLAYERS}~${MAX_PLAYERS}명이어야 해요.`);
  }

  const now = Date.now();
  const room: Room = {
    code: generateCode(),
    status: 'waiting',
    maxPlayers: max,
    players: [],
    createdAt: now,
    lastActiveAt: now,
  };
  const player = addPlayer(room, hostNickname, true);
  rooms.set(room.code, room);
  return { room, player };
}

export function getRoom(rawCode: unknown): Room {
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
  const room = rooms.get(code);
  if (!room) {
    throw new RoomError(404, 'ROOM_NOT_FOUND', '존재하지 않거나 만료된 방이에요.');
  }
  return room;
}

export function joinRoom(rawCode: unknown, rawNickname: unknown): { room: Room; player: Player } {
  const room = getRoom(rawCode);
  const nickname = validateNickname(rawNickname);

  if (room.status !== 'waiting') {
    throw new RoomError(409, 'ROOM_NOT_JOINABLE', '이미 게임이 시작됐거나 끝난 방이에요.');
  }
  if (room.players.length >= room.maxPlayers) {
    throw new RoomError(409, 'ROOM_FULL', '방이 가득 찼어요.');
  }
  if (room.players.some((p) => p.nickname === nickname)) {
    throw new RoomError(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임이에요.');
  }
  const player = addPlayer(room, nickname, false);
  return { room, player };
}

// 토큰 같은 내부 정보는 빼고, 화면에 보여줘도 되는 정보만 반환
export function toPublicRoom(room: Room): PublicRoom {
  return {
    code: room.code,
    status: room.status,
    maxPlayers: room.maxPlayers,
    playerCount: room.players.length,
    players: room.players.map((p) => ({ id: p.id, nickname: p.nickname, isHost: p.isHost })),
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
