import { useEffect, useRef, useState } from "react";
import { drawImagePet, drawPet, type CharacterId, type Mood } from "./sprites";

type Props = { character: CharacterId; color: string; image?: string | null; mood: Mood; px?: number };

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

export function PetCanvas({ character, color, image, mood, px = 5 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = useDevicePixelRatio();
  // 캔버스를 화면의 실제 픽셀로 그린다. 한 칸 = 정수 개의 실제 픽셀이라 늘려 보일 때 뭉개지지 않는다.
  const cell = Math.max(1, Math.round(px * dpr));
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const img = image ? Object.assign(new Image(), { src: image }) : null;
    const born = performance.now();
    const tick = () => {
      const t = (performance.now() - born) / 1000;
      if (img) {
        if (img.complete) drawImagePet(ctx, cell, img, mood, t);
      } else drawPet(ctx, cell, character, color, mood, t);
    };
    tick();
    const id = setInterval(tick, 80); // 초당 약 12번: 상시 실행이라 가볍게
    return () => clearInterval(id);
  }, [character, color, image, mood, cell]);
  return (
    <canvas ref={ref} width={16 * cell} height={18 * cell} style={{ width: (16 * cell) / dpr, height: (18 * cell) / dpr }} className="pixel" />
  );
}

export function Bubble({ text }: { text: string }) {
  return <div className="bubble">{text}</div>;
}
