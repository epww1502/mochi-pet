import { describe, expect, it } from "vitest";
import { mirror, petGrid, rotateRight, squash } from "./sprites";

describe("펫 모양 바꾸기", () => {
  const g = petGrid("mochi", "#ffe7c7", "idle", 0);

  it("기본 펫은 16칸 x 14줄", () => {
    expect([g.length, g[0].length]).toEqual([14, 16]);
  });

  it("잠들면 납작해지지만 가로 폭은 그대로", () => {
    const s = squash(g);
    expect(s.length).toBeLessThan(9);
    expect(s[0].length).toBe(16);
  });

  it("꽈당 넘어지면 가로세로가 바뀐다", () => {
    const r = rotateRight(g);
    expect([r.length, r[0].length]).toEqual([16, 14]);
  });

  it("뒤돌면 좌우가 뒤집힌다", () => {
    expect(mirror(g)[0]).toEqual([...g[0]].reverse());
  });

  it("걸을 때는 발 하나를 든다", () => {
    const standing = petGrid("cat", "#fff", "idle", 0, false);
    const walking = petGrid("cat", "#fff", "idle", 0, true);
    expect(standing[13].filter(Boolean).length).toBe(4);
    expect(walking[13].filter(Boolean).length).toBe(2);
  });
});


import { HATS, HAT_IDS, TAGS, available } from "./decor";
import { withHat } from "./sprites";

describe("모자", () => {
  it("모든 모자는 16칸 x 4줄이고, 머리 높이에 맞춰 얹힌다", () => {
    for (const id of HAT_IDS) {
      expect(HATS[id].rows, id).toHaveLength(4);
      for (const r of HATS[id].rows) expect(r.length, id).toBe(16);
    }
    const mochi = petGrid("mochi", "#fff", "idle", 0);
    expect(withHat(mochi, "crown", 1).length).toBe(16); // 머리가 맨 위라 2줄 늘어난다
    const cat = petGrid("cat", "#fff", "idle", 0);
    expect(withHat(cat, "crown", 4).length).toBe(14); // 귀 사이 머리에 얹혀서 안 늘어난다
    expect(withHat(cat, null)).toBe(cat);
  });

  it("계절 모자·이름표는 그 계절을 켰을 때만 고를 수 있다", () => {
    expect(available(HATS, [])).not.toContain("santa");
    expect(available(HATS, ["winter"])).toContain("santa");
    expect(available(TAGS, ["spring"])).toEqual(expect.arrayContaining(["heart", "sakura"]));
    expect(available(TAGS, ["spring"])).not.toContain("pumpkin");
  });
});
