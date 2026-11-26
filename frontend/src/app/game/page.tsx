
'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@ai-mafia/shared';
import './game.css';

const SERVER_URL = 'http://localhost:8000';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Phase = 'lobby' | 'day' | 'vote' | 'ended';

interface Player {
  id: number;
  nickname: string;
  isHost: boolean;
}

interface Message {
  sender: string;
  message: string;
  timestamp: string;
}

export default function GamePage() {
  const socketRef = useRef<GameSocket | null>(null);

  // 방 정보
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [playerId, setPlayerId] = useState('1');
  const [players, setPlayers] = useState<Player[]>([]);
  const [connected, setConnected] = useState(false);

  // 게임 상태
  const [phase, setPhase] = useState<Phase>('lobby');
  const [theme, setTheme] = useState<string | null>(null);
  const [phaseEndsAt, setPhaseEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [status, setStatus] = useState('');

  // 채팅
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  // 투표
  const [targetId, setTargetId] = useState<number | null>(null);
  const [voted, setVoted] = useState(false);
  const [votes, setVotes] = useState<Record<number, number> | null>(null);
  const [voteCounts, setVoteCounts] = useState<Record<number, number> | null>(null);

  const myId = Number(playerId);
  const me = players.find((player) => player.id === myId);
  const isHost = me?.isHost ?? false;

  // 남은 시간 표시
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const timeLeft = phaseEndsAt === null
    ? null
    : Math.max(0, Math.ceil((phaseEndsAt - now) / 1000));

  function formatTime(seconds: number | null) {
    if (seconds === null) return '--:--';

    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;

    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  // 방 상태를 확인하고 소켓에 연결
  async function connectRoom() {
    const code = roomCode.trim().toUpperCase();
    const name = nickname.trim();

    if (!code || !name || !Number.isInteger(myId) || myId <= 0) {
      setStatus('방 코드, 닉네임, 플레이어 ID를 확인해주세요.');
      return;
    }

    socketRef.current?.disconnect();
    socketRef.current = null;
    setConnected(false);

    try {
      const res = await fetch(`${SERVER_URL}/api/room/${encodeURIComponent(code)}/state`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setStatus(data.error || '방을 찾을 수 없습니다.');
        return;
      }

      const player = (data.players as Player[]).find(
        (p) => p.id === myId && p.nickname === name
      );

      if (!player) {
        setStatus('플레이어 정보가 일치하지 않습니다.');
        return;
      }

      setPlayers(data.players);
      setTheme(data.theme);
      setPhase(data.phase);
      setPhaseEndsAt(data.phaseEndsAt);
      setRoomCode(code);
      setVoted(false);
      setTargetId(null);
      setVotes(null);
      setVoteCounts(null);
      setMessages([]);

      const socket: GameSocket = io(SERVER_URL, {
        query: {
          roomCode: code,
          nickname: name
        }
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        setStatus('서버에 연결되었습니다.');
      });

      socket.on('disconnect', () => {
        setConnected(false);
        setStatus('서버 연결이 끊어졌습니다.');
      });

      socket.on('connect_error', (error) => {
        setConnected(false);
        setStatus(error.message);
      });

      socket.on('room:playerJoined', (data) => {
        setPlayers(data.players);
      });

      socket.on('chat:receive', (data) => {
        setMessages((prev) => [...prev, data]);
      });

      socket.on('game:phaseChanged', (data) => {
        setPhase(data.phase as Phase);
        setPhaseEndsAt(data.phaseEndsAt);

        if (data.phase === 'day') {
          setMessages([]);
          setVotes(null);
          setVoteCounts(null);
        }

        if (data.phase === 'vote') {
          setTargetId(null);
          setVoted(false);
        }
      });

      socket.on('vote:ack', (data) => {
        if (data.success) {
          setVoted(true);
          setStatus('투표가 완료되었습니다.');
        } else {
          setStatus(data.error || '투표에 실패했습니다.');
        }
      });

      socket.on('vote:result', (data) => {
        setVotes(data.votes);
        setVoteCounts(data.voteCounts);
        setPhase('ended');
        setPhaseEndsAt(null);
      });

      socket.on('game:ended', () => {
        setPhase('ended');
        setPhaseEndsAt(null);
      });

    } catch (error) {
      console.error(error);
      setStatus('서버에 연결할 수 없습니다.');
    }
  }

  // 호스트 게임 시작
  function startGame() {
    if (!socketRef.current || !isHost) return;

    socketRef.current.emit('game:start', {
      roomCode,
      playerId: myId
    });
  }

  // 채팅 전송
  function sendMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!socketRef.current || !chatInput.trim() || phase !== 'day') return;

    socketRef.current.emit('chat:send', {
      roomCode,
      sender: nickname,
      message: chatInput.trim()
    });

    setChatInput('');
  }

  // 투표 제출
  function submitVote() {
    if (!socketRef.current || targetId === null || voted) return;

    socketRef.current.emit('vote:submit', {
      roomCode,
      voterId: myId,
      targetPlayerId: targetId
    });
  }

  function getNickname(id: number) {
    return players.find((player) => player.id === id)?.nickname ?? `Player ${id}`;
  }

  return (
    <main className="game-page">
      <div className="game-container">

        <header className="game-header">
          <h1>AI MAFIA</h1>
          <span>{connected ? `ROOM ${roomCode}` : 'GAME'}</span>
        </header>

        {/* 방 연결 */}
        {!connected && (
          <section className="game-panel">
            <h2>방 연결</h2>

            <div className="connect-form">
              <input
                placeholder="방 코드"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
              />
              <input
                placeholder="닉네임"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
              <input
                type="number"
                placeholder="플레이어 ID"
                value={playerId}
                onChange={(e) => setPlayerId(e.target.value)}
              />
              <button onClick={connectRoom}>연결</button>
            </div>
          </section>
        )}

        {connected && (
          <>
            {/* 대기실 */}
            {phase === 'lobby' && (
              <section className="game-panel">
                <h2>대기실</h2>

                <div className="room-info">
                  <p>방 코드</p>
                  <strong>{roomCode}</strong>
                  <p>참가자 {players.length}명</p>
                </div>

                <div className="player-list">
                  {players.map((player) => (
                    <div className="player-row" key={player.id}>
                      <span>{player.nickname}</span>
                      {player.isHost && <small>HOST</small>}
                    </div>
                  ))}
                </div>

                {isHost ? (
                  <button className="main-button" onClick={startGame}>
                    게임 시작
                  </button>
                ) : (
                  <p className="notice">호스트가 게임을 시작하기를 기다리는 중입니다.</p>
                )}
              </section>
            )}

            {/* 토론 */}
            {phase === 'day' && (
              <section className="game-panel">
                <div className="section-header">
                  <h2>토론</h2>
                  <strong className="timer">{formatTime(timeLeft)}</strong>
                </div>

                <div className="topic">
                  <small>현재 주제</small>
                  <p>{theme || '선택된 주제가 없습니다.'}</p>
                </div>

                <div className="chat-box">
                  {messages.length === 0 && (
                    <p className="notice">대화를 시작해보세요.</p>
                  )}

                  {messages.map((msg, index) => (
                    <div
                      key={index}
                      className={`chat-message ${msg.sender === nickname ? 'mine' : ''}`}
                    >
                      <small>{msg.sender}</small>
                      <div className="chat-bubble">{msg.message}</div>
                    </div>
                  ))}
                </div>

                <form className="chat-form" onSubmit={sendMessage}>
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="메시지 입력"
                  />
                  <button type="submit">전송</button>
                </form>

                <p className="notice">토론이 끝나면 투표가 시작됩니다.</p>
              </section>
            )}

            {/* 투표 */}
            {phase === 'vote' && (
              <section className="game-panel">
                <div className="section-header">
                  <h2>투표</h2>
                  <strong className="timer">{formatTime(timeLeft)}</strong>
                </div>

                <p className="notice">AI라고 생각하는 플레이어를 선택하세요.</p>

                <div className="vote-list">
                  {players
                    .filter((player) => player.id !== myId)
                    .map((player) => (
                      <button
                        type="button"
                        key={player.id}
                        className={`vote-player ${targetId === player.id ? 'selected' : ''}`}
                        onClick={() => setTargetId(player.id)}
                        disabled={voted}
                      >
                        <span>{player.nickname}</span>
                        {targetId === player.id && <strong>선택됨</strong>}
                      </button>
                    ))}
                </div>

                <button
                  className="main-button"
                  onClick={submitVote}
                  disabled={voted || targetId === null}
                >
                  {voted ? '투표 완료' : '투표하기'}
                </button>
              </section>
            )}

            {/* 결과 */}
            {phase === 'ended' && (
              <section className="game-panel">
                <h2>게임 결과</h2>
                <p className="notice">최종 투표 결과입니다.</p>

                {voteCounts ? (
                  <div className="result-list">
                    {players.map((player) => (
                      <div className="result-row" key={player.id}>
                        <span>{player.nickname}</span>
                        <strong>{voteCounts[player.id] ?? 0}표</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="notice">투표 결과를 불러올 수 없습니다.</p>
                )}

                {votes && (
                  <details className="vote-details">
                    <summary>상세 투표 기록</summary>
                    {Object.entries(votes).map(([voter, target]) => (
                      <p key={voter}>
                        {getNickname(Number(voter))} → {getNickname(target)}
                      </p>
                    ))}
                  </details>
                )}

                <p className="notice">
                  AI/Human 정체 공개는 추후 연결할 예정입니다.
                </p>

                <button
                  className="main-button"
                  onClick={() => {
                    socketRef.current?.disconnect();
                    window.location.href = '/';
                  }}
                >
                  나가기
                </button>
              </section>
            )}
          </>
        )}

        {status && <p className="status-text">{status}</p>}
      </div>
    </main>
  );
}
