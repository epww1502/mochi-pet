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
    const w: Walker = { ...newWalker(0, 0), x: 300, target: 100, restUntil: 0, moving: false, faceLeft: false };
    const next = stepWalker(w, 0.1, 1, 1000, 40, true);
    expect([next.moving, next.faceLeft, next.x]).toEqual([true, true, 296]);
  });

  it("자리 비움·채팅 중이면 제자리에 선다", () => {
    const w: Walker = { ...newWalker(0, 0), x: 300, target: 100, restUntil: 0, moving: true, faceLeft: true };
    const next = stepWalker(w, 0.1, 1, 1000, 40, false);
    expect([next.x, next.moving]).toEqual([300, false]);
  });

  it("창이 좁아져도 화면 밖으로 나가지 않는다", () => {
    const w: Walker = { ...newWalker(0, 0), x: 900, target: 950, restUntil: 0, moving: false, faceLeft: false };
    const { w: after } = walk(w, 30, 0, 500, true, Math.random);
    expect(after.x).toBeGreaterThanOrEqual(0);
    expect(after.x).toBeLessThanOrEqual(500);
  });
});

import { perchFrom, stepRoam, type Perch } from "./roam";

const opts = (now: number, front: Perch | null, rand = () => 0.1) => ({ dt: 0.1, now, maxX: 1800, slotW: 112, speed: 40, canWalk: true, front, rand });

describe("창 위로 올라가기", () => {
  const perch: Perch = { left: 500, right: 1300, y: 400 };

  it("쉬고 나면 가끔 맨 앞 창 위로 폴짝 올라가 그 위에 선다", () => {
    let w = { ...newWalker(600, 0), restUntil: 0 };
    w = stepRoam(w, opts(1, perch)); // rand 0.1 < 25% → 올라간다
    expect(w.perch).toEqual(perch);
    for (let t = 100; t <= 900; t += 100) w = stepRoam(w, opts(t, perch));
    expect(w.y).toBe(400);
    expect(w.jump).toBeNull();
  });

  it("창 위에서는 그 창 모서리 밖으로 안 나간다", () => {
    let w = { ...newWalker(600, 0), restUntil: 0 };
    w = stepRoam(w, opts(1, perch));
    for (let t = 100; t < 30_000; t += 100) {
      w = stepRoam(w, opts(t, perch, Math.random));
      if (w.perch && !w.jump) {
        expect(w.x).toBeGreaterThanOrEqual(500);
        expect(w.x).toBeLessThanOrEqual(1300 - 112);
      }
    }
  });

  it("올라가 있던 창이 움직이거나 닫히면 바닥으로 떨어진다", () => {
    let w = { ...newWalker(600, 0), restUntil: 0 };
    w = stepRoam(w, opts(1, perch));
    for (let t = 100; t <= 900; t += 100) w = stepRoam(w, opts(t, perch));
    w = stepRoam(w, opts(1000, null)); // 창이 닫힘
    expect(w.perch).toBeNull();
    for (let t = 1100; t <= 2000; t += 100) w = stepRoam(w, opts(t, null));
    expect(w.y).toBe(0);
  });

  it("맨 앞 창이 없으면 바닥만 걷는다", () => {
    let w = { ...newWalker(600, 0), restUntil: 0 };
    for (let t = 1; t < 5000; t += 100) w = stepRoam(w, opts(t, null));
    expect(w.y).toBe(0);
  });
});

describe("perchFrom", () => {
  const overlay = { x: 0, y: 25, w: 2560, h: 1415 };
  it("창 위 모서리를 펫 창 기준 높이로 바꾼다", () => {
    expect(perchFrom([536, 358, 1268, 949], overlay, 112)).toEqual({ left: 536, right: 1804, y: 1415 - (358 - 25) });
  });
  it("최대화된 창이나 바닥 근처 창, 좁은 창은 안 쓴다", () => {
    expect(perchFrom([0, 25, 2560, 1415], overlay, 112)).toBeNull(); // 화면 맨 위에 붙음
    expect(perchFrom([100, 1350, 800, 200], overlay, 112)).toBeNull(); // 바닥 근처
    expect(perchFrom([100, 400, 120, 300], overlay, 112)).toBeNull(); // 좁음
  });
});
