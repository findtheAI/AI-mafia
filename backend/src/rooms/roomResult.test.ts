import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { computeResult } from './roomResult.js';
import * as store from './roomStore.js';

beforeEach(() => store.resetRoomsForTest());

// 서버가 만드는 닉네임과 절대 겹치지 않는 이름을 쓴다. (겹치면 테스트가 가끔 실패한다)
const AI = '테스트 AI';

// 사람 3명(+AI 1명)이 있고 결과가 공개된 방. votes는 "투표한 닉네임 -> 받은 닉네임".
function endedRoom(votes: (names: string[]) => Record<string, string>) {
  const { room } = store.createRoom();
  store.joinRoom(room.code);
  store.joinRoom(room.code);
  const names = room.players.map((p) => p.nickname);
  room.status = 'ended';
  room.ai = { nickname: AI };
  room.votes = votes(names);
  return { room, names };
}

test('결과가 아직 공개되지 않았으면 거절한다 (AI 정보 보호)', () => {
  const { room } = store.createRoom();
  room.ai = { nickname: AI };
  room.status = 'playing';
  assert.throws(() => computeResult(room), { status: 409, code: 'RESULT_NOT_READY' });
  room.status = 'waiting';
  assert.throws(() => computeResult(room), { code: 'RESULT_NOT_READY' });
});

test('ended여도 AI가 정해지지 않았으면 거절한다', () => {
  const { room } = store.createRoom();
  room.status = 'ended';
  assert.throws(() => computeResult(room), { code: 'RESULT_NOT_READY' });
});

test('단독 최다 득표자가 AI면 사람 팀이 이긴다', () => {
  const { room, names } = endedRoom(([a, b, c]) => ({ [a!]: AI, [b!]: AI, [c!]: a! }));
  const result = computeResult(room);
  assert.equal(result.winner, 'humans');
  assert.equal(result.aiNickname, AI);
  assert.deepEqual(result.topVoted, [AI]);
  assert.equal(result.isTie, false);
  assert.equal(result.totalVotes, 3);
  assert.equal(result.tally[0]?.nickname, AI);
  assert.equal(result.tally[0]?.votes, 2);
  assert.equal(result.tally[0]?.isAi, true);
  assert.equal(result.tally.length, names.length + 1); // 사람 + AI 모두 포함
});

test('사람이 최다 득표자면 AI가 이긴다', () => {
  const { room } = endedRoom(([a, b, c]) => ({ [a!]: c!, [b!]: c!, [c!]: AI }));
  const result = computeResult(room);
  assert.equal(result.winner, 'ai');
  assert.equal(result.topVoted.length, 1);
  assert.notEqual(result.topVoted[0], AI);
});

test('동점이면 isTie가 true이고, AI가 포함된 동점은 일단 AI 승리로 본다', () => {
  const { room } = endedRoom(([a, b, c]) => ({ [a!]: AI, [b!]: c!, [c!]: AI }));
  // AI 2표, c 1표 -> 동점 아님. 동점을 만들려고 한 표 바꾼다.
  room.votes = { [room.players[0]!.nickname]: AI, [room.players[1]!.nickname]: room.players[2]!.nickname };
  const result = computeResult(room);
  assert.equal(result.isTie, true);
  assert.equal(result.topVoted.length, 2);
  assert.equal(result.winner, 'ai');
});

test('표가 하나도 없으면 최다 득표자가 없고 AI가 이긴다', () => {
  const { room } = endedRoom(() => ({}));
  const result = computeResult(room);
  assert.deepEqual(result.topVoted, []);
  assert.equal(result.isTie, false);
  assert.equal(result.winner, 'ai');
  assert.equal(result.totalVotes, 0);
  assert.ok(result.tally.every((t) => t.votes === 0));
});

test('득표 많은 순으로 정렬되고, 표를 못 받은 참가자도 목록에 있다', () => {
  const { room } = endedRoom(([a, b, c]) => ({ [a!]: c!, [b!]: c!, [c!]: a! }));
  const result = computeResult(room);
  const votes = result.tally.map((t) => t.votes);
  assert.deepEqual(votes, [...votes].sort((x, y) => y - x));
  assert.ok(result.tally.some((t) => t.nickname === AI && t.votes === 0));
});

test('방에 없는 닉네임의 표와 자기 자신에게 한 표는 세지 않는다', () => {
  const { room } = endedRoom(([a, b]) => ({ [a!]: a!, 유령: b!, [b!]: '없는 사람' }));
  const result = computeResult(room);
  assert.equal(result.totalVotes, 0);
});

test('AI도 투표할 수 있다 (확장 기능 대비)', () => {
  const { room } = endedRoom(([a]) => ({ [AI]: a! }));
  const result = computeResult(room);
  assert.equal(result.totalVotes, 1);
  assert.deepEqual(result.topVoted, [room.players[0]!.nickname]);
});
