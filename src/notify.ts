// 친구 접속·채팅 OS 알림. 언제 알릴지는 아래 순수 함수가 정하고(테스트), 보내기만 플러그인에 맡긴다.

/** 잠깐 끊겼다 다시 붙은 건(와이파이 흔들림, 잠자기) "들어왔다"로 치지 않는다 */
export const ARRIVE_AWAY_MS = 3 * 60_000;
/** 같은 친구 채팅 알림은 이 간격 안에 한 번만 (연달아 보내면 첫 줄만) */
export const CHAT_NOTIFY_GAP_MS = 20_000;

/** 누가 접속 중이었는지와, 친구마다 마지막으로 접속 중이던 시각 */
export type Presence = { here: Set<string>; lastHere: Map<string, number> };

/**
 * 지금 접속 중인 친구 목록으로 새로 들어온 친구를 고른다.
 * prev가 없으면(방에 막 들어옴) 이미 있던 친구라 알리지 않는다.
 * 나갔다가 ARRIVE_AWAY_MS 안에 다시 붙은 친구도 알리지 않는다.
 */
export function arrivals(prev: Presence | null, online: string[], now: number): { arrived: string[]; next: Presence } {
  const lastHere = new Map(prev?.lastHere ?? []);
  for (const id of prev?.here ?? []) lastHere.set(id, now); // 직전까지 있던 친구는 지금까지 있던 걸로
  const arrived = prev
    ? online.filter((id) => {
        if (prev.here.has(id)) return false; // 계속 있던 친구
        const last = lastHere.get(id);
        return last === undefined || now - last >= ARRIVE_AWAY_MS;
      })
    : [];
  for (const id of online) lastHere.set(id, now);
  return { arrived, next: { here: new Set(online), lastHere } };
}

/** 채팅 알림을 띄울지: 켰고, 내가 바쁨·조용히가 아니고, 친구가 보낸 것이고, 같은 친구가 방금 알린 게 아니면 */
export function shouldNotifyChat(
  o: { on: boolean; busy: boolean; quiet: boolean; mine: boolean; lastAt: number | undefined },
  now: number,
): boolean {
  if (!o.on || o.busy || o.quiet || o.mine) return false;
  return o.lastAt === undefined || now - o.lastAt >= CHAT_NOTIFY_GAP_MS;
}

/** OS 알림 보내기. 권한이 없거나 브라우저 미리보기면 조용히 넘어간다. */
export async function notify(title: string, body: string) {
  try {
    const n = await import("@tauri-apps/plugin-notification");
    if (!(await n.isPermissionGranted())) return;
    n.sendNotification({ title, body });
  } catch {
    // 알림을 못 보내도 앱은 그대로
  }
}

/** 설정에서 알림을 켤 때 권한을 묻는다. 허락받으면 true */
export async function askNotifyPermission(): Promise<boolean> {
  try {
    const n = await import("@tauri-apps/plugin-notification");
    if (await n.isPermissionGranted()) return true;
    return (await n.requestPermission()) === "granted";
  } catch {
    return false;
  }
}
