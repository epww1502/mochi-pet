import { HATS, HAT_COLORS, type HatId } from "./decor";

// 16x13 픽셀 캐릭터. o=외곽선 b=몸통 s=반짝임 l=새싹 x=볼/귀 안쪽. 얼굴은 모든 캐릭터가 같은 자리(6~10행)에 그린다.

/** idle/away/typing/sleep(오프라인)은 상태. 나머지는 흔들기·쓰다듬기·이모티콘·던지기에 잠깐 보이는 몸짓 */
export type Mood =
  | "idle"
  | "away"
  | "typing"
  | "sleep"
  | "dizzy"
  | "happy"
  | "laugh"
  | "surprised"
  | "sad"
  | "cheer"
  | "wave"
  | "slip"
  | "splat";
export type Motion = Exclude<Mood, "idle" | "away" | "typing" | "sleep">;

export const CHARACTERS = {
  mochi: {
    name: "찹쌀떡", headY: 1,
    feet: true,
    rows: [
      ".......ll.......",
      ".....oooooo.....",
      "...oobbbbbboo...",
      "..obsbbbbbbbbo..",
      ".obsbbbbbbbbbbo.",
      ".obbbbbbbbbbbbo.",
      "obbbbbbbbbbbbbbo",
      "obbbbbbbbbbbbbbo",
      "obbbbbbbbbbbbbbo",
      "obbbbbbbbbbbbbbo",
      ".obbbbbbbbbbbbo.",
      "..oobbbbbbbboo..",
      "....oooooooo....",
    ],
  },
  cat: {
    name: "고양이", headY: 4,
    feet: true,
    rows: [
      "................",
      ".oo..........oo.",
      ".oxo........oxo.",
      ".oxbo......obxo.",
      ".obbboooooobbbo.",
      ".obsbbbbbbbbbbo.",
      "obbbbbbbbbbbbbbo",
      "obbbbbbbbbbbbbbo",
      "obbbbbbbbbbbbbbo",
      "obbbbbbbbbbbbbbo",
      ".obbbbbbbbbbbbo.",
      "..oobbbbbbbboo..",
      "....oooooooo....",
    ],
  },
  bear: {
    name: "곰", headY: 3,
    feet: true,
    rows: [
      "................",
      "..ooo......ooo..",
      ".obxbo....obxbo.",
      ".obbbooooooobbo.",
      "..obbbbbbbbbbo..",
      ".obsbbbbbbbbbbo.",
      "obsbbbbbbbbbbbbo",
      "obbbbbbbbbbbbbbo",
      "obbbbbbbbbbbbbbo",
      "obbbbbbbbbbbbbbo",
      ".obbbbbbbbbbbbo.",
      "..oobbbbbbbboo..",
      "....oooooooo....",
    ],
  },
  ghost: {
    name: "유령", headY: 1,
    feet: false,
    rows: [
      "................",
      ".....oooooo.....",
      "...oobbbbbboo...",
      "..obsbbbbbbbbo..",
      ".obsbbbbbbbbbbo.",
      ".obbbbbbbbbbbbo.",
      "obbbbbbbbbbbbbbo",
      "obbbbbbbbbbbbbbo",
      "obbbbbbbbbbbbbbo",
      "obbbbbbbbbbbbbbo",
      "obbbbbbbbbbbbbbo",
      "obbobbbobbobbbbo",
      "o..o...o..o....o",
    ],
  },
  quokka: {
    name: "쿼카", headY: 3,
    feet: true,
    rows: [
      "................",
      "..ooo......ooo..",
      ".oxxbo....obxxo.",
      ".oxbbooooobbbxo.",
      "..obbbbbbbbbbo..",
      ".obsbbbbbbbbbbo.",
      "obsbbbbbbbbbbbbo",
      "obbbbbbbbbbbbbbo",
      "obbbbbbnnbbbbbbo",
      "obbbbbbbbbbbbbbo",
      ".obbbbbbbbbbbbo.",
      "..oobbbbbbbboo..",
      "....oooooooo....",
    ],
  },
} as const;

