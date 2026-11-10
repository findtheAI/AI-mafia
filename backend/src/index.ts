import { createServer } from 'node:http';
import express from 'express';
import { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@ai-mafia/shared';
import { registerChatHandlers } from './chatSocket.js';
import { activeRooms } from './room.routes.js';


// backend/.env를 읽는다 (없으면 기본값 사용). 실행 위치와 무관하게 이 파일 기준 경로로 찾는다.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // .env 없음
}

const PORT = Number(process.env.PORT ?? 8000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:3000';
const app = express();


app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);
  const roomCode = socket.handshake.query.roomCode as string;
  const nickname = socket.handshake.query.nickname as string;

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
