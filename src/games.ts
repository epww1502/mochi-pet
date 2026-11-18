// 친구와 하는 작은 놀이: 먹이 주기, 가위바위보, 공 주고받기, 점심 메뉴 투표 룰렛.
// 모두 방 broadcast("game")로 주고받고, 각자 화면에서 똑같이 그린다.

import { HOLIDAY_FOODS } from "./events";

export const FOODS = ["🍙", "🍪", "🍓", "🍖"] as const;
/** 평소 간식 + 기념일 간식 (기념일엔 그날 간식이 하나 더 생긴다) */
export type Food = string;
const ALL_FOODS: readonly string[] = [...FOODS, ...HOLIDAY_FOODS];

export const RPS = { rock: "✊", scissors: "✌️", paper: "✋" } as const;
export type Rps = keyof typeof RPS;

/** 가위바위보: 0 비김, 1 a 승, 2 b 승 */
export function rpsWinner(a: Rps, b: Rps): 0 | 1 | 2 {
  if (a === b) return 0;
  const beats: Record<Rps, Rps> = { rock: "scissors", scissors: "paper", paper: "rock" };
  return beats[a] === b ? 1 : 2;
}

export const LUNCH = ["김치찌개", "돈까스", "국밥", "초밥", "햄버거", "마라탕", "쌀국수", "샐러드"] as const;
export const VOTE_MS = 30_000;

/** 투표 집계: 한 사람 한 표(마지막 표만) */
export function tally(votes: Record<string, string>, options: readonly string[]): Record<string, number> {
  const t: Record<string, number> = Object.fromEntries(options.map((o) => [o, 0]));
  for (const v of Object.values(votes)) if (v in t) t[v] += 1;
  return t;
}

/** 룰렛: 표를 받은 메뉴는 표 수만큼 확률, 아무도 안 찍었으면 전부 같은 확률 */
export function spin(t: Record<string, number>, rand: () => number = Math.random): string {
  const entries = Object.entries(t);
  const voted = entries.filter(([, n]) => n > 0);
  const pool = voted.length ? voted : entries.map(([k]) => [k, 1] as [string, number]);
  const total = pool.reduce((sum, [, n]) => sum + n, 0);
  let r = rand() * total;
  for (const [k, n] of pool) {
    if ((r -= n) < 0) return k;
  }
  return pool[pool.length - 1][0];
}

/** 같은 글자면 어느 컴퓨터에서나 같은 순서로 나오는 0~1 난수 (투표 시작한 친구가 사라졌을 때 모두 같은 결과를 내려고) */
export function seededRand(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 시작한 친구의 결과가 이만큼 늦으면 각자 결과를 낸다 */
export const VOTE_GRACE_MS = 5000;

export type GameMsg =
  | { t: "feed"; by: string; from: string; target: string; food: Food }
  | { t: "rps"; id: string; by: string; from: string; target: string; choice: Rps }
  | { t: "rpsAns"; id: string; by: string; from: string; target: string; choice: Rps; theirs: Rps }
  | { t: "ball"; id: string; by: string; from: string; target: string; rally: number }
  | { t: "miss"; id: string; by: string; from: string; rally: number }
  | { t: "voteStart"; id: string; by: string; from: string; options: string[]; endsAt: number }
  | { t: "vote"; id: string; by: string; choice: string }
  | { t: "voteResult"; id: string; winner: string; tally: Record<string, number> };

const str = (v: unknown, max = 60): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isRps = (v: unknown): v is Rps => typeof v === "string" && Object.prototype.hasOwnProperty.call(RPS, v);
const isLunch = (v: unknown): v is string => (LUNCH as readonly unknown[]).includes(v);

/** 친구가 보낸 놀이 신호는 정해진 모양일 때만 받는다 */
export function sanitizeGame(raw: unknown): GameMsg | null {
  const m = raw as Record<string, unknown> | null;
  if (!m || typeof m !== "object") return null;
  const from = str(m.from) ? m.from.slice(0, 20) : "";
  switch (m.t) {
    case "feed":
      return str(m.by) && str(m.target) && ALL_FOODS.includes(m.food as string) ? { t: "feed", by: m.by, from, target: m.target, food: m.food as Food } : null;
    case "rps":
      return str(m.id) && str(m.by) && str(m.target) && isRps(m.choice) ? { t: "rps", id: m.id, by: m.by, from, target: m.target, choice: m.choice } : null;
    case "rpsAns":
      return str(m.id) && str(m.by) && str(m.target) && isRps(m.choice) && isRps(m.theirs)
        ? { t: "rpsAns", id: m.id, by: m.by, from, target: m.target, choice: m.choice, theirs: m.theirs }
        : null;
    case "ball":
      return str(m.id) && str(m.by) && str(m.target) && Number.isInteger(m.rally) && (m.rally as number) >= 0 && (m.rally as number) < 10_000
        ? { t: "ball", id: m.id, by: m.by, from, target: m.target, rally: m.rally as number }
        : null;
    case "miss":
      return str(m.id) && str(m.by) && Number.isInteger(m.rally) ? { t: "miss", id: m.id, by: m.by, from, rally: m.rally as number } : null;
    case "voteStart":
      return str(m.id) && str(m.by) && Array.isArray(m.options) && m.options.length > 1 && m.options.every(isLunch) && Number.isFinite(m.endsAt)
        ? { t: "voteStart", id: m.id, by: m.by, from, options: m.options as string[], endsAt: Math.min(m.endsAt as number, Date.now() + VOTE_MS + 5000) }
        : null;
    case "vote":
      return str(m.id) && str(m.by) && isLunch(m.choice) ? { t: "vote", id: m.id, by: m.by, choice: m.choice } : null;
    case "voteResult":
      return str(m.id) && isLunch(m.winner) && m.tally && typeof m.tally === "object"
        ? {
            t: "voteResult",
            id: m.id,
            winner: m.winner,
            tally: Object.fromEntries(
              Object.entries(m.tally as Record<string, unknown>).filter(([k, v]) => isLunch(k) && Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1000),
            ) as Record<string, number>,
          }
        : null;
    default:
      return null;
  }
}