export type CharacterId = keyof typeof CHARACTERS;

export const COLORS = ["#ffe7c7", "#ffd1dc", "#c8f0d8", "#cde3ff", "#e2d4ff", "#e8e8e8", "#d9a877"] as const;

const OUTLINE = "#5b3a29";
const EYE = "#2b1b14";
const CHEEK = "#f59aa0";
const LEAF = "#5dbb63";

/** 캔버스 크기(칸). 가로 20칸 = 펫 16칸 + 휘청·뿔 여유 4칸, 세로 18칸 = 펫 14칸 + 점프 여유 4칸 */
export const CANVAS_W = 20;
export const CANVAS_H = 18;
const HOME_X = 2; // 가운데

type Px = [number, number];
/** 칸마다 색(없으면 null). grid[y][x] */
export type Grid = (string | null)[][];

const HAPPY_EYES: Px[] = [[4, 7], [5, 6], [6, 7], [9, 7], [10, 6], [11, 7]]; // ^^
const SMILE: Px[] = [[6, 9], [7, 10], [8, 10], [9, 9]];
const BIG_EYES: Px[] = [[4, 6], [5, 6], [4, 7], [5, 7], [10, 6], [11, 6], [10, 7], [11, 7]];
const X_EYES: Px[] = [[4, 6], [6, 6], [5, 7], [4, 8], [6, 8], [9, 6], [11, 6], [10, 7], [9, 8], [11, 8]];
const LINE_EYES: Px[] = [[4, 7], [5, 7], [10, 7], [11, 7]];

function face(mood: Mood, t: number): { eyes: Px[]; mouth: Px[]; cheeks: boolean } {
  const open: Px[] = [[5, 6], [5, 7], [10, 6], [10, 7]];
  switch (mood) {
    case "away":
    case "sleep":
      return { eyes: LINE_EYES, mouth: [[7, 9]], cheeks: false };
    case "happy":
    case "cheer":
      return { eyes: HAPPY_EYES, mouth: SMILE, cheeks: true };
    case "laugh": // ^^ 에 입을 크게 벌리고
      return { eyes: HAPPY_EYES, mouth: [[6, 9], [7, 9], [8, 9], [9, 9], [7, 10], [8, 10]], cheeks: true };
    case "surprised": // 동그란 눈, O 입
      return { eyes: BIG_EYES, mouth: [[7, 9], [8, 9], [7, 10], [8, 10]], cheeks: false };
    case "sad":
    case "splat": // 처진 눈, ㅅ 입
      return { eyes: [[4, 7], [5, 8], [10, 8], [11, 7]], mouth: [[6, 10], [7, 9], [8, 9], [9, 10]], cheeks: false };
    case "wave":
      return { eyes: open, mouth: SMILE, cheeks: true };
    case "dizzy":
    case "slip": // XX, 꼬불꼬불 입
      return { eyes: X_EYES, mouth: [[6, 10], [7, 9], [8, 10], [9, 9]], cheeks: false };
    default: {
      const blink = t % 3.5 < 0.15;
      return { eyes: blink ? LINE_EYES : open, mouth: [[7, 9], [8, 9]], cheeks: true };
    }
  }
}

/**
 * 모자를 머리 위에 얹는다. 모자 4줄 중 맨 아랫줄이 머리 윗줄(headY)에 걸친다.
 * 머리 위로 삐져나오는 만큼 격자를 위로 늘린다.
 */
export function withHat(g: Grid, hat: HatId | null | undefined, headY = 1, [dx, dy]: HatOffset = [0, 0]): Grid {
  if (!hat) return g;
  // 옆으로 옮긴 만큼 양쪽을 똑같이 늘린다: 가운데가 그대로라 몸이 안 밀리고, 좌우 반전해도 모자가 같은 자리에 있다
  const pad = Math.abs(dx);
  const width = g[0].length + pad * 2;
  const side = () => Array(pad).fill(null);
  const extra = Math.max(0, 3 - headY - dy);
  const out: Grid = [
    ...Array.from({ length: extra }, () => Array(width).fill(null)),
    ...g.map((r) => [...side(), ...r, ...side()]),
  ];
  const base = extra + headY - 3 + dy; // 모자 0번 줄이 들어갈 자리
  HATS[hat].rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const r = out[base + y];
      if (HAT_COLORS[c] && r) r[x + pad + dx] = HAT_COLORS[c];
    }),
  );
  return out;
}

