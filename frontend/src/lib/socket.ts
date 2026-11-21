import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { RoomClientToServerEvents, RoomServerToClientEvents } from '@ai-mafia/shared';
import { API_URL } from './api';
import type { Session } from './session';

// 방 안의 소식을 주고받는 소켓. 이벤트 이름과 payload 타입은 shared/src/room.ts에 있다.
export type RoomSocket = Socket<RoomServerToClientEvents, RoomClientToServerEvents>;

let current: { socket: RoomSocket; roomCode: string; playerId: number } | null = null;

// 방 코드로 소켓에 연결한다. (?roomCode=방코드&token=본인 확인용 값)
// 연결은 하나만 만들어서 화면이 바뀌어도 이어 쓴다. 같은 방/같은 사람이면 이미 있는 연결을 돌려준다.
// 연결이 거절되면 'connect_error'가 오고, error.message가 에러 코드(ROOM_NOT_FOUND, NOT_A_MEMBER 등)다.
export function connectRoomSocket(session: Session): RoomSocket {
  if (current && current.roomCode === session.roomCode && current.playerId === session.playerId) {
    return current.socket;
  }
  disconnectRoomSocket();

  const socket: RoomSocket = io(API_URL, {
    query: { roomCode: session.roomCode, token: session.token },
  });
  current = { socket, roomCode: session.roomCode, playerId: session.playerId };
  return socket;
}

export function disconnectRoomSocket(): void {
  current?.socket.disconnect();
  current = null;
}
