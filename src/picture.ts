// 내 그림 펫: 빈 여백 잘라 내기, 칸 안에서 옮기고 키운 모습을 64칸 PNG로 굽기, 그림이 실제로 있는 자리 찾기.

/** 그림을 칸 안에서 옮긴 칸 수(64칸 기준)와 확대 배율 */
export type PictureFit = { x: number; y: number; zoom: number };
export const FIT_DEFAULT: PictureFit = { x: 0, y: 0, zoom: 1 };
export const FIT_ZOOM_MIN = 0.5;
export const FIT_ZOOM_MAX = 3;
export const FIT_MOVE_MAX = 128; // 3배로 키운 그림을 끝까지 훑어볼 만큼
/** 구운 그림 크기 (칸) */
export const BAKE = 64;

export function cleanFit(v: unknown): PictureFit {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return FIT_DEFAULT;
  const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
  return {
    x: Math.round(num(o.x, -FIT_MOVE_MAX, FIT_MOVE_MAX, 0)),
    y: Math.round(num(o.y, -FIT_MOVE_MAX, FIT_MOVE_MAX, 0)),
    zoom: Math.round(num(o.zoom, FIT_ZOOM_MIN, FIT_ZOOM_MAX, 1) * 20) / 20,
  };
}

/**
 * 옮긴 칸을 그림이 64칸 틀 밖으로 잘리지 않게 맞춘다.
 * 틀보다 작으면 틀 안에서만, 틀보다 크면 틀이 그림 안에 있게(보여 줄 부분 고르기). 아래로는 바닥 밑으로 안 내려간다.
 */
export function clampFit(fit: PictureFit, iw: number, ih: number): PictureFit {
  const s = (BAKE / Math.max(iw, ih, 1)) * fit.zoom;
  const w = Math.round(iw * s);
  const h = Math.round(ih * s);
  const sideX = Math.abs(BAKE - w) / 2; // 가운데에서 양옆으로 갈 수 있는 칸
  const x = Math.round(Math.min(sideX, Math.max(-sideX, fit.x)));
  // 기본은 바닥에 붙어 있다(y=0). 작으면 위로만(바닥 밑 X), 크면 아래로만(틀 위를 넘는 부분을 보여 주려고)
  const y = Math.round(h <= BAKE ? Math.min(0, Math.max(-(BAKE - h), fit.y)) : Math.max(0, Math.min(h - BAKE, fit.y)));
  return { ...fit, x, y };
}

/** RGBA 픽셀에서 안 투명한 칸의 범위. 다 투명하면 null */
export function opaqueBox(data: ArrayLike<number>, w: number, h: number, alpha = 8): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > alpha) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** 그림의 빈 테두리를 잘라 낸 캔버스 (다 투명하면 그대로) */
export function trimCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = src.getContext("2d")!;
  const box = opaqueBox(ctx.getImageData(0, 0, src.width, src.height).data, src.width, src.height);
  if (!box) return src;
  const out = document.createElement("canvas");
  out.width = box.x1 - box.x0 + 1;
  out.height = box.y1 - box.y0 + 1;
  out.getContext("2d")!.drawImage(src, box.x0, box.y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = fail;
    img.src = url;
  });
}

/**
 * 원본 그림을 64x64 칸 안에 놓아 PNG로 굽는다. 기본은 칸에 꽉 맞춰 바닥 가운데,
 * 거기서 zoom배 키우고 (x, y)칸 옮긴다. 키우면 또렷하게, 줄이면 부드럽게.
 */
export function bakePicture(img: HTMLImageElement, fit: PictureFit): string {
  const c = document.createElement("canvas");
  c.width = c.height = BAKE;
  const ctx = c.getContext("2d")!;
  const s = (BAKE / Math.max(img.naturalWidth, img.naturalHeight, 1)) * fit.zoom;
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  ctx.imageSmoothingEnabled = s < 1;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, Math.round((BAKE - w) / 2 + fit.x), Math.round(BAKE - h + fit.y), Math.round(w), Math.round(h));
  return c.toDataURL("image/png");
}

/** 그림이 실제로 있는 자리 (모자를 그림 꼭대기·가운데에 씌우려고). 비율 0~1 */
export function contentBox(img: HTMLImageElement): { top: number; cx: number } {
  try {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const box = opaqueBox(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    if (!box) return { top: 0, cx: 0.5 };
    return { top: box.y0 / c.height, cx: (box.x0 + box.x1 + 1) / 2 / c.width };
  } catch {
    return { top: 0, cx: 0.5 };
  }
}
