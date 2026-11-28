// 게임 규칙 초안 — 기획이 확정되면 수정하세요.

export const ROLES = ['mafia', 'citizen', 'doctor', 'police'] as const;
export type Role = (typeof ROLES)[number];

export const GAME_PHASES = ['wait', 'chat', 'vote', 'result'] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

// 게임 제한 시간 (초)
export const CHAT_TIME = 5;
export const VOTE_TIME = 10;

// 게임) 상태
export interface GameState {
    phase: GamePhase;
    phaseEndsAt: number | null;
    votes: Record<string, string>;
}