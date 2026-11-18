import { invoke } from "@tauri-apps/api/core";
import { PhysicalPosition, PhysicalSize, currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { HATS, HAT_IDS, TAGS, type HatId, type OrnamentId, type SeasonId } from "./decor";
import { wiggleDetector } from "./gestures";
import { Bubble, PetCanvas } from "./Pet";
import { newWalker, stepWalker, type Walker } from "./roam";
import { CHARACTERS } from "./sprites";
import { SeasonFx, Tree, type Ornament } from "./Seasons";
import { WeatherFx, useWeather } from "./WeatherFx";
import type { Mood, Motion, Walk } from "./sprites";
import {
  AWAY_AFTER_MIN,
  EMOTES,
  EMOTE_MOTION,
  PX_DEFAULT,
  REPLIES,
  THROWABLES,
  buildRoster,
  presenceToPeers,
  sanitizeReaction,
  statusLight,
  saveSettings,
  supabase,
  useSettings,
  type Emote,
  type Member,
  type PeerState,
  type Reaction,
  type RosterPet,
  type Throwable,
} from "./state";

/** 화면에 세울 친구 수. 꺼진 친구는 남는 자리에만 */
const MAX_FRIENDS = 12;
/** 켜져 있는 동안 "마지막 접속"을 서버에 남기는 간격 */
const HEARTBEAT_MS = 60_000;
/** 창 높이(보통 크기, 논리 px). 너비는 화면 전체 */
const BASE_H = 280;
/** 펫 한 마리 자리 너비(보통 크기, styles.css .slot과 같다) */
const SLOT_W = 112;
/** 걷는 속도(보통 크기 기준 px/초) */
const WALK_SPEED = 32;
const CHAT_SHOW_MS = 7000;
const MOOD_SHOW_MS = 3000;
const EMOTE_SHOW_MS = 2600;
const PICKER_SHOW_MS = 6000;
const REPLY_SHOW_MS = 8000;
const BIG_SHOW_MS = 2600;
/** 던진 물건이 날아가는 시간 */
const FLIGHT_MS = 900;
/** 열지 않은 선물 상자가 남아 있는 시간 */
const GIFT_KEEP_MS = 3 * 60_000;

type Chat = { sender_id: string; body: string; at: number };
type MoodFx = { kind: Motion; at: number };
type EmoteFx = { emoji: string; from: string; at: number };
/** 날아가는 물건 하나: 화면 좌표 a → b */
type Shot = { key: number; item: Throwable; a: Pt; b: Pt; at: number };
type Pt = { x: number; y: number };

/** 펫 몸통 가운데의 화면 좌표 (없으면 null: 화면에 안 보이는 친구) */
function petCenter(id: string): Pt | null {
  const el = document.querySelector(`[data-peer="${CSS.escape(id)}"] .pet`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.55 };
}
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
  const [bigs, setBigs] = useState<Record<string, { at: number }>>({});
  const [shots, setShots] = useState<Shot[]>([]);
  const [gifts, setGifts] = useState<Record<string, { from: string; hat: HatId; at: number }>>({}); // 받는 사람 → 상자
  const [got, setGot] = useState<{ hat: HatId; from: string } | null>(null); // 내가 연 선물
  const [unread, setUnread] = useState(0); // 조용히 모드에서 안 본 채팅 수
  const [ornaments, setOrnaments] = useState<Ornament[]>([]);
  const [treeOpen, setTreeOpen] = useState(false);
  const [picker, setPicker] = useState<string | null>(null); // 이모티콘을 보낼 친구 id
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // null = 입력창 닫힘
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null); // 구독 완료된 방 채널
  const [dragging, setDragging] = useState(false); // 내 펫을 집어서 끄는 중
  const channelRef = useRef<RealtimeChannel | null>(null);
  channelRef.current = channel;

  useEffect(() => {
    if (!s.name) invoke("open_settings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const px = s.px; // 내 펫 크기
  const scale = px / PX_DEFAULT;
  const [stageW, setStageW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setStageW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

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
    hat: s.hat,
    tag: s.tag,
    px: s.px,
  };
  const meRef = useRef(me);
  meRef.current = me;
  const quietRef = useRef(s.quiet);
  quietRef.current = s.quiet;
  const winter = s.seasons.includes("winter");
  const weather = useWeather(s.weatherOn, s.place);

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
    if (r.kind === "big") {
      setBigs((p) => ({ ...p, [r.target]: { at } }));
      setMoods((p) => ({ ...p, [r.target]: { kind: "wave", at } }));
    }
    if (r.kind === "poke") {
      setEmotes((p) => ({ ...p, [r.target]: { emoji: "❗", from: r.from, at } }));
      setMoods((p) => ({ ...p, [r.target]: { kind: "surprised", at } }));
    }
    if (r.kind === "gift" && r.hat) {
      const hat = r.hat;
      setGifts((p) => ({ ...p, [r.target]: { from: r.from, hat, at } }));
      setMoods((p) => ({ ...p, [r.by]: { kind: "happy", at } }));
    }
    if (r.kind === "open" && r.hat) {
      const hat = r.hat;
      setGifts((p) => {
        const { [r.target]: _opened, ...rest } = p;
        return rest;
      });
      setEmotes((p) => ({ ...p, [r.target]: { emoji: HATS[hat].icon, from: "선물!", at } }));
      setMoods((p) => ({ ...p, [r.target]: { kind: "cheer", at } }));
    }
    if (r.kind === "throw" && r.item) {
      const item = r.item;
      const hit = () => setMoods((p) => ({ ...p, [r.target]: { kind: THROWABLES[item].hit, at: Date.now() } }));
      setMoods((p) => ({ ...p, [r.by]: { kind: "cheer", at } })); // 던진 펫은 신나서 콩콩
      const a = petCenter(r.by);
      const b = petCenter(r.target);
      if (a && b) {
        setShots((p) => [...p, { key: at + Math.random(), item, a, b, at }]);
        setTimeout(hit, FLIGHT_MS); // 닿는 순간 반응
      } else hit();
    }
  }

  /** 반응 보내기: 방에 있으면 모두에게(나 포함) 퍼지고, 혼자면 내 화면에만 */
  function react(target: string, kind: Reaction["kind"], extra: { emoji?: Emote; item?: Throwable; hat?: HatId } = {}) {
    const r: Reaction = { target, by: selfId, from: me.name, kind, ...extra };
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
        // 조용히 모드: 친구 말풍선은 띄우지 않고 개수만 센다 (내용은 설정 창 최근 대화에 남아 있다)
        if (quietRef.current && c.sender_id !== s.deviceId) return setUnread((n) => n + 1);
        setChats((prev) => ({ ...prev, [c.sender_id]: { ...c, at: Date.now() } }));
      })
      .on("broadcast", { event: "tree" }, () => loadTreeRef.current())
      .on("broadcast", { event: "react" }, ({ payload }) => {
        const r = sanitizeReaction(payload);
        if (r) applyReaction(r);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setChannel(ch);
          // 인터넷이 잠깐 끊겼다 다시 붙어도(맥 잠자기 포함) 같은 채널 객체라 위 state가 안 바뀐다.
          // 그래서 여기서 바로 "나 여기 있어"를 다시 보낸다. 안 하면 켜져 있어도 친구 화면에서 사라진다.
          ch.track(meRef.current);
        }
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
      channelRef.current?.track(meRef.current); // 혹시 빠졌어도 1분마다 다시 알린다
      setNow(Date.now());
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, s.deviceId, look]);

  const roster = buildRoster(peers, members, s.deviceId, MAX_FRIENDS, now);
  const winScale = Math.max(px, ...roster.map((p) => p.px)) / PX_DEFAULT;

  // 창: 지금 모니터의 작업 영역(Dock·작업 표시줄 제외) 바닥에 화면 너비 전체로 깐다. 높이는 제일 큰 펫에 맞춘다.
  useEffect(() => {
    const place = async () => {
      const w = getCurrentWindow();
      const mon = await currentMonitor();
      if (!mon) return;
      const a = mon.workArea;
      const h = Math.round(BASE_H * winScale * mon.scaleFactor);
      await w.setSize(new PhysicalSize(a.size.width, h));
      await w.setPosition(new PhysicalPosition(a.position.x, a.position.y + a.size.height - h));
    };
    place();
    const un = getCurrentWindow().onScaleChanged(() => place()); // 해상도가 다른 모니터로 옮겨지면 다시
    return () => void un.then((f) => f());
  }, [winScale]);


  // 펫마다 화면 바닥을 따라 따로 걷는다 (0.1초마다). 반응 중·채팅 중·자리 비움이면 제자리.
  const walkers = useRef(new Map<string, Walker>());
  const [, setWalkTick] = useState(0);
  const walkState = useRef({ me, roster, moods, bigs, gifts, picker, busyMe: false });
  walkState.current = { me, roster, moods, bigs, gifts, picker, busyMe: draft !== null || !!replyTo || !!got || dragging };
  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const t = performance.now();
      const dt = Math.min((t - last) / 1000, 0.5);
      last = t;
      const now = Date.now();
      const st = walkState.current;
      const pets: RosterPet[] = [{ ...st.me, online: true, lastSeen: null }, ...st.roster];
      for (const [i, p] of pets.entries()) {
        const k = p.px / PX_DEFAULT; // 펫마다 크기가 달라 자리 폭과 걸음도 다르다
        const maxX = Math.max(0, window.innerWidth - SLOT_W * k);
        let w = walkers.current.get(p.id);
        // 처음 보는 펫: 나는 오른쪽, 친구는 고르게 흩어서
        if (!w) walkers.current.set(p.id, (w = newWalker(i === 0 ? maxX * 0.85 : ((i * 0.37) % 0.8) * maxX, now)));
        const mine = p.id === st.me.id;
        const canWalk = p.online && p.status === "idle" && !st.moods[p.id] && !st.bigs[p.id] && !st.gifts[p.id] && st.picker !== p.id && !(mine && st.busyMe);
        if (mine && dragging) continue; // 끄는 중엔 손이 정한다
        walkers.current.set(p.id, stepWalker(w, dt, now, maxX, WALK_SPEED * k, canWalk));
      }
      setWalkTick((n) => (n + 1) % 1_000_000);
    }, 100);
    return () => clearInterval(id);
  }, [dragging]);
  const posOf = (id: string, petPx: number) => {
    const k = petPx / PX_DEFAULT;
    const w = walkers.current.get(id);
    const x = w?.x ?? 0;
    const edge = x < 150 * k ? " near-left" : x > stageW - (SLOT_W + 150) * k ? " near-right" : "";
    return { x, walk: w ? { moving: w.moving, faceLeft: w.faceLeft } : null, edge };
  };

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
      setBigs((p) => prune(p, BIG_SHOW_MS, now));
      setGifts((p) => prune(p, GIFT_KEEP_MS, now));
      setShots((p) => (p.some((x) => now - x.at > FLIGHT_MS + 700) ? p.filter((x) => now - x.at <= FLIGHT_MS + 700) : p));
    }, 250);
    return () => clearInterval(id);
  }, []);

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

  // 내 펫: 클릭하면 채팅, 더블클릭하면 크게 인사, 집어서 끌면 옮기기(좌우로 흔들면 어지러워함)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onTap() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      react(me.id, "big");
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        openChat();
      }, 260);
    }
  }
  const press = useRef<{ x: number; offset: number; moved: boolean } | null>(null);
  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    press.current = { x: e.clientX, offset: e.clientX - (walkers.current.get(me.id)?.x ?? 0), moved: false };
    setDragging(true);
    // 펫 밖으로 커서가 나가도 놓치지 않게 잠깐 창 전체가 클릭을 받는다
    invoke("set_hit_rects", { rects: [[0, 0, window.innerWidth, window.innerHeight]] });
  };
  useEffect(() => {
    if (!dragging) return;
    const shaken = wiggleDetector({ need: 4, windowMs: 1500, minStep: 6, cooldownMs: 3000 });
    const move = (e: MouseEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.moved && Math.abs(e.clientX - p.x) > 4) p.moved = true;
      if (!p.moved) return;
      const w = walkers.current.get(selfId);
      const maxX = Math.max(0, window.innerWidth - SLOT_W * scale);
      const x = Math.min(Math.max(e.clientX - p.offset, 0), maxX);
      if (w) walkers.current.set(selfId, { ...w, x, target: x, restUntil: Date.now() + 6000, moving: true, faceLeft: e.movementX < 0 });
      if (shaken(e.clientX, Date.now())) reactRef.current(selfId, "dizzy");
    };
    const up = () => {
      const p = press.current;
      press.current = null;
      setDragging(false);
      const w = walkers.current.get(selfId);
      if (w) walkers.current.set(selfId, { ...w, moving: false });
      if (p && !p.moved) onTapRef.current();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  // 친구 펫: 한 번 누르면 이모티콘·던지기 창, 0.7초 안에 세 번 누르면 콕 찌르기
  const taps = useRef(new Map<string, number[]>());
  function onFriendClick(id: string) {
    const t = Date.now();
    const recent = [...(taps.current.get(id) ?? []).filter((x) => t - x < 700), t];
    taps.current.set(id, recent);
    if (recent.length >= 3) {
      taps.current.set(id, []);
      setPicker(null);
      react(id, "poke");
    } else if (recent.length === 1) setPicker(picker === id ? null : id);
  }

  const fx = (id: string) => ({ mood: moods[id]?.kind, emote: emotes[id], big: !!bigs[id], gift: gifts[id] });

  // 같이 꾸미는 트리 (겨울 꾸미기를 켰을 때만)
  async function loadTree() {
    if (!roomId || !winter) return;
    const { data } = await supabase.rpc("list_ornaments", { p_room: roomId });
    if (data) setOrnaments(data as Ornament[]);
  }
  const loadTreeRef = useRef(loadTree);
  loadTreeRef.current = loadTree;
  useEffect(() => {
    setOrnaments([]);
    loadTree();
    const id = setInterval(loadTree, HEARTBEAT_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, winter]);
  async function hang(ornament: OrnamentId) {
    setTreeOpen(false);
    if (!roomId) return setError("트리는 방에 들어가야 같이 꾸밀 수 있어요");
    const { data, error } = await supabase.rpc("add_ornament", { p_room: roomId, p_ornament: ornament, p_name: me.name });
    if (error) return setError("장식을 달지 못했어요");
    if (data === null) return setError("트리가 꽉 찼어요! 설정에서 비울 수 있어요");
    await loadTree();
    channel?.send({ type: "broadcast", event: "tree", payload: {} });
  }

  // 내 펫 위에 잠깐 뜨는 것: 입력창 > 답장 추천 > 선물 열어 본 결과
  const gotChip = got ? (
    <div className="picker replies" data-hit role="dialog" aria-label="받은 선물">
      <span className="reply-label">
        {HATS[got.hat].icon} {HATS[got.hat].name} 받았어요! ({got.from})
      </span>
      <button
        className="wide"
        onClick={() => {
          saveSettings({ hat: got.hat });
          setGot(null);
        }}
      >
        써보기
      </button>
      <button className="wide" onClick={() => setGot(null)}>
        닫기
      </button>
    </div>
  ) : undefined;

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
          now={now}
          labelPos={s.labelPos}
          {...fx(me.id)}
          {...posOf(me.id, px)}
          title="클릭: 채팅 · 더블클릭: 크게 인사 · 끌기: 옮기기(흔들면 어지러워해요) · 머리 문지르기: 쓰다듬기 · 오른쪽 클릭: 설정"
          onMouseDown={onDown}
          onMouseMove={(e) => onPetHover(me.id, e)}
          onContextMenu={(e) => {
            e.preventDefault();
            invoke("open_settings");
          }}
          onOpenGift={(g) => {
            setGot({ hat: g.hat, from: g.from });
            react(me.id, "open", { hat: g.hat });
          }}
          badge={
            unread > 0 ? (
              <button
                className="unread"
                data-hit
                title="조용히 모드 동안 온 채팅 — 눌러서 모아 보기"
                onClick={() => {
                  setUnread(0);
                  invoke("open_settings");
                }}
              >
                💬 {unread}
              </button>
            ) : undefined
          }
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
                      react(replyTo.by, "emote", { emoji });
                      setReplyTo(null);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : (
              gotChip
            )
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
            now={now}
            labelPos={s.labelPos}
            {...fx(p.id)}
            {...posOf(p.id, p.px)}
            title={p.online ? `${p.name} · 클릭: 이모티콘·던지기 · 세 번 클릭: 콕 찌르기 · 머리 문지르기: 쓰다듬기` : `${p.name} · 오프라인`}
            onClick={p.online ? () => onFriendClick(p.id) : undefined}
            onMouseMove={p.online ? (e) => onPetHover(p.id, e) : undefined}
          >
            {picker === p.id ? (
              <div className="picker" data-hit role="toolbar" aria-label={`${p.name}에게 이모티콘 보내기, 던지기`}>
                {EMOTES.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      react(p.id, "emote", { emoji });
                      setPicker(null);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
                <span className="reply-label">던지기 · 선물</span>
                {(Object.keys(THROWABLES) as Throwable[]).map((item) => (
                  <button
                    key={item}
                    title={THROWABLES[item].name}
                    aria-label={`${THROWABLES[item].name} 던지기`}
                    onClick={() => {
                      react(p.id, "throw", { item });
                      setPicker(null);
                    }}
                  >
                    {item}
                  </button>
                ))}
                <button
                  title="선물 상자 (안에 랜덤 모자)"
                  aria-label="선물 상자 보내기"
                  onClick={() => {
                    react(p.id, "gift", { hat: HAT_IDS[Math.floor(Math.random() * HAT_IDS.length)] });
                    setPicker(null);
                  }}
                >
                  🎁
                </button>
              </div>
            ) : undefined}
          </PetSlot>
        ))}
        {winter && (
          <Tree ornaments={ornaments} px={px} open={treeOpen} onToggle={() => setTreeOpen((v) => !v)} onHang={hang} />
        )}
      </div>
      {dragging && <div className="drag-catcher" data-hit aria-hidden />}
      <SeasonFx seasons={s.seasons as SeasonId[]} />
      <WeatherFx weather={weather} scale={scale} />
      {shots.map((shot) => (
        <Flying key={shot.key} shot={shot} />
      ))}
    </div>
  );
}

