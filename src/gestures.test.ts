import { describe, expect, it } from "vitest";
import { wiggleDetector } from "./gestures";

const make = () => wiggleDetector({ need: 3, windowMs: 1000, minStep: 5, cooldownMs: 2000 });

/** 좌우로 n번 왕복하는 위치들을 step ms 간격으로 넣고, 반응한 횟수를 센다 */
function shake(d: ReturnType<typeof make>, xs: number[], start = 0, step = 50) {
  return xs.filter((x, i) => d(x, start + i * step)).length;
}

describe("wiggleDetector", () => {
  it("빠르게 좌우로 문지르면 한 번 반응한다", () => {
    expect(shake(make(), [0, 20, 0, 20, 0, 20])).toBe(1);
  });

  it("한쪽으로 쭉 끌기만 하면 반응하지 않는다", () => {
    expect(shake(make(), [0, 20, 40, 60, 80, 100])).toBe(0);
  });

  it("손떨림 정도의 작은 움직임은 무시한다", () => {
    expect(shake(make(), [0, 2, 0, 2, 0, 2, 0, 2])).toBe(0);
  });

  it("천천히 왔다 갔다 하면 반응하지 않는다", () => {
    expect(shake(make(), [0, 20, 0, 20, 0, 20], 0, 600)).toBe(0);
  });

  it("계속 흔들어도 쉬는 시간 동안은 다시 반응하지 않는다", () => {
    const d = make();
    const back = [0, 20, 0, 20, 0, 20, 0, 20, 0, 20, 0, 20];
    expect(shake(d, back)).toBe(1); // 0.55초 동안 여러 번 흔들어도 1번
    expect(shake(d, back, 3000)).toBe(1); // 쉬는 시간이 지나면 다시
  });
});
