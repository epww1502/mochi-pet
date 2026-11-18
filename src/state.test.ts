import { describe, expect, it } from "vitest";
import { CHARACTERS, cleanHatScale, fitImage } from "./sprites";
import { EMOTES, EMOTE_MOTION, MAX_IMAGE_CHARS, REPLIES, ago, ROOMS_MAX, buildRoster, cleanFriendPx, cleanRooms, withRoom, cleanMsg, presenceToPeers, pxOf, safeImage, samePerson, sanitizeChat, sanitizeReaction, statusLight, type Member, type PeerState } from "./state";

const peer = (id: string, name: string, extra: Partial<PeerState> = {}): PeerState => ({
  id,
  name,
  character: "mochi",
  color: "#fff",
  image: null,
  status: "idle",
  busy: false,
  idleMin: 0,
  hat: null,
  hatOffset: [0, 0],
  hatScale: 1,
  tag: null,
  px: 5,
  msg: "",
  bday: "",
  ...extra,
});

describe("presenceToPeers", () => {
  it("친구가 옮긴 모자 위치를 받되, 옛 버전이거나 이상한 값이면 제자리·범위 안으로", () => {
    const old = { ...peer("a", "가람") } as Partial<PeerState>;
    delete old.hatOffset; // v0.2.9 이전 친구는 안 보낸다
    const peers = presenceToPeers(
      { a: [old as PeerState], b: [peer("b", "나래", { hatOffset: [2, -1] })], c: [peer("c", "다온", { hatOffset: [99, "x" as unknown as number] })] },
      "me",
    );
    expect(peers.map((p) => p.hatOffset)).toEqual([[0, 0], [2, -1], [5, 0]]);
  });

  it("모자 크기는 정해진 단계만, 옛 버전이거나 이상한 값이면 원래 크기", () => {
    const old = { ...peer("a", "가람") } as Partial<PeerState>;
    delete old.hatScale;
    const peers = presenceToPeers(
      { a: [old as PeerState], b: [peer("b", "나래", { hatScale: 1.25 })], c: [peer("c", "다온", { hatScale: "big" as unknown as number })] },
      "me",
    );
    expect(peers.map((p) => p.hatScale)).toEqual([1, 1.25, 1]);
  });

  it("모자 크기는 0.5~1.5배, 0.05 단위로 맞춘다", () => {
    expect(cleanHatScale(0.73)).toBe(0.75);
    expect(cleanHatScale(9)).toBe(1.5);
    expect(cleanHatScale(0.1)).toBe(0.5);
    expect(cleanHatScale(Number.NaN)).toBe(1);
  });

  it("친구가 정한 펫 크기를 쓰되, 범위 밖이면 맞춘다", () => {
    const peers = presenceToPeers({ a: [peer("a", "가람", { px: 10 })], b: [peer("b", "나래", { px: 999 })] }, "me");
    expect(peers.map((p) => p.px)).toEqual([10, 12]);
  });

  it("내 펫은 친구 목록에 다시 나오지 않는다", () => {
    const peers = presenceToPeers({ me: [peer("me", "나")], a: [peer("a", "가람")] }, "me");
    expect(peers.map((p) => p.id)).toEqual(["a"]);
  });

  it("같은 친구가 창을 두 번 열어도 한 마리만 보이고 최신 상태를 쓴다", () => {
    const peers = presenceToPeers({ a: [peer("a", "가람"), peer("a", "가람", { status: "away" })] }, "me");
    expect(peers).toHaveLength(1);
    expect(peers[0].status).toBe("away");
  });

  it("친구들은 이름 가나다순으로 선다", () => {
    const peers = presenceToPeers({ b: [peer("b", "다온")], a: [peer("a", "가람")], c: [peer("c", "나래")] }, "me");
    expect(peers.map((p) => p.name)).toEqual(["가람", "나래", "다온"]);
  });

  it("친구가 이상한 그림 주소를 보내면 그림 없이 기본 캐릭터로 보인다", () => {
    const peers = presenceToPeers({ a: [peer("a", "가람", { image: "https://evil.example/x.png" })] }, "me");
    expect(peers[0].image).toBeNull();
  });
});

