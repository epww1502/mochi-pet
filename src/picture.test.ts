import { describe, expect, it } from "vitest";
import { FIT_UP_MAX, FIT_X_MAX, cleanFit, opaqueBox } from "./picture";

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
  it("옮긴 칸은 정수로 범위 안(바닥 밑 X), 확대는 0.5~3배", () => {
    expect(cleanFit({ x: 2.4, y: -999, zoom: 1.27 })).toEqual({ x: 2, y: -FIT_UP_MAX, zoom: 1.25 });
    expect(cleanFit({ x: 99, y: 5 })).toEqual({ x: FIT_X_MAX, y: 0, zoom: 1 });
    expect(cleanFit({ zoom: 9 }).zoom).toBe(3);
    expect(cleanFit(null)).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
