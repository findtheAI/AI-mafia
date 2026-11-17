// Socket.IO 이벤트 타입. 프론트/백 양쪽에서 이 타입으로 소켓을 생성합니다.
import type { GamePhase } from './game.js';
import type { Role } from './game.js';

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

  // 게임 단계 변경시 전체 플레이어에게 알림
  'game:phaseChanged': (payload: { phase: GamePhase, phaseEndsAt: number | null; }) => void;
  // 투표 정상처리됬는지 알림
  'vote:ack': (payload: { success: boolean, error?: string }) => void;
  // 투표 결과 전달
  'vote:result': (payload: { votes: Record<number, number>, voteCounts: Record<number, number>}) => void;
  // 게임 종료 및 플레이어 정체 공개
  'game:ended': (payload: { roles: Record<number, Role> }) => void;
}

/** 클라이언트 → 서버 */
export interface ClientToServerEvents {
  'client:ping': (ack: (payload: { serverTime: number }) => void) => void;
  'chat:send' : (payload: { sender: string, message: string, roomCode: string }) => void; // 플레이어가 서버한테 메시지를 보내는 이벤트

  // 호스트가 게임 시작 버튼 누름
  'game:start': (payload: { roomCode: string, playerId: number }) => void;
  // 플레이어가 투표
  'vote:submit': (payload: {roomCode: string, voterId: number, targetPlayerId: number}) => void;
}
