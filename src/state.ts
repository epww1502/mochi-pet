import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { isHat, isSeason, isTag, type HatId, type SeasonId, type TagId } from "./decor";
import { safePlace, type Place } from "./weather";
import { cleanBday, cleanTime } from "./events";
import { CHARACTERS, cleanHatOffset, hatDyMin, type CharacterId, type HatOffset, type Mood, type Motion } from "./sprites";

// 공개해도 되는 키(publishable). 테이블은 RLS로 잠겨 있고 함수로만 접근한다.
export const supabase = createClient(
  "https://xzsnsruyemxqxljqgvcj.supabase.co",
  "sb_publishable_nizXkiBZ-6KjAJwFo1WLmA_dhz9RLll",
  { auth: { persistSession: false } },
);

export type Room = { id: string; code: string; name: string };

export type Settings = {
  deviceId: string;
  name: string;
  character: CharacterId;
  color: string;
  /** 가져온 그림(64x64 이하 PNG data URL). 있으면 캐릭터 대신 쓴다. */
  image: string | null;
  room: Room | null;
  /** 픽셀 한 칸의 화면 크기(px). 펫, 이름표, 말풍선, 창이 이 비율로 같이 커진다. */
  px: number;
  /** 바쁨(방해 금지): 친구에게 빨간 불로 보이고, 답장 추천을 띄우지 않는다 */
  busy: boolean;
  /** 이름표를 펫 머리 위에 둘지 발 아래에 둘지 (내 화면의 모든 펫에 적용) */
  labelPos: "above" | "below";
  hat: HatId | null;
  /** 모자를 옮긴 칸 수 [오른쪽, 아래]. 설정 미리보기에서 끌어서 정한다 */
  hatOffset: HatOffset;
  tag: TagId | null;
  /** 켠 계절 꾸미기 (기본 없음) */
  seasons: SeasonId[];
  /** 조용히 모드: 친구 채팅 말풍선을 띄우지 않고 안 읽은 개수만 쌓는다 */
  quiet: boolean;
  /** 실제 날씨 효과 (기본 꺼짐). 켜면 place의 날씨를 30분마다 받아 온다 */
  weatherOn: boolean;
  place: Place | null;
  /** 친구 펫 크기를 내 화면에서만 바꾼 값 (친구 id → 픽셀 한 칸) */
  friendPx: Record<string, number>;
  /** 내 화면에서 숨긴 친구 (id → 숨길 때 이름, 다시 보기 메뉴에 쓴다) */
  hidden: Record<string, string>;
  /** 상태 메시지 (이름표 위에 작게, 친구에게도 보인다) */
  statusMsg: string;
  /** 펫이 가끔 맨 앞 창 위로 올라가 걷는다 (기본 켜짐) */
  climb: boolean;
  /** 친구 채팅이 오면 OS 알림 (기본 꺼짐. 바쁨·조용히 모드면 안 울린다) */
  notifyChat: boolean;
  /** 친구가 들어오면 OS 알림 (기본 꺼짐. 바쁨이면 안 울린다) */
  notifyOnline: boolean;
  /** 펫이 사는 모니터 이름. 없거나 빠지면 앱이 뜬 모니터 */
  monitor: string | null;
  /** 생일 "MM-DD" (없으면 ""). 방 친구에게 월·일만 보인다 */
  birthday: string;
  /** 평일 퇴근 시각에 펫들이 만세 (기본 켜짐, 18:00) */
  offParty: boolean;
  offTime: string;
  /** 기념일 인사와 "다 모였다" (기본 켜짐) */
  eventsOn: boolean;
};

/** 한 칸이 정수 픽셀이어야 픽셀아트가 또렷하다. 그래서 배율은 20%씩(3px=60% ~ 12px=240%) 움직인다. */
export const PX_MIN = 3;
export const PX_MAX = 12;
export const PX_DEFAULT = 5;
export const percentOf = (px: number) => px * 20;

/** v0.2.1까지 쓰던 단계 설정 */
const LEGACY_SIZES = new Map<unknown, number>([["xs", 3], ["s", 4], ["m", 5], ["l", 7], ["xl", 10]]);

/** 친구별 크기: 숫자만, 범위 안으로 */
export function cleanFriendPx(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>)
      .filter(([, n]) => typeof n === "number" && Number.isFinite(n))
      .map(([k, n]) => [k, pxOf({ px: n })]),
  );
}

/** 저장된 값에서 칸 크기를 꺼낸다. 예전 단계 설정은 이어받고, 이상한 값은 보통(100%)으로. */
export function pxOf(saved: { px?: unknown; size?: unknown }): number {
  const v = typeof saved.px === "number" && Number.isFinite(saved.px) ? saved.px : (LEGACY_SIZES.get(saved.size) ?? PX_DEFAULT);
  return Math.min(PX_MAX, Math.max(PX_MIN, Math.round(v)));
}

