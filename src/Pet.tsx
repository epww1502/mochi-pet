import { useEffect, useRef, useState } from "react";
import { contentBox, type PictureFit } from "./picture";
import type { HatId } from "./decor";
import { CHARACTERS, canvasCells, drawImagePet, drawPet, type CharacterId, type HatOffset, type Mood, type Walk } from "./sprites";

type Props = {
  character: CharacterId;
  color: string;
  image?: string | null;
  mood: Mood;
  px?: number;
  /** 걷는 중이면 발을 번갈아 들고, 가는 쪽을 본다 */
  walk?: Walk | null;
  hat?: HatId | null;
  /** 모자를 옮긴 칸 수 [오른쪽, 아래] */
  hatOffset?: HatOffset;
  /** 모자 크기 (1 = 원래) */
  hatScale?: number;
  /** 캔버스를 적어도 이만큼(칸)은 크게: 모자를 고치는 동안 크기가 들쑥날쑥하지 않게 */
  minCells?: { cols: number; rows: number };
  /** 그림 펫의 확대·위치 */
  imageFit?: PictureFit;
  /** 움직이지 않게 (편집할 때: 누르려는 곳이 숨쉬며 들썩이지 않게) */
  still?: boolean;
  /** 화면 좌표가 모자 위인지, 펫(그림) 위인지 알려 주는 함수를 여기에 둔다 */
  hitRef?: React.MutableRefObject<((clientX: number, clientY: number) => "hat" | "pet" | null) | null>;
};

/** 화면 배율(레티나 2, 윈도우 125% 등). 창을 다른 모니터로 옮기면 바뀐다. */
function useDevicePixelRatio() {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    const on = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return dpr;
}

export function PetCanvas({ character, color, image, mood, px = 5, walk = null, hat = null, hatOffset = [0, 0], hatScale = 1, minCells, still = false, hitRef, imageFit }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = useDevicePixelRatio();
  // 캔버스를 화면의 실제 픽셀로 그린다. 한 칸 = 정수 개의 실제 픽셀이라 늘려 보일 때 뭉개지지 않는다.
  const cell = Math.max(1, Math.round(px * dpr));
  const [dx, dy] = hatOffset; // 배열은 매번 새로 오니 숫자로 풀어서 그리기 루프 의존성에 쓴다
  // 모자를 높이 올렸거나 크게 했으면 캔버스를 위로 늘린다 (아래는 그대로라 펫 자리는 안 바뀐다)
  const fx = image ? (imageFit?.x ?? 0) : 0;
  const fy = image ? (imageFit?.y ?? 0) : 0;
  const fz = image ? (imageFit?.zoom ?? 1) : 1;
  const need = canvasCells(image ? 0 : CHARACTERS[character].headY, !!hat, [dx, dy], hatScale, image ? { x: fx, y: fy, zoom: fz } : null);
  const rows = Math.max(need.rows, minCells?.rows ?? 0);
  const cols = Math.max(need.cols, minCells?.cols ?? 0);
  // 걷기 상태는 자주 바뀌므로 그리기 루프를 다시 만들지 않고 ref로 읽는다
  const walkRef = useRef(walk);
  walkRef.current = walk;
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const img = image ? Object.assign(new Image(), { src: image }) : null;
    let content: { top: number; cx: number } | undefined; // 그림이 실제로 있는 자리 (처음 그릴 때 한 번 잰다)
    const born = performance.now();
    const draw = (c: CanvasRenderingContext2D, t: number, only: "hat" | null = null) => {
      if (img) {
        if (img.complete && img.naturalWidth) {
          content ??= contentBox(img);
          drawImagePet(c, cell, img, mood, t, walkRef.current, hat, [dx, dy], hatScale, content, only, { x: fx, y: fy, zoom: fz });
        }
      } else drawPet(c, cell, character, color, mood, t, walkRef.current, hat, [dx, dy], hatScale, only);
    };
    const tick = () => {
      draw(ctx, still ? 0 : (performance.now() - born) / 1000);
    };
    if (hitRef)
      hitRef.current = (clientX, clientY) => {
        const canvas = ref.current;
        if (!canvas) return null;
        const r = canvas.getBoundingClientRect();
        const x = Math.round(((clientX - r.left) / r.width) * canvas.width);
        const y = Math.round(((clientY - r.top) / r.height) * canvas.height);
        const near = (data: Uint8ClampedArray, w: number, h: number) => {
          // 한 칸 둘레까지 봐서 작은 모자도 누르기 쉽게
          for (let oy = -cell; oy <= cell; oy += cell)
            for (let ox = -cell; ox <= cell; ox += cell) {
              const px2 = x + ox, py = y + oy;
              if (px2 >= 0 && py >= 0 && px2 < w && py < h && data[(py * w + px2) * 4 + 3] > 0) return true;
            }
          return false;
        };
        if (hat) {
          const off = document.createElement("canvas");
          off.width = canvas.width;
          off.height = canvas.height;
          const octx = off.getContext("2d")!;
          draw(octx, still ? 0 : (performance.now() - born) / 1000, "hat");
          if (near(octx.getImageData(0, 0, off.width, off.height).data, off.width, off.height)) return "hat";
        }
        return near(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height) ? "pet" : null;
      };
    tick();
    const id = setInterval(tick, 80); // 초당 약 12번: 상시 실행이라 가볍게
    return () => clearInterval(id);
  }, [character, color, image, mood, cell, hat, dx, dy, hatScale, rows, cols, still, hitRef, fx, fy, fz]);
  return (
    <canvas
      ref={ref}
      width={cols * cell}
      height={rows * cell}
      style={{ width: (cols * cell) / dpr, height: (rows * cell) / dpr }}
      className="pixel"
    />
  );
}

export function Bubble({ text }: { text: string }) {
  return <div className="bubble">{text}</div>;
}
