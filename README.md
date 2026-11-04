# AI-Mafia

AI가 참여하는 마피아 게임 (동아리 프로젝트)

## 기술 스택

- **런타임:** Node.js 22 이상 (권장 26 LTS, `.nvmrc`)
- **언어:** TypeScript 6 — TS 7은 Next.js 타입 체크와 호환되지 않아 사용하지 않음
- **패키지 매니저:** npm workspaces
- **frontend:** Next.js 16 (App Router) + React 19, `socket.io-client`
- **backend:** Express 5 + Socket.IO 4, `tsx`로 실행
- **shared:** 프론트/백 공통 타입·상수 (`@ai-mafia/shared`)
- **미도입 (추후 결정):** 린터/포맷터, DB, Docker, Turborepo

## 시작하기

```bash
npm install
cp backend/.env.example backend/.env          # backend용 (필요 시 값 채우기)
cp frontend/.env.example frontend/.env.local  # frontend용 (선택)
npm run dev                                   # backend :8000 + frontend :3000
```

http://localhost:3000 에서 "서버 연결 상태: connected"가 보이면 정상입니다.

## 명령어

모든 명령은 **루트에서** 실행합니다.

| 명령 | 설명 |
|---|---|
| `npm run dev` | backend + frontend 동시 실행 |
| `npm run dev:backend` / `npm run dev:frontend` | 하나만 실행 |
| `npm run typecheck` | 전체 워크스페이스 타입 체크 |
| `npm run build` | frontend 프로덕션 빌드 |
| `npm install <패키지> -w backend` | 특정 워크스페이스에 패키지 추가 (`-D`는 devDependency) |

## 디렉터리 구조

```
AI-mafia/
├── frontend/              # Next.js (App Router) (env: frontend/.env.local)
│   └── src/app/
├── backend/               # Express + Socket.IO (env: backend/.env)
│   └── src/index.ts
├── shared/                # 공통 타입·상수 (빌드 없이 TS 소스로 사용)
│   └── src/
│       ├── game.ts        # 역할, 게임 단계
│       └── events.ts      # Socket.IO 이벤트 타입
├── package.json           # workspaces, 공통 스크립트
└── tsconfig.base.json     # 공통 TS 설정 (각 워크스페이스가 extends)
```

## 아키텍처

- **게임 로직은 backend에만 둡니다.** frontend는 화면 표시와 입력만 담당하고, Next.js의 API Route / Server Action으로 게임 로직을 만들지 않습니다.
- **프론트↔백 통신 규약은 `shared`에 정의합니다.** 소켓 이벤트 이름과 payload 타입은 `shared/src/events.ts`에 추가하고 양쪽에서 이 타입을 씁니다.
- **`shared`는 빌드 단계가 없습니다.** TS 소스를 그대로 export하고, frontend는 `transpilePackages`, backend는 `tsx`로 읽습니다. 런타임 의존성 없는 순수 TS만 둡니다.
- 게임 상태는 현재 서버 메모리에만 저장합니다 (DB 없음).

## 개발 규칙

- 패키지는 루트에서 `-w <워크스페이스>`로 설치합니다. 하위 폴더에서 `npm install`하면 별도 lock 파일이 생기니 주의하세요.
- 각 워크스페이스는 자기 `package.json`에 선언한 패키지만 import합니다. (npm은 선언 안 한 패키지도 import되지만 배포 시 깨질 수 있음)
- 비밀 값은 각 앱의 env 파일(`backend/.env`, `frontend/.env.local`)에 두고 커밋하지 않습니다. `NEXT_PUBLIC_` 값은 브라우저에 노출되므로 비밀 값을 넣지 마세요.

## Git 컨벤션

- 기본 브랜치: `main`
- 기능 작업은 브랜치를 따서 진행 (예: `feat/<기능>`, `fix/<버그>`)
- 커밋 메시지는 [Conventional Commits](https://www.conventionalcommits.org/) 형식 권장
  - 예: `feat: 밤 페이즈 투표 로직 추가`, `fix: 플레이어 사망 처리 오류 수정`
