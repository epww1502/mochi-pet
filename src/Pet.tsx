import { useEffect, useRef, useState } from "react";
import { contentBox } from "./picture";
import type { HatId } from "./decor";
import { CANVAS_H, CANVAS_W, CHARACTERS, drawImagePet, drawPet, hatHeadroom, type CharacterId, type HatOffset, type Mood, type Walk } from "./sprites";

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

export function PetCanvas({ character, color, image, mood, px = 5, walk = null, hat = null, hatOffset = [0, 0], hatScale = 1 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = useDevicePixelRatio();
  // 캔버스를 화면의 실제 픽셀로 그린다. 한 칸 = 정수 개의 실제 픽셀이라 늘려 보일 때 뭉개지지 않는다.
  const cell = Math.max(1, Math.round(px * dpr));
  const [dx, dy] = hatOffset; // 배열은 매번 새로 오니 숫자로 풀어서 그리기 루프 의존성에 쓴다
  // 모자를 높이 올렸거나 크게 했으면 캔버스를 위로 늘린다 (아래는 그대로라 펫 자리는 안 바뀐다)
  const rows = CANVAS_H + (hat ? hatHeadroom(image ? 0 : CHARACTERS[character].headY, dy, hatScale) : 0);
  // 걷기 상태는 자주 바뀌므로 그리기 루프를 다시 만들지 않고 ref로 읽는다
  const walkRef = useRef(walk);
  walkRef.current = walk;
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const img = image ? Object.assign(new Image(), { src: image }) : null;
    let content: { top: number; cx: number } | undefined; // 그림이 실제로 있는 자리 (처음 그릴 때 한 번 잰다)
    const born = performance.now();
    const tick = () => {
      const t = (performance.now() - born) / 1000;
      if (img) {
        if (img.complete && img.naturalWidth) {
          content ??= contentBox(img);
          drawImagePet(ctx, cell, img, mood, t, walkRef.current, hat, [dx, dy], hatScale, content);
        }
      } else drawPet(ctx, cell, character, color, mood, t, walkRef.current, hat, [dx, dy], hatScale);
    };
    tick();
    const id = setInterval(tick, 80); // 초당 약 12번: 상시 실행이라 가볍게
    return () => clearInterval(id);
  }, [character, color, image, mood, cell, hat, dx, dy, hatScale, rows]);
  return (
    <canvas
      ref={ref}
      width={CANVAS_W * cell}
      height={rows * cell}
      style={{ width: (CANVAS_W * cell) / dpr, height: (rows * cell) / dpr }}
      className="pixel"
    />
  );
}

export function Bubble({ text }: { text: string }) {
  return <div className="bubble">{text}</div>;
}
