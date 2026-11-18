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
import { CANVAS_H, CHARACTERS, HAT_DY_MIN, cleanHatOffset, hatDyMin, withHat } from "./sprites";

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

  it("옮긴 모자: 아래로 내리면 그만큼 낮게, 옆으로 옮기면 양쪽을 늘려 몸은 가운데 그대로", () => {
    const mochi = petGrid("mochi", "#fff", "idle", 0);
    const down = withHat(mochi, "crown", 1, [0, 2]);
    expect(down.length).toBe(14); // 머리 안으로 내려와서 안 늘어난다
    const right = withHat(mochi, "crown", 1, [3, 0]);
    expect(right[0].length).toBe(16 + 6);
    expect(right[right.length - 1].slice(3, 19)).toEqual(mochi[13]); // 몸은 가운데
    const plain = withHat(mochi, "crown", 1);
    expect(right[0].slice(6)).toEqual(plain[0].slice(0, 16)); // 모자는 3칸 오른쪽
    expect(withHat(mochi, "crown", 1, [0, HAT_DY_MIN]).length).toBe(18); // 위로 올리면 격자가 늘어나고 터지지 않는다
  });

  it("모자 위치 값은 정수, 범위 안으로", () => {
    expect(cleanHatOffset([1.6, -9])).toEqual([2, -2]);
    expect(cleanHatOffset(null)).toEqual([0, 0]);
    expect(cleanHatOffset([1])).toEqual([0, 0]);
    expect(cleanHatOffset([0, -2], hatDyMin("mochi", false))).toEqual([0, -1]);
  });

  it("모자를 위로 올려도 숨쉬며 뜰 때(1칸) 캔버스 위로 잘리지 않는다", () => {
    for (const id of Object.keys(CHARACTERS) as (keyof typeof CHARACTERS)[]) {
      const g = withHat(petGrid(id, "#fff", "idle", 0), "crown", CHARACTERS[id].headY, [0, hatDyMin(id, false)]);
      expect(g.length + 1, id).toBeLessThanOrEqual(CANVAS_H);
    }
    expect(hatDyMin("cat", true)).toBe(0);
  });

  it("계절 모자·이름표는 그 계절을 켰을 때만 고를 수 있다", () => {
    expect(available(HATS, [])).not.toContain("santa");
    expect(available(HATS, ["winter"])).toContain("santa");
    expect(available(TAGS, ["spring"])).toEqual(expect.arrayContaining(["heart", "sakura"]));
    expect(available(TAGS, ["spring"])).not.toContain("pumpkin");
  });
});
