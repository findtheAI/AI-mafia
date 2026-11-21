import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { announceStatus, registerRoomSocket, sweepStalePlayers } from './socket.js';
import type { AppServer } from './socket.js';
import * as store from './roomStore.js';

// Socket.IO를 흉내 내는 가짜 서버/소켓. 실제 네트워크 없이 "이벤트가 어떻게 오가는지"만 확인한다.
type Listener = (...args: any[]) => void;
interface Sent { event: string; payload: any }
interface Broadcast extends Sent { room: string }

class FakeSocket {
  data: { roomCode?: string; playerId?: number } = {};
  handshake: { query: Record<string, unknown> };
  joined = new Set<string>();
  sent: Sent[] = [];
  disconnected = false;
  private listeners = new Map<string, Listener>();

  constructor(query: Record<string, unknown>) {
    this.handshake = { query };
  }
  join(room: string) { this.joined.add(room); }
  leave(room: string) { this.joined.delete(room); }
  emit(event: string, payload?: unknown) { this.sent.push({ event, payload }); }
  on(event: string, listener: Listener) { this.listeners.set(event, listener); }
  disconnect() { this.disconnected = true; }
  // 클라이언트가 이벤트를 보낸 것처럼 실행하고, ack으로 돌아온 응답을 반환한다.
  call(event: string): any {
    let response: any;
    this.listeners.get(event)?.((res: any) => { response = res; });
    return response;
  }
  fire(event: string) { this.listeners.get(event)?.(); }
}

class FakeIo {
  broadcasts: Broadcast[] = [];
  private middlewares: Array<(socket: FakeSocket, next: (err?: Error) => void) => void> = [];
  private connectionListeners: Array<(socket: FakeSocket) => void> = [];

  use(fn: (socket: FakeSocket, next: (err?: Error) => void) => void) { this.middlewares.push(fn); }
  on(_event: 'connection', fn: (socket: FakeSocket) => void) { this.connectionListeners.push(fn); }
  to(room: string) {
    return { emit: (event: string, payload?: unknown) => { this.broadcasts.push({ room, event, payload }); } };
  }
  // 클라이언트가 접속한 것처럼 검사 -> connection 핸들러 순서로 실행한다.
  connect(query: Record<string, unknown>): { socket: FakeSocket; error?: string } {
    const socket = new FakeSocket(query);
    let error: string | undefined;
    for (const fn of this.middlewares) fn(socket, (err) => { if (err) error = err.message; });
    if (error !== undefined) return { socket, error };
    for (const fn of this.connectionListeners) fn(socket);
    return { socket };
  }
  eventsOf(name: string) { return this.broadcasts.filter((b) => b.event === name); }
}

let io: FakeIo;

beforeEach(() => {
  store.resetRoomsForTest();
  io = new FakeIo();
  registerRoomSocket(io as unknown as AppServer);
});

// REST로 방을 만들고 입장한 것처럼 준비한다.
function setup(playerCount: number) {
  const { room, player: host } = store.createRoom();
  const others = [];
  for (let i = 1; i < playerCount; i++) others.push(store.joinRoom(room.code).player);
  return { room, host, others };
}

const asQuery = (code: string, p: store.Player) => ({ roomCode: code, token: p.token });

test('연결하면 방에 들어가고, 방 전체에 playerJoined가 간다', () => {
  const { room, host } = setup(1);
  const { socket, error } = io.connect(asQuery(room.code, host));

  assert.equal(error, undefined);
  assert.ok(socket.joined.has(room.code));

  const joined = io.eventsOf('room:playerJoined');
  assert.equal(joined.length, 1);
  assert.equal(joined[0]?.room, room.code);
  assert.equal(joined[0]?.payload.nickname, host.nickname);
  assert.equal(joined[0]?.payload.playersCount, 1);
});

test('두 번째 사람이 연결하면 양쪽이 받는 playerJoined에 두 명이 들어 있다', () => {
  const { room, host, others } = setup(2);
  io.connect(asQuery(room.code, host));
  io.connect(asQuery(room.code, others[0]!));

  const joined = io.eventsOf('room:playerJoined');
  assert.equal(joined.length, 2);
  assert.equal(joined[1]?.payload.playersCount, 2);
  assert.equal(joined[1]?.payload.players.length, 2);
});

