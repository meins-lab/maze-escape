// Ant War 시뮬레이션. 화면과 분리된 순수 로직이라 같은 입력이면 같은 결과가 나온다
export type Owner = 0 | 1 | 2 | 3;
export type Nest = { x: number; y: number; owner: Owner; ants: number; cap: number };
export type Rock = { x: number; y: number; r: number };
export type TrailState = 'grow' | 'link' | 'clash' | 'back';
export type Trail = { from: number; to: number; owner: Owner; len: number; state: TrailState; dead?: boolean };
export type Burst = { from: number; to: number; owner: Owner; ants: number; pos: number };
export type World = {
  nests: Nest[];
  rocks: Rock[];
  trails: Trail[];
  bursts: Burst[];
  time: number;
  status: 'playing' | 'won' | 'lost';
};
export type Level = { nests: [number, number, Owner, number][]; rocks?: [number, number, number][] };

export const NEUTRAL = 0;
export const PLAYER = 1;
// 행렬 위 개미 한 마리가 차지하는 길이. 행렬 길이 / SPACING = 행렬에 선 개미 수
export const SPACING = 20;
export const MARCH = 140;
const GROW = 160;
const BACK = 320;
const PUSH = 40;
const GRADE_AT = [15, 40, 80];
export const SLOTS = [2, 2, 3, 3];
const REGEN = [0.6, 0.9, 1.2, 1.5];
// 내 굴만 개미가 더 빨리 늘어난다. 답답함을 덜려고 둔 손맛 값
const PLAYER_REGEN = 1.5;
const FLOW = [1, 1.3, 1.6, 2];

export const createWorld = (lv: Level): World => ({
  nests: lv.nests.map(([x, y, owner, ants]) => ({ x, y, owner, ants, cap: 100 })),
  rocks: (lv.rocks ?? []).map(([x, y, r]) => ({ x, y, r })),
  trails: [],
  bursts: [],
  time: 0,
  status: 'playing',
});

export const grade = (n: Nest) => {
  return GRADE_AT.filter((v) => n.ants >= v).length;
};

export const dist = (w: World, a: number, b: number) => {
  return Math.hypot(w.nests[b].x - w.nests[a].x, w.nests[b].y - w.nests[a].y);
};

const live = (t: Trail) => {
  return !t.dead && t.state !== 'back';
};

export const outgoing = (w: World, i: number) => {
  return w.trails.filter((t) => t.from === i && live(t)).length;
};

