import type { RoomStatus } from '@ai-mafia/shared';

export const HOME_PATH = '/';

export const lobbyPath = (roomCode: string) => `/room/${roomCode}`;
export const resultPath = (roomCode: string) => `/room/${roomCode}/result`;

// 방 상태(status)에 맞는 화면 주소. 폴링하다가 상태가 바뀌면 여기로 보낸다. (COMMON-04)
// 채팅/투표 화면 주소가 정해지면 'playing' 한 줄만 고치면 된다.
export function pathForStatus(roomCode: string, status: RoomStatus): string {
  switch (status) {
    case 'waiting':
      return lobbyPath(roomCode);
    case 'playing':
      return lobbyPath(roomCode); // TODO: 채팅/투표 화면 경로로 교체
    case 'ended':
      return resultPath(roomCode);
  }
}
