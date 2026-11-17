import type { PublicPlayer } from '@ai-mafia/shared';

// 백엔드 REST API 호출 모음. REST는 방 만들기/입장 두 가지만 쓴다. (명세서: /api/room/create, /api/room/join)
// 방 안의 소식(참가자, 단계 변경, 결과 등)은 소켓으로 주고받는다. (lib/socket.ts)
// 백엔드 주소는 frontend/.env.local의 NEXT_PUBLIC_API_URL로 바꿀 수 있다.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export interface JoinedRoom {
  roomCode: string;
  players: PublicPlayer[];
  nickname: string;
  playerId: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network error.');
  }

  const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; code?: string };
  if (!res.ok || data.success === false) {
    throw new ApiError(res.status, data.code ?? 'UNKNOWN', data.error ?? 'Request failed.');
  }
  return data as T;
}

export function createRoom(): Promise<JoinedRoom> {
  return post<JoinedRoom>('/api/room/create');
}

export function joinRoom(roomCode: string): Promise<JoinedRoom> {
  return post<JoinedRoom>('/api/room/join', { roomCode });
}

// 에러 코드별 안내 문구 (MAIN-04: 없는 방 / 이미 시작한 방 / 정원 초과를 구분)
// REST 에러(ApiError.code)와 소켓 에러(연결 거절의 message, ack의 code)가 같은 코드를 쓴다.
export function describeCode(code: string): string {
  switch (code) {
    case 'NETWORK':
      return '서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.';
    case 'ROOM_CODE_REQUIRED':
      return '방 코드를 입력해주세요.';
    case 'ROOM_NOT_FOUND':
      return '존재하지 않거나 만료된 방이에요. 방 코드를 다시 확인해주세요.';
    case 'ROOM_NOT_JOINABLE':
      return '이미 게임이 시작된 방이라 들어갈 수 없어요.';
    case 'ROOM_FULL':
      return '방이 가득 찼어요. (최대 6명)';
    case 'RESULT_NOT_READY':
      return '아직 결과가 공개되지 않았어요.';
    case 'ROOM_NOT_ENDED':
      return '아직 게임이 끝나지 않았어요.';
    case 'NOT_A_MEMBER':
      return '이 방의 참가자가 아니에요.';
    default:
      return '문제가 생겼어요. 잠시 후 다시 시도해주세요.';
  }
}

export function describeError(error: unknown): string {
  return describeCode(error instanceof ApiError ? error.code : 'UNKNOWN');
}
