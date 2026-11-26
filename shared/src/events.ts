// Socket.IO 이벤트 타입. 프론트/백 양쪽에서 이 타입으로 소켓을 생성합니다.
import type { GamePhase } from './game.js';
import type { Role } from './game.js';

// 방 상태: waiting(대기실) -> playing(채팅·투표 진행) -> ended(결과 공개)
export type RoomStatus = 'waiting' | 'playing' | 'ended';

export interface PublicPlayer {
  id: number;
  nickname: string;
  isHost: boolean;
}

// 화면에 보여줘도 되는 방 정보. AI 정보와 투표 내용은 절대 들어가지 않는다.
export interface PublicRoom {
  code: string;
  status: RoomStatus;
  maxPlayers: number;
  minPlayersToStart: number;
  playerCount: number;
  players: PublicPlayer[];
  theme: string;
}

export type ResultWinner = 'humans' | 'ai';

export interface TallyEntry {
  nickname: string;
  votes: number;
  isAi: boolean;
}

export interface RoomResult {
  winner: ResultWinner;
  aiNickname: string;
  isTie: boolean; // 최다 득표자가 2명 이상
  topVoted: string[]; // 최다 득표자 닉네임 (표가 하나도 없으면 빈 배열)
  totalVotes: number;
  tally: TallyEntry[]; // 득표 많은 순. 표를 못 받은 참가자와 AI도 포함
}

// 응답을 돌려주는(ack) 소켓 이벤트의 공통 응답 모양
export type SocketAck<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: string; code: string };

// 소켓 연결 때 쿼리로 보내는 값: ?roomCode=A3F9K2&token=...
// token은 방 만들기/입장 응답으로 받은 본인 확인용 비밀 값이다. (명세서의 nickname 대신. 닉네임은 남도 알 수 있어서 사칭이 된다)
export interface RoomSocketQuery {
  roomCode: string;
  token: string;
}

// 서버 -> 클라이언트
export interface ServerToClientEvents {
  // 방 전체: 새 참가자가 들어왔다 (명세서)
  'room:playerJoined': (payload: { nickname: string; playersCount: number; players: PublicPlayer[] }) => void;
  // 방 전체: 참가자가 나갔다. 방장이 바뀌었으면 players의 isHost에 반영되어 있다.
  'room:playerLeft': (payload: { nickname: string; playersCount: number; players: PublicPlayer[] }) => void;
  // 방 전체: 방 단계가 바뀌었다 (waiting / playing / ended). 받으면 단계에 맞는 화면으로 이동한다.
  'room:statusChanged': (payload: { status: RoomStatus }) => void;
  // 방 전체: 다시 하기로 대기실로 돌아갔고 닉네임이 새로 배정됐다. 내 닉네임은 players에서 내 id로 찾는다.
  'room:reset': (payload: { players: PublicPlayer[] }) => void;
  // 방 천체: 클라이언트한테 받은 메시지 재송출 
  'chat:receive': (payload: { sender: string, message: string, timestamp: string }) => void;

  // 게임 단계 변경시 전체 플레이어에게 알림
  'game:phaseChanged': (payload: { phase: GamePhase, phaseEndsAt: number | null; }) => void;
  // 투표 정상처리됬는지 알림
  'vote:ack': (payload: { success: boolean, error?: string }) => void;
  // 투표 결과 전달
  'vote:result': (payload: { votes: Record<number, number>, voteCounts: Record<number, number>}) => void;
  // 게임 종료 및 플레이어 정체 공개
  'game:ended': (payload: { roles: Record<number, Role> }) => void;

  // 주제 새로고침 후 나머지에게 전달
  'theme:updateAll': (payload: {newTheme: string}) => void;
}

// 클라이언트 -> 서버 (나는 누구인지는 연결할 때 이미 정해졌으므로 playerId를 따로 보내지 않는다)
export interface ClientToServerEvents {
  // 지금 방 상태를 묻는다. 화면이 열릴 때와 (재)연결될 때마다 불러서 현재 단계/참가자를 맞춘다.
  // (이미 연결된 소켓을 다른 화면이 이어 쓰기 때문에, 연결 순간에 한 번 보내주는 방식으로는 놓칠 수 있다)
  'room:getState': (ack: (res: SocketAck<{ room: PublicRoom }>) => void) => void;
  // 결과 조회: 방 상태가 ended일 때만 성공한다. 그 전에는 code RESULT_NOT_READY
  'result:get': (ack: (res: SocketAck<{ result: RoomResult }>) => void) => void;
  // 다시 하기: 방을 대기실로 되돌리고 닉네임을 새로 배정한다
  'room:rematch': (ack: (res: SocketAck<{ players: PublicPlayer[] }>) => void) => void;
  // 나가기
  'room:leave': (ack: (res: SocketAck) => void) => void;
  // 메시지 보내기
  'chat:send' : (payload: { sender: string, message: string, roomCode: string }) => void; // 플레이어가 서버한테 메시지를 보내는 이벤트

  // 호스트가 게임 시작 버튼 누름
  'game:start': (payload: { roomCode: string, playerId: number }) => void;
  // 플레이어가 투표
  'vote:submit': (payload: {roomCode: string, voterId: number, targetPlayerId: number}) => void;

  // 주제 리프레쉬
  'theme:refresh': (payload: {roomCode: string, playerId: number}) => void;
}