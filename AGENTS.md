# AGENTS.md

프로젝트 구조·명령어·컨벤션은 [README.md](./README.md)를 참고한다.

- 게임 로직은 `backend`에만 두고, 소켓 이벤트/payload 타입은 `shared/src/events.ts`에 정의해 양쪽에서 쓴다.
- 패키지는 루트에서 `npm install <pkg> -w <workspace>`로 설치하고, 자기 `package.json`에 선언한 패키지만 import한다.
- 변경 후 `npm run typecheck`로 확인한다. TypeScript는 6을 유지한다 (7은 Next.js와 비호환).
