'use client';

// frontend/app/room/[code]/page.tsx
// Waiting room + chat. The server's room status decides which screen is shown.

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { SyntheticEvent } from 'react';
import type { PublicPlayer, PublicRoom, RoomStatus, ServerToClientEvents } from '@ai-mafia/shared';
import { HOME_PATH, pathForStatus } from '@/lib/routes';
import { clearSession, loadSession, saveSession } from '@/lib/session';
import type { Session } from '@/lib/session';
import { connectRoomSocket } from '@/lib/socket';

type ChatMessage = Parameters<ServerToClientEvents['chat:receive']>[0];

const box = { border: '1px solid rgba(128,128,128,.4)', borderRadius: 8, padding: 12 };

export default function WaitPage() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = String(rawCode ?? '').toUpperCase();
  const router = useRouter();

  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [socket, setSocket] = useState<ReturnType<typeof connectRoomSocket> | null>(null);
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unstable, setUnstable] = useState(false);
  const [error, setError] = useState('');
  const sessionRef = useRef<Session | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const session = loadSession(code);
    // Opened without joining first (for example from an invite link): go join on the main page.
    if (!session || session.roomCode !== code) {
      router.replace(`/?code=${code}`);
      return;
    }
    sessionRef.current = session;

    const s = connectRoomSocket(session);

    // Apply a full room snapshot from the server.
    const applyRoom = (next: PublicRoom) => {
      const me = next.players.find((p) => p.id === session.playerId);
      if (!me) {
        // We are no longer in this room.
        clearSession(code);
        router.replace(HOME_PATH);
        return;
      }
      if (me.nickname !== sessionRef.current?.nickname) {
        const updated = { ...session, nickname: me.nickname };
        sessionRef.current = updated;
        saveSession(updated);
      }
      if (next.status === 'ended') {
        router.replace(pathForStatus(code, 'ended'));
        return;
      }
      setRoom(next);
    };

    // Ask the server for the current state. Runs on open and on every (re)connect,
    // so anything missed while disconnected or on another page is caught up.
    const syncState = () => {
      s.emit('room:getState', (res) => {
        if (res.success) applyRoom(res.room);
        else setError(res.error);
      });
    };

    const onConnect = () => {
      setUnstable(false);
      syncState();
    };
    const onDisconnect = () => setUnstable(true);

    const onChat = (data: ChatMessage) => setChatLog((prev) => [...prev, data]);

    // waiting / playing / ended. Re-sync instead of trusting only the status,
    // because the theme and players may have changed when the game started.
    const onStatus = ({ status }: { status: RoomStatus }) => {
      if (status === 'ended') router.replace(pathForStatus(code, 'ended'));
      else syncState();
    };

    const onPlayers = ({ players }: { players: PublicPlayer[] }) =>
      setRoom((prev) => (prev ? { ...prev, players, playerCount: players.length } : prev));

    const onThemeUpdated = ({ newTheme }: { newTheme: string }) => {
      console.log('[theme:updateAll]', newTheme);
      setRoom((prev) => (prev ? { ...prev, theme: newTheme } : prev));
    };
    
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('chat:receive', onChat);
    s.on('room:statusChanged', onStatus);
    s.on('room:playerJoined', onPlayers);
    s.on('room:playerLeft', onPlayers);
    s.on('theme:updateAll', onThemeUpdated);
    setSocket(s);
    if (s.connected) syncState();

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('chat:receive', onChat);
      s.off('room:statusChanged', onStatus);
      s.off('room:playerJoined', onPlayers);
      s.off('room:playerLeft', onPlayers);
      s.off('theme:updateAll', onThemeUpdated);
    };
  }, [code, router]);

  // Keep the newest message in view.
  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'end' });
  }, [chatLog]);

  const session = sessionRef.current;
  const me = room?.players.find((p) => p.id === session?.playerId);
  const isHost = me?.isHost ?? false;
  const enoughPlayers = room ? room.playerCount >= room.minPlayersToStart : false;

  // The server changes the status and announces it with room:statusChanged; nothing moves locally.
  const startGame = () => {
    if (!socket || !session || !isHost) return;
    socket.emit('game:start', { roomCode: session.roomCode });
  };

  const refreshTheme = () => {
    if (!socket || !session) return;
    socket.emit('theme:refresh', { roomCode: session.roomCode, playerId: session.playerId });
  };

  const sendChat = (event: SyntheticEvent) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || !socket || !session) return;
    socket.emit('chat:send', { sender: session.nickname, message, roomCode: session.roomCode });
    setChatInput('');
  };

  const banner = unstable && <p role="status">연결이 불안정해요. 다시 연결하는 중이에요.</p>;
  const errorText = error && <p role="alert">{error}</p>;

  if (!room) {
    return (
      <main style={{ maxWidth: 360, margin: '0 auto', padding: 24 }}>
        <p role="status">불러오는 중이에요…</p>
        {banner}
        {errorText}
      </main>
    );
  }

  if (room.status === 'waiting') {
    return (
      <main style={{ maxWidth: 360, margin: '0 auto', padding: 24, display: 'grid', gap: 16 }}>
        <h1>대기실</h1>
        {banner}
        <p>
          방 코드: <strong>{code}</strong>
        </p>
        <div style={box}>
          <small>
            참가자 {room.playerCount}/{room.maxPlayers}
          </small>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {room.players.map((p) => (
              <li key={p.id}>
                {p.nickname}
                {p.isHost && ' 👑'}
                {p.id === session?.playerId && ' (나)'}
              </li>
            ))}
          </ul>
        </div>
        <button type="button" onClick={startGame} disabled={!socket || !isHost || !enoughPlayers}>
          게임 시작
        </button>
        {!isHost && <small>방장이 게임을 시작해요.</small>}
        {isHost && !enoughPlayers && <small>최소 {room.minPlayersToStart}명이 필요해요.</small>}
        {errorText}
      </main>
    );
  }

  // status === 'playing'
  return (
    <main style={{ maxWidth: 360, margin: '0 auto', padding: 24, display: 'grid', gap: 12 }}>
      <h1>채팅</h1>
      {banner}
      <div style={{ ...box, textAlign: 'center' }}>
        <small>오늘의 주제</small>
        <p style={{ margin: '4px 0 8px', fontWeight: 700 }}>{room.theme || '불러오는 중…'}</p>
        <button type="button" onClick={refreshTheme} disabled={!socket}>
          주제 새로고침
        </button>
      </div>
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
      {errorText}
    </main>
  );
}