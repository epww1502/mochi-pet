// 16x13 픽셀 캐릭터. o=외곽선 b=몸통 s=반짝임 l=새싹 x=볼/귀 안쪽. 얼굴은 모든 캐릭터가 같은 자리(6~10행)에 그린다.

export type Mood = "idle" | "away" | "typing";

export const CHARACTERS = {
  mochi: {
    name: "찹쌀떡",
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
    name: "고양이",
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
    name: "곰",
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
    name: "유령",
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
} as const;

export type CharacterId = keyof typeof CHARACTERS;

export const COLORS = ["#ffe7c7", "#ffd1dc", "#c8f0d8", "#cde3ff", "#e2d4ff", "#e8e8e8"] as const;

const OUTLINE = "#5b3a29";
const EYE = "#2b1b14";
const CHEEK = "#f59aa0";
const LEAF = "#5dbb63";

type Px = [number, number];

function face(mood: Mood, t: number): { eyes: Px[]; mouth: Px[]; cheeks: boolean } {
  const line: Px[] = [[4, 7], [5, 7], [10, 7], [11, 7]];
  if (mood === "away") return { eyes: line, mouth: [[7, 9]], cheeks: false };
  const blink = t % 3.5 < 0.15;
  return { eyes: blink ? line : [[5, 6], [5, 7], [10, 6], [10, 7]], mouth: [[7, 9], [8, 9]], cheeks: true };
}

/** 기분에 따라 위로 뜨는 칸 수: 평소엔 숨쉬듯 1칸, 자는 중엔 가만히 */
export function hop(mood: Mood, t: number): number {
  return mood === "away" ? 0 : Math.round(Math.max(0, Math.sin(t * 1.6)));
}

/** 16x14 격자를 canvas에 그린다. canvas 크기는 16*px x 18*px (점프 여유 4칸). */
export function drawPet(ctx: CanvasRenderingContext2D, px: number, character: CharacterId, color: string, mood: Mood, t: number) {
  const { rows, feet } = CHARACTERS[character];
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const top = 4 - hop(mood, t);
  drawRows(ctx, px, top, rows, feet, color, mood, t);
}

/** 가져온 그림(32x32 PNG)을 같은 크기 칸에 그린다. 표정 대신 숨쉬기와 졸기(흐리게 + z)만. */
export function drawImagePet(ctx: CanvasRenderingContext2D, px: number, img: HTMLImageElement, mood: Mood, t: number) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const top = 4 - hop(mood, t);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = mood === "away" ? 0.55 : 1;
  ctx.drawImage(img, px, top * px, 14 * px, 14 * px); // 정사각형 그대로
  ctx.globalAlpha = 1;
  if (mood === "away") drawZ(ctx, px, top, t);
}

function drawZ(ctx: CanvasRenderingContext2D, px: number, top: number, t: number) {
  ctx.fillStyle = OUTLINE;
  ctx.font = `bold ${px * 3}px sans-serif`;
  ctx.fillText(Math.floor(t) % 2 ? "z" : "Z", 13 * px, (top + 1) * px);
}

function drawRows(
  ctx: CanvasRenderingContext2D,
  px: number,
  top: number,
  rows: readonly string[],
  feet: boolean,
  color: string,
  mood: Mood,
  t: number,
) {
  const dot = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x * px, (y + top) * px, px, px);
  };
  const colors: Record<string, string> = { o: OUTLINE, b: color, s: "#ffffff", x: CHEEK, l: LEAF };
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (colors[ch]) dot(x, y, colors[ch]);
    });
  });
  if (feet) for (const x of [3, 4, 11, 12]) dot(x, 13, OUTLINE);
  const f = face(mood, t);
  for (const [x, y] of f.eyes) dot(x, y, EYE);
  for (const [x, y] of f.mouth) dot(x, y, EYE);
  if (f.cheeks) {
    dot(3, 8, CHEEK);
    dot(12, 8, CHEEK);
  }
  if (mood === "away") drawZ(ctx, px, top, t);
}
