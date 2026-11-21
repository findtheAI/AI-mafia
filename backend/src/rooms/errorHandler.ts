import type { ErrorRequestHandler } from 'express';
import { RoomError } from './roomStore.js';

// 방 API의 에러 응답 형식을 API 명세서(OpenAPI)에 맞춘다: { success: false, error: "메시지" }
// code는 명세서에 없는 추가 필드다. 프론트가 에러 종류를 구분해서 한국어 안내를 띄울 때 쓴다.
export const roomErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof RoomError) {
    res.status(err.status).json({ success: false, error: err.message, code: err.code });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, error: 'Invalid JSON body.', code: 'INVALID_JSON' });
    return;
  }
  console.error(err);
  res.status(500).json({ success: false, error: 'Internal server error.', code: 'INTERNAL' });
};
