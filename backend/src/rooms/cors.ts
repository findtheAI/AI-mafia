import type { RequestHandler } from 'express';

// 프론트(다른 포트)에서 REST API를 호출할 수 있게 허용한다.
export function createCorsMiddleware(allowedOrigin: string): RequestHandler {
  return (req, res, next) => {
    res.header('Access-Control-Allow-Origin', allowedOrigin);
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
