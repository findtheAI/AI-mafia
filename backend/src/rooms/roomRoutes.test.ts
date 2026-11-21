import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import * as store from './roomStore.js';
import { setupRooms } from './setup.js';

// 실제로 서버를 띄워서 HTTP로 요청을 보내는 테스트. REST는 방 만들기/입장 두 가지뿐이다.
// (방 안의 소식은 소켓으로 오가며, 그 부분은 roomSocket.test.ts에서 확인한다)
let server!: Server;
let base = '';

before(async () => {
  const app = express();
  setupRooms(app, { clientOrigin: 'http://localhost:3000' });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

beforeEach(() => store.resetRoomsForTest());

async function post(path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}

test('방 생성 -> 입장: 명세서 응답 형태를 지킨다', async () => {
  const created = await post('/api/room/create');
  assert.equal(created.status, 201);
  assert.equal(created.json.success, true);
  assert.match(created.json.roomCode, /^[A-Z0-9]{6}$/);
  assert.equal(created.json.players.length, 1);
  assert.equal(created.json.players[0].isHost, true);
  assert.equal(created.json.players[0].nickname, created.json.nickname);
  assert.equal(typeof created.json.playerId, 'number');
  assert.equal(typeof created.json.token, 'string');
  assert.equal(JSON.stringify(created.json.players).includes(created.json.token), false);

  const joined = await post('/api/room/join', { roomCode: created.json.roomCode.toLowerCase() });
  assert.equal(joined.status, 200);
  assert.equal(joined.json.players.length, 2);
  assert.notEqual(joined.json.nickname, created.json.nickname);
  assert.equal(joined.json.roomCode, created.json.roomCode);
});

test('입장 실패: 코드 누락 400 / 없는 방 404 / 가득 참 409 / 시작한 방 409', async () => {
  const noCode = await post('/api/room/join', {});
  assert.equal(noCode.status, 400);
  assert.equal(noCode.json.success, false);
  assert.equal(noCode.json.error, 'Room code required.');

  const missing = await post('/api/room/join', { roomCode: 'NOPE22' });
  assert.equal(missing.status, 404);
  assert.equal(missing.json.code, 'ROOM_NOT_FOUND');

  const { json: created } = await post('/api/room/create');
  for (let i = 0; i < 5; i++) await post('/api/room/join', { roomCode: created.roomCode });
  const full = await post('/api/room/join', { roomCode: created.roomCode });
  assert.equal(full.status, 409);
  assert.equal(full.json.code, 'ROOM_FULL');

  store.getRoom(created.roomCode).status = 'playing';
  const started = await post('/api/room/join', { roomCode: created.roomCode });
  assert.equal(started.json.code, 'ROOM_NOT_JOINABLE');
});

test('깨진 JSON을 보내면 400', async () => {
  const res = await fetch(`${base}/api/room/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ not json',
  });
  assert.equal(res.status, 400);
});