const KEY = "mochi-pet-settings";

function load(): Settings {
  const base: Settings = { deviceId: crypto.randomUUID(), name: "", character: "mochi", color: "#ffe7c7", image: null, room: null, px: PX_DEFAULT, busy: false, labelPos: "above", hat: null, hatOffset: [0, 0], tag: null, seasons: [], quiet: false, weatherOn: false, place: null, friendPx: {}, hidden: {}, statusMsg: "", climb: true, notifyChat: false, notifyOnline: false, monitor: null, birthday: "", offParty: true, offTime: "18:00", eventsOn: true };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      ...base,
      ...saved,
      px: pxOf(saved),
      labelPos: saved.labelPos === "below" ? "below" : "above",
      hat: isHat(saved.hat) ? saved.hat : null,
      hatOffset: cleanHatOffset(
        saved.hatOffset,
        hatDyMin(Object.prototype.hasOwnProperty.call(CHARACTERS, saved.character) ? saved.character : "mochi", !!saved.image),
      ),
      tag: isTag(saved.tag) ? saved.tag : null,
      seasons: Array.isArray(saved.seasons) ? saved.seasons.filter(isSeason) : [],
      quiet: saved.quiet === true,
      weatherOn: saved.weatherOn === true,
      place: safePlace(saved.place),
      friendPx: cleanFriendPx(saved.friendPx),
      statusMsg: cleanMsg(saved.statusMsg),
      climb: saved.climb !== false,
      notifyChat: saved.notifyChat === true,
      notifyOnline: saved.notifyOnline === true,
      monitor: typeof saved.monitor === "string" && saved.monitor ? saved.monitor.slice(0, 200) : null,
      birthday: cleanBday(saved.birthday),
      offParty: saved.offParty !== false,
      offTime: cleanTime(saved.offTime),
      eventsOn: saved.eventsOn !== false,
      hidden:
        saved.hidden && typeof saved.hidden === "object"
          ? Object.fromEntries(Object.entries(saved.hidden as Record<string, unknown>).filter(([, n]) => typeof n === "string")) as Record<string, string>
          : {},
    };
  } catch {
    return base;
  }
}

