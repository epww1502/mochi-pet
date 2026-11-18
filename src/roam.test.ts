import { describe, expect, it } from "vitest";
import { newWalker, stepWalker, type Walker } from "./roam";

/** t초 동안 0.1초씩 걷기 */
function walk(w: Walker, seconds: number, start: number, maxX: number, canWalk = true, rand = () => 0.5) {
  let now = start;
  for (let i = 0; i < seconds * 10; i++) {
    now += 100;
    w = stepWalker(w, 0.1, now, maxX, 40, canWalk, rand);
  }
  return { w, now };
}

describe("stepWalker", () => {
  it("처음엔 잠깐 쉬다가 목적지로 걸어가고, 도착하면 다시 쉰다", () => {
    let w = newWalker(0, 0);
    w = { ...w, target: 200 };
    expect(walk(w, 2, 0, 1000).w.x).toBe(0); // 아직 쉬는 중
    const { w: walked } = walk(w, 6, 3000, 1000); // 40px/초 x 6초 = 240px → 200에 도착
    expect(walked.x).toBe(200);
    expect(walked.moving).toBe(false);
  });

  it("걸어가는 방향을 본다", () => {
    const w: Walker = { x: 300, target: 100, restUntil: 0, moving: false, faceLeft: false };
    const next = stepWalker(w, 0.1, 1, 1000, 40, true);
    expect([next.moving, next.faceLeft, next.x]).toEqual([true, true, 296]);
  });

  it("자리 비움·채팅 중이면 제자리에 선다", () => {
    const w: Walker = { x: 300, target: 100, restUntil: 0, moving: true, faceLeft: true };
    const next = stepWalker(w, 0.1, 1, 1000, 40, false);
    expect([next.x, next.moving]).toEqual([300, false]);
  });

  it("창이 좁아져도 화면 밖으로 나가지 않는다", () => {
    const w: Walker = { x: 900, target: 950, restUntil: 0, moving: false, faceLeft: false };
    const { w: after } = walk(w, 30, 0, 500, true, Math.random);
    expect(after.x).toBeGreaterThanOrEqual(0);
    expect(after.x).toBeLessThanOrEqual(500);
  });
});
