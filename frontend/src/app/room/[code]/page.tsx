'use client';

// Save as: frontend/app/room/[code]/page.tsx
// One route for the whole room. `phase` decides which screen is shown.

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import type { RoomStatus, ServerToClientEvents } from '@ai-mafia/shared';
import { loadSession } from '@/lib/session';
import type { Session } from '@/lib/session';
import { connectRoomSocket } from '@/lib/socket';

// Later phases (voting, result) get added here.
type Phase = 'waiting' | 'chat';
// Taken from the shared contract so it always matches what the server sends: { sender, message, timestamp }
type ChatMessage = Parameters<ServerToClientEvents['chat:receive']>[0];

const box = { border: '1px solid rgba(128,128,128,.4)', borderRadius: 8, padding: 12 };

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('waiting');
  const [socket, setSocket] = useState<ReturnType<typeof connectRoomSocket> | null>(null);
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const sessionRef = useRef<Session | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const session = loadSession(code);
    // Opened without joining first (for example from an invite link): go join on the main page.
    if (!session || session.roomCode !== code.toUpperCase()) {
      router.replace(`/?code=${code}`);
      return;
    }
    sessionRef.current = session;

    const s = connectRoomSocket(session);
    const onChat = (data: ChatMessage) => setChatLog((prev) => [...prev, data]);
    // The server announces phase changes with room:statusChanged (waiting / playing / ended).
    const onStatus = ({ status }: { status: RoomStatus }) => {
      if (status === 'playing') setPhase('chat');
      else if (status === 'waiting') setPhase('waiting');
    };

    s.on('chat:receive', onChat);
    s.on('room:statusChanged', onStatus);
    setSocket(s);

    return () => {
      s.off('chat:receive', onChat);
      s.off('room:statusChanged', onStatus);
    };
  }, [code, router]);

  // Keep the newest message in view.
  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'end' });
  }, [chatLog]);

  // TODO: local only, so each tab moves on its own. The real flow is up to the contract: the server
  // would announce the change with room:statusChanged ('playing'), which the listener above handles.
  const startGame = () => {
    setPhase('chat');
  };

  const sendChat = (event: SyntheticEvent) => {
    event.preventDefault();
    const message = chatInput.trim();
    const session = sessionRef.current;
    if (!message || !socket || !session) return;
    // Same payload the shared contract defines for chat:send.
    socket.emit('chat:send', { sender: session.nickname, message, roomCode: session.roomCode });
    setChatInput('');
  };

  if (phase === 'waiting') {
    return (
      <main style={{ maxWidth: 360, margin: '0 auto', padding: 24, display: 'grid', gap: 16 }}>
        <h1>대기실</h1>
        <p>
          방 코드: <strong>{code}</strong>
        </p>
        <button type="button" onClick={startGame} disabled={!socket}>
          게임 시작
        </button>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 360, margin: '0 auto', padding: 24, display: 'grid', gap: 12 }}>
      <h1>채팅</h1>
      <div style={{ ...box, height: 300, overflowY: 'auto' }}>
        {chatLog.map((m, i) => (
          <div key={`${m.timestamp}-${i}`}>
            <strong>{m.sender}</strong>: {m.message}
          </div>
        ))}
        <div ref={logEnd} />
      </div>
      <form onSubmit={sendChat} style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1 }}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="메시지를 입력하세요"
          autoComplete="off"
        />
        <button type="submit">전송</button>
      </form>
    </main>
  );
}
