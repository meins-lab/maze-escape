export const MAX_LEVEL = 100;

export const NAMES = [
  '낡은 목검', '손때 묻은 목검', '단단한 참나무 목검', '대나무 죽도', '녹슨 철검',
  '무딘 연습용 철검', '견습 대장장이의 검', '병사의 숏소드', '경비대의 장검', '용병의 브로드소드',
  '기사단의 롱소드', '은빛 기사의 검', '왕실 근위대의 검', '클레이모어', '플랑베르주',
  '귀족의 레이피어', '사막의 시미터', '북해 전사의 검', '흑철 장검', '다마스쿠스 명검',
  '무사의 카타나', '벚꽃 카타나', '청룡검', '백호도', '주작검',
  '현무검', '칠성검', '사인검', '요도 무라사메', '천하제일검',
  '불꽃의 검', '용암 군주의 대검', '서리검', '번개의 검', '바람의 검',
  '빛의 검', '어둠의 검', '물결의 검', '대지의 검', '생명의 검',
  '성기사의 검', '그림자의 검', '태양의 검', '월광검', '타락천사의 검',
  '수정 성검', '마검', '일식의 검', '천체의 검', '혼돈의 마검',
  '적룡의 검', '황금룡의 검', '빙룡의 검', '뇌룡의 검', '태양신의 검',
  '월신의 검', '숲의 고룡검', '흑룡의 검', '해신의 검', '백룡의 성검',
  '룬각인 검', '비전 수정검', '천구의 검', '대마도사의 검', '태엽 장치 검',
  '세계수의 검', '대천사의 검', '핏빛 마법진의 검', '고대 문명의 검', '연금술사의 검',
  '진동검', '플라즈마 커터', '사이버 카타나', '나노 블레이드', '중력검',
  '홀로그램 검', '열핵 블레이드', '차원 균열의 검', '레일 블레이드', '메카 대검',
  '빔사벨', '커스텀 빔사벨', '블루 빔사벨', '크림슨 빔사벨', '바이올렛 빔사벨',
  '트윈 빔사벨', '프리즘 빔사벨', '오버드라이브 빔사벨', '빔 대검', '초신성 빔사벨',
  '성운의 검', '사건의 지평선', '항성의 검', '성좌검', '적색거성의 검',
  '운명을 엮는 검', '은하수의 검', '창세의 검', '무한의 검', '신살검',
  '절대검 오메가',
];

// 확률은 0.1% 단위 정수(1000 = 100%)로 둔다. 화면 표기와 계산이 어긋나지 않게 하려는 것이다
export const odds = (level: number) => {
  if (level < 10) {
    return { success: 950 - 20 * level, destroy: 0, drop: false };
  }
  if (level < 30) {
    return { success: 750 - 10 * (level - 10), destroy: 0, drop: true };
  }
  // ponytail: +30부터 실패해도 단계를 내리지 않는다. 내리면 성공 50% 미만 구간이 내리막이 되어 +100까지 기대 시도가 수십억 번으로 뛴다
  return { success: 500 - 4 * (level - 30), destroy: (level - 29) / 2, drop: false };
};

export type Outcome = 'success' | 'fail' | 'drop' | 'destroy';

export const enhance = (level: number, rand: () => number = Math.random) => {
  const o = odds(level);
  const roll = rand() * 1000;
  if (roll < o.success) {
    return { outcome: 'success' as Outcome, level: level + 1 };
  }
  if (roll < o.success + o.destroy) {
    return { outcome: 'destroy' as Outcome, level: 0 };
  }
  if (o.drop) {
    return { outcome: 'drop' as Outcome, level: level - 1 };
  }
  return { outcome: 'fail' as Outcome, level };
};

export type State = { level: number; best: number; tries: number; broken: number };

// ponytail: 브라우저 안의 비밀값이라 코드를 뜯으면 뚫린다. 개발자 도구에서 숫자만 바꾸는 정도를 막는 용도다
const SALT = 'pb-sword-7f3a';

const sign = (raw: string) => {
  let h = 2166136261;
  for (const ch of SALT + raw) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  }
  return (h >>> 0).toString(36);
};

export const pack = (s: State) => {
  const raw = btoa(JSON.stringify([s.level, s.best, s.tries, s.broken]));
  return `${raw}.${sign(raw)}`;
};

// 서명이 틀리거나 이룰 수 없는 기록(시도보다 높은 단계 등)이면 null을 돌려 +0부터 시작하게 한다
export const unpack = (v: string | null): State | null => {
  const [raw, sig] = (v ?? '').split('.');
  if (!raw || sign(raw) !== sig) {
    return null;
  }
  try {
    const [level, best, tries, broken] = JSON.parse(atob(raw));
    const ok = [level, best, tries, broken].every((n) => Number.isInteger(n) && n >= 0) &&
      level <= MAX_LEVEL && level <= best && best <= MAX_LEVEL && best <= tries && broken <= tries;
    return ok ? { level, best, tries, broken } : null;
  } catch {
    return null;
  }
};
