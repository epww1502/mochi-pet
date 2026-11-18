import { useEffect, useRef } from "react";
import { drawImagePet, drawPet, type CharacterId, type Mood } from "./sprites";

type Props = { character: CharacterId; color: string; image?: string | null; mood: Mood; px?: number };

export function PetCanvas({ character, color, image, mood, px = 5 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const img = image ? Object.assign(new Image(), { src: image }) : null;
    const born = performance.now();
    const tick = () => {
      const t = (performance.now() - born) / 1000;
      if (img) {
        if (img.complete) drawImagePet(ctx, px, img, mood, t);
      } else drawPet(ctx, px, character, color, mood, t);
    };
    tick();
    const id = setInterval(tick, 80); // 초당 약 12번: 상시 실행이라 가볍게
    return () => clearInterval(id);
  }, [character, color, image, mood, px]);
  return <canvas ref={ref} width={16 * px} height={18 * px} className="pixel" />;
}

export function Bubble({ text }: { text: string }) {
  return <div className="bubble">{text}</div>;
}
