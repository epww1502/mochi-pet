import { useEffect, useRef, useState } from "react";
import { ORNAMENTS, ORNAMENT_IDS, ORNAMENT_SPOTS, TREE_ROWS, type OrnamentId, type SeasonId } from "./decor";

/** 화면에 살살 내리는 것: 봄 꽃잎, 여름 반딧불, 가을 낙엽, 겨울 눈 */
const PARTICLES: Record<SeasonId, { colors: string[]; rise?: boolean }> = {
  spring: { colors: ["#ffc0d9", "#ff9cc2", "#ffe1ec"] },
  summer: { colors: ["#fff3a0", "#ffe066"], rise: true },
  autumn: { colors: ["#ff8a3d", "#e5484d", "#ffb347", "#b5651d"] },
  winter: { colors: ["#ffffff", "#e8f2ff"] },
};

export function SeasonFx({ seasons }: { seasons: SeasonId[] }) {
  if (seasons.length === 0) return null;
  return (
    <div className="season-fx" aria-hidden>
      {seasons.flatMap((season) =>
        Array.from({ length: 9 }, (_, i) => {
          const { colors, rise } = PARTICLES[season];
          // 계절·번호마다 고정된 값으로 흩어 놓는다 (다시 그려도 튀지 않게)
          const n = i * 37 + season.length * 11;
          return (
            <span
              key={`${season}${i}`}
              className={`particle ${rise ? "rise" : "fall"}`}
              style={
                {
                  left: `${(n * 13) % 100}%`,
                  background: colors[i % colors.length],
                  animationDuration: `${7 + (n % 6)}s`,
                  animationDelay: `-${n % 9}s`,
                  "--drift": `${((n % 7) - 3) * 12}px`,
                } as React.CSSProperties
              }
            />
          );
        }),
      )}
    </div>
  );
}

export type Ornament = { slot: number; ornament: string; by_name: string };

const TREE_COLORS: Record<string, string> = { g: "#2f9e57", n: "#8b5a2b", y: "#ffc93c" };

/** 방에 하나 있는 크리스마스 트리. 누르면 장식 고르기, 장식은 모두에게 저장된다. */
export function Tree({
  ornaments,
  px,
  open,
  onToggle,
  onHang,
}: {
  ornaments: Ornament[];
  px: number;
  open: boolean;
  onToggle: () => void;
  onHang: (o: OrnamentId) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [dpr] = useState(() => window.devicePixelRatio || 1);
  const cell = Math.max(1, Math.round(px * dpr));
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const born = performance.now();
    const draw = () => {
      const t = (performance.now() - born) / 1000;
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      const dot = (x: number, y: number, c: string) => {
        ctx.fillStyle = c;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      };
      TREE_ROWS.forEach((row, y) => [...row].forEach((ch, x) => TREE_COLORS[ch] && dot(x, y, TREE_COLORS[ch])));
      if (Math.floor(t * 2) % 2) dot(7, 0, "#fff6c2"); // 별 반짝
      for (const o of ornaments) {
        const spot = ORNAMENT_SPOTS[o.slot];
        const color = ORNAMENTS[o.ornament as OrnamentId]?.color;
        if (spot && color) dot(spot[0], spot[1], color);
      }
    };
    draw();
    const id = setInterval(draw, 500);
    return () => clearInterval(id);
  }, [ornaments, cell]);

  const who = [...new Set(ornaments.map((o) => o.by_name))].join(", ");
  return (
    <div className="slot tree">
      {open && (
        <div className="picker" data-hit role="toolbar" aria-label="트리에 장식 달기">
          <span className="reply-label">장식 달기 ({ornaments.length}/12)</span>
          {ORNAMENT_IDS.map((o) => (
            <button key={o} title={ORNAMENTS[o].name} aria-label={`${ORNAMENTS[o].name} 달기`} onClick={() => onHang(o)}>
              {ORNAMENTS[o].icon}
            </button>
          ))}
        </div>
      )}
      <div className="name above">🎄 우리 트리 {ornaments.length}/12</div>
      <button
        className="pet tree-btn"
        data-hit
        onClick={onToggle}
        title={who ? `꾸민 사람: ${who} · 눌러서 장식 달기` : "눌러서 첫 장식을 달아 보세요"}
        aria-label="크리스마스 트리 장식 달기"
      >
        <canvas
          ref={ref}
          width={16 * cell}
          height={18 * cell}
          style={{ width: (16 * cell) / dpr, height: (18 * cell) / dpr }}
          className="pixel"
        />
      </button>
    </div>
  );
}
