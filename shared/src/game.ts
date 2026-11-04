// 게임 규칙 초안 — 기획이 확정되면 수정하세요.

export const ROLES = ['mafia', 'citizen', 'doctor', 'police'] as const;
export type Role = (typeof ROLES)[number];

export const GAME_PHASES = ['lobby', 'day', 'vote', 'night', 'ended'] as const;
export type GamePhase = (typeof GAME_PHASES)[number];
