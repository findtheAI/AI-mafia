import type { ErrorRequestHandler } from 'express';
import { RoomError } from './roomStore.js';

// 방 API의 에러 응답 형식을 통일한다. (RoomError는 상태 코드와 메시지를 그대로 내려준다)
export const roomErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof RoomError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: '서버 오류가 발생했어요.' } });
};
