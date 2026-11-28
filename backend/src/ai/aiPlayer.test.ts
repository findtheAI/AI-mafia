import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTranscript, parseReply } from './aiPlayer.js';
import { createRoom } from '../rooms/roomStore.js';

test('PASS나 빈 답이면 말하지 않는다', () => {
  assert.equal(parseReply('PASS', '봇'), null);
  assert.equal(parseReply('  \n', '봇'), null);
});

test('모델이 닉네임을 붙여 답하면 떼어낸다', () => {
  assert.equal(parseReply('봇: ㅋㅋ 그거 나도 봄', '봇'), 'ㅋㅋ 그거 나도 봄');
  assert.equal(parseReply(' 아 진짜? ', '봇'), '아 진짜?');
});

test('채팅 기록은 최근 40개만 보낸다', () => {
  const { room } = createRoom();
  room.ai = { nickname: '봇' };
  for (let i = 0; i < 50; i++) room.chat.push({ sender: 'a', message: `m${i}` });
  const transcript = buildTranscript(room);
  assert.equal(transcript.includes('a: m9\n'), false);
  assert.equal(transcript.includes('a: m10\n'), true);
  assert.equal(transcript.includes('a: m49\n'), true);
});
