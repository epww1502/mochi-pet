import { describe, expect, it } from "vitest";
import { ARRIVE_AWAY_MS, CHAT_NOTIFY_GAP_MS, arrivals, shouldNotifyChat } from "./notify";

describe("친구 접속 알림", () => {
  it("방에 막 들어왔을 때 이미 있던 친구는 알리지 않는다", () => {
    expect(arrivals(null, ["a", "b"], 0).arrived).toEqual([]);
  });

  it("새로 들어온 친구만 알리고, 계속 있던 친구는 다시 알리지 않는다", () => {
    let { next } = arrivals(null, ["a"], 0);
    const r = arrivals(next, ["a", "b"], 10_000);
    expect(r.arrived).toEqual(["b"]);
    next = r.next;
    expect(arrivals(next, ["a", "b"], 20 * 60_000).arrived).toEqual([]);
  });

  it("잠깐 끊겼다 다시 붙으면 알리지 않고, 오래 비웠다 오면 알린다", () => {
    let { next } = arrivals(null, ["a"], 0);
    next = arrivals(next, [], 60_000).next; // 1분에 나감
    expect(arrivals(next, ["a"], 60_000 + 30_000).arrived).toEqual([]); // 30초 만에 돌아옴
    let p = arrivals(null, ["a"], 0).next;
    p = arrivals(p, [], 60_000).next;
    expect(arrivals(p, ["a"], 60_000 + ARRIVE_AWAY_MS).arrived).toEqual(["a"]);
  });
});

describe("채팅 알림", () => {
  const base = { on: true, busy: false, quiet: false, mine: false, lastAt: undefined };
  it("켰고 친구가 보냈으면 알린다", () => {
    expect(shouldNotifyChat(base, 0)).toBe(true);
  });
  it("꺼짐·바쁨·조용히·내 채팅이면 안 알린다", () => {
    expect(shouldNotifyChat({ ...base, on: false }, 0)).toBe(false);
    expect(shouldNotifyChat({ ...base, busy: true }, 0)).toBe(false);
    expect(shouldNotifyChat({ ...base, quiet: true }, 0)).toBe(false);
    expect(shouldNotifyChat({ ...base, mine: true }, 0)).toBe(false);
  });
  it("같은 친구가 연달아 보내면 한 번만", () => {
    expect(shouldNotifyChat({ ...base, lastAt: 0 }, CHAT_NOTIFY_GAP_MS - 1)).toBe(false);
    expect(shouldNotifyChat({ ...base, lastAt: 0 }, CHAT_NOTIFY_GAP_MS)).toBe(true);
  });
});
