// Run: yarn check — fails if trail cost, capture, cutting, clashes or the AI loop breaks.
import { LEVELS } from './levels.ts';
import { canLink, createWorld, cut, link, PLAYER, SPACING, step, think } from './sim.ts';

import type { Level, Owner, World } from './sim.ts';

const DT = 1 / 30;
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
const run = (w: World, sec: number, each?: () => void) => {
  for (let k = 0; k < sec / DT && w.status === 'playing'; k++) {
    step(w, DT);
    each?.();
  }
};
const duel = (me: number, other: number, otherOwner: Owner): Level => ({
  nests: [
    [100, 500, 1, me],
    [500, 500, otherOwner, other],
    [900, 900, 2, 1],
  ],
});

// 행렬 400 길이 = 개미 20마리가 굴에서 빠져나와 줄을 선다
{
  const w = createWorld(duel(50, 10, 0));
  assert(link(w, 0, 1, PLAYER), 'link must start');
  run(w, 2.6);
  const t = w.trails[0];
  assert(t.state === 'link' && Math.abs(t.len / SPACING - 20) < 1e-6, `trail of 400 holds 20 ants (${t.state}, ${t.len})`);
  assert(w.nests[0].ants > 30 && w.nests[0].ants < 30 + 2.6 * 2.25, `source paid 20 ants (${w.nests[0].ants})`);

  // 가운데를 끊으면 10마리는 돌격하고 10마리는 돌아온다
  cut(w, t, 0.5);
  assert(w.bursts.length === 1 && Math.abs(w.bursts[0].ants - 10) < 1e-6 && Math.abs(t.len - 200) < 1e-6, 'cut in the middle splits 10/10');
  const before = w.nests[1].ants;
  run(w, 3);
  assert(w.trails.length === 0 && w.bursts.length === 0, 'returned trail and burst are cleared');
  assert(w.nests[1].owner === PLAYER || w.nests[1].ants < before, 'burst hit the target');
}

// 빈 굴 점령
{
  const w = createWorld(duel(50, 10, 0));
  link(w, 0, 1, PLAYER);
  run(w, 30);
  assert(w.nests[1].owner === PLAYER, 'neutral nest is captured');
}

// 정면충돌: 많은 쪽이 밀어내고 결국 상대 굴까지 빼앗는다
{
  const w = createWorld(duel(70, 20, 2));
  link(w, 0, 1, PLAYER);
  link(w, 1, 0, 2);
  run(w, 3);
  assert(w.trails.every((t) => t.state === 'clash'), 'opposing trails meet and clash');
  run(w, 90);
  assert(w.nests[1].owner === PLAYER, 'stronger side wins the clash and the nest');
}

// 바위가 막으면 행렬을 보낼 수 없다
{
  const w = createWorld({ ...duel(50, 10, 0), rocks: [[300, 500, 40]] });
  assert(!canLink(w, 0, 1, PLAYER), 'rock blocks the trail');
}

// 레벨 배치: 굴끼리 겹치지 않고, 바위에 묻히지 않고, 내 굴에서 행렬을 보낼 곳이 있어야 한다
for (const [li, lv] of LEVELS.entries()) {
  const w = createWorld(lv);
  w.nests.forEach((a, i) => {
    assert(a.x >= 100 && a.x <= 900 && a.y >= 100 && a.y <= 900, `L${li + 1}: nest ${i} too close to the edge`);
    w.nests.forEach((b, j) => {
      assert(i >= j || Math.hypot(a.x - b.x, a.y - b.y) >= 170, `L${li + 1}: nests ${i} and ${j} overlap`);
    });
    w.rocks.forEach((r) => {
      assert(Math.hypot(a.x - r.x, a.y - r.y) >= r.r + 60, `L${li + 1}: nest ${i} sits on a rock`);
    });
  });
  const mine = w.nests.findIndex((n) => n.owner === PLAYER);
  assert(w.nests.some((_, j) => canLink(w, mine, j, PLAYER)), `L${li + 1}: player nest can reach nothing`);
}

// AI끼리 모든 레벨을 돌려 음수·NaN이 없고, 같은 시드면 같은 결과인지 본다
let finished = 0;
const wins = LEVELS.map(() => 0);
for (const [li, lv] of LEVELS.entries()) {
  for (let seed = 1; seed <= 20; seed++) {
    const play = () => {
      const w = createWorld(lv);
      const rand = seeded(seed * 100 + li);
      let clock = 0;
      run(w, 600, () => {
        clock += DT;
        if (clock >= 1) {
          clock = 0;
          for (const o of [1, 2, 3] as Owner[]) {
            think(w, o, rand, o === 3);
          }
        }
        for (const n of w.nests) {
          assert(Number.isFinite(n.ants) && n.ants >= -1e-9, `L${li + 1}/${seed}: ants ${n.ants}`);
        }
        for (const t of w.trails) {
          assert(Number.isFinite(t.len) && t.len >= -1e-9, `L${li + 1}/${seed}: trail ${t.len}`);
        }
      });
      return w;
    };
    const a = play();
    const b = play();
    assert(JSON.stringify(a) === JSON.stringify(b), `L${li + 1}/${seed}: same seed must give the same game`);
    finished += a.status === 'playing' ? 0 : 1;
    wins[li] += a.status === 'won' ? 1 : 0;
  }
}

console.log(`ant-war ok: cost, cut, capture, clash, rocks, layouts; ${finished}/${LEVELS.length * 20} AI games finished`);
// 참고용: 단순 AI가 내 자리에서 이긴 판 수(20판 중). 레벨 난이도 곡선을 볼 때 쓴다
console.log(`ant-war naive player wins per level: ${wins.join(' ')}`);
