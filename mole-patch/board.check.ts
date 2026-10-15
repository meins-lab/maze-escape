// Run: yarn check — fails if planting, counting, flood fill, chording or win/lose judging breaks.
import { chord, createBoard, LEVELS, neighbors, reveal, toggleFlag } from './board.ts';

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    throw new Error(msg);
  }
};

for (const [id, { w, h, moles }] of Object.entries(LEVELS)) {
  for (let seed = 1; seed <= 200; seed++) {
    const b = createBoard(w, h, moles);
    const first = (seed * 7919) % (w * h);
    reveal(b, first, seeded(seed));

    assert(b.cells.filter((c) => c.mole).length === moles, `${id}/${seed}: mole count`);
    for (const n of [first, ...neighbors(b, first)]) {
      assert(!b.cells[n].mole, `${id}/${seed}: first click area must be safe`);
    }
    b.cells.forEach((c, i) => {
      assert(c.count === neighbors(b, i).filter((n) => b.cells[n].mole).length, `${id}/${seed}: count at ${i}`);
      // 열린 0칸 옆에 닫힌 칸이 남으면 연쇄 열기가 끊긴 것이다
      if (c.state === 'open' && c.count === 0) {
        assert(neighbors(b, i).every((n) => b.cells[n].state === 'open'), `${id}/${seed}: flood fill stopped at ${i}`);
      }
    });
    assert(b.cells[first].count === 0 && b.status === 'playing', `${id}/${seed}: first click opens an empty area`);

    // 정답대로 허수아비를 세우고 코딩으로 열리는 만큼 연 뒤, 두더지에 둘러싸여 코딩이 닿지 않는 칸은 직접 연다
    b.cells.forEach((c, i) => {
      if (c.mole) {
        toggleFlag(b, i);
      }
    });
    for (let pass = 0; pass < w * h && b.status === 'playing'; pass++) {
      b.cells.forEach((c, i) => {
        if (c.state === 'open') {
          chord(b, i);
        }
      });
    }
    b.cells.forEach((c, i) => {
      if (!c.mole) {
        reveal(b, i);
      }
    });
    assert(b.status === 'won', `${id}/${seed}: opening every safe cell must win (${b.status})`);
    assert(b.cells.every((c) => c.mole === (c.state === 'flag')), `${id}/${seed}: only moles stay flagged after winning`);
  }
}

const lose = createBoard(9, 9, 10);
reveal(lose, 0, seeded(42));
const mole = lose.cells.findIndex((c) => c.mole);
reveal(lose, mole);
assert(lose.status === 'lost' && lose.hit === mole, 'opening a mole must lose');
reveal(lose, lose.cells.findIndex((c) => c.state === 'hidden' && !c.mole));
assert(lose.status === 'lost', 'no moves after losing');

console.log('mole-patch ok: 600 boards planted, counted, flood-filled and won');
