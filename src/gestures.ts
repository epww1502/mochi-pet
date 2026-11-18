// 흔들기(창을 끌고 좌우로)와 쓰다듬기(머리 위에서 마우스를 좌우로)를 알아챈다.
// 둘 다 "짧은 시간 안에 좌우 방향이 여러 번 바뀌었나"로 판단한다.

/**
 * 좌우 방향 전환 감지기. 위치를 계속 넣어 주다가 windowMs 안에 need번 방향이 바뀌면 true를 한 번 돌려준다.
 * minStep보다 작은 움직임은 손떨림으로 보고 무시한다. 한 번 반응하면 cooldownMs 동안은 쉰다.
 */
export function wiggleDetector({ need, windowMs, minStep, cooldownMs }: { need: number; windowMs: number; minStep: number; cooldownMs: number }) {
  let anchor: number | null = null; // 마지막으로 방향을 판단한 위치
  let dir = 0;
  let flips: number[] = [];
  let quietUntil = 0;
  return (x: number, now: number): boolean => {
    if (anchor === null) {
      anchor = x;
      return false;
    }
    const d = x - anchor;
    if (Math.abs(d) < minStep) return false;
    const nd = Math.sign(d);
    if (dir !== 0 && nd !== dir) flips.push(now);
    dir = nd;
    anchor = x;
    flips = flips.filter((t) => now - t <= windowMs);
    if (flips.length >= need && now >= quietUntil) {
      flips = [];
      quietUntil = now + cooldownMs;
      return true;
    }
    return false;
  };
}
