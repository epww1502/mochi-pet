import { describe, expect, it } from "vitest";
import { CHARACTERS } from "./sprites";
import { MAX_IMAGE_CHARS, presenceToPeers, safeImage, type PeerState } from "./state";

const peer = (id: string, name: string, extra: Partial<PeerState> = {}): PeerState => ({
  id,
  name,
  character: "mochi",
  color: "#fff",
  image: null,
  status: "idle",
  ...extra,
});

describe("presenceToPeers", () => {
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
      for (let y = 6; y <= 10; y++) for (let x = 3; x <= 12; x++) expect(c.rows[y][x], `${id} (${x},${y})`).toMatch(/[bs]/);
    }
  });
});
