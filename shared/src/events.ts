// Socket.IO 이벤트 타입. 프론트/백 양쪽에서 이 타입으로 소켓을 생성합니다.

// 플레이어 인터페이스
export interface Player {
  id: number;
  nickname: string;
  isHost: boolean;
}
/** 서버 → 클라이언트 */
export interface ServerToClientEvents {
  'server:hello': (payload: { message: string }) => void;
  'chat:receive': (payload: { sender: string, message: string, timestamp: string }) => void; // 플레이어가 메시지를 보냈을 때 나머지 플레이어들한테도 보내는 이벤트
  'room:playerJoined': (payload: { nickname: string; playersCount: number; players: Player[] }) => void; 
  // ^ 새 플레이어가 방에 참가했을 때 백엔드 측에서 이런저런 작업을 수행하고 정보를 반환해주는 이벤트
}

/** 클라이언트 → 서버 */
export interface ClientToServerEvents {
  'client:ping': (ack: (payload: { serverTime: number }) => void) => void;
  'chat:send' : (payload: { sender: string, message: string, roomCode: string }) => void; // 플레이어가 서버한테 메시지를 보내는 이벤트
}
