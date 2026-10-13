import { COLS, HOUSE_EXIT, MAZES, PLAYER_START, ROWS } from './maze.ts';

type Dir = { x: number; y: number };
type Mover = { x: number; y: number; dir: Dir };
type GhostState = 'house' | 'leaving' | 'active' | 'eaten' | 'entering';
type Ghost = Mover & {
  name: 'chaser' | 'ambusher' | 'flanker' | 'wanderer';
  color: string;
  home: { x: number; y: number };
  corner: { x: number; y: number };
  releaseAt: number;
  uturnReadyAt: number;
  state: GhostState;
  frightened: boolean;
};

const TS = 16; // logical tile size
const HUD_TOP = 3;
const W = COLS * TS;
const H = (ROWS + HUD_TOP + 2) * TS;
const UP: Dir = { x: 0, y: -1 };
const LEFT: Dir = { x: -1, y: 0 };
const DOWN: Dir = { x: 0, y: 1 };
const RIGHT: Dir = { x: 1, y: 0 };
const STOP: Dir = { x: 0, y: 0 };
const DIRS = [UP, LEFT, DOWN, RIGHT]; // arcade tie-break order
// arcade scatter/chase rhythm in seconds; the last chase lasts forever
const MODE_SCHEDULE = [7, 20, 7, 20, 5, 20, 5, Infinity];
// seconds an eaten enemy rests inside the house before coming back out
const HOUSE_REST_SECONDS = 3;
const HOUSE_CENTER = { x: 13, y: 14 };
// clearing this level shows the ending
const LAST_LEVEL = 5;
// hidden round, reached only by typing HIDDEN_CODE on the title screen: one scatter only,
// all enemies out at once, no power pellets, and enemies may U-turn mid-corridor
const HIDDEN_LEVEL = 6;
const HIDDEN_CODE = '+lv6';
const HIDDEN_MODE_SCHEDULE = [7, Infinity];
// in the hidden round every enemy wears the chaser's color so roles can't be read at a glance
const CHASER_COLOR = '#43a047';
// small extra player speed (tiles/s) in the hidden round
const HIDDEN_PLAYER_SPEED_BONUS = 0.3;
// after a U-turn an enemy must keep going this long; stops it jittering between two tiles
const UTURN_COOLDOWN_SECONDS = 0.5;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let scale = 1;
let offX = 0;
let offY = 0;

const resize = () => {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  scale = Math.min(canvas.width / W, canvas.height / H);
  offX = (canvas.width - W * scale) / 2;
  offY = (canvas.height - H * scale) / 2;
};
window.addEventListener('resize', resize);
resize();

const readHigh = () => {
  try {
    return Number(localStorage.getItem('maze-escape-high')) || 0;
  } catch {
    return 0;
  }
};
const saveHigh = (v: number) => {
  try {
    localStorage.setItem('maze-escape-high', String(v));
  } catch {
    // storage blocked: high score lives only for this session
  }
};

const wrapCol = (x: number) => ((x % COLS) + COLS) % COLS;
let grid: string[][] = [];
const tileAt = (x: number, y: number) => (y < 0 || y >= ROWS ? '#' : grid[y][wrapCol(x)]);
const same = (a: Dir, b: Dir) => a.x === b.x && a.y === b.y;
const isStop = (d: Dir) => d.x === 0 && d.y === 0;

let player: Mover & { nextDir: Dir; face: Dir } = { x: 0, y: 0, dir: LEFT, nextDir: LEFT, face: LEFT };
let ghosts: Ghost[] = [];
let state: 'title' | 'ready' | 'play' | 'dying' | 'clear' | 'over' | 'ending' = 'title';
// text typed after '+' on the title screen, null when not typing
let code: string | null = null;
let stateTime = 0;
let roundTime = 0;
let modeIndex = 0;
let modeTime = 0;
let frightTime = 0;
let eatCombo = 0;
let score = 0;
let high = readHigh();
// lives the player can hold; clearing a level gives one back up to this cap
const MAX_LIVES = 3;
let lives = MAX_LIVES;
let level = 1;
let dotsLeft = 0;

