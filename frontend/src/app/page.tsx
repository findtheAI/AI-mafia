'use client';

import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@ai-mafia/shared';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

type Status = 'connecting' | 'connected' | 'disconnected';

export default function Home() {
  const [status, setStatus] = useState<Status>('connecting');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(BACKEND_URL);

    socket.on('connect', () => setStatus('connected'));
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('server:hello', ({ message }) => setMessage(message));

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <h1>AI Mafia</h1>
      <p>서버 연결 상태: {status}</p>
      {message && <p>{message}</p>}
    </main>
  );
}
