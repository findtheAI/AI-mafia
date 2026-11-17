import express from 'express';
import type { Express } from 'express';
import { createCorsMiddleware } from './cors.js';
import { createDemoPageRouter } from './demoPage.js';
import { roomErrorHandler } from './errorHandler.js';
import { createRoomRouter } from './roomRoutes.js';
import { cleanupExpiredRooms } from './roomStore.js';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

interface SetupRoomsOptions {
  clientOrigin: string; // 프론트 주소 (CORS 허용 + 초대 링크 앞부분)
}

// 방 생성 / 초대 링크 기능을 앱에 한 번에 연결한다.
// .env를 읽은 뒤의 값을 쓰기 위해, index.ts에서 호출하는 방식으로 만들었다.
export function setupRooms(app: Express, { clientOrigin }: SetupRoomsOptions): void {
  app.use(createCorsMiddleware(clientOrigin));
  app.use(express.json());

  app.use('/api/rooms', createRoomRouter({ clientOrigin }));
  app.use(createDemoPageRouter());
  app.use(roomErrorHandler);

  // 오래된 방 정리 (서버 종료를 막지 않도록 unref)
  setInterval(() => {
    cleanupExpiredRooms();
  }, CLEANUP_INTERVAL_MS).unref();
}
