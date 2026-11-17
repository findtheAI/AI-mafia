import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { finishRoomForDemo } from './demoState.js';
import { computeResult } from './roomResult.js';
import * as store from './roomStore.js';

beforeEach(() => store.resetRoomsForTest());

function makeRoom(count: number) {
  const { room } = store.createRoom();
  for (let i = 1; i < count; i++) store.joinRoom(room.code);
  return room;
}

test('3명 이상이면 사람 팀 승리 상태가 되고, 표가 한 표 갈린다', () => {
  const room = makeRoom(3);
  finishRoomForDemo(room);
  const result = computeResult(room); // ended + AI가 있어야 성공한다
  assert.equal(result.winner, 'humans');
  assert.equal(result.tally[0]?.isAi, true);
  assert.equal(result.tally[0]?.votes, 2);
  assert.equal(result.totalVotes, 3);
  assert.equal(room.players.some((p) => p.nickname === result.aiNickname), false); // AI 이름이 사람과 겹치지 않는다
});

test('outcome이 ai면 AI 승리 상태가 된다', () => {
  const room = makeRoom(4);
  finishRoomForDemo(room, 'ai');
  const result = computeResult(room);
  assert.equal(result.winner, 'ai');
  assert.equal(result.tally[0]?.isAi, false);
  assert.equal(result.isTie, false);
});

test('2명이면 사람 팀 승리, outcome이 ai면 동점이 보인다', () => {
  const a = makeRoom(2);
  finishRoomForDemo(a);
  assert.equal(computeResult(a).winner, 'humans');

  const b = makeRoom(2);
  finishRoomForDemo(b, 'ai');
  assert.equal(computeResult(b).isTie, true);
});

test('1명만 있어도 동작한다', () => {
  const room = makeRoom(1);
  finishRoomForDemo(room);
  assert.equal(computeResult(room).winner, 'humans');
});
