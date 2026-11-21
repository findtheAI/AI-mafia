'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoom, describeError, joinRoom } from '../lib/api';
import type { JoinedRoom } from '../lib/api';
import { lobbyPath } from '../lib/routes';
import { saveSession } from '../lib/session';
import { connectRoomSocket } from '../lib/socket';
import styles from './page.module.css';
import theme from './theme.module.css';

const GAME_TITLE = '이중에 AI가 있다';
const CODE_LENGTH = 6;

// 입력값을 방 코드 형태로 다듬는다: 영문/숫자만, 대문자, 최대 6자 (MAIN-03)
function normalizeCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, CODE_LENGTH);
}

type Step = 'intro' | 'room'; // Figma: Main-01(소개) → Main-02(방 만들기/코드 입장)

export default function MainPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('intro');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState('');

  // 초대 링크(/?code=ABC123)로 들어오면 코드를 미리 채우고 바로 입장 단계로 간다.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get('code');
    if (fromLink) {
      setCode(normalizeCode(fromLink));
      setStep('room');
    }
  }, []);

  // 방 만들기/입장(REST)이 끝나면 같은 방 코드로 소켓에 연결하고 대기실로 이동한다.
  function enterRoom(joined: JoinedRoom) {
    const session = { roomCode: joined.roomCode, playerId: joined.playerId, token: joined.token, nickname: joined.nickname };
    saveSession(session);
    connectRoomSocket(session);
    router.push(lobbyPath(joined.roomCode));
  }

  // 요청이 성공하면 화면이 넘어갈 때까지 버튼을 계속 막아둔다. (MAIN-05: 중복 클릭 방지)
  async function run(kind: 'create' | 'join', action: () => Promise<JoinedRoom>) {
    if (busy) return;
    setError('');
    setBusy(kind);
    try {
      enterRoom(await action());
    } catch (e) {
      setError(describeError(e));
      setBusy(null);
    }
  }

  const onCreate = () => run('create', createRoom);
  const onJoin = (event: FormEvent) => {
    event.preventDefault();
    if (code.length === CODE_LENGTH) void run('join', () => joinRoom(code));
  };

  if (step === 'intro') {
    return (
      <main className={styles.page}>
        <div className={styles.frame}>
          <div className={styles.topbar} />
          <section className={styles.intro}>
            {/* 로고 자리: 최종 로고가 나오면 public/images/logo-placeholder.svg만 바꾸면 된다. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.logo} src="/images/logo-placeholder.svg" alt="" width={218} height={83} />
            <h1 className={styles.title}>{GAME_TITLE}</h1>
            <p className={styles.lead}>익명 닉네임으로 대화하고 AI를 찾아내세요</p>

            {/* MAIN-01: 게임 소개와 3줄 규칙 */}
            <ul className={styles.rules}>
              <li>사람 3~6명과 AI 1명이 3분간 대화해요</li>
              <li>닉네임은 랜덤이라 누가 누군지 몰라요</li>
              <li>끝나면 AI 같은 사람에게 투표해요</li>
            </ul>

            <button type="button" className={`${theme.button} ${styles.start}`} onClick={() => setStep('room')}>
              게임 시작하기
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        <button
          type="button"
          className={`${theme.small} ${styles.back}`}
          onClick={() => {
            setStep('intro');
            setError('');
          }}
          disabled={busy !== null}
        >
          뒤로가기
        </button>

        <section className={styles.room}>
          {/* MAIN-02: 방 만들기 */}
          <button type="button" className={theme.button} onClick={onCreate} disabled={busy !== null}>
            {busy === 'create' ? '만드는 중…' : '방 생성하기'}
          </button>

          <div className={styles.spacer} />

          {/* MAIN-03: 방 코드 입력 */}
          <form className={styles.joinBlock} onSubmit={onJoin}>
            <p className={styles.joinTitle}>코드로 참여하기</p>
            <div className={styles.codeRow}>
              <input
                id="room-code"
                className={styles.input}
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                placeholder="코드입력칸"
                aria-label="방 코드 (6자리)"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={CODE_LENGTH}
                disabled={busy !== null}
              />
              <button
                type="submit"
                className={`${theme.small} ${styles.enter}`}
                disabled={busy !== null || code.length !== CODE_LENGTH}
              >
                {busy === 'join' ? '…' : '입장'}
              </button>
            </div>
            {/* MAIN-04: 입장/생성 실패 이유 */}
            <p className={styles.error} role="alert">
              {error}
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
