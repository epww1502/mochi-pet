import { describe, expect, it } from "vitest";
import { safePlace, weatherKind } from "./weather";

describe("weatherKind", () => {
  it("날씨 코드를 화면 날씨로 바꾼다", () => {
    expect([0, 1].map(weatherKind)).toEqual(["clear", "clear"]);
    expect([2, 3].map(weatherKind)).toEqual(["clouds", "clouds"]);
    expect([45, 48].map(weatherKind)).toEqual(["fog", "fog"]);
    expect([51, 61, 65, 80, 82].map(weatherKind)).toEqual(["rain", "rain", "rain", "rain", "rain"]);
    expect([71, 75, 85].map(weatherKind)).toEqual(["snow", "snow", "snow"]);
    expect([95, 99].map(weatherKind)).toEqual(["storm", "storm"]);
  });

  it("모르는 코드는 구름으로 둔다", () => {
    expect(weatherKind(42)).toBe("clouds");
  });
});

describe("safePlace", () => {
  it("이상한 위치는 버린다", () => {
    expect(safePlace({ name: "서울", lat: 37.5, lon: 127 })).toEqual({ name: "서울", lat: 37.5, lon: 127 });
    expect(safePlace({ name: "x", lat: 200, lon: 0 })).toBeNull();
    expect(safePlace({ name: "x", lat: "37" as unknown as number, lon: 0 })).toBeNull();
    expect(safePlace(null)).toBeNull();
  });
});
