import { describe, expect, it } from "vitest";
import { allHere, cleanBday, cleanTime, holidayOn, isBirthday, offTimeHit } from "./events";

// 2026-11-20은 금요일, 2026-11-21은 토요일
const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe("생일", () => {
  it("월-일만 받고 없는 날짜는 버린다", () => {
    expect(cleanBday("03-15")).toBe("03-15");
    expect(cleanBday("02-29")).toBe("02-29");
    expect(cleanBday("02-30")).toBe("");
    expect(cleanBday("13-01")).toBe("");
    expect(cleanBday("2000-03-15")).toBe("");
    expect(cleanBday(315)).toBe("");
  });
  it("오늘이 생일인지, 2월 29일생은 평년엔 2월 28일에", () => {
    expect(isBirthday("11-18", at(2026, 11, 18))).toBe(true);
    expect(isBirthday("11-19", at(2026, 11, 18))).toBe(false);
    expect(isBirthday("", at(2026, 11, 18))).toBe(false);
    expect(isBirthday("02-29", at(2027, 2, 28))).toBe(true);
    expect(isBirthday("02-29", at(2028, 2, 28))).toBe(false);
    expect(isBirthday("02-29", at(2028, 2, 29))).toBe(true);
  });
});

describe("퇴근 시간 파티", () => {
  it("정한 시각을 막 지나면 한 번", () => {
    expect(offTimeHit(at(2026, 11, 18, 17, 59), at(2026, 11, 18, 18, 0), "18:00")).toBe(true);
    expect(offTimeHit(at(2026, 11, 18, 18, 0), at(2026, 11, 18, 18, 1), "18:00")).toBe(false); // 이미 지남
    expect(offTimeHit(null, at(2026, 11, 18, 18, 0), "18:00")).toBe(false); // 막 켰을 때
  });
  it("주말엔 안 하고, 잠들었다 한참 뒤 깨면 넘어간다", () => {
    expect(offTimeHit(at(2026, 11, 21, 17, 59), at(2026, 11, 21, 18, 0), "18:00")).toBe(false);
    expect(offTimeHit(at(2026, 11, 18, 12, 0), at(2026, 11, 18, 20, 0), "18:00")).toBe(false);
  });
  it("시각은 HH:MM만", () => {
    expect(cleanTime("09:30")).toBe("09:30");
    expect(cleanTime("24:00")).toBe("18:00");
    expect(cleanTime(null)).toBe("18:00");
  });
});

describe("기념일", () => {
  it("날짜가 고정된 날만", () => {
    expect(holidayOn(at(2026, 12, 25))?.name).toBe("크리스마스");
    expect(holidayOn(at(2026, 11, 18))).toBeNull();
  });
});

describe("다 모였다", () => {
  const now = Date.now();
  it("최근에 쓰는 친구가 모두 접속하면", () => {
    const me = { online: true, lastSeen: null };
    expect(allHere([me, { online: true, lastSeen: null }, { online: true, lastSeen: null }], now)).toBe(true);
    expect(allHere([me, { online: true, lastSeen: null }, { online: false, lastSeen: now - 60_000 }], now)).toBe(false);
  });
  it("오래 안 쓴 친구는 빼고 세고, 나 혼자면 안 된다", () => {
    const me = { online: true, lastSeen: null };
    expect(allHere([me, { online: true, lastSeen: null }, { online: true, lastSeen: null }, { online: false, lastSeen: now - 30 * 86_400_000 }], now)).toBe(true);
    expect(allHere([me, { online: true, lastSeen: null }], now)).toBe(false); // 둘이면 "다 모였다"라기엔 적다
    expect(allHere([me], now)).toBe(false);
  });
});
