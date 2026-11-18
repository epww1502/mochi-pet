// 펫마다 화면을 따로 돌아다닌다: 바닥을 걷다가 쉬고, 가끔 맨 앞 창 위 모서리로 폴짝 올라가 걷다가 내려온다.
// 위치는 각자 화면에서만 계산한다(친구와 맞출 필요 없음).

/** 펫이 올라설 수 있는 곳: 창 위 모서리. left~right(px, 창 왼쪽부터), y = 바닥에서의 높이 */
export type Perch = { left: number; right: number; y: number };

/** 폴짝 뛰는 중: (x0,y0) → (x1,y1) */
type Jump = { x0: number; y0: number; x1: number; y1: number; t0: number; dur: number };

export type Walker = {
  /** 창 왼쪽에서 펫 왼쪽까지(px) */
  x: number;
  /** 바닥에서의 높이(px). 창 위에 올라가 있으면 > 0 */
  y: number;
  target: number;
  /** 이 시각(ms)까지 쉰다 */
  restUntil: number;
  moving: boolean;
  faceLeft: boolean;
  /** 올라가 있는 창 모서리 (바닥이면 null) */
  perch: Perch | null;
  /** 이 시각이 지나면 창에서 내려온다 */
  perchUntil: number;
  jump: Jump | null;
};

export const REST_MIN_MS = 3000;
export const REST_EXTRA_MS = 7000;
/** 쉬고 나서 창 위로 올라갈 확률 */
export const CLIMB_CHANCE = 0.25;
const JUMP_MS = 700;

export function newWalker(x: number, now: number): Walker {
  return { x, y: 0, target: x, restUntil: now + REST_MIN_MS, moving: false, faceLeft: false, perch: null, perchUntil: 0, jump: null };
}

/**
 * dt초만큼 걷기(한 줄 위에서). canWalk가 아니면(자리 비움·채팅 중·반응 중 등) 제자리.
 * maxX가 줄면(창이 작아지면) 그 안으로 들어온다.
 */
export function stepWalker(w: Walker, dt: number, now: number, maxX: number, speed: number, canWalk: boolean, rand: () => number = Math.random): Walker {
  const clamp = (v: number) => Math.min(Math.max(v, 0), Math.max(maxX, 0));
  const x = clamp(w.x);
  const target = clamp(w.target); // 창이 좁아졌으면 목적지도 안으로
  if (!canWalk || now < w.restUntil) return { ...w, x, target, moving: false };
  const d = target - x;
  const step = speed * dt;
  if (Math.abs(d) <= step) {
    // 도착: 쉬었다가 다음 목적지로
    return { ...w, x: target, target: rand() * maxX, restUntil: now + REST_MIN_MS + rand() * REST_EXTRA_MS, moving: false };
  }
  return { ...w, x: x + Math.sign(d) * step, target, moving: true, faceLeft: d < 0 };
}

const samePerch = (a: Perch | null, b: Perch | null) => !!a && !!b && Math.abs(a.left - b.left) < 4 && Math.abs(a.right - b.right) < 4 && Math.abs(a.y - b.y) < 4;

function startJump(w: Walker, x1: number, y1: number, now: number): Walker {
  return { ...w, jump: { x0: w.x, y0: w.y, x1, y1, t0: now, dur: JUMP_MS }, moving: false, faceLeft: x1 < w.x };
}

/**
 * 한 칸 진행: 뛰는 중이면 포물선, 창 위면 그 모서리 안에서 걷기, 바닥이면 바닥 걷기.
 * front = 지금 맨 앞 창 모서리(없으면 null). 올라가 있던 창이 움직이거나 닫히면 떨어진다.
 */
export function stepRoam(
  w: Walker,
  o: { dt: number; now: number; maxX: number; slotW: number; speed: number; canWalk: boolean; front: Perch | null; rand?: () => number },
): Walker {
  const rand = o.rand ?? Math.random;
  const { now } = o;
  if (w.jump) {
    const j = w.jump;
    const k = Math.min(1, (now - j.t0) / j.dur);
    const arc = 4 * 60 * k * (1 - k); // 위로 볼록하게 60px
    if (k >= 1) return { ...w, x: j.x1, y: j.y1, jump: null, restUntil: now + 800 };
    return { ...w, x: j.x0 + (j.x1 - j.x0) * k, y: j.y0 + (j.y1 - j.y0) * k + arc };
  }
  if (w.perch) {
    // 창이 사라졌거나 움직였으면 떨어진다, 오래 있었으면 내려온다
    if (!samePerch(w.perch, o.front) || now > w.perchUntil || !o.canWalk) {
      return startJump({ ...w, perch: null }, Math.min(Math.max(w.x, 0), o.maxX), 0, now);
    }
    const p = w.perch;
    const span = Math.max(0, p.right - p.left - o.slotW);
    const local = stepWalker({ ...w, x: w.x - p.left, target: w.target - p.left }, o.dt, now, span, o.speed, true, rand);
    return { ...local, x: local.x + p.left, target: local.target + p.left, y: p.y };
  }
  // 바닥: 쉬는 게 끝났을 때 가끔 맨 앞 창 위로 올라간다
  const f = o.front;
  if (o.canWalk && f && now >= w.restUntil && f.right - f.left >= o.slotW * 1.5 && rand() < CLIMB_CHANCE) {
    const x1 = Math.min(Math.max(w.x, f.left), f.right - o.slotW);
    return { ...startJump(w, x1, f.y, now), perch: f, perchUntil: now + 15_000 + rand() * 20_000, target: x1 };
  }
  return { ...stepWalker(w, o.dt, now, o.maxX, o.speed, o.canWalk, rand), y: 0 };
}

/**
 * 맨 앞 창 [x, y, 너비, 높이](화면 좌표) → 펫이 설 수 있는 모서리. overlay = 펫 창 위치·크기(화면 좌표).
 * 너무 낮거나(바닥 근처) 화면 맨 위에 붙은(최대화) 창은 안 쓴다.
 */
export function perchFrom(rect: [number, number, number, number] | null, overlay: { x: number; y: number; w: number; h: number }, slotW: number): Perch | null {
  if (!rect) return null;
  const [rx, ry, rw] = rect;
  const top = ry - overlay.y; // 펫 창 위에서부터
  const y = overlay.h - top; // 바닥에서의 높이
  const left = Math.max(0, rx - overlay.x);
  const right = Math.min(overlay.w, rx - overlay.x + rw);
  if (top < 60 || y < 120 || right - left < slotW * 1.5) return null;
  return { left, right, y };
}
