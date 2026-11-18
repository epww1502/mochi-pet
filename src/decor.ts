// 꾸미기: 모자, 이름표, 계절 꾸미기, 트리 장식.
// 계절 꾸미기는 각자 설정에서 켠 계절만 보인다(기본은 모두 꺼짐).

export type SeasonId = "spring" | "summer" | "autumn" | "winter";

export const SEASONS: Record<SeasonId, { name: string; icon: string; desc: string }> = {
  spring: { name: "봄", icon: "🌸", desc: "벚꽃 화관, 🌸 이름표, 꽃잎이 날려요" },
  summer: { name: "여름", icon: "🍉", desc: "밀짚모자, 🍉 이름표" },
  autumn: { name: "가을", icon: "🎃", desc: "마녀모자, 🎃 이름표, 낙엽이 떨어져요" },
  winter: { name: "겨울", icon: "🎄", desc: "산타모자·루돌프 뿔, 🎄 이름표, 눈이 오고 같이 꾸미는 트리가 생겨요" },
};
export const SEASON_IDS = Object.keys(SEASONS) as SeasonId[];

/**
 * 모자: 16칸 x 4줄 픽셀. 맨 아랫줄이 펫 머리 윗줄(캐릭터 1번 줄)과 겹친다.
 * 색: r 빨강, w 흰색, y 노랑, k 검정, g 초록, p 분홍, o 주황, n 갈색, B 파랑
 */
export const HATS = {
  ribbon: { name: "리본", icon: "🎀", season: null, rows: ["................", "........pp.pp...", "........ppppp...", ".........p.p...."] },
  crown: { name: "왕관", icon: "👑", season: null, rows: ["....y..yy..y....", "....yy.yy.yy....", "....yyyryyyy....", "....yyyyyyyy...."] },
  flower: { name: "꽃", icon: "🌼", season: null, rows: ["................", "...y............", "..yoy...........", "...y............"] },
  cap: { name: "야구모자", icon: "🧢", season: null, rows: ["................", "......BBBB......", ".....BBBBBB.....", "....BBBBBBBBBB.."] },
  party: { name: "고깔모자", icon: "🥳", season: null, rows: [".......y........", "......pyp.......", ".....ypypy......", ".....pypyp......"] },
  blossom: { name: "벚꽃 화관", icon: "🌸", season: "spring", rows: ["................", "................", "....p...p...p...", "...pyp.pyp.pyp.."] },
  straw: { name: "밀짚모자", icon: "👒", season: "summer", rows: ["................", "......yyyy......", ".....rrrrrr.....", "..yyyyyyyyyyyy.."] },
  witch: { name: "마녀모자", icon: "🧙", season: "autumn", rows: [".......kk.......", "......kkk.......", ".....kkokk......", "...kkkkkkkkkk..."] },
  santa: { name: "산타모자", icon: "🎅", season: "winter", rows: ["..........ww....", ".......rrrr.....", ".....rrrrrr.....", "....wwwwwwww...."] },
  antlers: { name: "루돌프 뿔", icon: "🦌", season: "winter", rows: ["...n.n....n.n...", "....nn....nn....", ".....n....n.....", "................"] },
} as const satisfies Record<string, { name: string; icon: string; season: SeasonId | null; rows: readonly string[] }>;
export type HatId = keyof typeof HATS;
export const HAT_IDS = Object.keys(HATS) as HatId[];

export const HAT_COLORS: Record<string, string> = {
  r: "#e5484d",
  w: "#ffffff",
  y: "#ffc93c",
  k: "#2b2b3a",
  g: "#5dbb63",
  p: "#ff8fb1",
  o: "#ff8a3d",
  n: "#8b5a2b",
  B: "#4c7dff",
};

/** 이름표 꾸미기: 이름 앞 아이콘과 이름 색 */
export const TAGS = {
  heart: { name: "하트", icon: "💖", color: "#ffd1e3", season: null },
  star: { name: "별", icon: "⭐", color: "#fff1a8", season: null },
  sprout: { name: "새싹", icon: "🌱", color: "#c9f5cf", season: null },
  sakura: { name: "벚꽃", icon: "🌸", color: "#ffd6e7", season: "spring" },
  melon: { name: "수박", icon: "🍉", color: "#c8f7c5", season: "summer" },
  pumpkin: { name: "호박", icon: "🎃", color: "#ffd8a8", season: "autumn" },
  tree: { name: "트리", icon: "🎄", color: "#cdf7d4", season: "winter" },
} as const satisfies Record<string, { name: string; icon: string; color: string; season: SeasonId | null }>;
export type TagId = keyof typeof TAGS;
export const TAG_IDS = Object.keys(TAGS) as TagId[];

/** 켠 계절에 맞는 것만 (기본 + 켠 계절) */
export function available<T extends { season: SeasonId | null }>(all: Record<string, T>, seasons: readonly SeasonId[]): string[] {
  return Object.entries(all)
    .filter(([, v]) => v.season === null || seasons.includes(v.season))
    .map(([k]) => k);
}

const own = (o: object, k: unknown) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);
export const isHat = (v: unknown): v is HatId => own(HATS, v);
export const isTag = (v: unknown): v is TagId => own(TAGS, v);
export const isSeason = (v: unknown): v is SeasonId => own(SEASONS, v);

/** 트리 장식: 칸에 찍을 색 */
export const ORNAMENTS = {
  red: { name: "빨간 공", icon: "🔴", color: "#e5484d" },
  gold: { name: "금색 공", icon: "🟡", color: "#ffc93c" },
  blue: { name: "파란 공", icon: "🔵", color: "#4c7dff" },
  pink: { name: "분홍 공", icon: "🩷", color: "#ff8fb1" },
  snow: { name: "눈송이", icon: "❄️", color: "#ffffff" },
  candy: { name: "사탕", icon: "🍬", color: "#b388ff" },
} as const;
export type OrnamentId = keyof typeof ORNAMENTS;
export const ORNAMENT_IDS = Object.keys(ORNAMENTS) as OrnamentId[];

/** 트리 그림 (16칸 x 18줄). g 잎, n 줄기, y 별 */
export const TREE_ROWS = [
  ".......yy.......",
  "......yyyy......",
  ".......gg.......",
  "......gggg......",
  ".....gggggg.....",
  "......gggg......",
  ".....gggggg.....",
  "....gggggggg....",
  ".....gggggg.....",
  "....gggggggg....",
  "...gggggggggg...",
  "....gggggggg....",
  "...gggggggggg...",
  "..gggggggggggg..",
  ".gggggggggggggg.",
  ".......nn.......",
  ".......nn.......",
  "......nnnn......",
];

/** 장식이 달리는 자리 12곳 (x, y) — 서버의 slot 번호 0~11과 같은 순서 */
export const ORNAMENT_SPOTS: [number, number][] = [
  [7, 4],
  [9, 6],
  [6, 7],
  [8, 8],
  [5, 9],
  [10, 9],
  [7, 11],
  [4, 12],
  [11, 12],
  [6, 13],
  [9, 13],
  [3, 14],
];
