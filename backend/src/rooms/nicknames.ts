import { randomInt } from 'node:crypto';

// 익명 닉네임 재료 (예: "졸린 펭귄"). 게임 규칙상 사용자가 직접 바꿀 수 없고 서버가 정해준다.
const ADJECTIVES = [
  '졸린', '배고픈', '수줍은', '용감한', '느긋한', '엉뚱한', '부지런한', '심심한', '당당한',
  '차분한', '까칠한', '명랑한', '씩씩한', '나른한', '똘똘한', '깜찍한', '든든한', '느릿한',
];

const ANIMALS = [
  '펭귄', '고양이', '다람쥐', '수달', '판다', '오리', '토끼', '거북이', '고슴도치', '너구리',
  '부엉이', '코알라', '햄스터', '알파카', '문어', '물개', '사슴', '여우', '참새', '두더지',
];

function pick(list: readonly string[]): string {
  return list[randomInt(list.length)] ?? '';
}

// taken에 없는 닉네임을 하나 만든다. (같은 방 안에서 중복 불가)
export function generateNickname(taken: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
    if (!taken.has(name)) return name;
  }
  // 거의 일어나지 않지만, 조합이 모두 겹치면 숫자를 붙여서라도 유일하게 만든다.
  for (let n = 2; ; n++) {
    const name = `${pick(ADJECTIVES)} ${pick(ANIMALS)} ${n}`;
    if (!taken.has(name)) return name;
  }
}
