// 펫마다 화면 바닥을 따라 따로 돌아다닌다: 걷다가 도착하면 잠깐 쉬고, 다른 곳으로 또 걸어간다.
// 위치는 각자 화면에서만 계산한다(친구와 맞출 필요 없음).

export type Walker = {
  /** 창 왼쪽에서 펫 왼쪽까지(px) */
  x: number;
  target: number;
  /** 이 시각(ms)까지 쉰다 */
  restUntil: number;
  moving: boolean;
  faceLeft: boolean;
};

export const REST_MIN_MS = 3000;
export const REST_EXTRA_MS = 7000;

export function newWalker(x: number, now: number): Walker {
  return { x, target: x, restUntil: now + REST_MIN_MS, moving: false, faceLeft: false };
}

/**
 * dt초만큼 걷기. canWalk가 아니면(자리 비움·채팅 중·반응 중 등) 제자리.
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
    return { x: target, target: rand() * maxX, restUntil: now + REST_MIN_MS + rand() * REST_EXTRA_MS, moving: false, faceLeft: w.faceLeft };
  }
  return { ...w, x: x + Math.sign(d) * step, target, moving: true, faceLeft: d < 0 };
}