/** 포물선으로 날아가는 물건 + 지나간 자리 점선 */
function Flying({ shot }: { shot: Shot }) {
  const ref = useRef<HTMLDivElement>(null);
  const { a, b } = shot;
  const peak = Math.max(24, Math.min(a.y, b.y) - 70 - Math.abs(b.x - a.x) * 0.15); // 멀수록 높이, 창 위로는 안 넘게
  const c = { x: (a.x + b.x) / 2, y: peak * 2 - (a.y + b.y) / 2 }; // 2차 베지어 조절점(꼭대기가 peak)
  const at = (k: number) => ({
    x: (1 - k) ** 2 * a.x + 2 * (1 - k) * k * c.x + k ** 2 * b.x,
    y: (1 - k) ** 2 * a.y + 2 * (1 - k) * k * c.y + k ** 2 * b.y,
  });
  useEffect(() => {
    const frames = Array.from({ length: 21 }, (_, i) => {
      const p = at(i / 20);
      // 맞는 순간(마지막 칸) 사라진다
      return { transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${i * 36}deg)`, opacity: i === 20 ? 0 : 1 };
    });
    ref.current?.animate(frames, { duration: FLIGHT_MS, easing: "linear", fill: "forwards" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <svg className="trail" aria-hidden>
        <path d={`M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`} />
      </svg>
      <div ref={ref} className="flying" aria-hidden>
        {shot.item}
      </div>
    </>
  );
}

function PetSlot({
  peer,
  chat,
  now,
  labelPos,
  mood,
  emote,
  big,
  gift,
  onOpenGift,
  badge,
  x,
  walk,
  edge,
  children,
  ...handlers
}: {
  peer: RosterPet;
  chat?: Chat;
  now: number;
  labelPos: "above" | "below";
  /** 흔들기/쓰다듬기 반응이 있으면 잠깐 이 표정 */
  mood?: MoodFx["kind"];
  emote?: EmoteFx;
  /** 더블클릭 크게 인사 중 */
  big?: boolean;
  /** 이 펫 앞에 놓인 선물 상자 */
  gift?: { from: string; hat: HatId };
  /** 있으면 상자를 눌러 열 수 있다 (받은 사람 본인만) */
  onOpenGift?: (g: { from: string; hat: HatId }) => void;
  /** 이름표 옆 작은 버튼 (조용히 모드의 안 읽은 채팅 수) */
  badge?: React.ReactNode;
  /** 화면 위 위치(px)와 걷는 모습 */
  x: number;
  walk: Walk | null;
  /** 화면 끝 가까이면 위에 뜨는 칸을 안쪽으로 맞춘다 */
  edge: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const text = chat?.body ?? (peer.status === "typing" ? "…" : null);
  const shown: Mood = mood ?? (peer.online ? peer.status : "sleep"); // 오프라인은 납작하게 잠듦
  const light = statusLight(peer, now);
  // 이름표: 상태 불 + 이름 (+ 자리 비움/바쁨/마지막 접속)
  const tag = peer.tag ? TAGS[peer.tag] : null;
  // 모자가 머리 위로 솟는 경우(머리가 맨 윗줄인 캐릭터·그림)만 이름표를 덜 내린다
  const hatTall = !!peer.hat && (!!peer.image || CHARACTERS[peer.character].headY < 3);
  const label = (
    <div className={`name ${labelPos}`} title={light.text || "온라인"}>
      <span className={`light ${light.color}`} aria-hidden />
      {tag && <span aria-hidden>{tag.icon}</span>}
      <span style={tag ? { color: tag.color } : undefined}>{peer.name}</span>
      {light.text && <span className="state">{light.text}</span>}
      <span className="sr-only">{light.text || "온라인"}</span>
      {badge}
    </div>
  );
  return (
    <div
      className={`slot${peer.online ? "" : " offline"}${big ? " big" : ""}${hatTall ? " hatted" : ""}${edge}`}
      data-peer={peer.id}
      style={{ left: x, "--s": peer.px / PX_DEFAULT } as React.CSSProperties}
    >
      {children ?? (text && <Bubble text={text} />)}
      {emote && (
        <div className="emote" key={emote.at} aria-live="polite">
          <span className="emoji">{emote.emoji}</span>
          <span className="from">{emote.from}</span>
        </div>
      )}
      {labelPos === "above" && label}
      <div className="pet" data-hit {...handlers}>
        <PetCanvas
          character={peer.character}
          color={peer.color}
          image={peer.image}
          mood={shown}
          px={peer.px}
          walk={walk}
          hat={peer.hat}
        />
        {gift && (
          <button
            className="gift"
            data-hit
            disabled={!onOpenGift}
            title={onOpenGift ? `${gift.from}의 선물 — 눌러서 열기` : `${gift.from}가 보낸 선물`}
            aria-label={onOpenGift ? `${gift.from}의 선물 열기` : `${gift.from}가 보낸 선물`}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpenGift?.(gift);
            }}
          >
            🎁
          </button>
        )}
      </div>
      {labelPos === "below" && label}
    </div>
  );
}