export function saveSettings(patch: Partial<Settings>) {
  const next = { ...load(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  // 같은 창에는 storage 이벤트가 안 오므로 직접 알린다. 다른 창(펫 ↔ 설정)은 storage 이벤트로 받는다.
  window.dispatchEvent(new Event("pet-settings"));
  return next;
}

/** 펫 창과 설정 창이 같은 localStorage를 보므로, 한쪽에서 바꾸면 다른 쪽도 바로 바뀐다. */
export function useSettings(): Settings {
  const [s, set] = useState(() => {
    const v = load();
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(v)); // deviceId 고정
    return v;
  });
  useEffect(() => {
    const on = () => set(load());
    window.addEventListener("storage", on);
    window.addEventListener("pet-settings", on);
    return () => {
      window.removeEventListener("storage", on);
      window.removeEventListener("pet-settings", on);
    };
  }, []);
  return s;
}

/** Realtime presence로 방 사람들에게 보이는 내 상태 */
export type PeerState = {
  id: string;
  name: string;
  character: CharacterId;
  color: string;
  image: string | null;
  status: Mood; // online(idle) / away / typing
  busy: boolean;
  /** 입력 없이 지난 분. 자리 비움일 때만 의미가 있다 */
  idleMin: number;
  hat: HatId | null;
  /** 모자 위치 (옛 버전 친구는 안 보낸다 → 제자리) */
  hatOffset: HatOffset;
  tag: TagId | null;
  /** 이 펫의 크기(픽셀 한 칸). 주인이 정한 크기로 모두의 화면에 보인다 */
  px: number;
  /** 상태 메시지 */
  msg: string;
  /** 생일 "MM-DD" (없거나 옛 버전이면 "") */
  bday: string;
};

/** presence 상태(키별 배열)를 나를 뺀 친구 목록으로. 같은 사람이 여러 번 잡히면 마지막 것을 쓴다. */
export function presenceToPeers(state: Record<string, PeerState[]>, selfId: string): PeerState[] {
  return Object.entries(state)
    .filter(([key, metas]) => key !== selfId && metas.length > 0)
    .map(([, metas]) => metas[metas.length - 1])
    .map(sanitizePeer)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** 친구가 보낸 상태는 믿지 않는다: 모르는 캐릭터나 이상한 값이면 기본값으로. */
function sanitizePeer(p: PeerState): PeerState {
  const character = Object.prototype.hasOwnProperty.call(CHARACTERS, p.character) ? p.character : "mochi";
  const image = safeImage(p.image);
  return {
    id: String(p.id),
    name: String(p.name ?? "").slice(0, 20) || "친구",
    character,
    color: /^#[0-9a-f]{6}$/i.test(String(p.color)) ? p.color : "#ffe7c7",
    image,
    status: p.status === "away" || p.status === "typing" ? p.status : "idle",
    busy: p.busy === true,
    idleMin: Number.isFinite(p.idleMin) ? Math.min(Math.max(Math.floor(p.idleMin), 0), 100_000) : 0,
    hat: isHat(p.hat) ? p.hat : null,
    hatOffset: cleanHatOffset(p.hatOffset, hatDyMin(character, !!image)),
    tag: isTag(p.tag) ? p.tag : null,
    px: pxOf({ px: p.px }),
    msg: cleanMsg(p.msg),
    bday: cleanBday(p.bday),
  };
}

export const MSG_MAX = 24;
/** 상태 메시지: 글자만, 한 줄, 24자까지 */
export function cleanMsg(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MSG_MAX) : "";
}

/** 접속 기록(1분마다)이 이 시간 안에 있으면 온라인. 컴퓨터를 끄거나 인터넷이 끊기면 3분 뒤 오프라인 */
export const ONLINE_GRACE_MS = 3 * 60_000;

/** 방 멤버 목록(DB)에서 온 한 줄. 앱을 끈 친구도 여기 남아 있다. */
export type Member = { device_id: string; name: string; character_id: string; color: string; image: string | null; last_seen: string };

/** 화면에 세울 펫 하나: 지금 접속 중이면 presence 상태, 아니면 마지막 접속 시각 */
export type RosterPet = PeerState & { online: boolean; lastSeen: number | null };

/**
 * 접속 중인 친구 + 꺼진 친구를 한 줄로. 접속 중인 친구가 먼저(이름순), 꺼진 친구는 최근 접속순.
 * 창에 들어가는 만큼(max)만 세운다.
 */
export function buildRoster(peers: PeerState[], members: Member[], selfId: string, max: number, now = Date.now()): RosterPet[] {
  const online = new Set(peers.map((p) => p.id));
  const others = members
    .filter((m) => m.device_id !== selfId && !online.has(m.device_id))
    .map((m) => ({
      ...sanitizePeer({
        id: m.device_id,
        name: m.name,
        character: m.character_id as CharacterId,
        color: m.color,
        image: m.image,
        status: "idle",
        busy: false,
        idleMin: 0,
        hat: null,
        hatOffset: [0, 0],
        tag: null,
        px: PX_DEFAULT,
        msg: "",
        bday: "",
      }),
      online: false,
      lastSeen: Date.parse(m.last_seen) || null,
    }))
    // 실시간 연결이 잠깐 끊겼어도 앱은 1분마다 접속을 남긴다. 최근에 남겼으면 컴퓨터·인터넷이 켜진 것으로 본다.
    .map((p) => (p.lastSeen && now - p.lastSeen < ONLINE_GRACE_MS ? { ...p, online: true } : p))
    .sort((a, b) => Number(b.online) - Number(a.online) || (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
  return [...peers.map((p) => ({ ...p, online: true, lastSeen: null })), ...others].slice(0, max);
}

/** "방금", "5분 전", "3시간 전", "2일 전" */
export function ago(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / 60 / 24)}일 전`;
}

export const AWAY_AFTER_MIN = 5;
export const AFK_AFTER_MIN = 30;

/** 이름표 옆 상태 불: 초록 온라인, 주황 자리 비움/잠수, 빨강 바쁨, 회색 오프라인 */
export function statusLight(p: Pick<RosterPet, "online" | "lastSeen" | "busy" | "status" | "idleMin">, now: number): { color: "green" | "orange" | "red" | "gray"; text: string } {
  if (!p.online) return { color: "gray", text: p.lastSeen ? ago(now - p.lastSeen) : "오프라인" };
  if (p.busy) return { color: "red", text: "바쁨" };
  if (p.status === "away") {
    if (p.idleMin >= AFK_AFTER_MIN) {
      const h = Math.floor(p.idleMin / 60);
      return { color: "orange", text: h >= 1 ? `잠수 ${h}시간` : `잠수 ${p.idleMin}분` };
    }
    return { color: "orange", text: "자리 비움" };
  }
  return { color: "green", text: "" };
}

/** 그림 한 장이 presence에 실리므로 크기를 제한한다. 64x64 PNG는 사진이라도 보통 10~20KB. */
export const MAX_IMAGE_CHARS = 48_000;

/** 친구가 보낸 그림은 우리가 만든 형식(작은 PNG data URL)일 때만 쓴다. */
export function safeImage(url: unknown): string | null {
  return typeof url === "string" && url.startsWith("data:image/png;base64,") && url.length <= MAX_IMAGE_CHARS ? url : null;
}

/**
 * 가져온 그림을 PNG data URL로. 64칸 이하 픽셀아트는 원본 그대로(화면에서 정수배로 또렷하게 키운다),
 * 더 큰 그림은 비율을 유지해 64칸 안으로 부드럽게 줄인다. 너무 무거우면 48, 32칸으로 다시 줄인다.
 */
export async function importImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    for (const max of [64, 48, 32]) {
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = scale < 1;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/png");
      if (safeImage(url)) return url;
    }
    throw new Error("그림이 너무 복잡해요");
  } finally {
    bitmap.close();
  }
}

/** 친구 펫을 눌러 보낼 수 있는 이모티콘 */
export const EMOTES = ["❤️", "🥰", "🤗", "👍", "🙌", "🎉", "😂", "🤣", "😮", "😢", "👋", "☕"] as const;
export type Emote = (typeof EMOTES)[number];

/** 이모티콘을 보낼 때 보낸 사람 펫이 하는 몸짓 (방 안 모두에게 보인다) */
export const EMOTE_MOTION: Record<Emote, Motion> = {
  "❤️": "happy",
  "🥰": "happy",
  "🤗": "happy",
  "☕": "happy",
  "👍": "cheer",
  "🙌": "cheer",
  "🎉": "cheer",
  "😂": "laugh",
  "🤣": "laugh",
  "😮": "surprised",
  "😢": "sad",
  "👋": "wave",
};

/** 이모티콘을 받았을 때 답장으로 추천하는 3개 */
export const REPLIES: Record<Emote, readonly [Emote, Emote, Emote]> = {
  "❤️": ["🥰", "❤️", "🤗"],
  "🥰": ["❤️", "🥰", "🤗"],
  "🤗": ["🤗", "❤️", "🥰"],
  "👍": ["🙌", "👍", "🎉"],
  "🙌": ["🎉", "🙌", "👍"],
  "🎉": ["🙌", "🎉", "🥰"],
  "😂": ["🤣", "😂", "👍"],
  "🤣": ["😂", "🤣", "👍"],
  "😮": ["😂", "😮", "🤗"],
  "😢": ["🤗", "❤️", "😢"],
  "👋": ["👋", "🥰", "☕"],
  "☕": ["☕", "👍", "👋"],
};

/** 친구에게 던질 수 있는 것과, 맞은 펫의 반응 */
export const THROWABLES = {
  "🏐": { name: "말랑공", hit: "dizzy" },
  "🍌": { name: "바나나", hit: "slip" },
  "🍅": { name: "토마토", hit: "splat" },
  "🪶": { name: "깃털", hit: "laugh" },
} as const satisfies Record<string, { name: string; hit: Motion }>;
export type Throwable = keyof typeof THROWABLES;

/**
 * 방 안에 broadcast로 퍼지는 반응. by(보낸 사람 id)가 from(이름)으로 target 펫에 무엇을 했는지.
 * - dizzy/happy: 흔들기·쓰다듬기
 * - emote: 이모티콘 (보낸 펫은 몸짓)
 * - throw: 물건 던지기 (포물선으로 날아가 맞으면 반응)
 * - big: 더블클릭 크게 인사 (target = 나)
 * - poke: 콕 찌르기
 * - gift: 선물 상자 놓기 (hat = 들어 있는 모자, 보낸 사람이 정해서 모두 같은 걸 본다)
 * - open: 받은 사람이 상자 열기
 */
export type Reaction = {
  target: string;
  by: string;
  from: string;
  kind: "dizzy" | "happy" | "emote" | "throw" | "big" | "poke" | "gift" | "open" | "bday";
  emoji?: Emote;
  item?: Throwable;
  hat?: HatId;
};

const isEmote = (e: unknown): e is Emote => (EMOTES as readonly unknown[]).includes(e);
const isThrowable = (e: unknown): e is Throwable => typeof e === "string" && Object.prototype.hasOwnProperty.call(THROWABLES, e);

/** 친구가 보낸 반응은 정해진 종류와 이모티콘·물건일 때만 받는다. */
export function sanitizeReaction(raw: unknown): Reaction | null {
  const r = raw as Partial<Reaction> | null;
  if (!r || typeof r.target !== "string" || typeof r.from !== "string" || typeof r.by !== "string") return null;
  const base = { target: r.target, by: r.by, from: r.from.slice(0, 20) };
  if (r.kind === "dizzy" || r.kind === "happy" || r.kind === "big" || r.kind === "poke" || r.kind === "bday") return { ...base, kind: r.kind };
  if (r.kind === "emote" && isEmote(r.emoji)) return { ...base, kind: "emote", emoji: r.emoji };
  if (r.kind === "throw" && isThrowable(r.item)) return { ...base, kind: "throw", item: r.item };
  if ((r.kind === "gift" || r.kind === "open") && isHat(r.hat)) return { ...base, kind: r.kind, hat: r.hat };
  return null;
}