/** 모자를 원래 자리에서 옮긴 칸 수 [오른쪽, 아래]. 설정 미리보기에서 끌어서 정한다. */
export type HatOffset = readonly [number, number];
export const HAT_DX_MAX = 5;
export const HAT_DY_MIN = -2; // 위로는 캔버스 여유만큼만
export const HAT_DY_MAX = 8;

/**
 * 모자를 위로 올릴 수 있는 한계. 캔버스 위 여유가 펫마다 달라서, 숨쉬며 1칸 뜰 때 모자 윗줄이 잘리지 않을 만큼만.
 * 머리가 맨 윗줄인 펫(찹쌀떡·유령)은 1칸, 그림 펫은 그림이 꽉 찰 수 있어 못 올린다.
 */
export function hatDyMin(character: CharacterId, image: boolean): number {
  return image ? 0 : Math.max(HAT_DY_MIN, -CHARACTERS[character].headY);
}

/** 저장된 값이나 친구가 보낸 값을 범위 안의 정수로. 이상하면 제자리. */
export function cleanHatOffset(v: unknown, dyMin = HAT_DY_MIN): HatOffset {
  if (!Array.isArray(v) || v.length !== 2) return [0, 0];
  const n = (x: unknown, lo: number, hi: number) =>
    typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : 0;
  return [n(v[0], -HAT_DX_MAX, HAT_DX_MAX), n(v[1], dyMin, HAT_DY_MAX)];
}

/** 몸통 + 발 + 얼굴을 16x14 칸 색 격자로. stepping이면 발을 번갈아 든다(걷기). */
export function petGrid(character: CharacterId, color: string, mood: Mood, t: number, stepping = false): Grid {
  const { rows, feet } = CHARACTERS[character];
  const colors: Record<string, string> = { o: OUTLINE, b: color, s: "#ffffff", x: CHEEK, l: LEAF, n: EYE };
  const g: Grid = Array.from({ length: 14 }, (_, y) => Array.from({ length: 16 }, (_, x) => colors[rows[y]?.[x] ?? "."] ?? null));
  if (feet) {
    const up = Math.floor(t * 8) % 2 === 0;
    for (const [xs, lifted] of [[[3, 4], stepping && up], [[11, 12], stepping && !up]] as const) {
      for (const x of xs) {
        if (lifted) g[12][x] = OUTLINE; // 든 발은 몸에 붙인다
        else g[13][x] = OUTLINE;
      }
    }
  }
  const f = face(mood, t);
  for (const [x, y] of [...f.eyes, ...f.mouth]) g[y][x] = EYE;
  if (f.cheeks) g[8][3] = g[8][12] = CHEEK;
  return g;
}

/** 잠들기: 홀수 줄만 남겨 납작하게 누운 모습 (픽셀이 뭉개지지 않게 줄을 건너뛴다) */
export function squash(g: Grid): Grid {
  const keep = g.filter((_, y) => y % 2 === 1 || y === g.length - 1);
  return keep.filter((row) => row.some(Boolean));
}

/** 미끄러져 꽈당: 시계 방향으로 90도 눕힌다 */
export function rotateRight(g: Grid): Grid {
  const h = g.length;
  const w = g[0].length;
  return Array.from({ length: w }, (_, y) => Array.from({ length: h }, (_, x) => g[h - 1 - x][y]));
}

/** 좌우 반전 (걷는 방향 보기) */
export function mirror(g: Grid): Grid {
  return g.map((row) => [...row].reverse());
}

/** 걷는 중인지, 어느 쪽을 보는지 (화면 위 위치는 바깥에서 정한다) */
export type Walk = { moving: boolean; faceLeft: boolean };

