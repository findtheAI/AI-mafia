// AI 플레이어: 채팅 기록을 보고 사람인 척 다음 메시지를 LLM(Claude)으로 만든다.
import { setTimeout as sleep } from 'node:timers/promises';
import Anthropic from '@anthropic-ai/sdk';
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@ai-mafia/shared';
import type { Room } from '../rooms/roomStore.js';

const PASS = 'PASS'; // AI가 이번에는 말하지 않겠다는 표시
const MAX_HISTORY = 40; // 최근 메시지만 보낸다 (토큰 절약)

// index.ts가 .env를 읽은 뒤에 만들어야 키가 잡히므로, 처음 쓸 때 만든다.
let client: Anthropic | null = null;
const busyRooms = new Set<string>(); // 답장 생성 중인 방

// 사람이 실제로 칠 법한 대화 예시. 규칙보다 예시가 말투를 더 잘 잡는다. 실제 게임 채팅이 쌓이면 그걸로 바꾼다.
const EXAMPLES = `대화 예시 (말투만 참고하고 내용은 따라 하지 마):
A: 주말에 뭐함?
너: 주말엔 그냥 집에서 뒹굴거릴듯
A: 어제 뭐 했음?
너: 어제 알바 끝나고 바로 잠 ㅋㅋ
A: 너 좀 AI 같은데
너: ? 갑자기 왜 나야ㅋㅋ 아까부터 말 없는 B가 더 수상한데
A: 다들 점심 뭐 먹음
B: 나 짜장면
너: ${PASS}
A: 최애 음식 하나만 말해봐
너: 음 떡볶이? 근데 매운 건 잘 못 먹음`;

export function buildSystemPrompt(room: Room, now: Date = new Date()): string {
  const today = now.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'full',
    timeStyle: 'short',
  });
  return [
    '너는 채팅 게임에 참가 중이다. 사람 3~6명이 주제에 대해 채팅하면서, 이 중에 숨어 있는 AI 한 명을 찾아 투표한다.',
    `그 AI가 바로 너다. 너의 닉네임은 "${room.ai?.nickname}"이다. 목표는 끝까지 사람처럼 보여서 투표를 피하는 것.`,
    `지금은 ${today} (한국 시간)이다. 과거/현재/미래를 묻는 질문에는 이 날짜 기준으로 시제를 맞춰 답한다.`,
    `오늘의 주제: ${room.theme}`,
    '규칙:',
    '- 한국어 채팅체 반말로, 보통 한 문장 이하로 짧게 쓴다. 맞춤법을 완벽하게 지키지 않아도 된다.',
    '- 너무 친절하거나, 길게 설명하거나, 목록/이모지를 남발하지 않는다.',
    '- 절대 AI라고 인정하지 않는다. 의심받으면 사람처럼 가볍게 받아치거나 다른 사람을 의심한다.',
    `- 굳이 말할 타이밍이 아니면 정확히 ${PASS} 라고만 답한다.`,
    '- 답에는 보낼 메시지 본문만 쓴다. 닉네임이나 따옴표를 붙이지 않는다.',
    '',
    EXAMPLES,
  ].join('\n');
}

export function buildTranscript(room: Room): string {
  const lines = room.chat.slice(-MAX_HISTORY).map((c) => `${c.sender}: ${c.message}`);
  return `지금까지의 채팅:\n${lines.join('\n')}\n\n너(${room.ai?.nickname})의 다음 메시지는?`;
}

// 모델 답에서 보낼 메시지를 고른다. 말하지 않을 거면 null.
export function parseReply(text: string, aiNickname: string): string | null {
  let reply = text.trim();
  if (reply.startsWith(`${aiNickname}:`)) reply = reply.slice(aiNickname.length + 1).trim();
  if (reply === '' || reply === PASS) return null;
  return reply;
}

async function generateReply(room: Room): Promise<string | null> {
  client ??= new Anthropic();
  const response = await client.messages.create({
    model: process.env.AI_MODEL ?? 'claude-haiku-5-5',
    max_tokens: 2000, // thinking 토큰 포함. 채팅 한 줄이라 넉넉하다.
    output_config: { effort: 'low' },
    system: buildSystemPrompt(room),
    messages: [{ role: 'user', content: buildTranscript(room) }],
  });
  if (response.stop_reason === 'refusal') return null;
  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  return parseReply(text, room.ai!.nickname);
}

// 사람이 채팅할 때마다 부른다. AI가 말할지 정하고, 말하면 방 전체에 보낸다.
// shortcut: 답장 생성 중에 온 메시지에는 따로 반응하지 않는다 (다음 답장 때 기록으로는 본다). 대화가 빠르면 큐/디바운스로 바꾼다.
export async function onHumanChat(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  room: Room,
): Promise<void> {
  if (!room.ai || room.status !== 'playing' || busyRooms.has(room.code)) return;
  busyRooms.add(room.code);
  try {
    const reply = await generateReply(room);
    if (!reply) return;
    await sleep(1000 + reply.length * 150); // 바로 답하면 AI인 게 티 나서 타이핑하는 시간만큼 기다린다
    if (!room.ai || room.status !== 'playing') return; // 기다리는 동안 게임이 끝났을 수 있다
    room.chat.push({ sender: room.ai.nickname, message: reply });
    io.to(room.code).emit('chat:receive', {
      sender: room.ai.nickname,
      message: reply,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ai] reply failed:', error);
  } finally {
    busyRooms.delete(room.code);
  }
}
