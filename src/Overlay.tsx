import { invoke } from "@tauri-apps/api/core";
import { PhysicalPosition, PhysicalSize, currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { Bubble, PetCanvas } from "./Pet";
import { PX_DEFAULT, presenceToPeers, supabase, useSettings, type PeerState } from "./state";

const AWAY_AFTER_SEC = 5 * 60;
/** 보통 크기일 때 창 크기(논리 px). tauri.conf.json의 main 창과 같다. */
const BASE_WIN = { w: 720, h: 240 };
const CHAT_SHOW_MS = 7000;

type Chat = { sender_id: string; body: string; at: number };

export function Overlay() {
  const s = useSettings();
  const [away, setAway] = useState(false);
  const [peers, setPeers] = useState<PeerState[]>([]);
  const [chats, setChats] = useState<Record<string, Chat>>({});
  const [draft, setDraft] = useState<string | null>(null); // null = 입력창 닫힘
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null); // 구독 완료된 방 채널

  // 처음 실행: 화면 오른쪽 아래로. 이후엔 window-state 플러그인이 위치를 기억한다.
  useEffect(() => {
    if (localStorage.getItem("mochi-pet-positioned")) return;
    (async () => {
      const w = getCurrentWindow();
      const mon = await currentMonitor();
      if (!mon) return;
      const size = await w.outerSize();
      const sf = mon.scaleFactor;
      await w.setPosition(
        new PhysicalPosition(mon.position.x + mon.size.width - size.width - 20 * sf, mon.position.y + mon.size.height - size.height - 90 * sf),
      );
      localStorage.setItem("mochi-pet-positioned", "1");
    })();
    if (!s.name) invoke("open_settings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 크기: 펫이 커지면 창도 같이 키우되, 오른쪽 아래 모서리는 제자리에 둔다
  const px = s.px;
  const scale = px / PX_DEFAULT;
  useEffect(() => {
    (async () => {
      const w = getCurrentWindow();
      const [pos, size, sf] = await Promise.all([w.outerPosition(), w.outerSize(), w.scaleFactor()]);
      const width = Math.round(BASE_WIN.w * scale * sf);
      const height = Math.round(BASE_WIN.h * scale * sf);
      if (width === size.width && height === size.height) return;
      await w.setSize(new PhysicalSize(width, height));
      await w.setPosition(new PhysicalPosition(pos.x + size.width - width, pos.y + size.height - height));
    })();
  }, [scale]);

  // 자리 비움: 키보드/마우스 입력이 5분 없으면
  useEffect(() => {
    const check = () => invoke<number>("idle_seconds").then((sec) => setAway(sec >= AWAY_AFTER_SEC));
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);

  const me: PeerState = {
    id: s.deviceId,
    name: s.name || "나",
    character: s.character,
    color: s.color,
    image: s.image,
    status: draft ? "typing" : away ? "away" : "idle",
  };

  // 방 연결: presence(상태) + broadcast(채팅)
  const roomId = s.room?.id;
  useEffect(() => {
    setPeers([]);
    if (!roomId) return;
    const ch = supabase.channel(`room:${roomId}`, { config: { presence: { key: s.deviceId }, broadcast: { self: true } } });
    ch.on("presence", { event: "sync" }, () => setPeers(presenceToPeers(ch.presenceState<PeerState>() as Record<string, PeerState[]>, s.deviceId)))
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const c = payload as { sender_id: string; body: string };
        setChats((prev) => ({ ...prev, [c.sender_id]: { ...c, at: Date.now() } }));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setChannel(ch);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setError("방에 연결하지 못했어요 (회사 네트워크가 웹소켓을 막을 수 있어요)");
      });
    return () => {
      setChannel(null);
      supabase.removeChannel(ch);
    };
  }, [roomId, s.deviceId]);

  // 내 상태가 바뀔 때마다 presence 갱신
  const meKey = JSON.stringify(me);
  useEffect(() => {
    channel?.track(me);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey, channel]);

  // 오래된 채팅 말풍선 지우기
  useEffect(() => {
    const id = setInterval(() => {
      setChats((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, c]) => now - c.at < CHAT_SHOW_MS));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 클릭을 받을 영역(펫, 입력창)을 Rust에 알려준다. 나머지 투명한 곳은 클릭이 뒤로 통과한다.
  useEffect(() => {
    let last = "";
    const id = setInterval(() => {
      const rects = [...document.querySelectorAll("[data-hit]")].map((el) => {
        const r = el.getBoundingClientRect();
        return [r.left, r.top, r.width, r.height];
      });
      const key = JSON.stringify(rects);
      if (key !== last) invoke("set_hit_rects", { rects }).then(() => (last = key));
    }, 200);
    return () => clearInterval(id);
  }, []);

  async function send() {
    const body = draft?.trim();
    if (!body) return setDraft(null);
    if (!s.room) {
      setError("설정에서 방을 만들거나 초대 코드로 들어가 주세요");
      return;
    }
    const { error } = await supabase.rpc("send_message", { p_room: s.room.id, p_sender: s.deviceId, p_sender_name: me.name, p_body: body });
    if (error) return setError("메시지를 보내지 못했어요");
    await channel?.send({ type: "broadcast", event: "chat", payload: { sender_id: s.deviceId, body } });
    if (!channel) setChats((p) => ({ ...p, [s.deviceId]: { sender_id: s.deviceId, body, at: Date.now() } }));
    setDraft(null);
  }

  async function openChat() {
    setError(null);
    setDraft("");
    await getCurrentWindow().setFocus(); // 클릭 통과 창이라 입력하려면 포커스를 가져와야 한다
  }

  // 내 펫: 클릭하면 채팅, 끌면 창 이동
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.MouseEvent) => {
    if (e.button === 0) drag.current = { x: e.screenX, y: e.screenY };
  };
  const onMove = (e: React.MouseEvent) => {
    const d = drag.current;
    if (d && Math.hypot(e.screenX - d.x, e.screenY - d.y) > 4) {
      drag.current = null;
      getCurrentWindow().startDragging();
    }
  };
  const onUp = () => {
    if (drag.current) openChat();
    drag.current = null;
  };

  return (
    <div className="stage" style={{ "--s": scale } as React.CSSProperties}>
      {error && (
        <div className="toast" data-hit onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <div className="row">
        <PetSlot
          peer={me}
          chat={chats[me.id]}
          px={px}
          isMe
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onContextMenu={(e) => {
            e.preventDefault();
            invoke("open_settings");
          }}
        >
          {draft === null ? undefined : (
            <input
              className="chat-input"
              data-hit
              autoFocus
              maxLength={300}
              placeholder={s.room ? "메시지 (Enter 전송, Esc 닫기)" : "먼저 설정에서 방에 들어가요"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setDraft(null);
                // 한글 조합 중 Enter는 글자 확정이므로 전송하지 않는다
                if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
              }}
              onBlur={() => !draft && setDraft(null)}
            />
          )}
        </PetSlot>
        {peers.map((p) => (
          <PetSlot key={p.id} peer={p} chat={chats[p.id]} px={px} />
        ))}
      </div>
    </div>
  );
}

function PetSlot({
  peer,
  chat,
  px,
  isMe,
  children,
  ...handlers
}: {
  peer: PeerState;
  chat?: Chat;
  px: number;
  isMe?: boolean;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const text = chat?.body ?? (peer.status === "typing" ? "…" : null);
  return (
    <div className="slot">
      {children ?? (text && <Bubble text={text} />)}
      <div className="pet" data-hit {...handlers} title={isMe ? "클릭: 채팅 · 끌기: 이동 · 오른쪽 클릭: 설정" : peer.name}>
        <PetCanvas character={peer.character} color={peer.color} image={peer.image} mood={peer.status} px={px} />
      </div>
      <div className="name">{peer.name}</div>
    </div>
  );
}