/** 위로 뜨는 칸 수: 평소엔 숨쉬듯 1칸, 좋으면 콩콩, 신나면 높이, 놀라면 펄쩍 */
export function hop(mood: Mood, t: number): number {
  switch (mood) {
    case "away":
    case "sleep":
    case "dizzy":
    case "sad":
    case "slip":
    case "splat":
      return 0;
    case "happy":
    case "laugh":
      return Math.round(Math.abs(Math.sin(t * 8)) * 2);
    case "cheer":
      return Math.round(Math.abs(Math.sin(t * 10)) * 3);
    case "surprised":
      return Math.round(Math.max(0, Math.sin(t * 5)) * 4);
    default:
      return Math.round(Math.max(0, Math.sin(t * 1.6)));
  }
}

/** 좌우로 흔들리는 칸 수: 어지러우면 휘청, 웃으면 들썩, 손 흔들면 흔들흔들 */
function sway(mood: Mood, t: number): number {
  if (mood === "dizzy") return Math.round(Math.sin(t * 14));
  if (mood === "laugh") return Math.round(Math.sin(t * 24) * 0.6);
  if (mood === "wave") return Math.round(Math.sin(t * 6));
  return 0;
}

function paint(ctx: CanvasRenderingContext2D, px: number, g: Grid, left: number, top: number) {
  g.forEach((row, y) =>
    row.forEach((c, x) => {
      if (!c) return;
      ctx.fillStyle = c;
      ctx.fillRect((x + left) * px, (y + top) * px, px, px);
    }),
  );
}

/** 펫 하나 그리기. walk가 있으면 그 방향을 보고 걸을 땐 발을 번갈아 든다 */
export function drawPet(
  ctx: CanvasRenderingContext2D,
  px: number,
  character: CharacterId,
  color: string,
  mood: Mood,
  t: number,
  walk: Walk | null = null,
  hat: HatId | null = null,
  hatOffset: HatOffset = [0, 0],
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const w = { x: HOME_X, moving: !!walk?.moving && mood === "idle", faceLeft: !!walk?.faceLeft };
  let g = withHat(petGrid(character, color, mood, t, w.moving), hat, CHARACTERS[character].headY, hatOffset);
  if (mood === "sleep") g = squash(g);
  if (mood === "slip") g = rotateRight(g);
  if (w.faceLeft) g = mirror(g);
  const left = w.x + sway(mood, t) + Math.floor((16 - g[0].length) / 2);
  const top = CANVAS_H - g.length - hop(mood, t) - (w.moving ? Math.floor(t * 8) % 2 : 0);
  paint(ctx, px, g, left, top);
  drawExtras(ctx, px, w.x, CANVAS_H - 14 - hop(mood, t), mood, t);
}

/** 가져온 그림을 14x14칸 자리에 바닥 맞춤으로 그린다. 표정 대신 몸짓(걷기, 콩콩, 휘청, 납작, 꽈당)과 효과로 반응한다. */
export function drawImagePet(
  ctx: CanvasRenderingContext2D,
  px: number,
  img: HTMLImageElement,
  mood: Mood,
  t: number,
  walk: Walk | null = null,
  hat: HatId | null = null,
  [dx, dy]: HatOffset = [0, 0],
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const w = { x: HOME_X, moving: !!walk?.moving && mood === "idle", faceLeft: !!walk?.faceLeft };
  const top = CANVAS_H - 14 - hop(mood, t) - (w.moving ? Math.floor(t * 8) % 2 : 0);
  const fit = fitImage(img.naturalWidth, img.naturalHeight, 14 * px);
  const h = mood === "sleep" ? Math.round(fit.h / 2) : fit.h; // 잘 땐 납작
  ctx.save();
  ctx.imageSmoothingEnabled = fit.smooth;
  ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = mood === "away" ? 0.55 : 1;
  const cx = (w.x + sway(mood, t) + 8) * px;
  const bottom = (top + 14) * px;
  ctx.translate(cx, bottom);
  if (w.faceLeft) ctx.scale(-1, 1);
  if (mood === "slip") ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -Math.round(fit.w / 2), -h, fit.w, h);
  ctx.restore();
  if (hat && mood !== "slip") {
    // 그림 윗변에 모자 아랫줄이 걸치게 (+ 옮긴 만큼. 왼쪽을 보면 좌우도 반대로)
    const hatGrid = withHat([Array(16).fill(null)], hat, 0).slice(0, 4);
    const left = w.x + sway(mood, t) + (w.faceLeft ? -dx : dx);
    const sleepDy = mood === "sleep" ? Math.round(dy / 2) : dy; // 잘 땐 그림이 반으로 납작해지니 옮긴 거리도 반
    paint(ctx, px, w.faceLeft ? mirror(hatGrid) : hatGrid, left, Math.round((bottom - h) / px) - 3 + sleepDy);
  }
  drawExtras(ctx, px, w.x, top, mood, t);
}

