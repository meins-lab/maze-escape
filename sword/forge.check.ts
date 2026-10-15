// Run: yarn check — fails if the name list, odds table, roll judging, or save signing breaks.
import { enhance, MAX_LEVEL, NAMES, odds, pack, unpack } from './forge.ts';

const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    throw new Error(msg);
  }
};

assert(NAMES.length === MAX_LEVEL + 1, 'one name per level');

for (let n = 0; n < MAX_LEVEL; n++) {
  const o = odds(n);
  assert(o.success > 0 && o.success + o.destroy <= 1000, `+${n}: odds out of range`);
  if (n > 0) {
    assert(o.success <= odds(n - 1).success, `+${n}: success must not rise`);
    assert(o.destroy >= odds(n - 1).destroy, `+${n}: destroy must not fall`);
  }
  const s = odds(n).success / 1000;
  const d = odds(n).destroy / 1000;
  assert(enhance(n, () => 0).level === n + 1, `+${n}: lowest roll must succeed`);
  assert(enhance(n, () => s - 1e-9).outcome === 'success', `+${n}: roll just under success`);
  const after = enhance(n, () => s + 1e-9);
  assert(after.outcome === (d > 0 ? 'destroy' : o.drop ? 'drop' : 'fail'), `+${n}: roll just over success`);
  const worst = enhance(n, () => 0.999999);
  assert(worst.outcome === (o.drop ? 'drop' : 'fail') && worst.level === (o.drop ? n - 1 : n), `+${n}: highest roll`);
  if (d > 0) {
    assert(enhance(n, () => s + d / 2).level === 0, `+${n}: destroy resets to +0`);
  }
}
assert(!odds(0).drop && odds(10).drop && !odds(30).drop, 'drop only in +10..+29');

const saved = { level: 42, best: 57, tries: 900, broken: 3 };
const packed = pack(saved);
assert(JSON.stringify(unpack(packed)) === JSON.stringify(saved), 'pack/unpack round trip');
assert(!packed.includes('42'), 'packed value must not show the level in plain text');
assert(unpack(null) === null && unpack('') === null && unpack('{"level":100}') === null, 'old or empty saves are rejected');
const [raw] = packed.split('.');
const forged = btoa(JSON.stringify([100, 100, 900, 3]));
assert(unpack(`${forged}.${packed.split('.')[1]}`) === null, 'edited value with old signature is rejected');
assert(unpack(`${raw}.x`) === null, 'bad signature is rejected');
assert(unpack(pack({ level: 100, best: 100, tries: 5, broken: 0 })) === null, 'level above tries is rejected');
assert(unpack(pack({ level: 101, best: 101, tries: 999, broken: 0 })) === null, 'level above max is rejected');