const isHiddenRound = () => level === HIDDEN_LEVEL;
const modeSchedule = () => (isHiddenRound() ? HIDDEN_MODE_SCHEDULE : MODE_SCHEDULE);
const scatterMode = () => modeIndex % 2 === 0;
const playerSpeed = () => Math.min(10, 7.5 + level * 0.25) + (isHiddenRound() ? HIDDEN_PLAYER_SPEED_BONUS : 0);
const ghostSpeed = () => Math.min(9.5, 7 + level * 0.25);
const frightDuration = () => Math.max(1, 6 - level * 0.5);

const playerCanWalk = (x: number, y: number) => {
  const t = tileAt(x, y);
  return t !== '#' && t !== '-';
};
const ghostCanWalk = (g: Ghost, x: number, y: number) => {
  const t = tileAt(x, y);
  if (t === '-') {
    return g.state !== 'active';
  }
  return t !== '#';
};

// each level uses the next maze, wrapping around
const currentMaze = () => MAZES[(level - 1) % MAZES.length];

const fillDots = () => {
  const rows = currentMaze().rows;
  grid = rows.map((row) => [...row]);
  if (isHiddenRound()) {
    // no power pellets: they become plain dots
    grid = grid.map((row) => row.map((t) => (t === 'o' ? '.' : t)));
  }
  dotsLeft = grid.flat().filter((t) => t === '.' || t === 'o').length;
};

const resetPositions = () => {
  player = { x: PLAYER_START.x, y: PLAYER_START.y, dir: LEFT, nextDir: LEFT, face: LEFT };
  const g = (name: Ghost['name'], color: string, home: Dir, corner: Dir, releaseAt: number): Ghost => ({
    name,
    color: isHiddenRound() ? CHASER_COLOR : color,
    home,
    corner,
    releaseAt: isHiddenRound() ? 0 : releaseAt,
    uturnReadyAt: 0,
    x: home.x,
    y: home.y,
    dir: name === 'chaser' ? LEFT : UP,
    state: name === 'chaser' ? 'active' : 'house',
    frightened: false,
  });
  ghosts = [
    g('chaser', CHASER_COLOR, HOUSE_EXIT, { x: 25, y: -3 }, 0),
    g('ambusher', '#8e24aa', { x: 13, y: 14 }, { x: 2, y: -3 }, 0),
    g('flanker', '#1e88e5', { x: 11, y: 14 }, { x: 27, y: 31 }, 4),
    g('wanderer', '#00897b', { x: 15, y: 14 }, { x: 0, y: 31 }, 8),
  ];
  roundTime = 0;
  modeIndex = 0;
  modeTime = 0;
  frightTime = 0;
  setState('ready');
};

const setState = (s: typeof state) => {
  state = s;
  stateTime = 0;
};

const newGame = (startLevel = 1) => {
  score = 0;
  lives = MAX_LIVES;
  level = startLevel;
  fillDots();
  resetPositions();
};

const toTitle = () => {
  level = 1;
  fillDots();
  resetPositions();
  setState('title');
};

// Move along the grid, stopping at every tile center so turns happen exactly on centers.
const advance = (e: Mover, dist: number, onCenter: () => void, canWalk: (x: number, y: number) => boolean) => {
  for (let guard = 0; dist > 1e-9 && guard < 8; guard++) {
    const cx = Math.round(e.x);
    const cy = Math.round(e.y);
    if (Math.abs(e.x - cx) < 1e-6 && Math.abs(e.y - cy) < 1e-6) {
      e.x = cx;
      e.y = cy;
      onCenter();
      if (isStop(e.dir) || !canWalk(cx + e.dir.x, cy + e.dir.y)) {
        e.dir = STOP;
        return;
      }
      const step = Math.min(dist, 1);
      e.x += e.dir.x * step;
      e.y += e.dir.y * step;
      dist -= step;
    } else {
      if (isStop(e.dir)) {
        return;
      }
      const tx = e.dir.x > 0 ? Math.ceil(e.x) : e.dir.x < 0 ? Math.floor(e.x) : e.x;
      const ty = e.dir.y > 0 ? Math.ceil(e.y) : e.dir.y < 0 ? Math.floor(e.y) : e.y;
      const step = Math.min(dist, Math.abs(tx - e.x) + Math.abs(ty - e.y));
      e.x += e.dir.x * step;
      e.y += e.dir.y * step;
      dist -= step;
    }
    // side tunnel wraps around
    if (e.x < -1) {
      e.x += COLS;
    } else if (e.x > COLS) {
      e.x -= COLS;
    }
  }
};

