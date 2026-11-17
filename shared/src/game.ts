// 게임 규칙 초안 — 기획이 확정되면 수정하세요.

export const ROLES = ['mafia', 'citizen', 'doctor', 'police'] as const;
export type Role = (typeof ROLES)[number];

export const GAME_PHASES = ['lobby', 'day', 'vote', 'night', 'ended'] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

// 게임 제한 시간 (초)
export const DISCUSSION_TIME = 60;
export const VOTING_TIME = 10;

// 게임) 상태
export interface GameState {
    phase: GamePhase;
    phaseEndsAt: number | null;
    votes: Record<number, number>;
    voteCounts: Record<number, number>;
}