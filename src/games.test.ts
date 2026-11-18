import { describe, expect, it } from "vitest";
import { LUNCH, rpsWinner, sanitizeGame, seededRand, spin, tally } from "./games";

describe("가위바위보", () => {
  it("바위는 가위를, 가위는 보를, 보는 바위를 이긴다", () => {
    expect(rpsWinner("rock", "scissors")).toBe(1);
    expect(rpsWinner("scissors", "paper")).toBe(1);
    expect(rpsWinner("paper", "rock")).toBe(1);
    expect(rpsWinner("rock", "paper")).toBe(2);
    expect(rpsWinner("paper", "paper")).toBe(0);
  });
});

describe("점심 투표", () => {
  it("한 사람은 한 표, 메뉴에 없는 표는 안 센다", () => {
    const t = tally({ a: "국밥", b: "국밥", c: "초밥", d: "라면" }, LUNCH);
    expect([t["국밥"], t["초밥"], t["라면"]]).toEqual([2, 1, undefined]);
  });

  it("룰렛은 표 받은 메뉴 중에서 표 수만큼 확률로 고른다", () => {
    const t = tally({ a: "국밥", b: "국밥", c: "초밥" }, LUNCH);
    expect(spin(t, () => 0)).toBe("국밥");
    expect(spin(t, () => 0.7)).toBe("초밥"); // 3표 중 국밥 0~2, 초밥 2~3
    expect(spin(t, () => 0.99)).toBe("초밥");
  });

  it("아무도 안 찍으면 모든 메뉴가 같은 확률", () => {
    const t = tally({}, LUNCH);
    expect(spin(t, () => 0)).toBe(LUNCH[0]);
    expect(spin(t, () => 0.999)).toBe(LUNCH[LUNCH.length - 1]);
  });
});

describe("sanitizeGame", () => {
  it("정해진 놀이 신호만 받는다", () => {
    expect(sanitizeGame({ t: "feed", by: "a", from: "가람", target: "b", food: "🍙" })?.t).toBe("feed");
    expect(sanitizeGame({ t: "feed", by: "a", from: "가람", target: "b", food: "💣" })).toBeNull();
    expect(sanitizeGame({ t: "rps", id: "1", by: "a", from: "가람", target: "b", choice: "gun" })).toBeNull();
    expect(sanitizeGame({ t: "vote", id: "1", by: "a", choice: "<script>" })).toBeNull();
    expect(sanitizeGame({ t: "ball", id: "1", by: "a", from: "가람", target: "b", rally: -1 })).toBeNull();
    expect(sanitizeGame({ t: "hack" })).toBeNull();
  });

  it("투표 결과의 이상한 메뉴 이름은 지운다", () => {
    const r = sanitizeGame({ t: "voteResult", id: "1", winner: "국밥", tally: { 국밥: 2, "<img>": 9 } });
    expect(r && r.t === "voteResult" && r.tally).toEqual({ 국밥: 2 });
  });
});

describe("seededRand", () => {
  it("같은 투표 id면 어느 컴퓨터에서나 같은 메뉴", () => {
    const t = { 국밥: 1, 초밥: 1, 돈까스: 0 };
    expect(spin(t, seededRand("vote-1"))).toBe(spin(t, seededRand("vote-1")));
    const r = seededRand("x");
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
