import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketAck,
} from '@ai-mafia/shared';
import { computeResult } from './roomResult.js';
import {
  RoomError,
  getRoom,
  leaveRoom,
  markConnected,
  markDisconnected,
  rematchRoom,
  removeStalePlayers,
  resolveMember,
  toPublicRoom,
  updateTheme
} from './roomStore.js';
import type { Player, Room } from './roomStore.js';
import { startGameLogic, submitVote } from '../game/gameLogic.js';
import { CHAT_TIME, GAME_PHASES, GamePhase } from '@ai-mafia/shared';
// 소켓 하나(= 연결 하나)에 붙여두는 정보: 이 연결이 어느 방의 누구인지
export interface RoomSocketData {
  roomCode?: string;
  playerId?: number;
}

// index.ts에서 만드는 Socket.IO 서버의 타입. (기존 이벤트 + 방 이벤트)
export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  RoomSocketData
>;

const SWEEP_INTERVAL_MS = 5 * 1000;

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function failure(error: unknown): { success: false; error: string; code: string } {
  if (error instanceof RoomError) {
    return { success: false, error: error.message, code: error.code };
  }
  console.error(error);
  return { success: false, error: 'Internal server error.', code: 'INTERNAL' };
}

// ack(응답 콜백)이 있는 이벤트를 처리한다. 성공하면 { success: true, ...결과 }, 실패하면 { success: false, error, code }
function respond<T extends object>(ack: ((res: SocketAck<T>) => void) | undefined, work: () => T): void {
  const send = typeof ack === 'function' ? ack : () => undefined;
  let response: SocketAck<T>;
  try {
    response = { success: true, ...work() };
  } catch (error) {
    response = failure(error);
  }
  send(response);
}

function broadcastLeft(io: AppServer, room: Room | null, player: Player): void {
  if (!room) return; // 마지막 사람이 나가서 방이 사라진 경우: 알릴 사람이 없다
  io.to(room.code).emit('room:playerLeft', {
    nickname: player.nickname,
    playersCount: room.players.length,
    players: toPublicRoom(room).players,
  });
}

// 방 단계(status)가 바뀐 뒤에 호출한다. 방 안의 모두에게 알려서 단계에 맞는 화면으로 이동시킨다.
// 채팅/투표 담당 코드에서 room.status를 바꾼 직후에 이 함수를 부르면 된다.
export function announceStatus(io: AppServer, room: Room): void {
  io.to(room.code).emit('room:statusChanged', { status: room.status });
}

// 대기실에서 소켓 연결 없이 오래 머문 사람(방 만들기/입장만 하고 떠난 경우)을 내보내고 알린다.
export function sweepStalePlayers(io: AppServer): void {
  for (const { room, player } of removeStalePlayers()) {
    broadcastLeft(io, room, player);
  }
}

export function registerRoomSocket(io: AppServer): void {
  // 1) 연결 검사: ?roomCode=...&token=... 가 이 방의 참가자인지 확인한다.
  //    실패하면 클라이언트는 connect_error를 받고, error.message가 에러 코드(ROOM_NOT_FOUND 등)다.
  //    roomCode 없이 연결하는 소켓(연결 상태 확인용 ping 등)은 방과 무관하므로 그대로 통과시킨다.
  io.use((socket, next) => {
    try {
      const query = socket.handshake.query;
      if (first(query.roomCode) === undefined) {
        next();
        return;
      }
      const { room, player } = resolveMember(first(query.roomCode), first(query.token));
      socket.data.roomCode = room.code;
      socket.data.playerId = player.id;
      next();
    } catch (error) {
      next(new Error(error instanceof RoomError ? error.code : 'INTERNAL'));
    }
  });
  

  io.on('connection', (socket) => {
    const { roomCode, playerId } = socket.data;
    if (roomCode === undefined || playerId === undefined) return; // 방과 무관한 연결

    // 2) 해당 방에 추가한다.
    let joined: ReturnType<typeof markConnected>;
    try {
      joined = markConnected(roomCode, playerId);
    } catch {
      socket.disconnect(true); // 검사 직후에 방이 사라진 경우
      return;
    }
    void socket.join(roomCode);

    // 3) 처음 들어온 사람이면 방 전체에 알린다. (화면을 옮기면서 재연결한 경우에는 다시 알리지 않는다)
    if (joined.firstConnect) {
      io.to(roomCode).emit('room:playerJoined', {
        nickname: joined.player.nickname,
        playersCount: joined.room.players.length,
        players: toPublicRoom(joined.room).players,
      });
    }
    console.log(`[room] ${roomCode} connected: player ${playerId} (${joined.player.nickname})`);

    // 현재 방 상태 조회: 화면이 열릴 때와 재연결될 때 클라이언트가 불러서 현재 단계를 맞춘다.
    socket.on('room:getState', (ack) => {
      respond(ack, () => ({ room: toPublicRoom(getRoom(roomCode)) }));
    });

    // 결과 조회: 방 상태가 ended일 때만 성공한다.
    socket.on('result:get', (ack) => {
      respond(ack, () => ({ result: computeResult(getRoom(roomCode)) }));
    });
    // TEMP: simple game start. Moves the room to 'playing' and tells everyone.
    // Replace with a real start (host check, min players, theme) later.
    socket.on('game:start', () => {
      try {
        const room = getRoom(roomCode);
        if (room.status !== 'waiting') return; // ignore double clicks
        room.status = 'playing';
        announceStatus(io, room);
        startGameLogic(io, room)
      } catch (error) {
        console.error('[game:start] failed:', error);
      }
    });

    socket.on('vote:submit', (data) => {
        submitVote(io, data.roomCode, data.voterNickname, data.targetPlayerNickname)
    });
    
    socket.on('chat:send', (data) => {
      console.log(data.message);
      io.to(data.roomCode).emit('chat:receive', {
        sender: data.sender,
        message: data.message,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('theme:refresh', () => {
      const room = updateTheme(roomCode);
      io.to(roomCode).emit('theme:updateAll', {newTheme: room.theme})
    });

    // 다시 하기: 대기실로 되돌리고 닉네임을 새로 배정한다. 방 전체에 room:reset을 보낸다.
    socket.on('room:rematch', (ack) => {
      respond(ack, () => {
        const { room, reset } = rematchRoom(roomCode, playerId);
        const players = toPublicRoom(room).players;
        if (reset) io.to(roomCode).emit('room:reset', { players });
        return { players };
      });
    });

    // 나가기: 방장이 나가면 다음 사람이 방장이 된다.
    socket.on('room:leave', (ack) => {
      respond(ack, () => {
        const left = leaveRoom(roomCode, playerId);
        void socket.leave(roomCode);
        if (left) broadcastLeft(io, left.room, left.player);
        return {};
      });
    });

    socket.on('disconnect', () => {
      markDisconnected(roomCode, playerId);
      console.log(`[room] ${roomCode} disconnected: player ${playerId}`);
    });
  });

  setInterval(() => sweepStalePlayers(io), SWEEP_INTERVAL_MS).unref();
}
