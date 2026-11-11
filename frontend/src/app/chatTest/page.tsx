'use client';

import React, { useState } from 'react';
import { io, Socket } from 'socket.io-client';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export default function ChatTestPage() {
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [currentRoom, setCurrentRoom] = useState<any>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<string[]>([]);

  // Connect to Socket.io with roomCode and assigned nickname query params
  const connectSocket = (roomCode: string, nickname: string) => {
    const newSocket = io(BACKEND_URL, {
      query: { roomCode, nickname },
    });

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
    });

    // Listen for incoming chat messages (assuming your chatSocket handles broadcasting back)
    newSocket.on('chat:receive' as any, (data: { nickname: string; message: string }) => {
      setChatLog((prev) => [...prev, `${data.nickname}: ${data.message}`]);
    });

    setSocket(newSocket);
  };

  const createRoom = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/room/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setCurrentRoom(data);
        setRoomCodeInput(data.roomCode);
        connectSocket(data.roomCode, data.nickname);
      }
    } catch (err) {
      console.error('Failed to create room', err);
    }
  };

  const joinRoom = async () => {
    if (!roomCodeInput.trim()) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/room/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: roomCodeInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentRoom(data);
        const joinedPlayer = data.players[data.players.length - 1];
        connectSocket(data.roomCode, joinedPlayer.nickname);
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error('Failed to join room', err);
    }
  };

  // Invokes the chat:send socket event
  const sendChatMessage = () => {
    if (!chatInput.trim() || !socket) return;
    
    socket.emit('chat:send', { message: chatInput });
    setChatInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '350px', padding: '20px' }}>
      <button onClick={createRoom}>Create Room</button>

      <div style={{ display: 'flex', gap: '5px' }}>
        <input
          type="text"
          value={roomCodeInput}
          onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
          placeholder="Enter Room Code"
        />
        <button onClick={joinRoom}>Join</button>
      </div>

      {currentRoom && (
        <div style={{ marginTop: '10px', border: '1px solid #ccc', padding: '10px' }}>
          <h4>Room Code: {currentRoom.roomCode}</h4>
          
          <div style={{ border: '1px solid #ddd', height: '120px', overflowY: 'scroll', padding: '5px', marginBottom: '10px', background: '#f9f9f9' }}>
            {chatLog.map((msg, index) => (
              <div key={index} style={{ fontSize: '14px' }}>{msg}</div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '5px' }}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type your message..."
            />
            <button onClick={sendChatMessage}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}