it("모르는 모자나 이름표 꾸미기는 빼고 그린다", () => {
  const bad = { ...peer("a", "가람"), hat: "tiara", tag: "<b>" } as unknown as PeerState;
  const [p] = presenceToPeers({ a: [bad] }, "me");
  expect([p.hat, p.tag]).toEqual([null, null]);
});

it("모르는 캐릭터나 색을 보내도 기본 찹쌀떡으로 그린다", () => {
  const bad = { ...peer("a", "가람"), character: "dragon", color: "red; background:url(x)" } as unknown as PeerState;
  const [p] = presenceToPeers({ a: [bad] }, "me");
  expect([p.character, p.color]).toEqual(["mochi", "#ffe7c7"]);
});

describe("safeImage", () => {
  it("작은 PNG data URL만 통과한다", () => {
    expect(safeImage("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(safeImage("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(safeImage("data:image/png;base64," + "A".repeat(MAX_IMAGE_CHARS))).toBeNull();
    expect(safeImage(42)).toBeNull();
  });
});

describe("캐릭터 그림", () => {
  it("모든 캐릭터는 16칸 x 13줄이고, 얼굴 자리는 몸통으로 채워져 있다", () => {
    for (const [id, c] of Object.entries(CHARACTERS)) {
      expect(c.rows, id).toHaveLength(13);
      c.rows.forEach((r, y) => expect(r.length, `${id} ${y}행`).toBe(16));
      for (let y = 6; y <= 10; y++) for (let x = 3; x <= 12; x++) expect(c.rows[y][x], `${id} (${x},${y})`).toMatch(/[bsn]/); // n = 코
    }
  });
});

describe("pxOf", () => {
  it("예전 버전에서 고른 크기 단계는 같은 크기로 이어진다", () => {
    expect(pxOf({ size: "xs" })).toBe(3);
    expect(pxOf({ size: "l" })).toBe(7);
  });

  it("슬라이더 값은 정수 칸 크기로, 범위 밖이면 끝값으로 맞춘다", () => {
    expect(pxOf({ px: 8, size: "xs" })).toBe(8);
    expect(pxOf({ px: 6.6 })).toBe(7);
    expect(pxOf({ px: 99 })).toBe(12);
    expect(pxOf({ px: 0 })).toBe(2); // 가장 작게 40%
  });

  it("값이 없거나 이상하면 보통(100%)이다", () => {
    expect(pxOf({})).toBe(5);
    expect(pxOf({ px: Number.NaN, size: "constructor" })).toBe(5);
  });
});

describe("fitImage", () => {
  it("작은 픽셀아트는 정수배로만 키워서 칸이 고르다", () => {
    expect(fitImage(16, 16, 70)).toEqual({ w: 64, h: 64, smooth: false }); // 4배
    expect(fitImage(20, 10, 70)).toEqual({ w: 60, h: 30, smooth: false }); // 3배, 비율 유지
  });

  it("정수배로는 많이 모자라면 box에 맞게 늘려서 크기를 바꾸면 그대로 커진다", () => {
    // 64px 그림: 예전엔 box 84~126에서 모두 64로 같아 크기 조절이 안 먹었다
    expect(fitImage(64, 64, 84)).toEqual({ w: 84, h: 84, smooth: false });
    expect(fitImage(64, 32, 126)).toEqual({ w: 126, h: 63, smooth: false });
    expect(fitImage(64, 64, 70)).toEqual({ w: 64, h: 64, smooth: false }); // 91%면 정수배 그대로
  });

  it("칸보다 큰 그림은 비율을 지키며 부드럽게 줄인다", () => {
    expect(fitImage(64, 32, 56)).toEqual({ w: 56, h: 28, smooth: true });
  });
});

describe("sanitizeChat", () => {
  it("글자로 된 채팅만, 300자까지", () => {
    expect(sanitizeChat({ sender_id: "a", body: " 안녕 " })).toEqual({ sender_id: "a", body: "안녕" });
    expect(sanitizeChat({ sender_id: "a", body: {} })).toBeNull(); // 그대로 그리면 화면이 멈춘다
    expect(sanitizeChat({ sender_id: 1, body: "x" })).toBeNull();
    expect(sanitizeChat({ sender_id: "a", body: "   " })).toBeNull();
    expect(sanitizeChat({ sender_id: "a", body: "가".repeat(5000) })?.body.length).toBe(300);
    expect(sanitizeChat(null)).toBeNull();
  });
});

describe("sanitizeReaction", () => {
  const base = { target: "a", by: "b", from: "가람" };
  it("정해진 이모티콘과 반응만 받는다", () => {
    expect(sanitizeReaction({ ...base, kind: "emote", emoji: "❤️" })).toEqual({ ...base, kind: "emote", emoji: "❤️" });
    expect(sanitizeReaction({ ...base, kind: "happy" })?.kind).toBe("happy");
    expect(sanitizeReaction({ ...base, kind: "emote", emoji: "<img src=x>" })).toBeNull();
    expect(sanitizeReaction({ ...base, kind: "explode" })).toBeNull();
    expect(sanitizeReaction({ target: "a", from: "가람", kind: "happy" })).toBeNull(); // 보낸 사람 id 없음
    expect(sanitizeReaction(null)).toBeNull();
  });

  it("던지기는 정해진 물건만, 인사와 콕 찌르기는 그대로 받는다", () => {
    expect(sanitizeReaction({ ...base, kind: "throw", item: "🍌" })).toEqual({ ...base, kind: "throw", item: "🍌" });
    expect(sanitizeReaction({ ...base, kind: "throw", item: "💣" })).toBeNull();
    expect(sanitizeReaction({ ...base, kind: "throw", item: "constructor" })).toBeNull();
    expect(sanitizeReaction({ ...base, kind: "big" })?.kind).toBe("big");
    expect(sanitizeReaction({ ...base, kind: "poke" })?.kind).toBe("poke");
    expect(sanitizeReaction({ ...base, kind: "gift", hat: "santa" })?.hat).toBe("santa");
    expect(sanitizeReaction({ ...base, kind: "gift", hat: "tiara" })).toBeNull();
  });
});

describe("이모티콘 답장", () => {
  it("모든 이모티콘에 몸짓과 답장 추천 3개가 있고, 추천도 보낼 수 있는 이모티콘이다", () => {
    for (const e of EMOTES) {
      expect(EMOTE_MOTION[e], e).toBeTruthy();
      expect(REPLIES[e], e).toHaveLength(3);
      for (const r of REPLIES[e]) expect(EMOTES, `${e} → ${r}`).toContain(r);
    }
  });
});

const member = (id: string, name: string, lastSeen: string): Member => ({ device_id: id, name, character_id: "cat", color: "#ffd1dc", image: null, last_seen: lastSeen });

describe("buildRoster", () => {
  it("실시간 연결이 잠깐 끊겨도 1분 전에 접속 기록이 있으면 온라인으로 본다", () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    const roster = buildRoster([], [member("b", "나래", "2026-11-18T11:59:00Z"), member("c", "다온", "2026-11-18T11:50:00Z")], "me", 6, now);
    expect(roster.map((p) => [p.name, p.online])).toEqual([["나래", true], ["다온", false]]);
  });

  it("앱을 끈 친구는 흐린 펫으로 남고, 접속 중인 친구가 앞에 선다", () => {
    const roster = buildRoster(
      [peer("a", "가람")],
      [member("a", "가람", "2026-11-18T00:00:00Z"), member("b", "나래", "2026-11-17T00:00:00Z"), member("me", "나", "2026-11-18T00:00:00Z")],
      "me",
      6,
      Date.parse("2026-11-18T12:00:00Z"),
    );
    expect(roster.map((p) => [p.name, p.online])).toEqual([["가람", true], ["나래", false]]);
    expect(roster[1].lastSeen).toBe(Date.parse("2026-11-17T00:00:00Z"));
  });

  it("같은 사람의 다른 컴퓨터(꺼진 쪽)는 빼고, 한 달 넘게 안 온 친구도 뺀다", () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    const roster = buildRoster(
      [peer("a", "영주 집")],
      [member("b", "영주", "2026-11-18T11:50:00Z"), member("c", "다온", "2026-11-18T11:00:00Z"), member("d", "옛친구", "2026-09-01T00:00:00Z")],
      "me",
      6,
      now,
    );
    expect(roster.map((p) => p.name)).toEqual(["영주 집", "다온"]);
  });

  it("samePerson: 두 글자 이상이 겹칠 때만", () => {
    expect(samePerson("영주", "영주 집")).toBe(true);
    expect(samePerson("Yeongju", "yeongju laptop")).toBe(true);
    expect(samePerson("민", "민수")).toBe(false);
    expect(samePerson("나래", "다온")).toBe(false);
  });

  it("서버 시간이 내 시계보다 앞서도 미래가 되지 않는다", () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    const roster = buildRoster([], [member("b", "나래", "2026-11-18T12:05:00Z")], "me", 6, now);
    expect(roster[0].lastSeen).toBe(now);
  });

  it("꺼진 친구는 최근에 들어온 순서, 창에 들어가는 만큼만", () => {
    const roster = buildRoster([], [member("b", "나래", "2026-11-17T00:00:00Z"), member("c", "다온", "2026-11-18T00:00:00Z"), member("d", "라온", "2026-11-16T00:00:00Z")], "me", 2);
    expect(roster.map((p) => p.name)).toEqual(["다온", "나래"]);
  });
});

