import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@ai-mafia/shared';

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
  socket.emit('server:hello', { message: 'AI-Mafia 서버에 연결되었습니다.' });

  socket.on('client:ping', (ack) => {
    ack({ serverTime: Date.now() });
  });

  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
