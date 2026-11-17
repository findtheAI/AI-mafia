// 새로고침해도 같은 방과 닉네임으로 돌아오기 위한 저장소 (COMMON-02).
// 탭마다 따로 저장(sessionStorage)해서, 새 탭을 열면 다른 플레이어로 입장해볼 수 있다.
export interface Session {
  roomCode: string;
  playerId: number;
  nickname: string;
}

const key = (roomCode: string) => `ai-mafia:room:${roomCode.toUpperCase()}`;

export function saveSession(session: Session): void {
  try {
    sessionStorage.setItem(key(session.roomCode), JSON.stringify(session));
  } catch {
    // 저장소를 쓸 수 없는 환경이면 새로고침 복귀만 안 된다.
  }
}

export function loadSession(roomCode: string): Session | null {
  try {
    const raw = sessionStorage.getItem(key(roomCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed.roomCode === 'string' && typeof parsed.playerId === 'number' && typeof parsed.nickname === 'string') {
      return { roomCode: parsed.roomCode, playerId: parsed.playerId, nickname: parsed.nickname };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSession(roomCode: string): void {
  try {
    sessionStorage.removeItem(key(roomCode));
  } catch {
    // 무시
  }
}
