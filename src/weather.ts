// 실제 날씨에 맞춰 화면에 비·구름·눈 등을 띄운다. 설정에서 켰을 때만, 내가 고른 도시로만 조회한다.
// 날씨는 Open-Meteo(무료, 키 없음)에서 받는다. 위치를 자동으로 알아내지 않는다.

export type Place = { name: string; lat: number; lon: number };
export type WeatherKind = "clear" | "clouds" | "rain" | "snow" | "fog" | "storm";
export type Weather = { kind: WeatherKind; day: boolean; temp: number; at: number };

/** 자주 쓰는 도시는 검색 없이 바로 */
export const PRESETS: Place[] = [
  { name: "서울", lat: 37.5665, lon: 126.978 },
  { name: "인천", lat: 37.4563, lon: 126.7052 },
  { name: "수원", lat: 37.2636, lon: 127.0286 },
  { name: "성남", lat: 37.42, lon: 127.1267 },
  { name: "대전", lat: 36.3504, lon: 127.3845 },
  { name: "세종", lat: 36.48, lon: 127.289 },
  { name: "대구", lat: 35.8714, lon: 128.6014 },
  { name: "광주", lat: 35.1595, lon: 126.8526 },
  { name: "울산", lat: 35.5384, lon: 129.3114 },
  { name: "부산", lat: 35.1796, lon: 129.0756 },
  { name: "제주", lat: 33.4996, lon: 126.5312 },
];

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: "☀️ 맑음",
  clouds: "☁️ 구름",
  rain: "🌧️ 비",
  snow: "🌨️ 눈",
  fog: "🌫️ 안개",
  storm: "⛈️ 천둥번개",
};

/** WMO 날씨 코드 → 화면에 그릴 날씨 */
export function weatherKind(code: number): WeatherKind {
  if (code === 0 || code === 1) return "clear"; // 맑음, 대체로 맑음
  if (code === 2 || code === 3) return "clouds"; // 구름 조금, 흐림
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return "clouds";
}

/** 저장된 위치가 이상하면 버린다 */
export function safePlace(p: unknown): Place | null {
  const v = p as Partial<Place> | null;
  if (!v || typeof v.name !== "string" || !Number.isFinite(v.lat) || !Number.isFinite(v.lon)) return null;
  if (Math.abs(v.lat!) > 90 || Math.abs(v.lon!) > 180) return null;
  return { name: v.name.slice(0, 40), lat: v.lat!, lon: v.lon! };
}

export async function fetchWeather(p: Place): Promise<Weather> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(3)}&longitude=${p.lon.toFixed(3)}&current=weather_code,temperature_2m,is_day`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`날씨 ${res.status}`);
  const { current } = await res.json();
  return { kind: weatherKind(Number(current.weather_code)), day: current.is_day === 1, temp: Math.round(Number(current.temperature_2m)), at: Date.now() };
}

/** 도시 검색. 한국어는 "서울특별시"처럼 전체 이름이나 영어로 찾아야 잘 나온다. */
export async function searchPlaces(q: string): Promise<(Place & { detail: string })[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=ko&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`검색 ${res.status}`);
  const { results = [] } = await res.json();
  return (results as { name: string; latitude: number; longitude: number; admin1?: string; country?: string }[]).map((r) => ({
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    detail: [r.admin1, r.country].filter(Boolean).join(", "),
  }));
}
