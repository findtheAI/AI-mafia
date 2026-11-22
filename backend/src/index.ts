// 전반적으로 소켓을 담당하고 이런저런 이벤트 핸들링을 연결해주는 스크립트다
import { createServer } from 'node:http';
import express from 'express';
import { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  RoomClientToServerEvents,
  RoomServerToClientEvents,
  ServerToClientEvents,
} from '@ai-mafia/shared';
import { registerRoomSocket } from './rooms/socket.js';
import type { RoomSocketData } from './rooms/socket.js';
import { setupRooms } from './rooms/setup.js';
import { registerChatHandlers } from './chatSocket.js';
import { activeRooms } from './room.routes.js';

import cors from 'cors';
import roomRouter from './room.routes';

// backend/.env를 읽는다 (없으면 기본값 사용). 실행 위치와 무관하게 이 파일 기준 경로로 찾는다.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // .env 없음
}

const PORT = Number(process.env.PORT ?? 8000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:3000';
const app = express();
setupRooms(app, { clientOrigin: CLIENT_ORIGIN }); // 방 생성 / 입장 REST API

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const httpServer = createServer(app);

const io = new Server<
  ClientToServerEvents & RoomClientToServerEvents,
  ServerToClientEvents & RoomServerToClientEvents,
  Record<string, never>,
  RoomSocketData
>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

// 방 입장 검사, 방 안의 소식(room:*), 결과 조회(result:get)를 소켓에 연결한다.
// connection 핸들러는 여러 개를 등록할 수 있어서, 아래의 기존 hello/ping이나 이후 채팅 핸들러도 그대로 동작한다.
// (roomCode 없이 연결해도 되지만, roomCode를 보냈는데 참가자가 아니면 연결이 거절된다)
registerRoomSocket(io);

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);
  const roomCode = socket.handshake.query.roomCode as string;
  const nickname = socket.handshake.query.nickname as string;
  console.log(roomCode, nickname);
  if (roomCode) {
    // 룸 코드를 프론트엔드에서 받아서 소켓에 추가합니다
    // POST 리퀘를 한번 거친 상태여서 방 코드가 존재한다는 걸 가정합니다
    socket.join(roomCode);

    // 새 플레이어가 참가했다는 것을 나머지 플레이어들에게 보냅니다
    const room = activeRooms.get(roomCode);
    if (room) {
      io.to(roomCode).emit('room:playerJoined', {
        nickname,
        playersCount: room.players.length,
        players: room.players
      });
    }
  }

  // chatSocket.ts의 채팅 관련 이벤트와 연결합니다
  registerChatHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
