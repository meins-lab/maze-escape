import { enhance, MAX_LEVEL, NAMES, odds, pack, unpack } from './forge.ts';

import type { Outcome, State } from './forge.ts';

const KEY = 'sword-state';
// 파괴 연출이 끝나기 전에 +0 목검으로 바뀌면 깨지는 장면이 안 보인다
const DESTROY_MS = 700;

const $ = (id: string) => document.getElementById(id)!;
const levelEl = $('level');
const nameEl = $('name');
const stageEl = $('stage');
const swordEl = $('sword') as HTMLImageElement;
const oddsEl = $('odds');
const msgEl = $('msg');
const goEl = $('go') as HTMLButtonElement;
const progressEl = $('progress');
const bestEl = $('best');
const triesEl = $('tries');
const brokenEl = $('broken');
const resetEl = $('reset') as HTMLButtonElement;
const homeEl = $('home') as HTMLAnchorElement;
const leaveEl = $('leave') as HTMLDialogElement;

const load = (): State => {
  try {
    const s = unpack(localStorage.getItem(KEY));
    if (s) {
      return s;
    }
  } catch {
    // storage blocked
  }
  return { level: 0, best: 0, tries: 0, broken: 0 };
};
// 진행은 홈으로 나갈 때 저장을 고른 경우에만 남긴다. 저장하지 않으면 다음에 +0부터 시작한다
const save = (keep: boolean) => {
  try {
    if (keep) {
      localStorage.setItem(KEY, pack(state));
    } else {
      localStorage.removeItem(KEY);
    }
  } catch {
    // storage blocked: progress lives only for this session
  }
};

const state = load();
let busy = false;
let guarded = false;
let leaveTo: 'home' | 'back' = 'home';

const src = (n: number) => {
  return `/sword/sword-${String(n).padStart(3, '0')}.webp`;
};
const pct = (permille: number) => {
  return `${+(permille / 10).toFixed(2)}%`;
};

// 10단계마다 검의 계열이 바뀐다(목검, 철검, 동양검, 원소, 성마, 용, 마법, 기계, 빔, 우주, 오메가)
const AURAS = ['#b08a5a', '#aab4c0', '#d9a441', '#ff8a3d', '#b98cff', '#ffcc4d', '#5fb8ff', '#3fe0c0', '#ff5ccf', '#8d7dff', '#ffe08a'];

const MESSAGES: Record<Outcome, (n: number) => string> = {
  success: (n) => `강화 성공! +${n}`,
  fail: () => '강화 실패. 검은 무사합니다',
  drop: (n) => `강화 실패… +${n}(으)로 떨어졌습니다`,
  destroy: () => '검이 산산조각 났습니다…',
};

const render = () => {
  const n = state.level;
  levelEl.textContent = `+${n}`;
  nameEl.textContent = NAMES[n];
  swordEl.src = src(n);
  document.documentElement.style.setProperty('--aura', AURAS[Math.floor(n / 10)]);
  progressEl.style.width = `${n}%`;
  swordEl.alt = `+${n} ${NAMES[n]}`;
  const done = n >= MAX_LEVEL;
  goEl.disabled = done;
  goEl.textContent = done ? '최고 단계 달성' : '강화하기';
  resetEl.hidden = !done;
  if (done) {
    oddsEl.innerHTML = '';
  } else {
    const o = odds(n);
    const fail = 1000 - o.success - o.destroy;
    const w = (permille: number) => {
      return `style="width:${permille / 10}%"`;
    };
    oddsEl.innerHTML =
      `<div class="bar"><i class="s" ${w(o.success)}></i><i class="f" ${w(fail)}></i><i class="d" ${w(o.destroy)}></i></div>` +
      '<div class="legend">' +
      `<span class="s">성공 ${pct(o.success)}</span>` +
      `<span class="f">${o.drop ? '실패 시 하락' : '실패'} ${pct(fail)}</span>` +
      (o.destroy ? `<span class="d">파괴 ${pct(o.destroy)}</span>` : '') +
      '</div>';
    new Image().src = src(n + 1);
  }
  bestEl.textContent = `+${state.best}`;
  triesEl.textContent = state.tries.toLocaleString();
  brokenEl.textContent = String(state.broken);
};

// 같은 결과가 연달아 나와도 애니메이션이 다시 돌도록 클래스를 지웠다가 리플로 후 다시 붙인다
const play = (cls: Outcome) => {
  stageEl.className = 'stage';
  void stageEl.offsetWidth;
  stageEl.className = `stage ${cls === 'drop' ? 'fail' : cls}`;
};

const handleGoBtnClick = () => {
  if (busy || leaveEl.open || state.level >= MAX_LEVEL) {
    return;
  }
  const r = enhance(state.level);
  state.tries++;
  // 뒤로가기를 가로채려면 막을 기록 한 칸이 필요하다. 클릭(사용자 조작) 안에서 넣어야 브라우저가 건너뛰지 않는다
  if (!guarded) {
    guarded = true;
    history.pushState({ sword: true }, '');
  }
  state.level = r.level;
  state.best = Math.max(state.best, r.level);
  if (r.outcome === 'destroy') {
    state.broken++;
  }
  msgEl.className = 'msg';
  void msgEl.offsetWidth;
  msgEl.className = `msg pop ${r.outcome}`;
  msgEl.textContent = MESSAGES[r.outcome](r.level);
  play(r.outcome);
  if (r.outcome === 'destroy') {
    busy = true;
    goEl.disabled = true;
    setTimeout(() => {
      busy = false;
      stageEl.className = 'stage';
      render();
    }, DESTROY_MS);
    return;
  }
  render();
};

const handleResetBtnClick = () => {
  state.level = 0;
  msgEl.textContent = '';
  render();
};

const handleHomeLinkClick = (e: MouseEvent) => {
  if (state.level === 0 && state.tries === 0) {
    return;
  }
  e.preventDefault();
  openLeave('home');
};

const openLeave = (to: 'home' | 'back') => {
  leaveTo = to;
  leaveEl.returnValue = '';
  leaveEl.showModal();
};

const handleWindowPopState = () => {
  if (!guarded) {
    return;
  }
  guarded = false;
  if (leaveEl.open) {
    leaveEl.close();
  }
  openLeave('back');
};

const handleLeaveDialogClose = () => {
  if (leaveEl.returnValue === 'save' || leaveEl.returnValue === 'discard') {
    save(leaveEl.returnValue === 'save');
    if (leaveTo === 'home') {
      location.href = homeEl.href;
      return;
    }
    history.back();
    // 이 페이지로 바로 들어와 이전 기록이 없으면 back이 아무 일도 하지 않는다
    setTimeout(() => {
      location.href = homeEl.href;
    }, 300);
    return;
  }
  if (leaveTo === 'back') {
    guarded = true;
    history.pushState({ sword: true }, '');
  }
};

goEl.addEventListener('click', handleGoBtnClick);
homeEl.addEventListener('click', handleHomeLinkClick);
leaveEl.addEventListener('close', handleLeaveDialogClose);
window.addEventListener('popstate', handleWindowPopState);
resetEl.addEventListener('click', handleResetBtnClick);
window.addEventListener('keydown', (e) => {
  // 버튼에 포커스가 있으면 브라우저가 click을 따로 보내서 두 번 강화된다
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !(document.activeElement instanceof HTMLButtonElement)) {
    e.preventDefault();
    handleGoBtnClick();
  }
});

render();
