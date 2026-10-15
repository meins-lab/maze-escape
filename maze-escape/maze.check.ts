// Run: yarn check — fails if any maze is malformed, has a dot the player can't reach, or has a dead end.
import { COLS, MAZES, PLAYER_START, ROWS } from './maze.ts';

MAZES.forEach(({ rows: MAZE }, i) => {

if (MAZE.length !== ROWS || MAZE.some((row) => row.length !== COLS)) {
  throw new Error(`maze ${i}: must be 28x31`);
}

const open = (x: number, y: number) => {
  const t = MAZE[y]?.[((x % COLS) + COLS) % COLS];
  return t !== undefined && t !== '#' && t !== '-';
};
const seen = new Set<string>();
const queue = [PLAYER_START];
while (queue.length) {
  const { x, y } = queue.pop()!;
  const cx = ((x % COLS) + COLS) % COLS;
  const key = `${cx},${y}`;
  if (seen.has(key) || !open(cx, y)) {
    continue;
  }
  seen.add(key);
  queue.push({ x: cx + 1, y }, { x: cx - 1, y }, { x: cx, y: y + 1 }, { x: cx, y: y - 1 });
}
let dots = 0;
MAZE.forEach((row, y) =>
  [...row].forEach((t, x) => {
    if (t === '.' || t === 'o') {
      dots++;
      if (!seen.has(`${x},${y}`)) {
        throw new Error(`maze ${i}: unreachable dot at ${x},${y}`);
      }
    }
  }),
);
// no dead ends outside the ghost house: the player never has to stop
MAZE.forEach((row, y) =>
  [...row].forEach((_, x) => {
    const inHouse = x >= 10 && x <= 17 && y >= 12 && y <= 16;
    if (!inHouse && open(x, y) && [open(x + 1, y), open(x - 1, y), open(x, y + 1), open(x, y - 1)].filter(Boolean).length < 2) {
      throw new Error(`maze ${i}: dead end at ${x},${y}`);
    }
  }),
);
console.log(`maze ${i} ok: ${dots} dots, all reachable`);
});
