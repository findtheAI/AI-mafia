import { generateNickname } from './nicknames.js';
import type { Room } from './roomStore.js';

// 방을 "결과가 나온 상태"로 만든다. 채팅/투표가 아직 없을 때 결과 화면을 확인하려고 쓴다. (devTools.ts에서 호출)
//
// outcome 'humans': 사람들이 AI에게 투표 (3명 이상이면 한 명은 다른 사람에게 투표해서 표가 갈린다)
// outcome 'ai':     사람들이 첫 번째 사람에게 투표 (첫 번째 사람은 AI에게 투표)
export function finishRoomForDemo(room: Room, outcome: 'humans' | 'ai' = 'humans'): void {
  const ai = generateNickname(new Set(room.players.map((p) => p.nickname)));
  const first = room.players[0]?.nickname ?? ai;
  const last = room.players.length - 1;

  const votes: Record<string, string> = {};
  room.players.forEach((player, index) => {
    if (outcome === 'ai') {
      votes[player.nickname] = index === 0 ? ai : first;
    } else {
      votes[player.nickname] = room.players.length >= 3 && index === last ? first : ai;
    }
  });

  room.ai = { nickname: ai };
  room.votes = votes;
  room.status = 'ended';
}
