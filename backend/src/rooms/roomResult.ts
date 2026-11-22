import type { ResultWinner, RoomResult, TallyEntry } from '@ai-mafia/shared';
import { RoomError } from './roomStore.js';
import type { Room } from './roomStore.js';

// 결과 계산: 방이 'ended'이고 AI가 정해져 있을 때만 호출할 수 있다.
// (RESULT-02: 결과를 열기 전에는 서버가 AI 정보를 화면에 보내지 않는다)
export function computeResult(room: Room): RoomResult {
  if (room.status !== 'ended' || !room.ai) {
    throw new RoomError(409, 'RESULT_NOT_READY', 'The result is not available yet.');
  }
  const aiNickname = room.ai.nickname;

  const participants = [...room.players.map((p) => p.nickname), aiNickname];
  const isParticipant = new Set(participants);

  // 방에 없는 닉네임이 섞인 표와 자기 자신에게 한 표는 세지 않는다.
  const counts = new Map<string, number>(participants.map((nickname) => [nickname, 0]));
  let totalVotes = 0;
  for (const [voter, target] of Object.entries(room.votes)) {
    if (!isParticipant.has(voter) || !isParticipant.has(target) || voter === target) continue;
    counts.set(target, (counts.get(target) ?? 0) + 1);
    totalVotes += 1;
  }

  const tally: TallyEntry[] = participants
    .map((nickname) => ({ nickname, votes: counts.get(nickname) ?? 0, isAi: nickname === aiNickname }))
    .sort((a, b) => b.votes - a.votes || a.nickname.localeCompare(b.nickname, 'ko'));

  const maxVotes = tally[0]?.votes ?? 0;
  const topVoted = maxVotes > 0 ? tally.filter((t) => t.votes === maxVotes).map((t) => t.nickname) : [];

  // 승패 규칙 (RESULT-03): 최다 득표자가 AI면 사람 팀 승리, 아니면 AI 승리.
  // 동점일 때는 아직 팀에서 정하지 않았다. 일단 "단독 1위가 AI일 때만 사람 팀 승리"로 둔다.
  // 규칙이 정해지면 이 아래 한 줄만 고치면 된다.
  const winner: ResultWinner = topVoted.length === 1 && topVoted[0] === aiNickname ? 'humans' : 'ai';

  return { winner, aiNickname, isTie: topVoted.length > 1, topVoted, totalVotes, tally };
}