test('같은 사람이 다시 연결해도(새로고침, 재연결) playerJoined는 다시 가지 않는다', () => {
  const { room, host } = setup(1);
  io.connect(asQuery(room.code, host));
  io.connect(asQuery(room.code, host));

  assert.equal(io.eventsOf('room:playerJoined').length, 1);
});

test('현재 방 상태 조회: 단계와 참가자를 준다 (AI/투표 정보는 없다)', () => {
  const { room, host, others } = setup(2);
  room.ai = { nickname: '비밀 AI' };
  room.votes = { [host.nickname]: '비밀 AI' };
  const { socket } = io.connect(asQuery(room.code, others[0]!));

  const res = socket.call('room:getState');
  assert.equal(res.success, true);
  assert.equal(res.room.status, 'waiting');
  assert.equal(res.room.players.length, 2);
  assert.equal(res.room.maxPlayers, 6);
  assert.equal(JSON.stringify(res).includes('비밀 AI'), false);

  room.status = 'ended';
  assert.equal(socket.call('room:getState').room.status, 'ended'); // 단계가 바뀌면 바뀐 값을 준다
});

test('roomCode가 소문자여도 연결된다', () => {
  const { room, host } = setup(1);
  const { error } = io.connect({ roomCode: room.code.toLowerCase(), token: host.token });
  assert.equal(error, undefined);
});

test('사칭 거절: 남의 닉네임이나 playerId만으로는 연결되지 않는다', () => {
  const { room, host } = setup(1);
  assert.equal(io.connect({ roomCode: room.code, nickname: host.nickname }).error, 'NOT_A_MEMBER');
  assert.equal(io.connect({ roomCode: room.code, playerId: String(host.id) }).error, 'NOT_A_MEMBER');
  assert.equal(io.connect({ roomCode: room.code, token: 'guess' }).error, 'NOT_A_MEMBER');
});

test('연결 거절: 없는 방 / 참가자가 아님 / 방 코드 누락 중 잘못된 값', () => {
  const { room } = setup(1);
  assert.equal(io.connect({ roomCode: 'NOPE22', token: 'x' }).error, 'ROOM_NOT_FOUND');
  assert.equal(io.connect({ roomCode: room.code, token: '' }).error, 'NOT_A_MEMBER');
  assert.equal(io.connect({ roomCode: '   ', token: 'x' }).error, 'ROOM_CODE_REQUIRED');
  assert.equal(io.eventsOf('room:playerJoined').length, 0);
});

test('roomCode 없이 연결하는 소켓(연결 상태 확인용)은 막지 않고, 방과 무관하게 둔다', () => {
  const { socket, error } = io.connect({});
  assert.equal(error, undefined);
  assert.equal(socket.sent.length, 0);
  assert.equal(socket.call('result:get'), undefined); // 방 핸들러가 붙지 않았다
  assert.equal(socket.call('room:getState'), undefined);
});

test('결과 조회: ended 전에는 실패(RESULT_NOT_READY), ended 후에는 AI 정체와 승패를 준다', () => {
  const { room, host, others } = setup(2);
  const { socket } = io.connect(asQuery(room.code, host));
  room.ai = { nickname: '테스트 AI' };
  room.votes = { [host.nickname]: '테스트 AI', [others[0]!.nickname]: '테스트 AI' };

  room.status = 'playing';
  const early = socket.call('result:get');
  assert.equal(early.success, false);
  assert.equal(early.code, 'RESULT_NOT_READY');
  assert.equal(JSON.stringify(early).includes('테스트 AI'), false);

  room.status = 'ended';
  const done = socket.call('result:get');
  assert.equal(done.success, true);
  assert.equal(done.result.winner, 'humans');
  assert.equal(done.result.aiNickname, '테스트 AI');
});

