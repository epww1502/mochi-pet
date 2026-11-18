import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { CHARACTERS, type CharacterId, type Mood } from "./sprites";

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
  /** 가져온 그림(32x32 PNG data URL). 있으면 캐릭터 대신 쓴다. */
  image: string | null;
  room: Room | null;
  /** 픽셀 한 칸의 화면 크기(px). 펫, 이름표, 말풍선, 창이 이 비율로 같이 커진다. */
  px: number;
};

/** 한 칸이 정수 픽셀이어야 픽셀아트가 또렷하다. 그래서 배율은 20%씩(3px=60% ~ 12px=240%) 움직인다. */
export const PX_MIN = 3;
export const PX_MAX = 12;
export const PX_DEFAULT = 5;
export const percentOf = (px: number) => px * 20;

/** v0.2.1까지 쓰던 단계 설정 */
const LEGACY_SIZES = new Map<unknown, number>([["xs", 3], ["s", 4], ["m", 5], ["l", 7], ["xl", 10]]);

/** 저장된 값에서 칸 크기를 꺼낸다. 예전 단계 설정은 이어받고, 이상한 값은 보통(100%)으로. */
export function pxOf(saved: { px?: unknown; size?: unknown }): number {
  const v = typeof saved.px === "number" && Number.isFinite(saved.px) ? saved.px : (LEGACY_SIZES.get(saved.size) ?? PX_DEFAULT);
  return Math.min(PX_MAX, Math.max(PX_MIN, Math.round(v)));
}

const KEY = "mochi-pet-settings";

function load(): Settings {
  const base: Settings = { deviceId: crypto.randomUUID(), name: "", character: "mochi", color: "#ffe7c7", image: null, room: null, px: PX_DEFAULT };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { ...base, ...saved, px: pxOf(saved) };
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
  return {
    id: String(p.id),
    name: String(p.name ?? "").slice(0, 20) || "친구",
    character: Object.prototype.hasOwnProperty.call(CHARACTERS, p.character) ? p.character : "mochi",
    color: /^#[0-9a-f]{6}$/i.test(String(p.color)) ? p.color : "#ffe7c7",
    image: safeImage(p.image),
    status: p.status === "away" || p.status === "typing" ? p.status : "idle",
  };
}

/** 그림 한 장이 presence에 실리므로 크기를 제한한다. 32x32 PNG는 보통 2~5KB. */
export const MAX_IMAGE_CHARS = 24_000;

/** 친구가 보낸 그림은 우리가 만든 형식(작은 PNG data URL)일 때만 쓴다. */
export function safeImage(url: unknown): string | null {
  return typeof url === "string" && url.startsWith("data:image/png;base64,") && url.length <= MAX_IMAGE_CHARS ? url : null;
}

/** 사진이든 큰 그림이든 32x32 픽셀로 줄인 PNG data URL로 바꾼다. 비율은 유지하고 남는 곳은 투명. */
export async function importImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // 작은 픽셀아트는 또렷하게, 큰 사진은 부드럽게 줄인다
  ctx.imageSmoothingEnabled = Math.max(bitmap.width, bitmap.height) > size * 2;
  const scale = size / Math.max(bitmap.width, bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  ctx.drawImage(bitmap, (size - w) / 2, size - h, w, h); // 바닥에 붙여서 서 있는 느낌
  bitmap.close();
  const url = canvas.toDataURL("image/png");
  if (!safeImage(url)) throw new Error("그림이 너무 복잡해요");
  return url;
}
