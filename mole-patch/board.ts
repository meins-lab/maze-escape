export type CellState = 'hidden' | 'open' | 'flag';
export type Cell = { mole: boolean; count: number; state: CellState };
export type Status = 'ready' | 'playing' | 'won' | 'lost';
export type Board = {
  w: number;
  h: number;
  moles: number;
  cells: Cell[];
  status: Status;
  opened: number;
  flags: number;
  hit: number;
};

export type LevelId = 'easy' | 'normal' | 'hard';
export const LEVELS: Record<LevelId, { name: string; w: number; h: number; moles: number }> = {
  easy: { name: '쉬움', w: 9, h: 9, moles: 10 },
  normal: { name: '보통', w: 16, h: 16, moles: 40 },
  // 고전 고급(30×16)을 세로로 돌렸다. 휴대폰 세로 화면에 칸이 커진다
  hard: { name: '어려움', w: 16, h: 30, moles: 99 },
};

export const createBoard = (w: number, h: number, moles: number): Board => ({
  w,
  h,
  moles,
  cells: Array.from({ length: w * h }, () => ({ mole: false, count: 0, state: 'hidden' as CellState })),
  status: 'ready',
  opened: 0,
  flags: 0,
  hit: -1,
});

export const neighbors = (b: Board, i: number) => {
  const x = i % b.w;
  const y = Math.floor(i / b.w);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && nx < b.w && ny >= 0 && ny < b.h) {
        out.push(ny * b.w + nx);
      }
    }
  }
  return out;
};

// 첫 칸과 주변 8칸을 비워 두어 첫 수에 항상 빈 영역이 열리게 한다
const plant = (b: Board, first: number, rand: () => number) => {
  const safe = new Set([first, ...neighbors(b, first)]);
  const pool = b.cells.map((_, i) => i).filter((i) => !safe.has(i));
  for (let k = 0; k < b.moles; k++) {
    const j = k + Math.floor(rand() * (pool.length - k));
    [pool[k], pool[j]] = [pool[j], pool[k]];
    b.cells[pool[k]].mole = true;
  }
  b.cells.forEach((c, i) => {
    c.count = neighbors(b, i).filter((n) => b.cells[n].mole).length;
  });
  b.status = 'playing';
};

const finish = (b: Board, won: boolean) => {
  b.status = won ? 'won' : 'lost';
  b.cells.forEach((c) => {
    if (won && c.mole && c.state === 'hidden') {
      c.state = 'flag';
      b.flags++;
    }
  });
};

export const reveal = (b: Board, i: number, rand: () => number = Math.random) => {
  if (b.status === 'won' || b.status === 'lost' || b.cells[i].state !== 'hidden') {
    return;
  }
  if (b.status === 'ready') {
    plant(b, i, rand);
  }
  if (b.cells[i].mole) {
    b.hit = i;
    finish(b, false);
    return;
  }
  const queue = [i];
  b.cells[i].state = 'open';
  b.opened++;
  while (queue.length) {
    const cur = queue.pop()!;
    if (b.cells[cur].count !== 0) {
      continue;
    }
    for (const n of neighbors(b, cur)) {
      if (b.cells[n].state === 'hidden') {
        b.cells[n].state = 'open';
        b.opened++;
        queue.push(n);
      }
    }
  }
  if (b.opened === b.w * b.h - b.moles) {
    finish(b, true);
  }
};

export const chord = (b: Board, i: number) => {
  const c = b.cells[i];
  if (b.status !== 'playing' || c.state !== 'open' || c.count === 0) {
    return;
  }
  const around = neighbors(b, i);
  if (around.filter((n) => b.cells[n].state === 'flag').length !== c.count) {
    return;
  }
  for (const n of around) {
    reveal(b, n);
  }
};

export const toggleFlag = (b: Board, i: number) => {
  const c = b.cells[i];
  if (b.status !== 'playing' || c.state === 'open') {
    return;
  }
  c.state = c.state === 'flag' ? 'hidden' : 'flag';
  b.flags += c.state === 'flag' ? 1 : -1;
};
