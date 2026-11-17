import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import * as store from './roomStore.js';

beforeEach(() => store.resetRoomsForTest());

// 방장 + (count - 1)명이 들어간 방을 만든다.
function makeRoom(count: number) {
  const { room, player: host } = store.createRoom();
  const others = [];
  for (let i = 1; i < count; i++) others.push(store.joinRoom(room.code).player);
  return { room, host, others };
}

test('방을 만들면 6자리 코드가 생기고 방장이 서버가 정한 닉네임으로 입장해 있다', () => {
  const { room, player } = store.createRoom();
  assert.match(room.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(room.status, 'waiting');
  assert.equal(room.players.length, 1);
  assert.equal(player.isHost, true);
  assert.equal(player.id, 1);
  assert.ok(player.nickname.length > 0);
});

test('방 코드로 입장할 수 있고 대소문자는 구분하지 않는다', () => {
  const { room } = store.createRoom();
  const { player } = store.joinRoom(room.code.toLowerCase());
  assert.equal(player.isHost, false);
  assert.equal(player.id, 2);
  assert.equal(store.getRoom(room.code).players.length, 2);
});

test('같은 방 안에서 닉네임은 겹치지 않는다', () => {
  for (let round = 0; round < 50; round++) {
    const { room } = makeRoom(6);
    const names = room.players.map((p) => p.nickname);
    assert.equal(new Set(names).size, 6);
  }
});

test('방 코드 누락 / 없는 방 / 가득 찬 방 / 시작한 방은 거절한다', () => {
  assert.throws(() => store.joinRoom(undefined), { status: 400, code: 'ROOM_CODE_REQUIRED' });
  assert.throws(() => store.joinRoom('   '), { status: 400, code: 'ROOM_CODE_REQUIRED' });
  assert.throws(() => store.joinRoom('NOPE22'), { status: 404, code: 'ROOM_NOT_FOUND' });

  const { room } = makeRoom(6);
  assert.throws(() => store.joinRoom(room.code), { status: 409, code: 'ROOM_FULL' });

  const { room: started } = makeRoom(3);
  started.status = 'playing';
  assert.throws(() => store.joinRoom(started.code), { status: 409, code: 'ROOM_NOT_JOINABLE' });
});

test('공개 정보에는 AI와 투표 내용이 없다', () => {
  const { room } = makeRoom(3);
  room.ai = { nickname: '비밀 AI' };
  room.votes = { 철수: '비밀 AI' };
  const json = JSON.stringify(store.toPublicRoom(room));
  assert.equal(json.includes('비밀 AI'), false);
  assert.equal(json.includes('votes'), false);
});

test('오래된 방은 정리된다', () => {
  const { room } = store.createRoom();
  const removed = store.cleanupExpiredRooms(Date.now() + store.ROOM_TTL_MS + 1000);
  assert.equal(removed, 1);
  assert.throws(() => store.getRoom(room.code), { code: 'ROOM_NOT_FOUND' });
});

test('다시 하기: 결과가 나온 방은 대기실로 돌아가고 닉네임이 새로 배정된다', () => {
  const { room, host, others } = makeRoom(4);
  room.status = 'ended';
  room.ai = { nickname: '테스트 AI' };
  room.votes = { [host.nickname]: '테스트 AI' };

  const { room: after, player } = store.rematchRoom(room.code, others[0]?.id);

  assert.equal(after.status, 'waiting');
  assert.equal(after.ai, null);
  assert.deepEqual(after.votes, {});
  assert.equal(after.players.length, 4);
  assert.equal(after.players.find((p) => p.isHost)?.id, host.id); // 방장은 그대로
  assert.equal(new Set(after.players.map((p) => p.nickname)).size, 4);
  assert.equal(player.id, others[0]?.id);
});

test('다시 하기: 이미 대기실이면 아무것도 바꾸지 않는다 (누가 먼저 눌러도 같은 결과)', () => {
  const { room, host, others } = makeRoom(3);
  room.status = 'ended';
  room.ai = { nickname: 'AI' };
  store.rematchRoom(room.code, host.id);
  const namesAfterFirst = room.players.map((p) => p.nickname);

  store.rematchRoom(room.code, others[0]?.id);
  assert.deepEqual(room.players.map((p) => p.nickname), namesAfterFirst);
});

test('다시 하기: 진행 중인 방 / 방에 없는 사람 / 잘못된 id는 거절한다', () => {
  const { room, host } = makeRoom(3);
  room.status = 'playing';
  assert.throws(() => store.rematchRoom(room.code, host.id), { status: 409, code: 'ROOM_NOT_ENDED' });

  room.status = 'ended';
  assert.throws(() => store.rematchRoom(room.code, 999), { status: 403, code: 'NOT_A_MEMBER' });
  assert.throws(() => store.rematchRoom(room.code, 'abc'), { status: 400, code: 'INVALID_PLAYER_ID' });
  assert.throws(() => store.rematchRoom('NOPE22', host.id), { code: 'ROOM_NOT_FOUND' });
});

test('나가기: 방장이 나가면 다음 사람이 방장이 된다', () => {
  const { room, host, others } = makeRoom(3);
  store.leaveRoom(room.code, host.id);
  assert.equal(room.players.length, 2);
  assert.equal(room.players.find((p) => p.id === others[0]?.id)?.isHost, true);
  assert.equal(room.players.filter((p) => p.isHost).length, 1);
});

test('나가기: 일반 참가자가 나가도 방장은 그대로다', () => {
  const { room, host, others } = makeRoom(3);
  store.leaveRoom(room.code, others[1]?.id);
  assert.equal(room.players.length, 2);
  assert.equal(room.players.find((p) => p.isHost)?.id, host.id);
});

test('나가기: 마지막 사람이 나가면 방이 사라진다', () => {
  const { room, host } = makeRoom(1);
  store.leaveRoom(room.code, host.id);
  assert.throws(() => store.getRoom(room.code), { code: 'ROOM_NOT_FOUND' });
});

test('나가기: 없는 방 / 이미 나간 사람이어도 에러 없이 끝난다', () => {
  const { room, host } = makeRoom(2);
  store.leaveRoom('NOPE22', 1);
  store.leaveRoom(room.code, 999);
  store.leaveRoom(room.code, host.id);
  store.leaveRoom(room.code, host.id); // 두 번 눌러도 괜찮다
  assert.equal(room.players.length, 1);
  assert.throws(() => store.leaveRoom(room.code, 'x'), { code: 'INVALID_PLAYER_ID' });
});

test('다시 하기: 실제로 되돌렸을 때만 reset이 true다', () => {
  const { room, host } = makeRoom(2);
  room.status = 'ended';
  room.ai = { nickname: '테스트 AI' };
  assert.equal(store.rematchRoom(room.code, host.id).reset, true);
  assert.equal(store.rematchRoom(room.code, host.id).reset, false); // 이미 대기실
});

test('나가기: 남은 방과 나간 사람을 돌려주고, 방이 사라지면 room이 null이다', () => {
  const { room, host, others } = makeRoom(2);
  const first = store.leaveRoom(room.code, host.id);
  assert.equal(first?.player.id, host.id);
  assert.equal(first?.room?.players.length, 1);
  const last = store.leaveRoom(room.code, others[0]?.id);
  assert.equal(last?.room, null);
  assert.equal(store.leaveRoom(room.code, 1), null); // 이미 없는 방
});

test('소켓 연결 검사: playerId 또는 닉네임으로 "나"를 찾는다', () => {
  const { room, host, others } = makeRoom(3);
  const second = others[0]!;

  assert.equal(store.resolveMember(room.code, undefined, String(host.id)).player.id, host.id); // 쿼리는 문자열
  assert.equal(store.resolveMember(room.code.toLowerCase(), second.nickname, undefined).player.id, second.id);
  // playerId가 있으면 닉네임이 달라도(다시 하기 직후 등) playerId를 믿는다
  assert.equal(store.resolveMember(room.code, '옛날 닉네임', String(second.id)).player.id, second.id);

  assert.throws(() => store.resolveMember(room.code, '없는 사람', undefined), { status: 403, code: 'NOT_A_MEMBER' });
  assert.throws(() => store.resolveMember(room.code, undefined, '999'), { code: 'NOT_A_MEMBER' });
  assert.throws(() => store.resolveMember(room.code, undefined, undefined), { code: 'NOT_A_MEMBER' });
  assert.throws(() => store.resolveMember(undefined, host.nickname, undefined), { code: 'ROOM_CODE_REQUIRED' });
  assert.throws(() => store.resolveMember('NOPE22', host.nickname, undefined), { code: 'ROOM_NOT_FOUND' });
});

test('소켓 연결: 첫 연결에서만 firstConnect가 true이고, 끊기면 연결 수가 줄어든다', () => {
  const { room, host } = makeRoom(1);
  const a = store.markConnected(room.code, host.id);
  assert.equal(a.firstConnect, true);
  assert.equal(host.connections, 1);

  const b = store.markConnected(room.code, host.id); // 탭을 하나 더 열었거나 재연결
  assert.equal(b.firstConnect, false);
  assert.equal(host.connections, 2);

  store.markDisconnected(room.code, host.id);
  store.markDisconnected(room.code, host.id);
  store.markDisconnected(room.code, host.id); // 더 끊어도 0 아래로 내려가지 않는다
  assert.equal(host.connections, 0);
  store.markDisconnected('NOPE22', 1); // 없는 방이어도 에러 없음
});

test('연결 없이 오래 머문 사람은 대기실에서 내보내고, 방장이 바뀐다', () => {
  const { room, host, others } = makeRoom(3);
  store.markConnected(room.code, others[0]!.id); // 한 명만 연결돼 있다
  const later = Date.now() + store.STALE_PLAYER_MS + 1000;

  const removed = store.removeStalePlayers(later);
  assert.deepEqual(removed.map((r) => r.player.id).sort(), [host.id, others[1]!.id].sort());
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0]?.isHost, true); // 남은 사람이 방장
});

test('연결이 있거나 아직 유예 시간이 안 지났거나 게임 중이면 내보내지 않는다', () => {
  const { room, host } = makeRoom(2);
  assert.equal(store.removeStalePlayers(Date.now() + 1000).length, 0); // 방금 만든 방

  const later = Date.now() + store.STALE_PLAYER_MS + 1000;
  store.markConnected(room.code, host.id);
  room.status = 'playing';
  assert.equal(store.removeStalePlayers(later).length, 0); // 게임 중
  room.status = 'waiting';
  assert.equal(store.removeStalePlayers(later).length, 1); // 대기실: 연결 없는 한 명만
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0]?.id, host.id);
});

test('모두 연결 없이 떠나면 방이 사라진다', () => {
  const { room } = makeRoom(2);
  const removed = store.removeStalePlayers(Date.now() + store.STALE_PLAYER_MS + 1000);
  assert.equal(removed.length, 2);
  assert.throws(() => store.getRoom(room.code), { code: 'ROOM_NOT_FOUND' });
});
