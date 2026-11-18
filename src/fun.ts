// 펫끼리 노는 것과 요일·시간에 따라 달라지는 기분. 서버 없이 각자 화면에서 정한다.
import type { Motion } from "./sprites";

export type WeekdayMood = { key: string; emoji: string; text: string; motion: Motion };

/**
 * 요일·시간마다 한 번씩 펫이 보여 주는 기분 (평일만).
 * - 월요일 아침(9~11시): 피곤
 * - 점심 앞(11:30~12:30): 배고픔
 * - 금요일 오후(15~18시): 들뜸
 * key는 하루에 한 번만 보여 주려고 쓴다.
 */
export function weekdayMood(d: Date): WeekdayMood | null {
  const day = d.getDay();
  if (day === 0 || day === 6) return null;
  const min = d.getHours() * 60 + d.getMinutes();
  if (day === 1 && min >= 9 * 60 && min < 11 * 60) return { key: "monday", emoji: "😪", text: "월요일이다…", motion: "sad" };
  if (min >= 11 * 60 + 30 && min < 12 * 60 + 30) return { key: "lunch", emoji: "🍚", text: "배고파…", motion: "wave" };
  if (day === 5 && min >= 15 * 60 && min < 18 * 60) return { key: "friday", emoji: "🎶", text: "곧 주말!", motion: "happy" };
  return null;
}

export type PlayPet = { id: string; x: number; y: number; width: number; free: boolean };
export type Play = { a: string; b: string; kind: "highfive" | "hug" };

/** 펫 사이(가장자리 사이)가 이만큼(px)보다 가까우면 같이 논다 */
export const PLAY_NEAR = 40;

/**
 * 바닥에 붙어 있고 쉬는 중인 두 펫이 가까이 있으면 같이 놀 짝을 고른다.
 * rand는 0~1 (테스트에서 고정하려고 받는다).
 */
export function pickPlay(pets: PlayPet[], rand: () => number = Math.random): Play | null {
  const free = pets.filter((p) => p.free && p.y === 0).sort((p, q) => p.x - q.x);
  const pairs: [PlayPet, PlayPet][] = [];
  for (let i = 0; i + 1 < free.length; i++) {
    const [l, r] = [free[i], free[i + 1]];
    if (r.x - (l.x + l.width) < PLAY_NEAR) pairs.push([l, r]);
  }
  if (!pairs.length) return null;
  const [a, b] = pairs[Math.floor(rand() * pairs.length) % pairs.length];
  return { a: a.id, b: b.id, kind: rand() < 0.6 ? "highfive" : "hug" };
}