/**
 * 그림을 box 안에 넣을 크기. 작은 픽셀아트는 정수배로만 키워서 칸이 고르게(또렷하게),
 * box보다 큰 그림은 부드럽게 줄인다.
 */
export function fitImage(iw: number, ih: number, box: number): { w: number; h: number; smooth: boolean } {
  const side = Math.max(iw, ih, 1);
  const n = Math.floor(box / side);
  if (n >= 1) return { w: iw * n, h: ih * n, smooth: false };
  const s = box / side;
  return { w: Math.round(iw * s), h: Math.round(ih * s), smooth: true };
}

const HEART = [".x.x.", "xxxxx", ".xxx.", "..x.."];

/** 몸 밖에 그리는 것: 졸면 z, 좋으면 하트, 어지러우면 도는 별, 슬프면 눈물, 신나면 꽃가루, 토마토 맞으면 범벅 */
function drawExtras(ctx: CanvasRenderingContext2D, px: number, left: number, top: number, mood: Mood, t: number) {
  const dot = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x + left) * px, Math.round(y) * px, px, px);
  };
  if (mood === "away") drawZ(ctx, px, left + 13, top + 1, t);
  if (mood === "sleep") drawZ(ctx, px, left + 12, CANVAS_H - 7, t);
  if (mood === "happy") {
    const lift = Math.floor(t * 3) % 2; // 하트가 살짝 떠올랐다 내려온다
    HEART.forEach((row, y) => [...row].forEach((c, x) => c === "x" && dot(11 + x, y - lift + 1, "#ff6b8a")));
  }
  if (mood === "dizzy" || mood === "slip") {
    const cy = mood === "slip" ? CANVAS_H - 9 : top + 0.5;
    for (const phase of [0, Math.PI]) dot(7.5 + Math.cos(t * 7 + phase) * 6, cy + Math.sin(t * 7 + phase), "#ffc93c");
  }
  if (mood === "sad") {
    const fall = (t * 6) % 5; // 눈물이 볼을 타고 떨어진다
    dot(4, top + 9 + fall, "#5fa8ff");
    dot(11, top + 9 + ((fall + 2.5) % 5), "#5fa8ff");
  }
  if (mood === "splat") {
    for (const [x, y] of [[5, 5], [6, 5], [7, 6], [5, 6], [9, 8], [10, 8], [10, 9], [8, 4], [12, 6]] as Px[]) dot(x, top + y, "#e5484d");
  }
  if (mood === "cheer") {
    const c = ["#ff6b8a", "#ffc93c", "#5dbb63", "#5fa8ff"]; // 꽃가루
    for (let i = 0; i < 4; i++) dot(((i * 5 + Math.floor(t * 4)) % 16) - 0, (i * 3 + t * 8) % 5, c[i]);
  }
}

function drawZ(ctx: CanvasRenderingContext2D, px: number, x: number, y: number, t: number) {
  ctx.fillStyle = OUTLINE;
  ctx.font = `bold ${px * 3}px sans-serif`;
  ctx.fillText(Math.floor(t) % 2 ? "z" : "Z", x * px, y * px);
}