test('AI 정보는 참가 알림에 절대 실리지 않는다', () => {
  const { room, host, others } = setup(2);
  room.ai = { nickname: '비밀 AI' };
  const { socket } = io.connect(asQuery(room.code, host));
  io.connect(asQuery(room.code, others[0]!));
  const everything = JSON.stringify([socket.sent, io.broadcasts]);
  assert.equal(everything.includes('비밀 AI'), false);
});

test('다시 하기: ended 방이 대기실로 돌아가고 방 전체에 room:reset이 간다 (두 번째 호출은 알리지 않는다)', () => {
  const { room, host, others } = setup(2);
  const { socket } = io.connect(asQuery(room.code, others[0]!));
  io.connect(asQuery(room.code, host));
  room.status = 'ended';
  room.ai = { nickname: '테스트 AI' };

  const res = socket.call('room:rematch');
  assert.equal(res.success, true);
  assert.equal(res.players.length, 2);
  assert.equal(room.status, 'waiting');

  const resets = io.eventsOf('room:reset');
  assert.equal(resets.length, 1);
  assert.equal(resets[0]?.room, room.code);
  assert.equal(resets[0]?.payload.players.length, 2);

  assert.equal(socket.call('room:rematch').success, true); // 이미 대기실: 성공은 하지만
  assert.equal(io.eventsOf('room:reset').length, 1); // 다시 알리지는 않는다
});

test('다시 하기: 게임 진행 중이면 실패한다', () => {
  const { room, host } = setup(1);
  const { socket } = io.connect(asQuery(room.code, host));
  room.status = 'playing';
  const res = socket.call('room:rematch');
  assert.equal(res.success, false);
  assert.equal(res.code, 'ROOM_NOT_ENDED');
  assert.equal(io.eventsOf('room:reset').length, 0);
});

test('나가기: 방 전체에 playerLeft가 가고 방장이 넘어간다. 마지막 사람이 나가면 알림 없이 방이 사라진다', () => {
  const { room, host, others } = setup(2);
  const a = io.connect(asQuery(room.code, host));
  io.connect(asQuery(room.code, others[0]!));

  assert.equal(a.socket.call('room:leave').success, true);
  assert.equal(a.socket.joined.has(room.code), false);
  const left = io.eventsOf('room:playerLeft');
  assert.equal(left.length, 1);
  assert.equal(left[0]?.payload.nickname, host.nickname);
  assert.equal(left[0]?.payload.playersCount, 1);
  assert.equal(left[0]?.payload.players[0]?.isHost, true); // 남은 사람이 방장

  const b = io.connect(asQuery(room.code, others[0]!));
  assert.equal(b.socket.call('room:leave').success, true);
  assert.equal(io.eventsOf('room:playerLeft').length, 1); // 방이 사라졌으니 더 알리지 않는다
  assert.throws(() => store.getRoom(room.code), { code: 'ROOM_NOT_FOUND' });
});

test('연결이 끊기면 연결 수가 줄고, 대기실에서 오래 비어 있으면 sweep이 내보내고 알린다', () => {
  const { room, host, others } = setup(2);
  const a = io.connect(asQuery(room.code, host));
  io.connect(asQuery(room.code, others[0]!));

  a.socket.fire('disconnect');
  assert.equal(host.connections, 0);
  assert.equal(others[0]?.connections, 1);

  host.lastSeenAt = Date.now() - store.STALE_PLAYER_MS - 1000; // 시간이 흐른 것으로 만든다
  sweepStalePlayers(io as unknown as AppServer);
  const left = io.eventsOf('room:playerLeft');
  assert.equal(left.length, 1);
  assert.equal(left[0]?.payload.nickname, host.nickname);
  assert.equal(room.players.length, 1);
});

test('announceStatus: 방 전체에 현재 단계를 알린다', () => {
  const { room } = setup(1);
  room.status = 'playing';
  announceStatus(io as unknown as AppServer, room);
  assert.deepEqual(io.eventsOf('room:statusChanged')[0], {
    room: room.code,
    event: 'room:statusChanged',
    payload: { status: 'playing' },
  });
});
