import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import * as store from './roomStore.js';

beforeEach(() => store.resetRoomsForTest());

test('방을 만들면 6자리 코드가 생기고 방장이 입장해 있다', () => {
  const { room, player } = store.createRoom({ nickname: '민수', maxPlayers: undefined });
  assert.match(room.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(room.players.length, 1);
  assert.equal(player.isHost, true);
});

test('초대 코드로 입장할 수 있고 대소문자는 구분하지 않는다', () => {
  const { room } = store.createRoom({ nickname: '민수', maxPlayers: undefined });
  const { player } = store.joinRoom(room.code.toLowerCase(), '영희');
  assert.equal(player.isHost, false);
  assert.equal(store.getRoom(room.code).players.length, 2);
});

test('없는 방 / 가득 찬 방 / 중복 닉네임은 거절한다', () => {
  assert.throws(() => store.joinRoom('NOPE22', 'a'), { code: 'ROOM_NOT_FOUND' });
  const { room } = store.createRoom({ nickname: 'host', maxPlayers: 4 });
  store.joinRoom(room.code, 'a');
  assert.throws(() => store.joinRoom(room.code, 'a'), { code: 'NICKNAME_TAKEN' });
  store.joinRoom(room.code, 'b');
  store.joinRoom(room.code, 'c');
  assert.throws(() => store.joinRoom(room.code, 'd'), { code: 'ROOM_FULL' });
});

test('게임이 시작된 방에는 입장할 수 없다', () => {
  const { room } = store.createRoom({ nickname: 'host', maxPlayers: undefined });
  room.status = 'playing';
  assert.throws(() => store.joinRoom(room.code, 'late'), { code: 'ROOM_NOT_JOINABLE' });
});

test('공개 정보에는 토큰이 없다', () => {
  const { room } = store.createRoom({ nickname: 'host', maxPlayers: undefined });
  assert.equal(JSON.stringify(store.toPublicRoom(room)).includes('token'), false);
});

test('오래된 방은 정리된다', () => {
  const { room } = store.createRoom({ nickname: 'host', maxPlayers: undefined });
  const removed = store.cleanupExpiredRooms(Date.now() + store.ROOM_TTL_MS + 1000);
  assert.equal(removed, 1);
  assert.throws(() => store.getRoom(room.code), { code: 'ROOM_NOT_FOUND' });
});

test('최대 인원은 4~6명이고 기본값은 5명이다', () => {
  assert.equal(store.createRoom({ nickname: 'a', maxPlayers: undefined }).room.maxPlayers, 5);
  assert.equal(store.createRoom({ nickname: 'a', maxPlayers: 4 }).room.maxPlayers, 4);
  assert.equal(store.createRoom({ nickname: 'a', maxPlayers: 6 }).room.maxPlayers, 6);
  assert.throws(() => store.createRoom({ nickname: 'a', maxPlayers: 3 }), { code: 'INVALID_MAX_PLAYERS' });
  assert.throws(() => store.createRoom({ nickname: 'a', maxPlayers: 7 }), { code: 'INVALID_MAX_PLAYERS' });
});
