'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublicPlayer, PublicRoom, RoomResult, RoomStatus } from '@ai-mafia/shared';
import { describeCode } from '../../../../lib/api';
import { HOME_PATH, lobbyPath, pathForStatus } from '../../../../lib/routes';
import { clearSession, loadSession, saveSession } from '../../../../lib/session';
import type { Session } from '../../../../lib/session';
import { connectRoomSocket, disconnectRoomSocket } from '../../../../lib/socket';
import styles from './result.module.css';
import theme from '../../../theme.module.css';

type View = 'loading' | 'result' | 'gone' | 'outsider';

function summarize(result: RoomResult): string {
  if (result.topVoted.length === 0) return '투표가 하나도 없어서 AI가 이겼어요.';
  if (result.isTie) return `${result.topVoted.length}명이 같은 표를 받아 동점이었어요.`;
  return result.winner === 'humans'
    ? '가장 많은 표를 받은 닉네임이 AI였어요.'
    : '가장 많은 표를 받은 닉네임은 사람이었어요.';
}

export default function ResultPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = String(params.code ?? '').toUpperCase();

  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>('loading');
  const [result, setResult] = useState<RoomResult | null>(null);
  const [unstable, setUnstable] = useState(false);
  const [busy, setBusy] = useState<'rematch' | 'leave' | null>(null);
  const [actionError, setActionError] = useState('');

  // 이 탭에 저장된 "나"(방 코드, 플레이어 번호). 없으면 메인으로 보낸다.
  useEffect(() => {
    const saved = loadSession(code);
    if (saved) setSession(saved);
    else router.replace(HOME_PATH);
  }, [code, router]);

  // 소켓으로 방 소식을 받는다. (화면이 열린 동안만 듣고, 닫히면 듣기를 멈춘다)
  useEffect(() => {
    if (!session) return;
    const socket = connectRoomSocket(session);
    let resultLoaded = false;

    // 결과 조회: 방 상태가 ended일 때만 성공한다. (RESULT-02: 그 전에는 서버가 AI 정보를 보내지 않는다)
    const requestResult = () => {
      if (resultLoaded) return;
      socket.emit('result:get', (res) => {
        if (res.success) {
          resultLoaded = true;
          setResult(res.result);
          setView('result');
        } else if (res.code !== 'RESULT_NOT_READY') {
          setActionError(describeCode(res.code));
        }
      });
    };

    // COMMON-04: 결과 단계가 아니면 방 상태에 맞는 화면으로 보낸다.
    const handleRoom = (room: PublicRoom) => {
      const me = room.players.find((p) => p.id === session.playerId);
      if (!me) {
        setView('outsider');
        return;
      }
      if (room.status !== 'ended') {
        saveSession({ ...session, nickname: me.nickname });
        router.replace(pathForStatus(code, room.status));
        return;
      }
      requestResult();
    };

    // 현재 방 상태를 묻는다. 화면이 열릴 때와 (재)연결될 때마다 불러서, 끊긴 동안 놓친 소식도 맞춘다.
    const syncState = () => {
      socket.emit('room:getState', (res) => {
        if (res.success) handleRoom(res.room);
        else if (res.code === 'ROOM_NOT_FOUND') setView('gone');
        else setActionError(describeCode(res.code));
      });
    };

    const onConnect = () => {
      setUnstable(false);
      syncState();
    };
    const onDisconnect = () => setUnstable(true); // COMMON-03
    const onConnectError = (error: Error) => {
      // 서버가 연결을 거절하면 error.message가 에러 코드다.
      if (error.message === 'ROOM_NOT_FOUND') setView('gone');
      else if (error.message === 'NOT_A_MEMBER') setView('outsider');
      else setUnstable(true);
    };
    const onStatusChanged = ({ status }: { status: RoomStatus }) => {
      if (status === 'ended') requestResult();
      else router.replace(pathForStatus(code, status));
    };
    // 다른 사람이(또는 내가) "다시 하기"를 눌러 방이 대기실로 돌아갔다. 닉네임이 새로 배정됐다.
    const onReset = ({ players }: { players: PublicPlayer[] }) => {
      const me = players.find((p) => p.id === session.playerId);
      if (!me) {
        setView('outsider');
        return;
      }
      saveSession({ ...session, nickname: me.nickname });
      router.replace(lobbyPath(code));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('room:statusChanged', onStatusChanged);
    socket.on('room:reset', onReset);
    if (socket.connected) syncState();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('room:statusChanged', onStatusChanged);
      socket.off('room:reset', onReset);
    };
  }, [code, session, router]);

  // RESULT-04: 같은 방의 대기실로 돌아간다. 닉네임은 서버가 새로 배정해준다.
  function onRematch() {
    if (!session || busy) return;
    setBusy('rematch');
    setActionError('');
    connectRoomSocket(session).emit('room:rematch', (res) => {
      if (res.success) {
        const me = res.players.find((p) => p.id === session.playerId);
        saveSession({ ...session, nickname: me?.nickname ?? session.nickname });
        router.replace(lobbyPath(code));
      } else {
        setActionError(describeCode(res.code));
        setBusy(null);
      }
    });
  }

  function goHome() {
    disconnectRoomSocket();
    clearSession(code);
    router.replace(HOME_PATH);
  }

  // RESULT-05: 방에서 나가고 메인으로 이동한다. 서버 응답이 늦거나 없어도 이 탭에서는 나간 것으로 처리한다.
  function onLeave() {
    if (busy) return;
    setBusy('leave');
    if (!session) {
      goHome();
      return;
    }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      goHome();
    };
    connectRoomSocket(session).emit('room:leave', finish);
    setTimeout(finish, 1500);
  }

  if (view === 'gone' || view === 'outsider') {
    return (
      <main className={styles.page}>
        <div className={styles.inner}>
          <div className={styles.notice}>
            <h1>{view === 'gone' ? '방이 사라졌어요' : '이 방에서 나온 상태예요'}</h1>
            <p>{view === 'gone' ? '오래 쓰지 않아 정리됐거나 없는 방이에요.' : '메인에서 새 방을 만들거나 다시 입장해주세요.'}</p>
          </div>
          <button type="button" className={theme.button} onClick={goHome}>
            메인으로
          </button>
        </div>
      </main>
    );
  }

  if (!session || view === 'loading' || !result) {
    return (
      <main className={styles.page}>
        <p className={styles.status} role="status">
          결과를 불러오는 중이에요…
        </p>
        {unstable && <p className={styles.banner}>연결이 불안정해요. 다시 연결하는 중이에요.</p>}
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      </main>
    );
  }

  const maxVotes = Math.max(1, ...result.tally.map((t) => t.votes));

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        {unstable && (
          <p className={styles.banner} role="status">
            연결이 불안정해요. 다시 연결하는 중이에요.
          </p>
        )}

        <section className={styles.panel} aria-label="결과">
        {/* RESULT-02: AI 정체 공개 */}
        <h1 className={styles.headline}>
          <span className={styles.kicker}>AI의 정체는</span>
          <span className={styles.aiName}>
            {result.aiNickname}
            <span className={styles.mask} aria-hidden="true">
              ???
            </span>
          </span>
        </h1>

        {/* RESULT-03: 승패 */}
        <div className={`${styles.verdict} ${styles.afterReveal}`} data-winner={result.winner}>
          <p className={styles.verdictLabel}>{result.winner === 'humans' ? '사람 팀 승리' : 'AI 승리'}</p>
          <p className={styles.summary}>{summarize(result)}</p>
        </div>

        {/* RESULT-01: 득표 결과 (많은 순) */}
        <section className={styles.afterReveal} aria-labelledby="tally-title">
          <h2 id="tally-title" className={styles.sectionTitle}>
            득표 결과
          </h2>
          <ol className={styles.tally}>
            {result.tally.map((entry) => (
              <li key={entry.nickname} className={entry.isAi ? `${styles.row} ${styles.rowAi}` : styles.row}>
                <div className={styles.rowHead}>
                  <span className={styles.name}>
                    {entry.nickname}
                    {entry.isAi && <span className={styles.badgeAi}>AI</span>}
                    {entry.nickname === session.nickname && <span className={styles.badgeMe}>나</span>}
                  </span>
                  <span className={styles.count}>{entry.votes}표</span>
                </div>
                <div className={styles.track} aria-hidden="true">
                  <div className={styles.bar} style={{ width: `${(entry.votes / maxVotes) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </section>
        </section>

        <div className={styles.actions}>
          <button type="button" className={theme.button} onClick={onRematch} disabled={busy !== null}>
            {busy === 'rematch' ? '이동 중…' : '다시 플레이하기'}
          </button>
          <button type="button" className={theme.button} onClick={onLeave} disabled={busy !== null}>
            나가기
          </button>
        </div>
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      </div>
    </main>
  );
}