describe("statusLight", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  const base = { online: true, lastSeen: null, busy: false, status: "idle" as const, idleMin: 0 };

  it("켜져 있으면 초록, 바쁨이면 빨강", () => {
    expect(statusLight(base, now).color).toBe("green");
    expect(statusLight({ ...base, busy: true }, now)).toEqual({ color: "red", text: "바쁨" });
  });

  it("5분 넘게 입력이 없으면 자리 비움, 30분 넘으면 잠수 시간을 보여준다", () => {
    expect(statusLight({ ...base, status: "away", idleMin: 7 }, now)).toEqual({ color: "orange", text: "자리 비움" });
    expect(statusLight({ ...base, status: "away", idleMin: 40 }, now)).toEqual({ color: "orange", text: "잠수 40분" });
    expect(statusLight({ ...base, status: "away", idleMin: 130 }, now)).toEqual({ color: "orange", text: "잠수 2시간" });
  });

  it("앱을 끈 친구는 회색 불에 마지막 접속 시간", () => {
    expect(statusLight({ ...base, online: false, lastSeen: now - 3 * 3600_000 }, now)).toEqual({ color: "gray", text: "3시간 전" });
  });
});

describe("ago", () => {
  it("방금 / 분 / 시간 / 일", () => {
    expect([ago(30_000), ago(5 * 60_000), ago(3 * 3600_000), ago(2 * 86400_000)]).toEqual(["방금", "5분 전", "3시간 전", "2일 전"]);
  });
});

