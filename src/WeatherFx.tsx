import { useEffect, useState } from "react";
import { fetchWeather, type Place, type Weather } from "./weather";

const REFRESH_MS = 30 * 60_000;

/** 켜져 있고 도시가 정해져 있으면 30분마다 날씨를 받아 온다. 실패하면 마지막 값을 그대로 둔다. */
export function useWeather(on: boolean, place: Place | null): Weather | null {
  const [w, setW] = useState<Weather | null>(null);
  // 브라우저 미리보기(npm run dev)에서 ?weather=rain&night 처럼 날씨를 바꿔 볼 수 있다
  const fake = import.meta.env.DEV ? new URLSearchParams(location.search).get("weather") : null;
  const key = on && place ? `${place.lat},${place.lon}` : "";
  useEffect(() => {
    setW(null);
    if (!on || !place) return;
    let alive = true;
    const load = () =>
      fetchWeather(place)
        .then((v) => alive && setW(v))
        .catch(() => {});
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (fake) return { kind: fake as Weather["kind"], day: !new URLSearchParams(location.search).has("night"), temp: 0, at: 0 };
  return w;
}

const CLOUD = ["....xxxx....", "..xxxxxxxx..", ".xxxxxxxxxxx", "xxxxxxxxxxxx", ".xxxxxxxxxx."];
const SUN = ["....y....", ".y..y..y.", "...ooo...", "..ooooo..", "yyoooooyy", "..ooooo..", "...ooo...", ".y..y..y.", "....y...."];

/** 픽셀 그림을 SVG 사각형으로 (크기와 상관없이 또렷하게) */
function Pixels({ rows, colors, cell }: { rows: string[]; colors: Record<string, string>; cell: number }) {
  return (
    <svg width={rows[0].length * cell} height={rows.length * cell} shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((row, y) =>
        [...row].map((c, x) => (colors[c] ? <rect key={`${x},${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill={colors[c]} /> : null)),
      )}
    </svg>
  );
}

/** 날씨에 맞는 화면 효과. 클릭은 모두 뒤로 통과한다. */
export function WeatherFx({ weather, scale }: { weather: Weather | null; scale: number }) {
  if (!weather) return null;
  const { kind, day } = weather;
  const cell = Math.max(2, Math.round(4 * scale));
  const cloudColor = kind === "storm" ? "#6b7280" : kind === "rain" ? "#c7ced8" : "#ffffff";
  const clouds = kind === "clouds" || kind === "rain" || kind === "storm" || kind === "snow";
  const drops = kind === "rain" ? 26 : kind === "storm" ? 40 : 0;
  return (
    <div className={`weather-fx ${kind}`} aria-hidden>
      {kind === "clear" && day && (
        <div className="sun">
          <Pixels rows={SUN} colors={{ y: "#ffd84d", o: "#ffb020" }} cell={cell} />
        </div>
      )}
      {kind === "clear" &&
        !day &&
        Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="star" style={{ left: `${(i * 37) % 100}%`, top: `${8 + ((i * 23) % 45)}%`, animationDelay: `-${i * 0.7}s` }} />
        ))}
      {clouds &&
        [0, 1, 2].map((i) => (
          <div
            key={i}
            className="cloud"
            style={{ top: `${6 + i * 14}%`, animationDuration: `${60 + i * 25}s`, animationDelay: `-${i * 22}s`, opacity: 0.9 - i * 0.15 }}
          >
            <Pixels rows={CLOUD} colors={{ x: cloudColor }} cell={cell + (i === 0 ? 1 : 0)} />
          </div>
        ))}
      {Array.from({ length: drops }, (_, i) => (
        <span
          key={i}
          className="drop"
          style={{ left: `${(i * 29) % 100}%`, animationDuration: `${0.6 + ((i * 7) % 5) / 10}s`, animationDelay: `-${((i * 13) % 10) / 10}s` }}
        />
      ))}
      {kind === "snow" &&
        Array.from({ length: 22 }, (_, i) => (
          <span
            key={i}
            className="flake"
            style={{ left: `${(i * 31) % 100}%`, animationDuration: `${6 + (i % 5)}s`, animationDelay: `-${i % 7}s` }}
          />
        ))}
      {kind === "fog" && (
        <>
          <div className="fog" />
          <div className="fog second" />
        </>
      )}
      {kind === "storm" && <div className="flash" />}
    </div>
  );
}
