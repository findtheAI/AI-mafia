// Socket.IO 이벤트 타입. 프론트/백 양쪽에서 이 타입으로 소켓을 생성합니다.

/** 서버 → 클라이언트 */
export interface ServerToClientEvents {
  'server:hello': (payload: { message: string }) => void;
}

/** 클라이언트 → 서버 */
export interface ClientToServerEvents {
  'client:ping': (ack: (payload: { serverTime: number }) => void) => void;
}
