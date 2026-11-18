import { describe, expect, it } from "vitest";
import { pickPlay, weekdayMood } from "./fun";

// 2026-11-16은 월요일
const at = (day: number, h: number, m = 0) => new Date(2026, 10, 16 + day, h, m);

describe("weekdayMood", () => {
  it("월요일 아침엔 피곤, 점심 앞엔 배고픔, 금요일 오후엔 들뜸", () => {
    expect(weekdayMood(at(0, 9, 30))?.key).toBe("monday");
    expect(weekdayMood(at(2, 11, 45))?.key).toBe("lunch");
    expect(weekdayMood(at(4, 16))?.key).toBe("friday");
  });
  it("그 밖의 시간과 주말엔 없다", () => {
    expect(weekdayMood(at(1, 9, 30))).toBeNull(); // 화요일 아침
    expect(weekdayMood(at(0, 11, 0))).toBeNull(); // 월요일 11시 (아침도 점심도 아님)
    expect(weekdayMood(at(5, 12))).toBeNull(); // 토요일 점심
    expect(weekdayMood(at(4, 18))).toBeNull(); // 금요일 18시부터는 퇴근 파티 몫
  });
});

describe("pickPlay", () => {
  const pet = (id: string, x: number, free = true, y = 0) => ({ id, x, y, width: 100, free });
  it("가까이 쉬고 있는 두 펫을 고른다", () => {
    expect(pickPlay([pet("a", 0), pet("b", 120), pet("c", 600)], () => 0)).toEqual({ a: "a", b: "b", kind: "highfive" });
  });
  it("멀거나, 바쁘거나, 창 위에 올라가 있으면 안 논다", () => {
    expect(pickPlay([pet("a", 0), pet("b", 300)])).toBeNull();
    expect(pickPlay([pet("a", 0), pet("b", 110, false)])).toBeNull();
    expect(pickPlay([pet("a", 0), pet("b", 110, true, 50)])).toBeNull();
  });
  it("가끔은 안아 준다", () => {
    expect(pickPlay([pet("a", 0), pet("b", 120)], () => 0.9)?.kind).toBe("hug");
  });
});