const ghostTarget = (g: Ghost) => {
  // eyes head for the door first, then drop inside (targeting the house directly lets them loop around it)
  if (g.state === 'entering') {
    return HOUSE_CENTER;
  }
  if (g.state === 'leaving' || g.state === 'eaten') {
    return HOUSE_EXIT;
  }
  if (scatterMode()) {
    return g.corner;
  }
  const px = Math.round(player.x);
  const py = Math.round(player.y);
  switch (g.name) {
    case 'chaser':
      return { x: px, y: py };
    case 'ambusher':
      return { x: px + player.face.x * 4, y: py + player.face.y * 4 };
    case 'flanker': {
      const b = ghosts[0];
      const ax = px + player.face.x * 2;
      const ay = py + player.face.y * 2;
      return { x: ax * 2 - Math.round(b.x), y: ay * 2 - Math.round(b.y) };
    }
    case 'wanderer':
      return Math.hypot(g.x - px, g.y - py) > 8 ? { x: px, y: py } : g.corner;
  }
};

const ghostOnCenter = (g: Ghost) => {
  if (g.state === 'leaving' && g.x === HOUSE_EXIT.x && g.y === HOUSE_EXIT.y) {
    g.state = 'active';
  }
  if (g.state === 'eaten' && g.x === HOUSE_EXIT.x && g.y === HOUSE_EXIT.y) {
    g.state = 'entering';
  }
  if (g.state === 'entering' && g.x === HOUSE_CENTER.x && g.y === HOUSE_CENTER.y) {
    // back home: rest, then the usual house release takes it out again
    g.state = 'house';
    g.releaseAt = roundTime + HOUSE_REST_SECONDS;
    g.dir = UP;
    return;
  }
  const reverse = { x: -g.dir.x, y: -g.dir.y };
  const canUturn = isHiddenRound() && g.state === 'active' && !g.frightened && roundTime >= g.uturnReadyAt;
  const options = DIRS.filter(
    (d) =>
      ghostCanWalk(g, g.x + d.x, g.y + d.y) &&
      (g.state === 'leaving' || g.state === 'entering' || canUturn || !same(d, reverse)),
  );
  if (options.length === 0) {
    g.dir = reverse;
    return;
  }
  if (g.frightened) {
    g.dir = options[Math.floor(Math.random() * options.length)];
    return;
  }
  const t = ghostTarget(g);
  let best = options[0];
  let bestD = Infinity;
  for (const d of options) {
    const dd = (g.x + d.x - t.x) ** 2 + (g.y + d.y - t.y) ** 2;
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  if (canUturn && same(best, reverse)) {
    g.uturnReadyAt = roundTime + UTURN_COOLDOWN_SECONDS;
  }
  g.dir = best;
};

const playerOnCenter = () => {
  const t = tileAt(player.x, player.y);
  if (t === '.' || t === 'o') {
    grid[player.y][wrapCol(player.x)] = ' ';
    dotsLeft--;
    score += t === 'o' ? 50 : 10;
    if (t === 'o') {
      frightTime = frightDuration();
      eatCombo = 0;
      for (const g of ghosts) {
        if (g.state === 'active') {
          g.frightened = true;
          g.dir = { x: -g.dir.x, y: -g.dir.y };
        }
      }
    }
  }
  if (playerCanWalk(player.x + player.nextDir.x, player.y + player.nextDir.y)) {
    player.dir = player.nextDir;
  }
  if (!playerCanWalk(player.x + player.dir.x, player.y + player.dir.y)) {
    // never stand still: at a wall turn left or right (random if both open), reverse only at a dead end
    const sides = [
      { x: player.dir.y, y: -player.dir.x },
      { x: -player.dir.y, y: player.dir.x },
    ].filter((d) => playerCanWalk(player.x + d.x, player.y + d.y));
    player.dir = sides.length ? sides[Math.floor(Math.random() * sides.length)] : { x: -player.dir.x, y: -player.dir.y };
    player.nextDir = player.dir;
  }
};

const update = (dt: number) => {
  stateTime += dt;
  if (state === 'ready' && stateTime > 2) {
    setState('play');
  }
  if (state === 'dying' && stateTime > 1.6) {
    if (lives <= 0) {
      setState('over');
    } else {
      resetPositions();
    }
  }
  if (state === 'clear' && stateTime > 2 && (level === LAST_LEVEL || isHiddenRound())) {
    setState('ending');
  }
  if (state === 'clear' && stateTime > 2) {
    level++;
    lives = Math.min(MAX_LIVES, lives + 1);
    fillDots();
    resetPositions();
  }
  if (state !== 'play') {
    return;
  }

  roundTime += dt;
  if (frightTime > 0) {
    frightTime -= dt;
    if (frightTime <= 0) {
      ghosts.forEach((g) => (g.frightened = false));
    }
  } else {
    modeTime += dt;
    if (modeTime > modeSchedule()[modeIndex]) {
      modeTime = 0;
      modeIndex++;
      // mode switch makes every roaming ghost turn around
      ghosts.filter((g) => g.state === 'active').forEach((g) => (g.dir = { x: -g.dir.x, y: -g.dir.y }));
    }
  }

  // reversing is allowed anywhere, other turns only on tile centers
  if (same(player.nextDir, { x: -player.dir.x, y: -player.dir.y }) && !isStop(player.dir)) {
    player.dir = player.nextDir;
  }
  advance(player, playerSpeed() * dt, playerOnCenter, playerCanWalk);
  if (!isStop(player.dir)) {
    player.face = player.dir;
  }

  for (const g of ghosts) {
    if (g.state === 'house') {
      if (roundTime >= g.releaseAt) {
        g.state = 'leaving';
      }
      continue;
    }
    const speed =
      g.state === 'eaten' || g.state === 'entering' ? 15 : g.state === 'leaving' ? 4 : g.frightened ? 4.5 : ghostSpeed();
    advance(g, speed * dt, () => ghostOnCenter(g), (x, y) => ghostCanWalk(g, x, y));
  }

  for (const g of ghosts) {
    if (g.state !== 'active' || Math.hypot(g.x - player.x, g.y - player.y) > 0.6) {
      continue;
    }
    if (g.frightened) {
      g.state = 'eaten';
      g.frightened = false;
      score += 200 * 2 ** eatCombo;
      eatCombo++;
    } else {
      lives--;
      setState('dying');
      break;
    }
  }

  if (score > high) {
    high = score;
    saveHigh(high);
  }
  if (dotsLeft === 0) {
    setState('clear');
  }
};

const setDir = (d: Dir) => {
  if (state === 'ending') {
    // short pause so the clearing keypress doesn't skip the ending
    if (stateTime > 1.5) {
      toTitle();
    }
    return;
  }
  if (state === 'title' || state === 'over') {
    newGame();
    return;
  }
  player.nextDir = d;
};

const KEYS: Record<string, Dir> = {
  ArrowUp: UP,
  ArrowLeft: LEFT,
  ArrowDown: DOWN,
  ArrowRight: RIGHT,
  KeyW: UP,
  KeyA: LEFT,
  KeyS: DOWN,
  KeyD: RIGHT,
};
// typing the hidden code: '+' opens a prompt at the bottom, everything else is ignored until Enter/Escape
const typeCode = (e: KeyboardEvent) => {
  e.preventDefault();
  if (code === null) {
    code = '+';
  } else if (e.key === 'Enter') {
    if (code.toLowerCase() === HIDDEN_CODE) {
      newGame(HIDDEN_LEVEL);
    }
    code = null;
  } else if (e.key === 'Escape') {
    code = null;
  } else if (e.key === 'Backspace') {
    code = code.length > 1 ? code.slice(0, -1) : null;
  } else if (code.length < 8) {
    // read letters/digits from the physical key so Korean input mode still types 'lv6'
    const ch = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : /^Digit\d$/.test(e.code) ? e.code.slice(5) : e.key;
    if (ch.length === 1) {
      code += ch;
    }
  }
};

window.addEventListener('keydown', (e) => {
  if (state === 'title' && (code !== null || e.key === '+')) {
    typeCode(e);
    return;
  }
  const d = KEYS[e.code];
  if (d) {
    e.preventDefault();
    setDir(d);
  } else if (e.code === 'Space' || e.code === 'Enter') {
    setDir(player.nextDir);
  }
});

// swipe on touch screens
let swipeStart: { x: number; y: number } | null = null;
window.addEventListener('pointerdown', (e) => {
  swipeStart = { x: e.clientX, y: e.clientY };
  if (state === 'ending' || ((state === 'title' || state === 'over') && code === null)) {
    setDir(LEFT);
  }
});
window.addEventListener('pointermove', (e) => {
  if (!swipeStart) {
    return;
  }
  const dx = e.clientX - swipeStart.x;
  const dy = e.clientY - swipeStart.y;
  if (Math.hypot(dx, dy) < 24) {
    return;
  }
  setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : dy > 0 ? DOWN : UP);
  swipeStart = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointerup', () => {
  swipeStart = null;
});

