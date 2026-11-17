import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Router } from 'express';

// 시연용 화면 (backend/public/index.html).
// 프론트(Next.js)에 같은 화면이 생기면 이 파일과 public 폴더를 지워도 된다.
export function createDemoPageRouter(): Router {
  const publicDir = fileURLToPath(new URL('../../public', import.meta.url));
  const router = express.Router();

  router.use(express.static(publicDir));
  router.get('/invite/:code', (_req, res) => {
    res.sendFile('index.html', { root: publicDir });
  });

  return router;
}
