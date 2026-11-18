import { describe, expect, it } from "vitest";
import { FIT_MOVE_MAX, clampFit, cleanFit, opaqueBox } from "./picture";

describe("opaqueBox", () => {
  it("안 투명한 칸의 범위만", () => {
    const w = 4, h = 3;
    const d = new Uint8ClampedArray(w * h * 4);
    d[(1 * w + 2) * 4 + 3] = 255; // (2,1)
    d[(2 * w + 1) * 4 + 3] = 255; // (1,2)
    expect(opaqueBox(d, w, h)).toEqual({ x0: 1, y0: 1, x1: 2, y1: 2 });
    expect(opaqueBox(new Uint8ClampedArray(w * h * 4), w, h)).toBeNull();
  });
});

describe("cleanFit", () => {
  it("옮긴 칸은 정수로 범위 안, 확대는 0.5~3배", () => {
    expect(cleanFit({ x: 2.4, y: -999, zoom: 1.27 })).toEqual({ x: 2, y: -FIT_MOVE_MAX, zoom: 1.25 });
    expect(cleanFit({ zoom: 9 }).zoom).toBe(3);
    expect(cleanFit(null)).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe("clampFit", () => {
  it("작은 그림은 틀 안에서만, 바닥 밑으로는 안 내려간다", () => {
    // 64x32 그림 → 64x32 (zoom 1): 옆으로는 못 가고, 위로 32칸까지
    expect(clampFit({ x: 10, y: 10, zoom: 1 }, 64, 32)).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(clampFit({ x: 0, y: -99, zoom: 1 }, 64, 32)).toEqual({ x: 0, y: -32, zoom: 1 });
    // 반으로 줄이면 32x16: 옆으로 16칸씩
    expect(clampFit({ x: -40, y: 0, zoom: 0.5 }, 64, 32).x).toBe(-16);
  });
  it("큰 그림은 틀이 그림 안에 있게 (보여 줄 부분 고르기)", () => {
    // 64x64 를 2배 → 128x128: 좌우 32칸씩, 아래로 64칸까지
    expect(clampFit({ x: 50, y: 99, zoom: 2 }, 64, 64)).toEqual({ x: 32, y: 64, zoom: 2 });
    expect(clampFit({ x: 0, y: -5, zoom: 2 }, 64, 64).y).toBe(0);
  });
});
