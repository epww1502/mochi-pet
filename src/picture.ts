// 내 그림 펫: 빈 여백 잘라 내기, 그림이 실제로 있는 자리 찾기, 그림 확대·위치 값.
// 확대·위치는 그림을 굽지 않고 그릴 때마다 적용한다 (그래야 칸 밖으로도 크게 할 수 있고, 친구에게도 값만 보낸다).

/** 그림 확대 배율과 옮긴 칸 수 (펫 칸 기준). y는 위로 올린 만큼 음수, 바닥 밑으로는 못 간다 */
export type PictureFit = { x: number; y: number; zoom: number };
export const FIT_DEFAULT: PictureFit = { x: 0, y: 0, zoom: 1 };
export const FIT_ZOOM_MIN = 0.5;
export const FIT_ZOOM_MAX = 3;
export const FIT_X_MAX = 12;
export const FIT_UP_MAX = 20;

export function cleanFit(v: unknown): PictureFit {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return FIT_DEFAULT;
  const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
  return {
    x: Math.round(num(o.x, -FIT_X_MAX, FIT_X_MAX, 0)),
    y: Math.round(num(o.y, -FIT_UP_MAX, 0, 0)),
    zoom: Math.round(num(o.zoom, FIT_ZOOM_MIN, FIT_ZOOM_MAX, 1) * 20) / 20,
  };
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
