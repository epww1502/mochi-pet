// 날짜·시간으로 정해지는 이벤트: 생일, 퇴근 시간 파티, 기념일, 다 모였다.
// 서버 없이 각자 시계로 정한다. 같은 방 친구들은 비슷한 시각에 같은 걸 본다.

/** 양력으로 날짜가 고정된 기념일. 설날·추석은 음력이라 해마다 날짜 표가 필요해서 아직 넣지 않았다. */
export const HOLIDAYS = {
  "01-01": { name: "새해", icon: "🎍", greet: "새해 복 많이 받아요!", food: "🍡" },
  "02-14": { name: "발렌타인데이", icon: "💝", greet: "해피 발렌타인!", food: "🍫" },
  "03-14": { name: "화이트데이", icon: "🤍", greet: "해피 화이트데이!", food: "🍬" },
  "05-05": { name: "어린이날", icon: "🎈", greet: "어린이날이에요!", food: "🍭" },
  "10-31": { name: "할로윈", icon: "🎃", greet: "해피 할로윈! 사탕 줄래?", food: "🍬" },
  "11-11": { name: "빼빼로데이", icon: "🍫", greet: "빼빼로 하나씩!", food: "🍫" },
  "12-24": { name: "크리스마스 이브", icon: "🎄", greet: "내일은 크리스마스!", food: "🍰" },
  "12-25": { name: "크리스마스", icon: "🎅", greet: "메리 크리스마스!", food: "🍰" },
} as const;
export type Holiday = (typeof HOLIDAYS)[keyof typeof HOLIDAYS];
/** 기념일 간식 (간식 주기에서 받아 주는 것) */
export const HOLIDAY_FOODS = [...new Set(Object.values(HOLIDAYS).map((h) => h.food))];

const pad = (n: number) => String(n).padStart(2, "0");
/** 내 컴퓨터 시각 기준 "MM-DD" */
export const monthDay = (d: Date) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 내 컴퓨터 시각 기준 "YYYY-MM-DD" (하루에 한 번만 하는 이벤트 표시용) */
export const dayKey = (d: Date) => `${d.getFullYear()}-${monthDay(d)}`;

export function holidayOn(d: Date): Holiday | null {
  return (HOLIDAYS as Record<string, Holiday>)[monthDay(d)] ?? null;
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** 생일 "MM-DD"만 받는다 (2월 29일 포함). 이상하면 빈 값 */
export function cleanBday(v: unknown): string {
  if (typeof v !== "string") return "";
  const m = /^(\d\d)-(\d\d)$/.exec(v);
  if (!m) return "";
  const [mo, da] = [Number(m[1]), Number(m[2])];
  return mo >= 1 && mo <= 12 && da >= 1 && da <= DAYS_IN_MONTH[mo - 1] ? v : "";
}

/** 오늘이 생일인지. 2월 29일생은 평년엔 2월 28일에 축하한다. */
export function isBirthday(bday: string, d: Date): boolean {
  if (!bday) return false;
  if (bday === monthDay(d)) return true;
  const leap = new Date(d.getFullYear(), 1, 29).getMonth() === 1;
  return bday === "02-29" && !leap && monthDay(d) === "02-28";
}

/** "HH:MM"만 받는다. 이상하면 기본 오후 6시 */
export function cleanTime(v: unknown, fallback = "18:00"): string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback;
}

/**
 * 퇴근 시각을 막 지났는지 (지난번 확인 ~ 지금 사이에 그 시각이 있었나). 평일만.
 * 컴퓨터가 잠들었다 한참 뒤 깨어나면 늦은 파티를 하지 않도록 10분 넘게 지났으면 넘어간다.
 */
export function offTimeHit(prev: Date | null, now: Date, offTime: string): boolean {
  if (!prev) return false;
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const [h, m] = offTime.split(":").map(Number);
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime();
  return prev.getTime() < target && now.getTime() >= target && now.getTime() - target < 10 * 60_000;
}
export const isFriday = (d: Date) => d.getDay() === 5;

/** 최근(7일 안) 들어온 적 있는 멤버만 센다: 예전에 한 번 들어왔다 안 쓰는 사람 때문에 영영 못 모이지 않게 */
export const ACTIVE_WITHIN_MS = 7 * 24 * 60 * 60_000;

/** 방 친구가 모두 접속했는지 (나 포함 3명 이상일 때만) */
export function allHere(friends: { online: boolean; lastSeen: number | null }[], now: number): boolean {
  const active = friends.filter((f) => f.online || (f.lastSeen !== null && now - f.lastSeen < ACTIVE_WITHIN_MS));
  return active.length >= 3 && active.every((f) => f.online);
}

/** 하루에 한 번만: 오늘 처음이면 표시하고 true. 저장소를 못 쓰면 이번 실행 동안만 기억한다. */
const memo = new Set<string>();
export function onceToday(name: string, d: Date): boolean {
  const key = `mochi-pet-event:${name}:${dayKey(d)}`;
  if (memo.has(key)) return false;
  memo.add(key);
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
  } catch {
    // 저장소를 못 써도 이번 실행에서는 한 번만
  }
  return true;
}
