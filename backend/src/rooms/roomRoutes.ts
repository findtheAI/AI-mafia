import express from 'express';
import type { Router } from 'express';
import { createRoom, joinRoom, toPublicRoom, updateTheme } from './roomStore.js';

interface JoinBody {
  roomCode?: unknown;
}

// REST는 방 만들기/입장 두 가지만 쓴다. (API 명세서: /api/room/create, /api/room/join)
// 이 응답을 받은 프론트가 같은 방 코드로 소켓에 연결하면(socket.ts), 그때부터 방 안의 소식은 소켓으로 주고받는다.
// 응답의 roomCode(join), playerId, token은 명세서에 없는 추가 필드다.
// token은 소켓 연결 때 본인 확인에 쓰는 비밀 값이고, playerId는 화면에서 players 중 "나"를 찾는 데 쓴다.
export function createRoomRouter(): Router {
  const router = express.Router();

  // 방 생성: 만든 사람이 방장으로 자동 입장, 닉네임은 서버가 배정
  router.post('/create', (_req, res) => {
    const { room, player } = createRoom();
    res.status(201).json({
      success: true,
      roomCode: room.code,
      players: toPublicRoom(room).players,
      nickname: player.nickname,
      playerId: player.id,
      theme: room.theme,
      token: player.token,
    });
  });

  // 방 참가: 방 코드로 입장, 닉네임은 서버가 배정
  router.post('/join', (req, res) => {
    const body = (req.body ?? {}) as JoinBody;
    const { room, player } = joinRoom(body.roomCode);
    res.status(200).json({
      success: true,
      roomCode: room.code,
      players: toPublicRoom(room).players,
      nickname: player.nickname,
      playerId: player.id,
      theme: room.theme,
      token: player.token,
    });
  });
  return router;
}
