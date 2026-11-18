import { invoke } from "@tauri-apps/api/core";
import { Menu } from "@tauri-apps/api/menu";
import { PhysicalPosition, PhysicalSize, availableMonitors, currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { arrivals, notify, shouldNotifyChat, type Presence } from "./notify";
import { allHere, holidayOn, isBirthday, isFriday, offTimeHit, onceToday } from "./events";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useEffect, useRef, useState } from "react";
import { HATS, HAT_IDS, TAGS, type HatId, type OrnamentId, type SeasonId } from "./decor";
import { FOODS, LUNCH, RPS, VOTE_MS, rpsWinner, sanitizeGame, spin, tally, type Food, type GameMsg, type Rps } from "./games";
import { wiggleDetector } from "./gestures";
import { Bubble, PetCanvas } from "./Pet";
import { newWalker, perchFrom, stepRoam, type Perch, type Walker } from "./roam";
import { CHARACTERS } from "./sprites";
import { SeasonFx, Tree, type Ornament } from "./Seasons";
import { WeatherFx, useWeather } from "./WeatherFx";
import type { Mood, Motion, Walk } from "./sprites";
import {
  AWAY_AFTER_MIN,
  EMOTES,
  EMOTE_MOTION,
  PX_DEFAULT,
  PX_MAX,
  PX_MIN,
  percentOf,
  sanitizeChat,
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
/** 새 버전 확인 간격 */
const UPDATE_CHECK_MS = 6 * 60 * 60_000;

type Chat = { sender_id: string; body: string; at: number };
type MoodFx = { kind: Motion; at: number };
type EmoteFx = { emoji: string; from: string; at: number };
/** 날아가는 물건 하나: 화면 좌표 a → b */
type Shot = { key: number; item: string; a: Pt; b: Pt; at: number };
type Message = { id: number; sender_id: string; sender_name: string; body: string; created_at: string };
type Vote = { id: string; by: string; from: string; options: string[]; endsAt: number; votes: Record<string, string>; result?: { winner: string; tally: Record<string, number> } };
/** 공을 받을 수 있는 시간 */
const CATCH_MS = 1800;
const newId = () => Math.random().toString(36).slice(2, 10);
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
  // 놀이
  const [rpsAsk, setRpsAsk] = useState<{ target: string; name: string } | null>(null); // 내가 낼 손 고르는 중
  const [rpsIncoming, setRpsIncoming] = useState<{ id: string; by: string; from: string; theirs: Rps } | null>(null);
  const [catchBall, setCatchBall] = useState<{ id: string; by: string; from: string; rally: number } | null>(null);
  const [vote, setVote] = useState<Vote | null>(null);
  const [spinning, setSpinning] = useState<string | null>(null); // 룰렛이 돌며 보여주는 메뉴
  const [miniLog, setMiniLog] = useState<Message[] | null>(null); // 최근 대화 (열려 있으면)
  const [treeOpen, setTreeOpen] = useState(false);
  const [picker, setPicker] = useState<string | null>(null); // 이모티콘을 보낼 친구 id
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // null = 입력창 닫힘
  const [error, setError] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null); // 새 버전이 있으면
  const [updating, setUpdating] = useState<string | null>(null); // 받는 중 진행 글자
  const [channel, setChannel] = useState<RealtimeChannel | null>(null); // 구독 완료된 방 채널
  const [dragging, setDragging] = useState(false); // 내 펫을 집어서 끄는 중
  const [lift, setLift] = useState(0); // 내 펫을 바닥에서 들어 올린 높이(px)
  const [falling, setFalling] = useState(false);
  // 이벤트: 꽃가루와 잠깐 뜨는 인사
  const [confettiAt, setConfettiAt] = useState(0);
  const [eventToast, setEventToast] = useState<{ text: string; at: number } | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  channelRef.current = channel;
  // 실시간 연결이 죽으면(잠자기, 와이파이 끊김) 채널을 새로 만든다. 이 숫자를 올리면 방 연결을 다시 한다.
  const [reconnect, setReconnect] = useState(0);
  const reconnectSoon = () => setReconnect((n) => n + 1);
  /** 실시간 방 연결이 살아 있을 때만 그 채널. 아니면 null (보낼 건 내 화면에 바로 보이고, 연결을 다시 한다) */
  const live = () => (channelRef.current?.state === "joined" ? channelRef.current : null);
  /** broadcast 보내기. 연결이 죽었거나 안 가면 fallback(내 화면에만)을 하고 다시 연결한다 */
  const broadcast = (event: string, payload: unknown, fallback: () => void) => {
    const ch = live();
    if (!ch) {
      fallback();
      if (channelRef.current) reconnectSoon();
      return;
    }
    ch.send({ type: "broadcast", event, payload }).then((r) => {
      if (r === "ok") return;
      fallback();
      reconnectSoon();
    });
  };

  useEffect(() => {
    if (!s.name) invoke("open_settings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 자동 업데이트: 켤 때와 6시간마다 새 버전을 확인한다 (못 하면 조용히 넘어간다)
  useEffect(() => {
    const look = () =>
      check()
        .then((u) => u && setUpdate(u))
        .catch(() => {});
    look();
    const id = setInterval(look, UPDATE_CHECK_MS);
    return () => clearInterval(id);
  }, []);
  async function installUpdate() {
    if (!update) return;
    try {
      let total = 0;
      let got = 0;
      setUpdating("받는 중…");
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        if (e.event === "Progress") {
          got += e.data.chunkLength;
          if (total) setUpdating(`받는 중 ${Math.round((got / total) * 100)}%`);
        }
        if (e.event === "Finished") setUpdating("설치 중…");
      });
      await relaunch();
    } catch {
      setUpdating(null);
      setError("업데이트하지 못했어요. 잠시 뒤 다시 해 주세요");
    }
  }

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
    hatOffset: s.hatOffset,
    hatScale: s.hatScale,
    tag: s.tag,
    px: s.px,
    msg: s.statusMsg,
    bday: s.birthday,
  };
  const meRef = useRef(me);
  meRef.current = me;
  const quietRef = useRef(s.quiet);
  quietRef.current = s.quiet;
  // 알림: 채팅이 오면 보낸 친구 이름이 필요하다 (방 연결 콜백 안에서 최신 값을 읽는다)
  const notifyRef = useRef({ chat: s.notifyChat, online: s.notifyOnline });
  notifyRef.current = { chat: s.notifyChat, online: s.notifyOnline };
  const namesRef = useRef(new Map<string, string>());
  const chatNotifiedAt = useRef(new Map<string, number>());
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
    if (r.kind === "bday") {
      setEmotes((p) => ({ ...p, [r.target]: { emoji: "🎉", from: `${r.from}: 생일 축하해!`, at } }));
      setMoods((p) => ({ ...p, [r.target]: { kind: "cheer", at }, [r.by]: { kind: "cheer", at } }));
      if (r.target === selfId) setConfettiAt(at);
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
    broadcast("react", r, () => applyReaction(r));
  }
  const reactRef = useRef(react);
  reactRef.current = react;

  /** 놀이 신호 보내기: 방에 있으면 모두에게(나 포함), 혼자면 내 화면에만 */
  function sendGame(m: GameMsg) {
    broadcast("game", m, () => applyGame(m));
  }
  const sendGameRef = useRef(sendGame);
  sendGameRef.current = sendGame;
  const applyGameRef = useRef<(m: GameMsg) => void>(() => {});

  function applyGame(m: GameMsg) {
    const at = Date.now();
    switch (m.t) {
      case "feed": // 냠냠
        setEmotes((p) => ({ ...p, [m.target]: { emoji: m.food, from: m.by === m.target ? "냠냠!" : `${m.from}가 준 간식`, at } }));
        setMoods((p) => ({ ...p, [m.target]: { kind: "happy", at } }));
        break;
      case "rps":
        if (m.target === selfId) setRpsIncoming({ id: m.id, by: m.by, from: m.from, theirs: m.choice });
        setEmotes((p) => ({ ...p, [m.by]: { emoji: "✊✌️✋", from: "가위바위보!", at } }));
        break;
      case "rpsAns": {
        // by = 받은 사람(답한 쪽), target = 신청한 사람
        const w = rpsWinner(m.theirs, m.choice);
        setEmotes((p) => ({ ...p, [m.target]: { emoji: RPS[m.theirs], from: w === 1 ? "이겼다!" : w === 2 ? "졌다…" : "비김", at }, [m.by]: { emoji: RPS[m.choice], from: w === 2 ? "이겼다!" : w === 1 ? "졌다…" : "비김", at } }));
        setMoods((p) => ({
          ...p,
          [m.target]: { kind: w === 0 ? "surprised" : w === 1 ? "cheer" : "sad", at },
          [m.by]: { kind: w === 0 ? "surprised" : w === 2 ? "cheer" : "sad", at },
        }));
        break;
      }
      case "ball": {
        const a = petCenter(m.by);
        const b = petCenter(m.target);
        if (a && b) setShots((p) => [...p, { key: at + Math.random(), item: "⚽", a, b, at }]);
        setMoods((p) => ({ ...p, [m.by]: { kind: "cheer", at } }));
        // 내가 받을 차례면 공이 닿을 때 "받아!" 버튼
        if (m.target === selfId) setTimeout(() => setCatchBall({ id: m.id, by: m.by, from: m.from, rally: m.rally }), a && b ? FLIGHT_MS - 200 : 0);
        break;
      }
      case "miss":
        setMoods((p) => ({ ...p, [m.by]: { kind: "slip", at } }));
        setEmotes((p) => ({ ...p, [m.by]: { emoji: "⚽", from: m.rally > 0 ? `랠리 ${m.rally}번!` : "놓쳤다!", at } }));
        break;
      case "voteStart":
        setVote({ id: m.id, by: m.by, from: m.from, options: m.options, endsAt: m.endsAt, votes: {} });
        break;
      case "vote":
        setVote((v) => (v && v.id === m.id && !v.result ? { ...v, votes: { ...v.votes, [m.by]: m.choice } } : v));
        break;
      case "voteResult":
        setVote((v) => (v && v.id === m.id ? { ...v, result: { winner: m.winner, tally: m.tally } } : v));
        break;
    }
  }

  // 방 연결: presence(상태) + broadcast(채팅, 반응)
  const roomId = s.room?.id;
  // 방을 바꿀 때만 친구 목록을 비운다. 다시 연결할 때(아래 reconnect) 비우면 꺼진 친구 펫이 1분 동안 사라진다.
  useEffect(() => {
    setPeers([]);
    setMembers([]);
    loadRef.current();
  }, [roomId]);
  useEffect(() => {
    if (!roomId) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const ch = supabase.channel(`room:${roomId}`, { config: { presence: { key: s.deviceId }, broadcast: { self: true } } });
    ch.on("presence", { event: "sync" }, () => setPeers(presenceToPeers(ch.presenceState<PeerState>() as Record<string, PeerState[]>, s.deviceId)))
      .on("presence", { event: "leave" }, () => loadRef.current()) // 누가 나가면 마지막 접속 시각을 새로 받아 온다
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const c = sanitizeChat(payload);
        if (!c) return; // 모양이 이상한 채팅은 버린다 (그대로 그리면 화면 전체가 멈출 수 있다)
        const now = Date.now();
        const alert = { on: notifyRef.current.chat, busy: busyRef.current, quiet: quietRef.current, mine: c.sender_id === s.deviceId, lastAt: chatNotifiedAt.current.get(c.sender_id) };
        if (shouldNotifyChat(alert, now)) {
          chatNotifiedAt.current.set(c.sender_id, now);
          notify(`💬 ${namesRef.current.get(c.sender_id) ?? "친구"}`, String(c.body ?? "").slice(0, 100));
        }
        // 조용히 모드: 친구 말풍선은 띄우지 않고 개수만 센다 (내용은 설정 창 최근 대화에 남아 있다)
        if (quietRef.current && c.sender_id !== s.deviceId) return setUnread((n) => n + 1);
        setChats((prev) => ({ ...prev, [c.sender_id]: { ...c, at: Date.now() } }));
        appendLogRef.current(c);
      })
      .on("broadcast", { event: "tree" }, () => loadTreeRef.current())
      .on("broadcast", { event: "game" }, ({ payload }) => {
        const g = sanitizeGame(payload);
        if (g) applyGameRef.current(g);
      })
      .on("broadcast", { event: "react" }, ({ payload }) => {
        const r = sanitizeReaction(payload);
        if (r) applyReaction(r);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setChannel(ch);
          setError((e) => (e && /연결/.test(e) ? null : e)); // 다시 붙었으면 연결 안내는 지운다
          // 인터넷이 잠깐 끊겼다 다시 붙어도(맥 잠자기 포함) 같은 채널 객체라 위 state가 안 바뀐다.
          // 그래서 여기서 바로 "나 여기 있어"를 다시 보낸다. 안 하면 켜져 있어도 친구 화면에서 사라진다.
          ch.track(meRef.current);
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (!alive) return; // 방을 나가거나 다시 연결하느라 닫은 것
          if (status !== "CLOSED") setError("방에 연결하지 못했어요. 다시 연결하는 중… (회사 네트워크가 웹소켓을 막을 수 있어요)");
          // 끊긴 채로 두면 펫은 1분마다 남기는 접속 기록으로 계속 온라인처럼 보이는데 채팅·반응만 안 오간다. 그래서 새로 붙는다.
          clearTimeout(retry);
          retry = setTimeout(reconnectSoon, 5000);
        }
      });
    return () => {
      alive = false;
      clearTimeout(retry);
      setChannel(null);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, s.deviceId, reconnect]);

  // 연결 지킴이: 1분마다 보고, 채널이 붙어 있지 않은 채로 두 번 연속이면 새로 만든다. 인터넷이 다시 붙어도 바로.
  useEffect(() => {
    if (!roomId) return;
    let bad = 0;
    const id = setInterval(() => {
      bad = live() ? 0 : bad + 1;
      if (bad >= 2) {
        bad = 0;
        reconnectSoon();
      }
    }, HEARTBEAT_MS);
    const onOnline = () => !live() && reconnectSoon();
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

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

  // 친구 펫 크기는 내가 바꿨으면 그 크기로 (내 화면에서만)
  // 숨긴 친구는 빼고 (내 화면에서만)
  const roster = buildRoster(peers, members, s.deviceId, MAX_FRIENDS, now)
    .filter((p) => !s.hidden[p.id])
    .map((p) => (s.friendPx[p.id] ? { ...p, px: s.friendPx[p.id] } : p));
  for (const p of [...peers, ...members.map((m) => ({ id: m.device_id, name: m.name }))]) if (!namesRef.current.has(p.id)) namesRef.current.set(p.id, p.name);
  for (const p of peers) namesRef.current.set(p.id, p.name);

  // 친구 접속 알림: 실시간 접속 목록(presence)이 바뀔 때 새로 들어온 친구만. 숨긴 친구와 바쁠 땐 안 알린다.
  const presenceRef = useRef<Presence | null>(null);
  useEffect(() => {
    presenceRef.current = null; // 방을 바꾸면 처음부터 (이미 있던 친구는 안 알림)
  }, [roomId]);
  const peerIds = peers.map((p) => p.id).sort().join(",");
  useEffect(() => {
    if (!channel) return; // 연결 전 빈 목록은 "모두 나감"이 아니다
    const r = arrivals(presenceRef.current, peerIds ? peerIds.split(",") : [], Date.now());
    presenceRef.current = r.next;
    if (!notifyRef.current.online || busyRef.current) return;
    for (const id of r.arrived) if (!s.hidden[id]) notify("🟢 친구가 들어왔어요", `${namesRef.current.get(id) ?? "친구"}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerIds, channel]);
  // 창: 지금 모니터의 작업 영역(Dock·작업 표시줄 제외) 전체를 덮는 투명 창. 클릭은 펫 위에서만 받는다.
  // 화면 전체라서 펫을 높이 들어 올리거나 다른 창 위로 올라갈 수 있다.
  const overlayRef = useRef({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }); // 화면 좌표(논리 px)
  useEffect(() => {
    const place = async () => {
      const w = getCurrentWindow();
      // 설정에서 고른 모니터. 빠졌거나 안 골랐으면 지금 있는 모니터.
      const mons = s.monitor ? await availableMonitors().catch(() => []) : [];
      const mon = mons.find((m) => m.name === s.monitor) ?? (await currentMonitor());
      if (!mon) return;
      const a = mon.workArea;
      const sf = mon.scaleFactor;
      await w.setSize(new PhysicalSize(a.size.width, a.size.height));
      await w.setPosition(new PhysicalPosition(a.position.x, a.position.y));
      overlayRef.current = { x: a.position.x / sf, y: a.position.y / sf, w: a.size.width / sf, h: a.size.height / sf };
    };
    place();
    const un = getCurrentWindow().onScaleChanged(() => place()); // 해상도가 다른 모니터로 옮겨지면 다시
    return () => void un.then((f) => f());
  }, [s.monitor]);

  // 맨 앞 창 모서리 (펫이 올라갈 곳). 1.5초마다 다시 본다.
  const frontRef = useRef<Perch | null>(null);
  useEffect(() => {
    if (!s.climb) {
      frontRef.current = null; // 끄면 올라가 있던 펫도 내려온다
      return;
    }
    const look = () =>
      invoke<[number, number, number, number] | null>("front_window")
        .then((r) => (frontRef.current = perchFrom(r, overlayRef.current, SLOT_W * scale)))
        .catch(() => (frontRef.current = null));
    look();
    const id = setInterval(look, 1500);
    return () => clearInterval(id);
  }, [scale, s.climb]);


  // 펫마다 화면 바닥을 따라 따로 걷는다 (0.1초마다). 반응 중·채팅 중·자리 비움이면 제자리.
  const walkers = useRef(new Map<string, Walker>());
  const [, setWalkTick] = useState(0);
  const walkState = useRef({ me, roster, moods, bigs, gifts, picker, busyMe: false });
  walkState.current = { me, roster, moods, bigs, gifts, picker, busyMe: draft !== null || !!replyTo || !!got || dragging || falling || lift > 0 || !!catchBall || !!rpsIncoming || !!rpsAsk || !!miniLog };
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
        walkers.current.set(p.id, stepRoam(w, { dt, now, maxX, slotW: SLOT_W * k, speed: WALK_SPEED * k, canWalk, front: frontRef.current }));
      }
      setWalkTick((n) => (n + 1) % 1_000_000);
    }, 100);
    return () => clearInterval(id);
  }, [dragging]);
  // ── 이벤트 ──────────────────────────────────────────────
  /** 화면에 있는 펫(나 + 접속 중인 친구) 모두 만세하고, 머리 위에 글자 */
  const celebrate = (emoji: string, text: string) => {
    const at = Date.now();
    const ids = [selfId, ...walkState.current.roster.filter((p) => p.online).map((p) => p.id)];
    setMoods((p) => ({ ...p, ...Object.fromEntries(ids.map((id) => [id, { kind: "cheer" as Motion, at }])) }));
    setEmotes((p) => ({ ...p, ...Object.fromEntries(ids.map((id) => [id, { emoji, from: text, at }])) }));
    setConfettiAt(at);
  };
  const celebrateRef = useRef(celebrate);
  celebrateRef.current = celebrate;
  const showEvent = (text: string) => setEventToast({ text, at: Date.now() });
  const eventRef = useRef({ offParty: s.offParty, offTime: s.offTime, eventsOn: s.eventsOn, birthday: s.birthday, name: me.name });
  eventRef.current = { offParty: s.offParty, offTime: s.offTime, eventsOn: s.eventsOn, birthday: s.birthday, name: me.name };

  // 30초마다 시계를 보며: 퇴근 시각, 날이 바뀌면 생일·기념일 인사 (하루에 한 번)
  useEffect(() => {
    let prev: Date | null = null;
    const tick = () => {
      const d = new Date();
      const e = eventRef.current;
      if (e.offParty && offTimeHit(prev, d, e.offTime)) {
        celebrateRef.current(isFriday(d) ? "🎉" : "🏃", isFriday(d) ? "불금! 퇴근!" : "퇴근!");
        setEventToast({ text: isFriday(d) ? "🎉 금요일 퇴근 시간이에요! 한 주 고생했어요" : "🏃 퇴근 시간이에요! 오늘도 고생했어요", at: Date.now() });
      }
      if (isBirthday(e.birthday, d) && onceToday("bday", d)) {
        celebrateRef.current("🎂", "생일 축하해!");
        setEventToast({ text: `🎂 생일 축하해요, ${e.name}!`, at: Date.now() });
      } else {
        const h = holidayOn(d);
        if (e.eventsOn && h && onceToday(`holiday`, d)) {
          celebrateRef.current(h.icon, h.greet);
          setEventToast({ text: `${h.icon} ${h.name} · ${h.greet}`, at: Date.now() });
        }
      }
      prev = d;
    };
    const first = setTimeout(tick, 4000); // 켜자마자는 펫들이 자리 잡은 뒤에
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // 다 모였다: 최근에 쓰는 방 친구가 모두 접속하면 하루에 한 번 (방마다)
  const hereKey = roster.map((p) => `${p.id}:${p.online ? 1 : 0}`).join(",");
  useEffect(() => {
    if (!roomId || !channel || !s.eventsOn) return;
    const pets = [{ online: true, lastSeen: null }, ...roster.map((p) => ({ online: p.online, lastSeen: p.lastSeen }))];
    if (allHere(pets, Date.now()) && onceToday(`all-here:${roomId}`, new Date())) {
      celebrate("🙌", "다 모였다!");
      showEvent("🙌 방 친구들이 다 모였어요!");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hereKey, channel, roomId, s.eventsOn]);

  // 인사와 꽃가루는 잠깐만
  useEffect(() => {
    if (!eventToast) return;
    const id = setTimeout(() => setEventToast(null), 9000);
    return () => clearTimeout(id);
  }, [eventToast]);
  const holidayFood = s.eventsOn ? holidayOn(new Date(now))?.food : undefined;

  const posOf = (id: string, petPx: number) => {
    const k = petPx / PX_DEFAULT;
    const w = walkers.current.get(id);
    const x = w?.x ?? 0;
    const edge = x < 150 * k ? " near-left" : x > stageW - (SLOT_W + 150) * k ? " near-right" : "";
    return { x, lift: w?.y ?? 0, walk: w ? { moving: w.moving, faceLeft: w.faceLeft } : null, edge };
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
    // 친구에게 먼저 바로 보내고(말풍선이 바로 뜬다), 대화 기록 저장은 뒤에서 따로
    setDraft(null);
    broadcast("chat", { sender_id: s.deviceId, body }, () => {
      // 실시간으로 못 보냈어도 내 말풍선은 보이고, 대화 기록(아래)에는 남아 친구가 최근 대화에서 본다
      setChats((p) => ({ ...p, [s.deviceId]: { sender_id: s.deviceId, body, at: Date.now() } }));
      if (channelRef.current) setError("실시간 연결이 끊겨 다시 연결하는 중이에요. 메시지는 대화 기록에 남겼어요");
    });
    supabase
      .rpc("send_message", { p_room: s.room.id, p_sender: s.deviceId, p_sender_name: me.name, p_body: body })
      .then(({ error }) => error && setError("대화 기록에 저장하지 못했어요 (말풍선은 보냈어요)"));
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
  const press = useRef<{ x: number; sy: number; offset: number; moved: boolean } | null>(null);
  const liftRef = useRef(0);
  liftRef.current = lift;
  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || falling) return;
    const w = walkers.current.get(me.id);
    // 창 위에 올라가 있던 펫을 집으면 그 높이에서 시작한다
    const startLift = w?.y ?? 0;
    if (w) walkers.current.set(me.id, { ...w, y: 0, perch: null, jump: null });
    if (startLift > 0) setLift(startLift);
    press.current = { x: e.clientX, sy: e.screenY + startLift, offset: e.clientX - (w?.x ?? 0), moved: startLift > 0 };
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
      if (!p.moved && (Math.abs(e.clientX - p.x) > 4 || Math.abs(e.screenY - p.sy) > 4)) p.moved = true;
      if (!p.moved) return;
      // 위로 들어 올리기: 창이 커지면 clientY가 바뀌므로 화면 좌표(screenY)로 잰다
      const up = Math.max(0, Math.min(p.sy - e.screenY, window.innerHeight - 140));
      setLift(up);
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
      if (liftRef.current > 0) setFalling(true);
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

  // 놓으면 중력으로 떨어져 통통 튄다. 높이서 떨어지면 어지러워한다(친구 화면에도).
  useEffect(() => {
    if (!falling) return;
    const from = liftRef.current;
    let y = from;
    let v = 0; // 위가 +
    let last = performance.now();
    // requestAnimationFrame은 창이 비활성일 때 멈출 수 있어 일반 타이머(약 60fps)로 돌린다
    const id = setInterval(() => {
      const t = performance.now();
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      v -= 2600 * dt;
      y += v * dt;
      if (y <= 0) {
        y = 0;
        if (-v > 380) v = -v * 0.38; // 통!
        else {
          setLift(0);
          setFalling(false);
          if (from > 150) reactRef.current(selfId, "dizzy");
          clearInterval(id);
          return;
        }
      }
      setLift(y);
    }, 16);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [falling]);

  // 내 펫 오른쪽 클릭: 운영체제 기본 메뉴로 "설정 열기 / 펫 종료"
  async function showPetMenu() {
    try {
      const menu = await Menu.new({
        items: [
          { id: "settings", text: "설정 열기", action: () => invoke("open_settings") },
          { id: "log", text: "최근 대화 보기", action: () => openMiniLog() },
          { id: "eat", text: "간식 먹기", action: () => sendGame({ t: "feed", by: selfId, from: me.name, target: selfId, food: FOODS[Math.floor(Math.random() * FOODS.length)] }) },
          { id: "lunch", text: "점심 메뉴 투표 시작", action: () => startVote() },
          // 숨긴 친구 다시 보기
          ...Object.entries(s.hidden).map(([id, name]) => ({
            id: `show-${id}`,
            text: `${name} 다시 보기`,
            action: () => {
              const { [id]: _shown, ...rest } = s.hidden;
              saveSettings({ hidden: rest });
            },
          })),
          ...(Object.keys(s.hidden).length > 1
            ? [{ id: "show-all", text: "숨긴 친구 모두 다시 보기", action: () => saveSettings({ hidden: {} }) }]
            : []),
          { id: "quit", text: "펫 종료", action: () => invoke("quit_app") },
        ],
      });
      await menu.popup();
    } catch {
      invoke("open_settings"); // 메뉴를 못 띄우면(브라우저 미리보기 등) 설정 창으로
    }
  }

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

  applyGameRef.current = applyGame;

  // 최근 대화 (미니 기록)
  const appendLogRef = useRef<(c: { sender_id: string; body: string }) => void>(() => {});
  appendLogRef.current = (c) =>
    setMiniLog((log) =>
      log
        ? [
            ...log.slice(-11),
            {
              id: Date.now(),
              sender_id: c.sender_id,
              sender_name: c.sender_id === selfId ? me.name : (roster.find((p) => p.id === c.sender_id)?.name ?? "친구"),
              body: c.body,
              created_at: new Date().toISOString(),
            },
          ]
        : log,
    );
  // 최근 대화를 열면 맨 아래(가장 최근)부터 보이게
  const miniLogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = miniLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [miniLog]);
  async function openMiniLog() {
    setUnread(0);
    if (!roomId) return setError("방에 들어가면 최근 대화를 볼 수 있어요");
    const { data } = await supabase.rpc("recent_messages", { p_room: roomId, p_limit: 12 });
    setMiniLog((data as Message[]) ?? []);
  }
  const miniLogPanel = miniLog ? (
    <div className="mini-log" data-hit role="log" aria-label="최근 대화" ref={miniLogRef}>
      <div className="mini-log-head">
        <b>최근 대화</b>
        <button aria-label="닫기" onClick={() => setMiniLog(null)}>
          ✕
        </button>
      </div>
      {miniLog.length === 0 && <div className="muted">아직 대화가 없어요</div>}
      {miniLog.map((m) => (
        <div key={m.id} className="mini-log-line">
          <b>{m.sender_id === selfId ? "나" : m.sender_name}</b> {m.body}
        </div>
      ))}
    </div>
  ) : undefined;

  // 점심 투표: 시작한 사람이 마감 때 룰렛을 돌려 결과를 모두에게 보낸다
  function startVote() {
    if (vote && !vote.result) return;
    sendGame({ t: "voteStart", id: newId(), by: selfId, from: me.name, options: [...LUNCH], endsAt: Date.now() + VOTE_MS });
  }
  const voteRef = useRef(vote);
  voteRef.current = vote;
  const [now2, setNow2] = useState(() => Date.now()); // 투표 남은 초
  useEffect(() => {
    if (!vote || vote.result) return;
    setNow2(Date.now()); // 처음부터 남은 초를 맞게
    const id = setInterval(() => setNow2(Date.now()), 1000);
    const end = setTimeout(
      () => {
        const v = voteRef.current;
        if (!v || v.result || v.by !== selfId) return;
        const t = tally(v.votes, v.options);
        sendGameRef.current({ t: "voteResult", id: v.id, winner: spin(t), tally: t });
      },
      Math.max(0, vote.endsAt - Date.now()),
    );
    return () => {
      clearInterval(id);
      clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vote?.id, !!vote?.result]);
  // 결과가 나오면 룰렛이 2.5초 돌다가 멈추고, 8초 뒤 닫힌다
  useEffect(() => {
    if (!vote?.result) return;
    const opts = vote.options;
    let i = 0;
    const roll = setInterval(() => setSpinning(opts[i++ % opts.length]), 90);
    const stop = setTimeout(() => {
      clearInterval(roll);
      setSpinning(null);
    }, 2500);
    const close = setTimeout(() => setVote(null), 10_000);
    return () => {
      clearInterval(roll);
      clearTimeout(stop);
      clearTimeout(close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vote?.result?.winner, vote?.id]);

  // 공 받기: 정해진 시간 안에 못 누르면 놓친다
  useEffect(() => {
    if (!catchBall) return;
    const id = setTimeout(() => {
      sendGameRef.current({ t: "miss", id: catchBall.id, by: selfId, from: me.name, rally: catchBall.rally });
      setCatchBall(null);
    }, CATCH_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catchBall]);
  // 가위바위보 고르는 창은 12초 뒤 닫힌다
  useEffect(() => {
    if (!rpsAsk && !rpsIncoming) return;
    const id = setTimeout(() => {
      setRpsAsk(null);
      setRpsIncoming(null);
    }, 12_000);
    return () => clearTimeout(id);
  }, [rpsAsk, rpsIncoming]);

  const hands = (onPick: (r: Rps) => void) =>
    (Object.keys(RPS) as Rps[]).map((r) => (
      <button key={r} aria-label={r === "rock" ? "바위" : r === "scissors" ? "가위" : "보"} onClick={() => onPick(r)}>
        {RPS[r]}
      </button>
    ));
  const gamePopup = catchBall ? (
    <div className="picker replies" data-hit role="dialog" aria-label="공 받기">
      <button
        className="catch"
        onClick={() => {
          sendGame({ t: "ball", id: catchBall.id, by: selfId, from: me.name, target: catchBall.by, rally: catchBall.rally + 1 });
          setCatchBall(null);
        }}
      >
        ⚽ 받아!
      </button>
    </div>
  ) : rpsIncoming ? (
    <div className="picker replies" data-hit role="dialog" aria-label="가위바위보">
      <span className="reply-label">{rpsIncoming.from}의 가위바위보!</span>
      {hands((r) => {
        sendGame({ t: "rpsAns", id: rpsIncoming.id, by: selfId, from: me.name, target: rpsIncoming.by, choice: r, theirs: rpsIncoming.theirs });
        setRpsIncoming(null);
      })}
    </div>
  ) : rpsAsk ? (
    <div className="picker replies" data-hit role="dialog" aria-label="가위바위보 신청">
      <span className="reply-label">{rpsAsk.name}에게 낼 손</span>
      {hands((r) => {
        sendGame({ t: "rps", id: newId(), by: selfId, from: me.name, target: rpsAsk.target, choice: r });
        setRpsAsk(null);
      })}
    </div>
  ) : undefined;

  // 내 펫 위에 잠깐 뜨는 것: 입력창 > 놀이 > 답장 추천 > 선물 열어 본 결과 > 최근 대화
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
      {update && !error && (
        <div className="toast update" data-hit>
          <span>새 버전 v{update.version}</span>
          <button onClick={installUpdate} disabled={!!updating}>
            {updating ?? "업데이트"}
          </button>
          {!updating && (
            <button className="ghost" aria-label="나중에" onClick={() => setUpdate(null)}>
              나중에
            </button>
          )}
        </div>
      )}
      <div className="row">
        <PetSlot
          peer={{ ...me, online: true, lastSeen: null }}
          chat={chats[me.id]}
          now={now}
          labelPos={s.labelPos}
          {...fx(me.id)}
          {...(lift > 0 && !falling ? { mood: "surprised" as Motion } : {})}
          {...posOf(me.id, px)}
          {...(lift > 0 ? { lift } : {})}
          title="클릭: 채팅 · 더블클릭: 크게 인사 · 끌기: 옮기기(흔들면 어지러워해요) · 머리 문지르기: 쓰다듬기 · 오른쪽 클릭: 설정·종료"
          onMouseDown={onDown}
          onMouseMove={(e) => onPetHover(me.id, e)}
          onContextMenu={(e) => {
            e.preventDefault();
            showPetMenu();
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
                  openMiniLog();
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
              (gamePopup ?? gotChip ?? miniLogPanel)
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
              <div
                className="picker"
                data-hit
                role="toolbar"
                aria-label={`${p.name}에게 이모티콘 보내기, 던지기`}
                style={{ "--s": scale } as React.CSSProperties} /* 친구 크기를 바꿔도 메뉴는 내 크기 그대로 */
              >
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
                <span className="reply-label">간식</span>
                {[...(holidayFood && !(FOODS as readonly string[]).includes(holidayFood) ? [holidayFood] : []), ...FOODS].map((food) => (
                  <button
                    key={food}
                    aria-label={`${food} 간식 주기`}
                    onClick={() => {
                      sendGame({ t: "feed", by: selfId, from: me.name, target: p.id, food: food as Food });
                      setPicker(null);
                    }}
                  >
                    {food}
                  </button>
                ))}
                {isBirthday(p.bday, new Date(now)) && (
                  <button
                    className="wide"
                    onClick={() => {
                      react(p.id, "bday");
                      setPicker(null);
                    }}
                  >
                    🎂 생일 축하하기
                  </button>
                )}
                <button
                  className="wide"
                  onClick={() => {
                    setPicker(null);
                    setRpsAsk({ target: p.id, name: p.name });
                  }}
                >
                  ✊ 가위바위보
                </button>
                <button
                  className="wide"
                  onClick={() => {
                    setPicker(null);
                    sendGame({ t: "ball", id: newId(), by: selfId, from: me.name, target: p.id, rally: 0 });
                  }}
                >
                  ⚽ 공놀이
                </button>
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
                <label className="friend-size">
                  <span>
                    크기 <output>{percentOf(p.px)}%</output> <span className="muted">· 내 화면에서만</span>
                  </span>
                  <input
                    type="range"
                    min={PX_MIN}
                    max={PX_MAX}
                    step={1}
                    value={p.px}
                    aria-label={`${p.name} 펫 크기`}
                    aria-valuetext={`${percentOf(p.px)}%`}
                    onChange={(e) => saveSettings({ friendPx: { ...s.friendPx, [p.id]: Number(e.target.value) } })}
                  />
                </label>
                <button
                  className="wide full"
                  aria-label={`${p.name} 펫 숨기기`}
                  title="내 화면에서만 숨겨요. 내 펫 오른쪽 클릭 메뉴에서 다시 볼 수 있어요"
                  onClick={() => {
                    setPicker(null);
                    saveSettings({ hidden: { ...s.hidden, [p.id]: p.name } });
                  }}
                >
                  🙈 숨기기
                </button>
                {s.friendPx[p.id] !== undefined && (
                  <button
                    className="wide full"
                    onClick={() => {
                      const { [p.id]: _reset, ...rest } = s.friendPx;
                      saveSettings({ friendPx: rest });
                    }}
                  >
                    원래 크기로
                  </button>
                )}
              </div>
            ) : undefined}
          </PetSlot>
        ))}
        {winter && (
          <Tree ornaments={ornaments} px={px} open={treeOpen} onToggle={() => setTreeOpen((v) => !v)} onHang={hang} />
        )}
      </div>
      {dragging && <div className="drag-catcher" data-hit aria-hidden />}
      {vote && (
        <div className="vote-panel" data-hit role="dialog" aria-label="점심 메뉴 투표">
          {vote.result ? (
            <div className="vote-result" aria-live="polite">
              {spinning ? (
                <span className="spin">🎰 {spinning}</span>
              ) : (
                <>
                  🎉 오늘 점심은 <b>{vote.result.winner}</b>!
                </>
              )}
            </div>
          ) : (
            <>
              <div className="vote-title">
                🍱 점심 뭐 먹지? <span className="muted">({vote.from} · {Math.max(0, Math.ceil((vote.endsAt - now2) / 1000))}초)</span>
              </div>
              <div className="vote-options">
                {vote.options.map((o) => {
                  const n = tally(vote.votes, vote.options)[o];
                  return (
                    <button
                      key={o}
                      className={vote.votes[selfId] === o ? "on" : ""}
                      aria-pressed={vote.votes[selfId] === o}
                      onClick={() => sendGame({ t: "vote", id: vote.id, by: selfId, choice: o })}
                    >
                      {o} {n > 0 && <b>{n}</b>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
      {Date.now() - confettiAt < CONFETTI_MS && <Confetti key={confettiAt} />}
      {eventToast && !error && !update && (
        <div className="toast event" data-hit onClick={() => setEventToast(null)} role="status">
          {eventToast.text}
        </div>
      )}
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
  lift = 0,
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
  /** 바닥에서 들어 올린 높이(px) */
  lift?: number;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const text = chat?.body ?? (peer.status === "typing" ? "…" : null);
  const shown: Mood = mood ?? (peer.online ? peer.status : "sleep"); // 오프라인은 납작하게 잠듦
  const light = statusLight(peer, now);
  // 이름표: 상태 불 + 이름 (+ 자리 비움/바쁨/마지막 접속)
  const tag = peer.tag ? TAGS[peer.tag] : null;
  // 생일이면 이름 앞에 🎂, 모자가 없으면 고깔모자를 씌워 준다
  const bday = isBirthday(peer.bday, new Date(now));
  const hat = peer.hat ?? (bday ? "party" : null);
  // 모자가 머리 위로 솟는 경우(머리가 맨 윗줄인 캐릭터·그림)만 이름표를 덜 내린다
  const hatTall = !!hat && (!!peer.image || CHARACTERS[peer.character].headY + peer.hatOffset[1] < 3);
  const label = (
    <div className={`name ${labelPos}`} title={light.text || "온라인"}>
      <span className={`light ${light.color}`} aria-hidden />
      {tag && <span aria-hidden>{tag.icon}</span>}
      {bday && <span title="오늘 생일">🎂</span>}
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
      style={{ left: x, bottom: 4 + lift, transition: lift ? "none" : undefined, "--s": peer.px / PX_DEFAULT } as React.CSSProperties}
    >
      {children ?? (text && <Bubble text={text} />)}
      {emote && (
        <div className="emote" key={emote.at} aria-live="polite">
          <span className="emoji">{emote.emoji}</span>
          <span className="from">{emote.from}</span>
        </div>
      )}
      {peer.msg && peer.online && labelPos === "above" && <div className="status-msg">{peer.msg}</div>}
      {labelPos === "above" && label}
      <div className="pet" data-hit {...handlers}>
        <PetCanvas
          character={peer.character}
          color={peer.color}
          image={peer.image}
          mood={shown}
          px={peer.px}
          walk={walk}
          hat={hat}
          hatOffset={peer.hatOffset}
          hatScale={peer.hatScale}
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
      {peer.msg && peer.online && labelPos === "below" && <div className="status-msg">{peer.msg}</div>}
    </div>
  );
}

const CONFETTI_MS = 4500;
const CONFETTI_COLORS = ["#ff8fb1", "#ffc93c", "#4c7dff", "#5dbb63", "#b388ff", "#ff8a3d"];
/** 펫들 위로 꽃가루가 쏟아진다 (이벤트 때 잠깐) */
function Confetti() {
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: 36 }, (_, i) => {
        const n = i * 53 + 7; // 번호마다 고정된 값으로 흩는다
        return (
          <span
            key={i}
            style={
              {
                left: `${(n * 17) % 100}%`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${(n % 10) * 0.08}s`,
                animationDuration: `${2.6 + (n % 7) * 0.25}s`,
                "--drift": `${((n % 9) - 4) * 14}px`,
                "--spin": `${(n % 2 ? 1 : -1) * (360 + (n % 5) * 90)}deg`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
