import { invoke } from "@tauri-apps/api/core";
import { PhysicalPosition, PhysicalSize, currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { wiggleDetector } from "./gestures";
import { Bubble, PetCanvas } from "./Pet";
import type { Mood, Motion } from "./sprites";
import {
  AWAY_AFTER_MIN,
  EMOTES,
  EMOTE_MOTION,
  PX_DEFAULT,
  REPLIES,
  buildRoster,
  presenceToPeers,
  sanitizeReaction,
  statusLight,
  supabase,
  useSettings,
  type Emote,
  type Member,
  type PeerState,
  type Reaction,
  type RosterPet,
} from "./state";

/** 한 줄에 세울 친구 수(창 너비 기준). 꺼진 친구는 남는 자리에만 */
const MAX_FRIENDS = 5;
/** 켜져 있는 동안 "마지막 접속"을 서버에 남기는 간격 */
const HEARTBEAT_MS = 60_000;
/** 보통 크기일 때 창 크기(논리 px). tauri.conf.json의 main 창과 같다. */
const BASE_WIN = { w: 720, h: 240 };
const CHAT_SHOW_MS = 7000;
const MOOD_SHOW_MS = 3000;
const EMOTE_SHOW_MS = 2600;
const PICKER_SHOW_MS = 6000;
const REPLY_SHOW_MS = 8000;

type Chat = { sender_id: string; body: string; at: number };
type MoodFx = { kind: Motion; at: number };
type EmoteFx = { emoji: Emote; from: string; at: number };
/** 받은 이모티콘에 답장할 상대 */
type ReplyTo = { by: string; from: string; emoji: Emote };

/** 시간이 지난 항목을 지운다. 바뀐 게 없으면 같은 객체를 돌려줘 다시 그리지 않는다. */
function prune<T extends { at: number }>(rec: Record<string, T>, ms: number, now: number) {
  const next = Object.fromEntries(Object.entries(rec).filter(([, v]) => now - v.at < ms));
  return Object.keys(next).length === Object.keys(rec).length ? rec : next;
}

export function Overlay() {
  const s = useSettings();
  const [idleMin, setIdleMin] = useState(0);
  const [peers, setPeers] = useState<PeerState[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [now, setNow] = useState(() => Date.now()); // "3분 전" 같은 글자를 새로 고치는 시계
  const [chats, setChats] = useState<Record<string, Chat>>({});
  const [moods, setMoods] = useState<Record<string, MoodFx>>({});
  const [emotes, setEmotes] = useState<Record<string, EmoteFx>>({});
  const [picker, setPicker] = useState<string | null>(null); // 이모티콘을 보낼 친구 id
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // null = 입력창 닫힘
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null); // 구독 완료된 방 채널

  // 처음 실행: 화면 오른쪽 아래로. 이후엔 window-state 플러그인이 위치를 기억한다.
  useEffect(() => {
    if (!s.name) invoke("open_settings");
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

  // 자리 비움(5분) / 잠수(30분): 키보드·마우스 입력이 없던 시간
  useEffect(() => {
    const check = () => invoke<number>("idle_seconds").then((sec) => setIdleMin(Math.floor(sec / 60)));
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);

  const away = idleMin >= AWAY_AFTER_MIN;
  const busyRef = useRef(s.busy);
  busyRef.current = s.busy;

  const me: PeerState = {
    id: s.deviceId,
    name: s.name || "나",
    character: s.character,
    color: s.color,
    image: s.image,
    status: draft ? "typing" : away ? "away" : "idle",
    busy: s.busy,
    idleMin: away ? idleMin : 0, // 자리에 있을 땐 0으로 둬서 presence를 1분마다 다시 보내지 않는다
  };

  const selfId = s.deviceId;
  function applyReaction(r: Reaction) {
    const at = Date.now();
    if (r.kind === "emote" && r.emoji) {
      const emoji = r.emoji;
      setEmotes((p) => ({ ...p, [r.target]: { emoji, from: r.from, at } })); // 받은 펫 위로 이모티콘
      setMoods((p) => ({ ...p, [r.by]: { kind: EMOTE_MOTION[emoji], at } })); // 보낸 펫은 몸짓
      if (r.target === selfId && r.by !== selfId && !busyRef.current) setReplyTo({ by: r.by, from: r.from, emoji });
    }
    if (r.kind === "dizzy" || r.kind === "happy") setMoods((p) => ({ ...p, [r.target]: { kind: r.kind as Motion, at } }));
  }

  /** 반응 보내기: 방에 있으면 모두에게(나 포함) 퍼지고, 혼자면 내 화면에만 */
  function react(target: string, kind: Reaction["kind"], emoji?: Emote) {
    const r: Reaction = { target, by: selfId, from: me.name, kind, emoji };
    if (channel) channel.send({ type: "broadcast", event: "react", payload: r });
    else applyReaction(r);
  }
  const reactRef = useRef(react);
  reactRef.current = react;

  // 방 연결: presence(상태) + broadcast(채팅, 반응)
  const roomId = s.room?.id;
  useEffect(() => {
    setPeers([]);
    setMembers([]);
    if (!roomId) return;
    const ch = supabase.channel(`room:${roomId}`, { config: { presence: { key: s.deviceId }, broadcast: { self: true } } });
    ch.on("presence", { event: "sync" }, () => setPeers(presenceToPeers(ch.presenceState<PeerState>() as Record<string, PeerState[]>, s.deviceId)))
      .on("presence", { event: "leave" }, () => loadRef.current()) // 누가 나가면 마지막 접속 시각을 새로 받아 온다
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const c = payload as { sender_id: string; body: string };
        setChats((prev) => ({ ...prev, [c.sender_id]: { ...c, at: Date.now() } }));
      })
      .on("broadcast", { event: "react" }, ({ payload }) => {
        const r = sanitizeReaction(payload);
        if (r) applyReaction(r);
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

  // 방 멤버(꺼진 친구 포함)와 마지막 접속 시각
  async function loadMembers() {
    if (!roomId) return;
    const { data } = await supabase.rpc("list_members", { p_room: roomId });
    if (data) setMembers(data as Member[]);
  }
  const loadRef = useRef(loadMembers);
  loadRef.current = loadMembers;

  // 켜져 있는 동안: 1분마다 "나 여기 있어" 남기고, 멤버 목록과 시계를 새로 고친다
  const look = JSON.stringify([me.name, me.character, me.color, me.image]);
  useEffect(() => {
    if (!roomId) return;
    const beat = async () => {
      await supabase.rpc("touch_member", {
        p_room: roomId,
        p_device: s.deviceId,
        p_name: me.name,
        p_character: me.character,
        p_color: me.color,
        p_image: me.image,
      });
      await loadRef.current();
      setNow(Date.now());
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, s.deviceId, look]);

  const roster = buildRoster(peers, members, s.deviceId, MAX_FRIENDS);

  // 내 상태가 바뀔 때마다 presence 갱신
  const meKey = JSON.stringify(me);
  useEffect(() => {
    channel?.track(me);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey, channel]);

  // 오래된 말풍선, 반응 지우기
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setChats((p) => prune(p, CHAT_SHOW_MS, now));
      setMoods((p) => prune(p, MOOD_SHOW_MS, now));
      setEmotes((p) => prune(p, EMOTE_SHOW_MS, now));
    }, 250);
    return () => clearInterval(id);
  }, []);

  // 흔들기: 내 펫을 끌고 좌우로 빠르게 흔들면(창이 왔다 갔다) 어지러워한다
  useEffect(() => {
    const shaken = wiggleDetector({ need: 4, windowMs: 1500, minStep: 6, cooldownMs: 3000 });
    const un = getCurrentWindow().onMoved(({ payload }) => {
      if (shaken(payload.x, Date.now())) reactRef.current(s.deviceId, "dizzy");
    });
    return () => void un.then((f) => f());
  }, [s.deviceId]);

  // 쓰다듬기: 펫 머리(위쪽 60%) 위에서 버튼을 누르지 않고 좌우로 문지르면 좋아한다
  const petting = useRef(new Map<string, ReturnType<typeof wiggleDetector>>());
  function onPetHover(target: string, e: React.MouseEvent<HTMLDivElement>) {
    if (e.buttons !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientY - r.top > r.height * 0.6) return;
    let d = petting.current.get(target);
    if (!d) petting.current.set(target, (d = wiggleDetector({ need: 3, windowMs: 1200, minStep: 4, cooldownMs: 2500 })));
    if (d(e.clientX, Date.now())) react(target, "happy");
  }

  // 이모티콘 고르는 창과 답장 추천은 잠시 뒤 저절로 닫힌다 (투명 창이라 바깥 클릭을 받을 수 없다)
  useEffect(() => {
    if (!picker) return;
    const id = setTimeout(() => setPicker(null), PICKER_SHOW_MS);
    return () => clearTimeout(id);
  }, [picker]);
  useEffect(() => {
    if (!replyTo) return;
    const id = setTimeout(() => setReplyTo(null), REPLY_SHOW_MS);
    return () => clearTimeout(id);
  }, [replyTo]);

  // 클릭을 받을 영역(펫, 입력창 등)을 Rust에 알려준다. 나머지 투명한 곳은 클릭이 뒤로 통과한다.
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
    setPicker(null);
    setDraft("");
    await getCurrentWindow().setFocus(); // 클릭 통과 창이라 입력하려면 포커스를 가져와야 한다
  }

  // 내 펫: 클릭하면 채팅, 끌면 창 이동
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.MouseEvent) => {
    if (e.button === 0) drag.current = { x: e.screenX, y: e.screenY };
  };
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d && Math.hypot(e.screenX - d.x, e.screenY - d.y) > 4) {
      drag.current = null;
      getCurrentWindow().startDragging();
    }
    onPetHover(me.id, e);
  };
  const onUp = () => {
    if (drag.current) openChat();
    drag.current = null;
  };

  const fx = (id: string) => ({ mood: moods[id]?.kind, emote: emotes[id] });

  return (
    <div className="stage" style={{ "--s": scale } as React.CSSProperties}>
      {error && (
        <div className="toast" data-hit onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <div className="row">
        <PetSlot
          peer={{ ...me, online: true, lastSeen: null }}
          chat={chats[me.id]}
          px={px}
          now={now}
          labelPos={s.labelPos}
          {...fx(me.id)}
          title="클릭: 채팅 · 끌기: 이동(흔들면 어지러워해요) · 머리 문지르기: 쓰다듬기 · 오른쪽 클릭: 설정"
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onContextMenu={(e) => {
            e.preventDefault();
            invoke("open_settings");
          }}
        >
          {draft === null ? (
            replyTo ? (
              <div className="picker replies" data-hit role="toolbar" aria-label={`${replyTo.from}에게 답장`}>
                <span className="reply-label">
                  {replyTo.from} {replyTo.emoji} → 답장
                </span>
                {REPLIES[replyTo.emoji].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      react(replyTo.by, "emote", emoji);
                      setReplyTo(null);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : undefined
          ) : (
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
        {roster.map((p) => (
          <PetSlot
            key={p.id}
            peer={p}
            chat={chats[p.id]}
            px={px}
            now={now}
            labelPos={s.labelPos}
            {...fx(p.id)}
            title={p.online ? `${p.name} · 클릭: 이모티콘 보내기 · 머리 문지르기: 쓰다듬기` : `${p.name} · 오프라인`}
            onClick={p.online ? () => setPicker(picker === p.id ? null : p.id) : undefined}
            onMouseMove={p.online ? (e) => onPetHover(p.id, e) : undefined}
          >
            {picker === p.id ? (
              <div className="picker" data-hit role="toolbar" aria-label={`${p.name}에게 이모티콘 보내기`}>
                {EMOTES.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      react(p.id, "emote", emoji);
                      setPicker(null);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : undefined}
          </PetSlot>
        ))}
      </div>
    </div>
  );
}

function PetSlot({
  peer,
  chat,
  px,
  now,
  labelPos,
  mood,
  emote,
  children,
  ...handlers
}: {
  peer: RosterPet;
  chat?: Chat;
  px: number;
  now: number;
  labelPos: "above" | "below";
  /** 흔들기/쓰다듬기 반응이 있으면 잠깐 이 표정 */
  mood?: MoodFx["kind"];
  emote?: EmoteFx;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const text = chat?.body ?? (peer.status === "typing" ? "…" : null);
  const shown: Mood = mood ?? peer.status;
  const light = statusLight(peer, now);
  // 이름표: 상태 불 + 이름 (+ 자리 비움/바쁨/마지막 접속)
  const label = (
    <div className={`name ${labelPos}`} title={light.text || "온라인"}>
      <span className={`light ${light.color}`} aria-hidden />
      {peer.name}
      {light.text && <span className="state">{light.text}</span>}
      <span className="sr-only">{light.text || "온라인"}</span>
    </div>
  );
  return (
    <div className={`slot${peer.online ? "" : " offline"}`}>
      {children ?? (text && <Bubble text={text} />)}
      {emote && (
        <div className="emote" key={emote.at} aria-live="polite">
          <span className="emoji">{emote.emoji}</span>
          <span className="from">{emote.from}</span>
        </div>
      )}
      {labelPos === "above" && label}
      <div className="pet" data-hit {...handlers}>
        <PetCanvas character={peer.character} color={peer.color} image={peer.image} mood={shown} px={px} />
      </div>
      {labelPos === "below" && label}
    </div>
  );
}
