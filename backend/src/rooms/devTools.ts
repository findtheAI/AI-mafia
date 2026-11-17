import express from 'express';
import type { Router } from 'express';
import { finishRoomForDemo } from './demoState.js';
import { getRoom } from './roomStore.js';

// 개발 중에 결과 화면을 확인하기 위한 도구. backend/.env에 ENABLE_DEV_TOOLS=1이 있을 때만 켜진다. (setup.ts)
// 배포 환경에서는 켜지 않는다.
export function createDevRouter(): Router {
  const router = express.Router();

  // 브라우저 주소창에서 바로 열 수 있게 GET으로 만들었다.
  // 예) http://localhost:8000/dev/finish/ABC123            -> 사람 팀 승리 상태
  //     http://localhost:8000/dev/finish/ABC123?outcome=ai -> AI 승리 상태
  router.get('/finish/:roomCode', (req, res) => {
    const room = getRoom(req.params.roomCode);
    finishRoomForDemo(room, req.query.outcome === 'ai' ? 'ai' : 'humans');
    res.json({
      success: true,
      message: '방을 결과 단계로 만들었어요. 프론트에서 resultUrl 주소를 열어보세요.',
      resultUrl: `http://localhost:3000/room/${room.code}/result`,
    });
  });

  return router;
}
