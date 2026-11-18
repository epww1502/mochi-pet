// 16x13 픽셀 캐릭터. o=외곽선 b=몸통 s=반짝임 l=새싹 x=볼/귀 안쪽. 얼굴은 모든 캐릭터가 같은 자리(6~10행)에 그린다.

/** idle/away/typing은 접속 상태. 나머지는 흔들기·쓰다듬기·이모티콘에 잠깐 보이는 몸짓 */
export type Mood = "idle" | "away" | "typing" | "dizzy" | "happy" | "laugh" | "surprised" | "sad" | "cheer" | "wave";
export type Motion = Exclude<Mood, "idle" | "away" | "typing">;

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

const HAPPY_EYES: Px[] = [[4, 7], [5, 6], [6, 7], [9, 7], [10, 6], [11, 7]]; // ^^
const SMILE: Px[] = [[6, 9], [7, 10], [8, 10], [9, 9]];
const BIG_EYES: Px[] = [[4, 6], [5, 6], [4, 7], [5, 7], [10, 6], [11, 6], [10, 7], [11, 7]];

function face(mood: Mood, t: number): { eyes: Px[]; mouth: Px[]; cheeks: boolean } {
  const line: Px[] = [[4, 7], [5, 7], [10, 7], [11, 7]];
  const open: Px[] = [[5, 6], [5, 7], [10, 6], [10, 7]];
  switch (mood) {
    case "away":
      return { eyes: line, mouth: [[7, 9]], cheeks: false };
    case "happy":
    case "cheer":
      return { eyes: HAPPY_EYES, mouth: SMILE, cheeks: true };
    case "laugh": // ^^ 에 입을 크게 벌리고
      return { eyes: HAPPY_EYES, mouth: [[6, 9], [7, 9], [8, 9], [9, 9], [7, 10], [8, 10]], cheeks: true };
    case "surprised": // 동그란 눈, O 입
      return { eyes: BIG_EYES, mouth: [[7, 9], [8, 9], [7, 10], [8, 10]], cheeks: false };
    case "sad": // 처진 눈, ㅅ 입
      return { eyes: [[4, 7], [5, 8], [10, 8], [11, 7]], mouth: [[6, 10], [7, 9], [8, 9], [9, 10]], cheeks: false };
    case "wave":
      return { eyes: open, mouth: SMILE, cheeks: true };
    case "dizzy": // XX, 꼬불꼬불 입
      return {
        eyes: [[4, 6], [6, 6], [5, 7], [4, 8], [6, 8], [9, 6], [11, 6], [10, 7], [9, 8], [11, 8]],
        mouth: [[6, 10], [7, 9], [8, 10], [9, 9]],
        cheeks: false,
      };
    default: {
      const blink = t % 3.5 < 0.15;
      return { eyes: blink ? line : open, mouth: [[7, 9], [8, 9]], cheeks: true };
    }
  }
}

/** 위로 뜨는 칸 수: 평소엔 숨쉬듯 1칸, 좋으면 콩콩, 신나면 높이, 놀라면 펄쩍 */
export function hop(mood: Mood, t: number): number {
  switch (mood) {
    case "away":
    case "dizzy":
    case "sad":
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

/** 좌우로 움직이는 칸 수: 어지러우면 휘청, 웃으면 들썩, 손 흔들면 흔들흔들 */
function sway(mood: Mood, t: number): number {
  if (mood === "dizzy") return Math.round(Math.sin(t * 14));
  if (mood === "laugh") return Math.round(Math.sin(t * 24) * 0.6);
  if (mood === "wave") return Math.round(Math.sin(t * 6));
  return 0;
}

/** 16x14 격자를 canvas에 그린다. canvas 크기는 16*px x 18*px (점프 여유 4칸). */
export function drawPet(ctx: CanvasRenderingContext2D, px: number, character: CharacterId, color: string, mood: Mood, t: number) {
  const { rows, feet } = CHARACTERS[character];
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const top = 4 - hop(mood, t);
  drawRows(ctx, px, sway(mood, t), top, rows, feet, color, mood, t);
  drawExtras(ctx, px, top, mood, t);
}

/** 가져온 그림을 14x14칸 자리에 바닥 맞춤으로 그린다. 표정 대신 몸짓(콩콩, 휘청, 졸기)과 하트/별로 반응한다. */
export function drawImagePet(ctx: CanvasRenderingContext2D, px: number, img: HTMLImageElement, mood: Mood, t: number) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const top = 4 - hop(mood, t);
  const { w, h, smooth } = fitImage(img.naturalWidth, img.naturalHeight, 14 * px);
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = mood === "away" ? 0.55 : 1;
  ctx.drawImage(img, Math.round((16 * px - w) / 2) + sway(mood, t) * px, (top + 14) * px - h, w, h);
  ctx.globalAlpha = 1;
  drawExtras(ctx, px, top, mood, t);
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

/** 몸 밖에 그리는 것: 졸면 z, 좋으면 하트, 어지러우면 도는 별, 슬프면 눈물, 신나면 꽃가루 */
function drawExtras(ctx: CanvasRenderingContext2D, px: number, top: number, mood: Mood, t: number) {
  const dot = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x) * px, Math.round(y) * px, px, px);
  };
  if (mood === "away") drawZ(ctx, px, top, t);
  if (mood === "happy") {
    // 하트
    const lift = Math.floor(t * 3) % 2; // 하트가 살짝 떠올랐다 내려온다
    HEART.forEach((row, y) => [...row].forEach((c, x) => c === "x" && dot(11 + x, y - lift + 1, "#ff6b8a")));
  }
  if (mood === "dizzy") {
    for (const phase of [0, Math.PI]) dot(7.5 + Math.cos(t * 7 + phase) * 6, top + 0.5 + Math.sin(t * 7 + phase), "#ffc93c");
  }
  if (mood === "sad") {
    const fall = (t * 6) % 5; // 눈물이 볼을 타고 떨어진다
    dot(4, top + 9 + fall, "#5fa8ff");
    dot(11, top + 9 + ((fall + 2.5) % 5), "#5fa8ff");
  }
  if (mood === "cheer") {
    const c = ["#ff6b8a", "#ffc93c", "#5dbb63", "#5fa8ff"]; // 꽃가루
    for (let i = 0; i < 4; i++) dot((i * 5 + Math.floor(t * 4)) % 16, ((i * 3 + t * 8) % 5) + 0, c[i]);
  }
}

function drawZ(ctx: CanvasRenderingContext2D, px: number, top: number, t: number) {
  ctx.fillStyle = OUTLINE;
  ctx.font = `bold ${px * 3}px sans-serif`;
  ctx.fillText(Math.floor(t) % 2 ? "z" : "Z", 13 * px, (top + 1) * px);
}

function drawRows(
  ctx: CanvasRenderingContext2D,
  px: number,
  left: number,
  top: number,
  rows: readonly string[],
  feet: boolean,
  color: string,
  mood: Mood,
  t: number,
) {
  const dot = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect((x + left) * px, (y + top) * px, px, px);
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
}