// ---- drawing ----

const px = (x: number) => (x + 0.5) * TS;
const py = (y: number) => (y + 0.5 + HUD_TOP) * TS;

const drawMaze = () => {
  const flash = state === 'clear' && Math.floor(stateTime * 4) % 2 === 1;
  ctx.strokeStyle = flash ? '#ffffff' : currentMaze().wall;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x] !== '#') {
        continue;
      }
      // outline only the wall edges that face open space
      const l = x * TS;
      const t = (y + HUD_TOP) * TS;
      const wallAt = (cx: number, cy: number) => cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS || grid[cy][cx] === '#';
      if (!wallAt(x, y - 1)) {
        ctx.moveTo(l, t + 4);
        ctx.lineTo(l + TS, t + 4);
      }
      if (!wallAt(x, y + 1)) {
        ctx.moveTo(l, t + TS - 4);
        ctx.lineTo(l + TS, t + TS - 4);
      }
      if (!wallAt(x - 1, y)) {
        ctx.moveTo(l + 4, t);
        ctx.lineTo(l + 4, t + TS);
      }
      if (!wallAt(x + 1, y)) {
        ctx.moveTo(l + TS - 4, t);
        ctx.lineTo(l + TS - 4, t + TS);
      }
    }
  }
  ctx.stroke();

  ctx.fillStyle = '#c8b27a';
  ctx.fillRect(13 * TS, (12 + HUD_TOP) * TS + 6, TS * 2, 3);

  ctx.fillStyle = '#f5e6c8';
  const blink = Math.floor(performance.now() / 200) % 2 === 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = grid[y][x];
      if (t === '.') {
        ctx.fillRect(px(x) - 2, py(y) - 2, 4, 4);
      } else if (t === 'o' && (blink || state !== 'play')) {
        ctx.beginPath();
        ctx.arc(px(x), py(y), 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
};

const millirang = new Image();
millirang.src = '/millirang.png';

// Millirang face: mirrored when heading left, squashes a little while chomping
const drawPlayer = (x: number, y: number, face: Dir, chomp: number, size = TS * 1.7, spin = 0) => {
  if (!millirang.complete || millirang.naturalWidth === 0) {
    return;
  }
  const h = size * (millirang.naturalHeight / millirang.naturalWidth);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.scale(face.x < 0 ? -1 : 1, 1 - chomp * 0.12);
  ctx.drawImage(millirang, -size / 2, -h / 2, size, h);
  ctx.restore();
};

const drawGhost = (g: Ghost) => {
  const x = px(g.x);
  const y = py(g.y) + (g.state === 'house' ? Math.sin(performance.now() / 150) * 2 : 0);
  const r = TS * 0.8;
  if (g.state !== 'eaten' && g.state !== 'entering') {
    const flashing = g.frightened && frightTime < 2 && Math.floor(frightTime * 5) % 2 === 0;
    ctx.fillStyle = g.frightened ? (flashing ? '#ffffff' : '#3949ab') : g.color;
    // dokkaebi: round body with two horns, bobbing as it walks
    const bob = Math.sin(performance.now() / 110 + g.home.x) * 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y + bob, r, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    for (const hx of [-1, 1]) {
      ctx.moveTo(x + hx * r * 0.75, y + bob - r * 0.45);
      ctx.lineTo(x + hx * r * 0.85, y + bob - r * 1.25);
      ctx.lineTo(x + hx * r * 0.25, y + bob - r * 0.8);
    }
    ctx.fill();
    if (g.frightened) {
      ctx.fillStyle = flashing ? '#e53935' : '#f5e6c8';
      ctx.fillRect(x - 5, y - 5, 3, 3);
      ctx.fillRect(x + 2, y - 5, 3, 3);
      return;
    }
  }
  // eyes look where the ghost is heading
  for (const ex of [-5, 5]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x + ex, y - 4, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#212121';
    ctx.beginPath();
    ctx.arc(x + ex + g.dir.x * 2, y - 4 + g.dir.y * 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
};

const text = (s: string, x: number, y: number, color = '#ffffff', align: CanvasTextAlign = 'left') => {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
};

const draw = () => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  // keep tunnel travelers from drawing outside the board on wide screens
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  drawBoard();
  ctx.restore();
};

const drawBoard = () => {
  ctx.font = 'bold 14px "Courier New", monospace';

  text('1UP', TS * 3, TS * 1);
  text(String(score), TS * 7, TS * 2, '#ffffff', 'right');
  text('HIGH SCORE', W / 2, TS * 1, '#ffffff', 'center');
  text(String(high), W / 2 + TS * 2, TS * 2, '#ffffff', 'right');

  drawMaze();

  if (state === 'title') {
    text('MAZE ESCAPE', W / 2, py(14) + 5, '#f5c542', 'center');
    text('PRESS ANY KEY / TAP', W / 2, py(17) + 5, '#ffffff', 'center');
    if (code !== null) {
      const cursor = Math.floor(performance.now() / 400) % 2 === 0 ? '_' : ' ';
      text(code + cursor, TS, H - TS + 5);
    }
    return;
  }

  if (state === 'ending') {
    // dark panel so the text reads cleanly over the maze lines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(TS * 2, py(9), W - TS * 4, py(21) - py(9));
    if (isHiddenRound()) {
      text('TRUE ENDING', W / 2, py(11) + 5, '#e53935', 'center');
      text('YOU BEAT THE HIDDEN ROUND', W / 2, py(14) + 5, '#ffffff', 'center');
    } else {
      text('ALL CLEAR!', W / 2, py(11) + 5, '#f5c542', 'center');
      text('THANKS FOR PLAYING', W / 2, py(14) + 5, '#ffffff', 'center');
    }
    text(`SCORE ${score}`, W / 2, py(17) + 5, '#ffffff', 'center');
    if (stateTime > 1.5) {
      text('PRESS ANY KEY / TAP', W / 2, py(20) + 5, '#ffffff', 'center');
    }
    return;
  }

  if (state !== 'clear') {
    for (const g of ghosts) {
      if (state !== 'dying' || stateTime < 0.5) {
        drawGhost(g);
      }
    }
  }

  if (state === 'dying') {
    // Millirang spins and shrinks away
    const k = Math.min(1, Math.max(0, (stateTime - 0.5) / 1));
    if (k < 1) {
      drawPlayer(px(player.x), py(player.y), RIGHT, 0, TS * 1.7 * (1 - k), k * Math.PI * 4);
    }
  } else {
    const moving = state === 'play' && !isStop(player.dir);
    const chomp = moving ? Math.abs(Math.sin(performance.now() / 60)) : 0;
    drawPlayer(px(player.x), py(player.y), player.face, chomp);
  }

  if (state === 'ready') {
    text('READY!', W / 2, py(17) + 5, '#f5c542', 'center');
  }
  if (state === 'over') {
    text('GAME  OVER', W / 2, py(17) + 5, '#ff0000', 'center');
  }

  for (let i = 0; i < lives - (state === 'ready' ? 1 : 0); i++) {
    drawPlayer(TS * (2 + i * 2), H - TS, RIGHT, 0, TS * 1.3);
  }
  text(`LV ${level}`, W - TS, H - TS + 5, isHiddenRound() ? '#e53935' : '#ffffff', 'right');
};

let last = performance.now();
const loop = (now: number) => {
  // clamp dt so a background tab doesn't teleport anyone through walls
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
};
fillDots();
resetPositions();
setState('title');
requestAnimationFrame(loop);