describe("cleanFriendPx", () => {
  it("친구별 크기는 숫자만 남기고 범위 안으로 맞춘다", () => {
    expect(cleanFriendPx({ a: 3, b: 50, c: "big", d: Number.NaN })).toEqual({ a: 3, b: 12 });
    expect(cleanFriendPx(null)).toEqual({});
  });
});

describe("cleanMsg", () => {
  it("상태 메시지는 한 줄, 24자까지", () => {
    expect(cleanMsg("  점심\n먹는 중  ")).toBe("점심 먹는 중");
    expect(cleanMsg("가".repeat(40))).toHaveLength(24);
    expect(cleanMsg(42)).toBe("");
  });
});

describe("방 목록", () => {
  const a = { id: "a", code: "AAAAAA", name: "우리 방" };
  const b = { id: "b", code: "BBBBBB", name: "회사" };
  it("지금 방은 꼭 넣고, 같은 방은 하나만, 이상한 값은 버린다", () => {
    expect(cleanRooms(undefined, a)).toEqual([a]);
    expect(cleanRooms([a, a, { id: 1 }, null], b)).toEqual([a, b]);
    expect(cleanRooms("x", null)).toEqual([]);
  });
  it("이미 있으면 이름만 새로, 많으면 오래된 것부터 뺀다", () => {
    expect(withRoom([a, b], { ...a, name: "새 이름" })).toEqual([{ ...a, name: "새 이름" }, b]);
    const many = Array.from({ length: ROOMS_MAX }, (_, i) => ({ id: `r${i}`, code: "CCCCCC", name: `방${i}` }));
    const next = withRoom(many, a);
    expect(next).toHaveLength(ROOMS_MAX);
    expect(next[next.length - 1]).toEqual(a);
  });
});
