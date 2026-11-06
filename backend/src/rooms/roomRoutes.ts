import express from 'express';
import type { Router } from 'express';
import { createRoom, getRoom, joinRoom, toPublicRoom } from './roomStore.js';

interface RoomRouterOptions {
  clientOrigin: string; // 초대 링크의 앞부분 (프론트 주소)
}

interface RoomRequestBody {
  nickname?: unknown;
  maxPlayers?: unknown;
}

// .env는 index.ts에서 읽은 뒤에 적용되므로, 값을 인자로 받는 함수로 만들었다.
export function createRoomRouter({ clientOrigin }: RoomRouterOptions): Router {
  const router = express.Router();

  // 방 생성: 만든 사람이 방장으로 자동 입장
  router.post('/', (req, res) => {
    const body = (req.body ?? {}) as RoomRequestBody;
    const { room, player } = createRoom({ nickname: body.nickname, maxPlayers: body.maxPlayers });
    res.status(201).json({
      room: toPublicRoom(room),
      inviteUrl: `${clientOrigin}/invite/${room.code}`,
      player: { id: player.id, token: player.token, nickname: player.nickname, isHost: true },
    });
  });

  // 초대 링크로 접속했을 때 방 정보 확인 (입장 전 미리보기)
  router.get('/:code', (req, res) => {
    res.json({ room: toPublicRoom(getRoom(req.params.code)) });
  });

  // 초대 링크로 입장
  router.post('/:code/join', (req, res) => {
    const body = (req.body ?? {}) as RoomRequestBody;
    const { room, player } = joinRoom(req.params.code, body.nickname);
    res.status(201).json({
      room: toPublicRoom(room),
      player: { id: player.id, token: player.token, nickname: player.nickname, isHost: false },
    });
  });

  return router;
}