// 두 굴을 잇는 직선이 바위를 지나면 행렬을 보낼 수 없다
const blocked = (w: World, a: Nest, b: Nest) => {
  return w.rocks.some((r) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((r.x - a.x) * dx + (r.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(a.x + dx * t - r.x, a.y + dy * t - r.y) < r.r;
  });
};

// 마주 오는 다른 진영의 행렬
const opposite = (w: World, t: Trail) => {
  return w.trails.find((o) => o.from === t.to && o.to === t.from && o.owner !== t.owner && live(o));
};

export const canLink = (w: World, from: number, to: number, owner: Owner) => {
  const a = w.nests[from];
  return (
    w.status === 'playing' &&
    from !== to &&
    a.owner === owner &&
    a.ants >= 1 &&
    outgoing(w, from) < SLOTS[grade(a)] &&
    !w.trails.some((t) => t.from === from && t.to === to && live(t)) &&
    !blocked(w, a, w.nests[to])
  );
};

export const link = (w: World, from: number, to: number, owner: Owner) => {
  if (!canLink(w, from, to, owner)) {
    return false;
  }
  // 내 굴끼리 반대로 오가는 행렬은 하나만 둔다
  const rev = w.trails.find((t) => t.from === to && t.to === from && t.owner === owner && live(t));
  if (rev) {
    rev.state = 'back';
  }
  w.trails.push({ from, to, owner, len: 0, state: 'grow' });
  return true;
};

// 끊은 자리에서 목표 쪽 개미는 한꺼번에 돌격하고, 굴 쪽 개미는 돌아온다. 이어지기 전이면 전부 돌아온다
export const cut = (w: World, t: Trail, frac: number) => {
  if (t.state === 'link') {
    const keep = t.len * Math.max(0, Math.min(1, frac));
    w.bursts.push({ from: t.from, to: t.to, owner: t.owner, ants: (t.len - keep) / SPACING, pos: keep });
    t.len = keep;
  }
  t.state = 'back';
};

const hit = (w: World, i: number, owner: Owner, n: number) => {
  const nest = w.nests[i];
  if (nest.owner === owner) {
    nest.ants = Math.min(nest.cap, nest.ants + n);
    return;
  }
  nest.ants -= n;
  if (nest.ants < 0) {
    nest.owner = owner;
    nest.ants = -nest.ants;
    // 빼앗긴 굴에서 나가던 행렬의 개미는 흩어진다
    for (const t of w.trails) {
      if (t.from === i) {
        t.dead = true;
      }
    }
  }
};

const stepTrail = (w: World, t: Trail, dt: number) => {
  const src = w.nests[t.from];
  if (src.owner !== t.owner) {
    t.dead = true;
    return;
  }
  const d = dist(w, t.from, t.to);
  if (t.state === 'back') {
    const r = Math.min(BACK * dt, t.len);
    t.len -= r;
    src.ants = Math.min(src.cap, src.ants + r / SPACING);
    if (t.len <= 0) {
      t.dead = true;
    }
    return;
  }
  const o = opposite(w, t);
  if (t.state === 'grow') {
    // 행렬이 길어지는 만큼 굴에서 개미가 나와 줄을 선다
    const s = Math.max(0, Math.min(GROW * dt, src.ants * SPACING, d - t.len));
    src.ants -= s / SPACING;
    t.len += s;
    if (o && t.len + o.len >= d) {
      const extra = t.len + o.len - d;
      t.len -= extra;
      src.ants += extra / SPACING;
      t.state = 'clash';
      o.state = 'clash';
    } else if (!o && t.len >= d - 1e-6) {
      t.len = d;
      t.state = 'link';
    }
  } else if (t.state === 'clash') {
    if (!o) {
      t.state = 'grow';
      return;
    }
    // 맞붙으면 개미가 더 많은 굴 쪽이 상대 행렬을 밀어낸다
    const os = w.nests[o.from];
    if (src.ants > os.ants) {
      const s = Math.min(PUSH * dt, o.len, src.ants * SPACING);
      src.ants -= s / SPACING;
      t.len += s;
      o.len -= s;
      if (o.len <= 0) {
        o.dead = true;
        t.state = 'grow';
      }
    }
  } else {
    const target = w.nests[t.to];
    if (target.owner === t.owner && target.ants >= target.cap) {
      return;
    }
    const f = Math.min(src.ants, FLOW[grade(src)] * dt);
    src.ants -= f;
    hit(w, t.to, t.owner, f);
  }
};

export const step = (w: World, dt: number) => {
  if (w.status !== 'playing') {
    return;
  }
  w.time += dt;
  for (const n of w.nests) {
    if (n.owner !== NEUTRAL && n.ants < n.cap) {
      n.ants = Math.min(n.cap, n.ants + REGEN[grade(n)] * (n.owner === PLAYER ? PLAYER_REGEN : 1) * dt);
    }
  }
  for (const t of w.trails) {
    if (!t.dead) {
      stepTrail(w, t, dt);
    }
  }
  for (const b of w.bursts) {
    b.pos += MARCH * dt;
    if (b.pos >= dist(w, b.from, b.to)) {
      hit(w, b.to, b.owner, b.ants);
      b.ants = 0;
    }
  }
  w.trails = w.trails.filter((t) => !t.dead);
  w.bursts = w.bursts.filter((b) => b.ants > 0);
  const owners = new Set(w.nests.map((n) => n.owner));
  if (!owners.has(PLAYER)) {
    w.status = 'lost';
  } else if (!owners.has(2) && !owners.has(3)) {
    w.status = 'won';
  }
};

// 적 AI. 불리한 맞대결은 끊어서 회수하고, 이길 수 있는 가장 약한 굴을 노리고, 공격받는 굴에 보급한다.
// smart(보라 흰개미)는 목표를 넘어뜨릴 만큼 행렬이 차면 굴 앞에서 끊어 한꺼번에 돌격한다
export const think = (w: World, owner: Owner, rand: () => number, smart: boolean) => {
  const mine = w.nests.map((_, i) => i).filter((i) => w.nests[i].owner === owner);
  for (const i of mine) {
    const n = w.nests[i];
    for (const t of w.trails) {
      if (t.from !== i || t.owner !== owner || !live(t)) {
        continue;
      }
      const o = opposite(w, t);
      if (t.state === 'clash' && o && n.ants < w.nests[o.from].ants * 0.7) {
        cut(w, t, 0);
      } else if (smart && t.state === 'link' && w.nests[t.to].owner !== owner && (t.len / SPACING) * 0.9 > w.nests[t.to].ants + 2) {
        cut(w, t, 0.1);
      }
    }
    if (outgoing(w, i) >= SLOTS[grade(n)]) {
      continue;
    }
    let best = -1;
    let score = Infinity;
    for (let j = 0; j < w.nests.length; j++) {
      if (w.nests[j].owner === owner || !canLink(w, i, j, owner)) {
        continue;
      }
      const s = w.nests[j].ants + dist(w, i, j) / SPACING + rand() * 5;
      if (s < score) {
        score = s;
        best = j;
      }
    }
    if (best >= 0 && n.ants > score + (smart ? 3 : 8)) {
      link(w, i, best, owner);
      continue;
    }
    const attacked = mine.find((j) => j !== i && w.trails.some((t) => t.to === j && t.owner !== owner && live(t)));
    if (attacked !== undefined && n.ants > 25) {
      link(w, i, attacked, owner);
    }
  }
};
