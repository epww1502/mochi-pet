import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { PetCanvas } from "./Pet";
import { FIT_DEFAULT, FIT_ZOOM_MAX, FIT_ZOOM_MIN, bakePicture, cleanFit, loadImage, type PictureFit } from "./picture";
import { HATS, SEASONS, SEASON_IDS, TAGS, available, type HatId, type TagId } from "./decor";
import { CHARACTERS, COLORS, HAT_DX_MAX, HAT_DY_MIN, HAT_SCALE_MAX, canvasCells, HAT_SCALE_MIN, HAT_SCALE_STEP, cleanHatOffset, cleanHatScale, hatDyMin, type CharacterId, type HatOffset, type HatScale } from "./sprites";
import { PRESETS, WEATHER_LABEL, searchPlaces, type Place } from "./weather";
import { useWeather } from "./WeatherFx";
import { askNotifyPermission } from "./notify";
import { HOLIDAYS } from "./events";
import { availableMonitors, primaryMonitor } from "@tauri-apps/api/window";
import { MSG_MAX, PX_DEFAULT, PX_MAX, PX_MIN, cleanMsg, importImage, percentOf, safeImage, saveSettings, withRoom, supabase, useSettings, type Room, type Settings as PetSettings } from "./state";

type Message = { id: number; sender_id: string; sender_name: string; body: string; created_at: string };

export function Settings() {
  const s = useSettings();
  const [name, setName] = useState(s.name);
  const [msgDraft, setMsgDraft] = useState(s.statusMsg);
  const [roomName, setRoomName] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<Message[]>([]);
  const [copied, setCopied] = useState(false);
  const [placeQ, setPlaceQ] = useState("");
  const [found, setFound] = useState<(Place & { detail: string })[] | null>(null);
  const weather = useWeather(s.weatherOn, s.place);
  const [hatEdit, setHatEdit] = useState(false);
  const [picEdit, setPicEdit] = useState(false);
  // 최근 대화는 맨 아래(가장 최근)가 보이게. 새 메시지가 오면 다시 아래로.
  const historyRef = useRef<HTMLUListElement>(null);
  const lastId = history[history.length - 1]?.id;
  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const roomId = s.room?.id;
  useEffect(() => {
    if (!roomId) return setHistory([]);
    const load = () =>
      supabase.rpc("recent_messages", { p_room: roomId, p_limit: 30 }).then(({ data }) => setHistory((data as Message[]) ?? []));
    load();
    window.addEventListener("focus", load);
    const id = setInterval(load, 10000);
    return () => {
      window.removeEventListener("focus", load);
      clearInterval(id);
    };
  }, [roomId]);

  async function enter(promise: PromiseLike<{ data: unknown; error: unknown }>, failText: string) {
    setMsg(null);
    const { data, error } = await promise;
    const room = (data as Room[] | null)?.[0];
    if (error || !room) return setMsg(failText);
    saveSettings({ room, rooms: withRoom(s.rooms, room) });
    setCode("");
    setRoomName("");
  }

  const trimmed = name.trim();
  const [tab, setTab] = useState<TabId>(loadTab);
  const pick = (t: TabId) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* 저장 못 해도 지금 탭은 바뀐다 */
    }
  };

  return (
    <main className="settings">
      <header className="settings-head">
        <div className="profile">
          {picEdit && s.image ? (
            <PictureFitEditor s={s} onDone={() => setPicEdit(false)} />
          ) : (
            <PreviewWithHatDrag s={s} editing={hatEdit} setEditing={setHatEdit} />
          )}
          <div className="profile-text">
            <b>{s.name || "이름 없음"}</b>
            <span className="muted">{s.room ? `🏠 ${s.room.name}` : "아직 방에 안 들어갔어요"}</span>
            {s.statusMsg && <span className="muted">💬 {s.statusMsg}</span>}
          </div>
        </div>
        <nav className="tabs" role="tablist" aria-label="설정 메뉴">
          {TABS.map(([id, icon, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => pick(id)}>
              <span aria-hidden>{icon}</span> {label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "pet" && (
        <>
          <section>
            <h2>이름</h2>
            <div className="inline">
              <input
                aria-label="닉네임"
                value={name}
                maxLength={20}
                placeholder="친구들에게 보일 이름"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && trimmed && saveSettings({ name: trimmed })}
              />
              <button disabled={!trimmed || trimmed === s.name} onClick={() => saveSettings({ name: trimmed })}>
                저장
              </button>
            </div>
          </section>

          <section>
            <h2>캐릭터</h2>
            <div className="choices">
              {(Object.keys(CHARACTERS) as CharacterId[]).map((id) => (
                <button
                  key={id}
                  className={`choice${!s.image && s.character === id ? " on" : ""}`}
                  onClick={() => saveSettings({ character: id, image: null, ...(s.image || s.character !== id ? { hatOffset: [0, 0] } : {}) })}
                  aria-pressed={!s.image && s.character === id}
                >
                  <PetCanvas character={id} color={s.color} mood="idle" px={3} />
                  <span>{CHARACTERS[id].name}</span>
                </button>
              ))}
              <label className={`choice upload${s.image ? " on" : ""}`} title="배경이 투명한 PNG 픽셀아트가 제일 잘 어울려요. 64x64로 줄어들어요.">
                {s.image ? <PetCanvas character={s.character} color={s.color} image={s.image} mood="idle" px={3} /> : <span className="plus">+</span>}
                <span>{s.image ? "내 그림" : "그림 가져오기"}</span>
                <input
                  type="file"
                  accept="image/png,image/gif,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setMsg(null);
                    try {
                      const url = await importImage(file);
                      setPicEdit(false);
                      // 머리 위치가 달라지니 모자도 제자리로
                      saveSettings({ image: url, imageOrig: url, imageFit: FIT_DEFAULT, hatOffset: [0, 0] });
                    } catch {
                      setMsg("그림을 읽지 못했어요. PNG나 JPG 파일로 다시 해 주세요.");
                    }
                  }}
                />
              </label>
            </div>
            {msg && tab === "pet" && <p className="error">{msg}</p>}
            {s.image && !picEdit && (
              <button
                className="ghost edit-hat"
                onClick={() => {
                  setHatEdit(false);
                  setPicEdit(true);
                }}
              >
                ✏️ 그림 위치·크기 맞추기
              </button>
            )}
            {!s.image && (
              <>
                <div className="label">색</div>
                <div className="choices">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      className={`swatch${s.color === c ? " on" : ""}`}
                      style={{ background: c }}
                      aria-label={`색 ${c}`}
                      aria-pressed={s.color === c}
                      onClick={() => saveSettings({ color: c })}
                    />
                  ))}
                </div>
              </>
            )}
          </section>

          <section>
            <h2>
              크기 <output className="muted">{percentOf(s.px)}%</output>
            </h2>
            <div className="inline">
              <input
                type="range"
                aria-label="내 펫 크기"
                min={PX_MIN}
                max={PX_MAX}
                step={1}
                value={s.px}
                aria-valuetext={`${percentOf(s.px)}%`}
                onChange={(e) => saveSettings({ px: Number(e.target.value) })}
              />
              <button className="ghost" disabled={s.px === PX_DEFAULT} onClick={() => saveSettings({ px: PX_DEFAULT })}>
                100%
              </button>
            </div>
            <p className="hint">친구 화면에도 이 크기로 보여요</p>
            <div className="label">이름표 위치</div>
            <Segmented
              label="이름표 위치"
              value={s.labelPos}
              options={[
                ["above", "머리 위"],
                ["below", "발 아래"],
              ]}
              onChange={(v) => saveSettings({ labelPos: v })}
            />
          </section>
        </>
      )}

      {tab === "decor" && (
        <>
          <section>
            <h2>모자</h2>
            <div className="choices" role="radiogroup" aria-label="모자">
              <button className={`pill${s.hat ? "" : " on"}`} role="radio" aria-checked={!s.hat} onClick={() => saveSettings({ hat: null })}>
                없음
              </button>
              {(available(HATS, s.seasons) as HatId[]).map((id) => (
                <button key={id} className={`pill${s.hat === id ? " on" : ""}`} role="radio" aria-checked={s.hat === id} onClick={() => saveSettings({ hat: id })}>
                  {HATS[id].icon} {HATS[id].name}
                </button>
              ))}
            </div>
            {s.hat && !hatEdit && (
              <button className="ghost edit-hat" onClick={() => setHatEdit(true)}>
                ✏️ 모자 위치·크기 조절
              </button>
            )}
            <p className="hint">친구가 보낸 선물 상자를 열면 랜덤 모자가 나와요</p>
          </section>

          <section>
            <h2>이름표</h2>
            <div className="choices" role="radiogroup" aria-label="이름표 꾸미기">
              <button className={`pill${s.tag ? "" : " on"}`} role="radio" aria-checked={!s.tag} onClick={() => saveSettings({ tag: null })}>
                기본
              </button>
              {(available(TAGS, s.seasons) as TagId[]).map((id) => (
                <button key={id} className={`pill${s.tag === id ? " on" : ""}`} role="radio" aria-checked={s.tag === id} onClick={() => saveSettings({ tag: id })}>
                  {TAGS[id].icon} {TAGS[id].name}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>계절</h2>
            <p className="hint top">켜면 그 계절 모자·이름표가 생기고 화면에 계절 효과가 보여요 (내 화면만)</p>
            {SEASON_IDS.map((id) => (
              <Toggle
                key={id}
                title={`${SEASONS[id].icon} ${SEASONS[id].name}`}
                desc={SEASONS[id].desc}
                checked={s.seasons.includes(id)}
                onChange={(on) =>
                  saveSettings({
                    seasons: on ? [...s.seasons, id] : s.seasons.filter((x) => x !== id),
                    // 계절을 끄면 그 계절 모자·이름표도 벗는다
                    ...(!on && s.hat && HATS[s.hat].season === id ? { hat: null } : {}),
                    ...(!on && s.tag && TAGS[s.tag].season === id ? { tag: null } : {}),
                  })
                }
              />
            ))}
            {s.seasons.includes("winter") && s.room && (
              <button
                className="ghost"
                onClick={async () => {
                  if (!confirm("방 트리의 장식을 모두 떼요. 친구들 트리도 같이 비워져요. 계속할까요?")) return;
                  await supabase.rpc("clear_tree", { p_room: s.room!.id });
                }}
              >
                🎄 트리 비우기
              </button>
            )}
          </section>

          <section>
            <h2>날씨</h2>
            <Toggle
              title="실제 날씨 보여주기"
              desc={weather ? `지금 ${s.place?.name ?? ""} ${WEATHER_LABEL[weather.kind]} ${weather.temp}°C` : "비·구름·해(밤엔 별)가 펫 창에 보여요"}
              checked={s.weatherOn}
              onChange={(on) => saveSettings({ weatherOn: on })}
            />
            {s.weatherOn && (
              <>
                <div className="label">도시 {s.place ? `· ${s.place.name}` : "· 골라 주세요"}</div>
                <div className="choices">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      className={`pill${s.place?.name === p.name ? " on" : ""}`}
                      aria-pressed={s.place?.name === p.name}
                      onClick={() => saveSettings({ place: p })}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <form
                  className="inline"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!placeQ.trim()) return;
                    try {
                      setFound(await searchPlaces(placeQ));
                    } catch {
                      setFound([]);
                    }
                  }}
                >
                  <input value={placeQ} maxLength={40} placeholder="다른 지역 (예: 춘천시)" onChange={(e) => setPlaceQ(e.target.value)} />
                  <button type="submit">검색</button>
                </form>
                {found && (
                  <ul className="places">
                    {found.length === 0 && <li className="muted">못 찾았어요. "OO시"처럼 전체 이름이나 영어로 찾아보세요.</li>}
                    {found.map((p) => (
                      <li key={`${p.lat},${p.lon}`}>
                        <button
                          className="ghost"
                          onClick={() => {
                            saveSettings({ place: { name: p.name, lat: p.lat, lon: p.lon } });
                            setFound(null);
                            setPlaceQ("");
                          }}
                        >
                          {p.name} <span className="muted">{p.detail}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="hint">고른 도시 좌표만 날씨 서비스에 보내요. 내 위치는 찾지 않아요.</p>
              </>
            )}
          </section>
        </>
      )}

      {tab === "friends" && (
        <>
          <section>
            <h2>방</h2>
            {s.room ? (
              <>
                <p className="room-line">
                  <b>{s.room.name}</b> <span className="muted">· 초대 코드를 친구에게 알려 주세요</span>
                </p>
                <div className="inline">
                  <code className="code">{s.room.code}</code>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(s.room!.code);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? "복사됨" : "복사"}
                  </button>
                  <button
                    className="ghost"
                    onClick={async () => {
                      if (!confirm(`'${s.room!.name}' 방에서 나갈까요?`)) return;
                      // 친구들 화면에서 내 회색 펫도 지운다 (실패해도 나가기는 한다)
                      const left = s.room!.id;
                      await supabase.rpc("leave_room", { p_room: left, p_device: s.deviceId });
                      saveSettings({ room: null, rooms: s.rooms.filter((r) => r.id !== left) });
                    }}
                  >
                    나가기
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="label">초대 코드로 들어가기</div>
                <div className="inline">
                  <input aria-label="초대 코드" value={code} maxLength={6} placeholder="예: 26MMRA" onChange={(e) => setCode(e.target.value.toUpperCase())} />
                  <button disabled={code.trim().length !== 6} onClick={() => enter(supabase.rpc("join_room", { p_code: code }), "그런 코드의 방이 없어요")}>
                    들어가기
                  </button>
                </div>
                <div className="label">새 방 만들기</div>
                <div className="inline">
                  <input aria-label="방 이름" value={roomName} maxLength={30} placeholder="방 이름 (비우면 '우리 방')" onChange={(e) => setRoomName(e.target.value)} />
                  <button onClick={() => enter(supabase.rpc("create_room", { p_name: roomName }), "방을 만들지 못했어요")}>만들기</button>
                </div>
              </>
            )}
            {msg && tab === "friends" && <p className="error">{msg}</p>}
            {s.rooms.length > 1 && (
              <>
                <div className="label">내 방 목록</div>
                <ul className="room-list">
                  {s.rooms.map((r) => {
                    const here = s.room?.id === r.id;
                    return (
                      <li key={r.id} className={here ? "here" : ""}>
                        <span>
                          <b>{r.name}</b> <span className="muted">{r.code}</span>
                        </span>
                        {here ? (
                          <span className="hint">지금 방</span>
                        ) : (
                          <span className="inline">
                            <button onClick={() => saveSettings({ room: r })}>바꾸기</button>
                            <button
                              className="ghost"
                              title="목록에서만 지워요 (친구 화면엔 꺼진 펫으로 남아요)"
                              aria-label={`${r.name} 목록에서 지우기`}
                              onClick={() => saveSettings({ rooms: s.rooms.filter((x) => x.id !== r.id) })}
                            >
                              ✕
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="hint">방을 바꿔도 이전 방에서 나가지는 않아요. 언제든 다시 돌아올 수 있어요.</p>
              </>
            )}
            {s.room && (
              <details className="more-room">
                <summary>다른 방 들어가기 · 새 방 만들기</summary>
                <div className="label">초대 코드로 들어가기</div>
                <div className="inline">
                  <input aria-label="초대 코드" value={code} maxLength={6} placeholder="예: 26MMRA" onChange={(e) => setCode(e.target.value.toUpperCase())} />
                  <button disabled={code.trim().length !== 6} onClick={() => enter(supabase.rpc("join_room", { p_code: code }), "그런 코드의 방이 없어요")}>
                    들어가기
                  </button>
                </div>
                <div className="label">새 방 만들기</div>
                <div className="inline">
                  <input aria-label="방 이름" value={roomName} maxLength={30} placeholder="방 이름 (비우면 '우리 방')" onChange={(e) => setRoomName(e.target.value)} />
                  <button onClick={() => enter(supabase.rpc("create_room", { p_name: roomName }), "방을 만들지 못했어요")}>만들기</button>
                </div>
              </details>
            )}
          </section>

          <section>
            <h2>내 상태</h2>
            <div className="inline">
              <input
                aria-label="상태 메시지"
                value={msgDraft}
                maxLength={MSG_MAX}
                placeholder="상태 메시지 (예: 점심 먹는 중 🍜)"
                onChange={(e) => setMsgDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && saveSettings({ statusMsg: cleanMsg(msgDraft) })}
              />
              <button disabled={cleanMsg(msgDraft) === s.statusMsg} onClick={() => saveSettings({ statusMsg: cleanMsg(msgDraft) })}>
                저장
              </button>
              {s.statusMsg && (
                <button
                  className="ghost"
                  onClick={() => {
                    setMsgDraft("");
                    saveSettings({ statusMsg: "" });
                  }}
                >
                  지우기
                </button>
              )}
            </div>
            <p className="hint">친구 화면에서 펫 위에 작게 보여요</p>
            <Toggle title="🔴 바쁨 (방해 금지)" desc="친구에게 빨간 불로 보이고, 답장 추천을 띄우지 않아요" checked={s.busy} onChange={(on) => saveSettings({ busy: on })} />
            <Toggle title="🤫 조용히 모드" desc="채팅 말풍선 대신 이름표 옆에 안 읽은 개수만 보여요" checked={s.quiet} onChange={(on) => saveSettings({ quiet: on })} />
            <p className="hint legend">🟢 온라인 · 🟠 자리 비움 · 🔴 바쁨 · ⚪ 오프라인</p>
          </section>

          {s.room && (
            <section>
              <h2>최근 대화</h2>
              {history.length === 0 ? (
                <p className="muted">아직 대화가 없어요. 펫을 클릭하면 말할 수 있어요.</p>
              ) : (
                <ul className="history" ref={historyRef}>
                  {history.map((m) => (
                    <li key={m.id}>
                      <b>{m.sender_id === s.deviceId ? "나" : m.sender_name}</b> {m.body}
                      <time>{new Date(m.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {tab === "app" && (
        <>
          <BehaviorSection s={s} />
          <section>
            <h2>알림</h2>
            <NotifyToggle on={s.notifyChat} onChange={(v) => saveSettings({ notifyChat: v })} title="채팅 알림" desc="친구 채팅이 오면 알려 줘요 (바쁨·조용히 땐 안 울려요)" />
            <NotifyToggle on={s.notifyOnline} onChange={(v) => saveSettings({ notifyOnline: v })} title="친구 접속 알림" desc="친구가 앱을 켜면 알려 줘요" />
          </section>
          <EventSection s={s} />
          <section className="quit">
            <button className="ghost" onClick={() => invoke("quit_app")}>
              펫 종료
            </button>
            <span className="hint">펫 클릭: 채팅 · 끌기: 옮기기 · 오른쪽 클릭: 메뉴</span>
          </section>
        </>
      )}
    </main>
  );
}

type TabId = "pet" | "decor" | "friends" | "app";
const TABS: [TabId, string, string][] = [
  ["pet", "🐾", "내 펫"],
  ["decor", "🎩", "꾸미기"],
  ["friends", "💬", "친구"],
  ["app", "⚙️", "앱 설정"],
];
const TAB_KEY = "mochi-pet-settings-tab";
function loadTab(): TabId {
  try {
    const t = localStorage.getItem(TAB_KEY);
    if (TABS.some(([id]) => id === t)) return t as TabId;
  } catch {
    /* 못 읽으면 첫 탭 */
  }
  return "pet";
}

/** 켜기/끄기 한 줄: 왼쪽에 제목과 짧은 설명, 오른쪽에 스위치 */
function Toggle({
  title,
  desc,
  checked,
  disabled,
  onChange,
  children,
}: {
  title: string;
  desc?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <label className="toggle">
      <span className="toggle-text">
        <b>{title}</b>
        {desc && <span className="muted">{desc}</span>}
        {children}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** 둘 이상 중 하나 고르기 (붙어 있는 버튼) */
function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

const PREVIEW_PX = 5; // 미리보기 한 칸 = 화면 5px

/**
 * 설정 맨 위 미리보기 + 모자 위치·크기 조절.
 * "모자 위치·크기 조절"을 누르면 미리보기에서 모자를 끌어(또는 방향키로) 옮기고 크기를 골라 볼 수 있고, 저장을 눌러야 바뀐다.
 * 그래서 고치는 동안은 친구에게 아무것도 보내지 않고, 취소하면 그대로다.
 */
function PreviewWithHatDrag({ s, editing, setEditing }: { s: PetSettings; editing: boolean; setEditing: (v: boolean) => void }) {
  const [draft, setDraft] = useState<HatOffset>(s.hatOffset);
  const [scaleDraft, setScaleDraft] = useState<HatScale>(s.hatScale);
  const [drag, setDrag] = useState<{ x0: number; y0: number; from: HatOffset } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // 고치기 시작할 때마다 지금 저장된 모자에서 시작하고, 방향키를 바로 쓸 수 있게 포커스
  useEffect(() => {
    if (!editing) return;
    setDraft(s.hatOffset);
    setScaleDraft(s.hatScale);
    boxRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  // 모자를 벗으면 고치기도 끝
  useEffect(() => {
    if (!s.hat) setEditing(false);
  }, [s.hat, setEditing]);

  const fit = (v: [number, number]) => cleanHatOffset(v, hatDyMin(s.character, !!s.image));
  const editCells = canvasCells(s.image ? 0 : CHARACTERS[s.character].headY, true, [HAT_DX_MAX, HAT_DY_MIN], HAT_SCALE_MAX);
  const offset = editing ? draft : s.hatOffset;
  const hatScale = editing ? scaleDraft : s.hatScale;
  const changed = draft[0] !== s.hatOffset[0] || draft[1] !== s.hatOffset[1] || scaleDraft !== s.hatScale;
  const atHome = draft[0] === 0 && draft[1] === 0 && scaleDraft === 1;
  const save = () => {
    saveSettings({ hatOffset: draft, hatScale: scaleDraft });
    setEditing(false);
  };
  const cancel = () => setEditing(false);

  return (
    <div className={`preview-wrap${editing ? " editing" : ""}`}>
      <div
        ref={boxRef}
        className={`preview${editing ? " hat-editing" : ""}${drag ? " dragging" : ""}`}
        tabIndex={editing ? 0 : undefined}
        role={editing ? "application" : undefined}
        aria-label={editing ? "모자 조절: 끌거나 방향키로 옮기고 Enter로 저장, Esc로 취소" : undefined}
        onPointerDown={(e) => {
          if (!editing || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ x0: e.clientX, y0: e.clientY, from: draft });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          setDraft(fit([drag.from[0] + (e.clientX - drag.x0) / PREVIEW_PX, drag.from[1] + (e.clientY - drag.y0) / PREVIEW_PX]));
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onWheel={(e) => {
          // 휠로도 모자 크기를 바꾼다 (위로 굴리면 크게)
          if (!editing) return;
          setScaleDraft((v) => cleanHatScale(v + (e.deltaY < 0 ? HAT_SCALE_STEP : -HAT_SCALE_STEP)));
        }}
        onKeyDown={(e) => {
          if (!editing) return;
          if (e.key === "Enter") return save();
          if (e.key === "Escape") return cancel();
          const step = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
          if (!step) return;
          e.preventDefault();
          setDraft((d) => fit([d[0] + step[0], d[1] + step[1]]));
        }}
      >
        <PetCanvas
          character={s.character}
          color={s.color}
          image={s.image}
          mood="idle"
          px={PREVIEW_PX}
          hat={s.hat}
          hatOffset={offset}
          hatScale={hatScale}
          // 고치는 동안은 가장 멀리 옮겼을 때 크기로 고정: 모자를 옮길 때마다 미리보기가 커졌다 줄었다 하면 모자가 제자리에 있는 것처럼 보인다
          minCells={editing ? editCells : undefined}
        />
      </div>
      {editing && (
        <div className="hat-edit-bar" role="group" aria-label="모자 위치·크기 조절">
          <span className="hint">모자를 끌어서 옮기고, 크기는 슬라이더나 휠로</span>
          <label className="hat-size">
            <span>
              크기 <output>{Math.round(scaleDraft * 100)}%</output>
            </span>
            <input
              type="range"
              aria-label="모자 크기"
              min={HAT_SCALE_MIN}
              max={HAT_SCALE_MAX}
              step={HAT_SCALE_STEP}
              value={scaleDraft}
              aria-valuetext={`${Math.round(scaleDraft * 100)}%`}
              onChange={(e) => setScaleDraft(Number(e.target.value))}
            />
          </label>
          <div className="inline">
            <button className="ghost" disabled={atHome} onClick={() => (setDraft([0, 0]), setScaleDraft(1))}>
              처음대로
            </button>
            <button className="ghost" onClick={cancel}>
              취소
            </button>
            <button disabled={!changed} onClick={save}>
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 내 그림을 칸(점선 사각형) 안에서 끌어 옮기고 휠·슬라이더로 키운다. 저장하면 64칸 PNG로 구워 친구에게도 그대로 보인다.
 * 원본은 이 컴퓨터에 따로 두어서 몇 번을 고쳐도 흐려지지 않는다.
 */
function PictureFitEditor({ s, onDone }: { s: PetSettings; onDone: () => void }) {
  const orig = s.imageOrig ?? s.image!;
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fit, setFit] = useState<PictureFit>(s.imageOrig ? s.imageFit : FIT_DEFAULT);
  const [drag, setDrag] = useState<{ x0: number; y0: number; from: PictureFit } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    loadImage(orig).then((i) => live && setImg(i), () => live && setErr("그림을 읽지 못했어요"));
    boxRef.current?.focus();
    return () => {
      live = false;
    };
  }, [orig]);
  const url = img ? bakePicture(img, fit) : s.image;
  // 화면 1px = 그림 몇 칸인지: 64칸 그림이 펫 칸 14줄 높이에 맞춰 보인다
  const perPx = 64 / (14 * PREVIEW_PX);
  const move = (dx: number, dy: number) => setFit((f) => cleanFit({ ...f, x: f.x + dx, y: f.y + dy }));
  const zoomBy = (d: number) => setFit((f) => cleanFit({ ...f, zoom: f.zoom + d }));
  const changed = !s.imageOrig || fit.x !== s.imageFit.x || fit.y !== s.imageFit.y || fit.zoom !== s.imageFit.zoom;
  const save = () => {
    if (!url || !safeImage(url)) return setErr("그림이 너무 복잡해서 저장하지 못했어요. 조금 줄여 보세요.");
    saveSettings({ image: url, imageOrig: orig, imageFit: fit });
    onDone();
  };
  return (
    <div className="preview-wrap editing">
      <div
        ref={boxRef}
        className={`preview hat-editing${drag ? " dragging" : ""}`}
        tabIndex={0}
        role="application"
        aria-label="그림 맞추기: 끌거나 방향키로 옮기고 휠로 크기, Enter로 저장, Esc로 취소"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ x0: e.clientX, y0: e.clientY, from: fit });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          setFit(cleanFit({ ...drag.from, x: drag.from.x + (e.clientX - drag.x0) * perPx, y: drag.from.y + (e.clientY - drag.y0) * perPx }));
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 0.05 : -0.05)}
        onKeyDown={(e) => {
          if (e.key === "Enter") return save();
          if (e.key === "Escape") return onDone();
          const step = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
          if (!step) return;
          e.preventDefault();
          move(step[0], step[1]);
        }}
      >
        <PetCanvas character={s.character} color={s.color} image={url} mood="idle" px={PREVIEW_PX} hat={s.hat} hatOffset={s.hatOffset} hatScale={s.hatScale} />
      </div>
      <div className="hat-edit-bar" role="group" aria-label="그림 위치·크기 맞추기">
        <span className="hint">그림을 끌어서 옮기고, 크기는 슬라이더나 휠로</span>
        <label className="hat-size">
          <span>
            크기 <output>{Math.round(fit.zoom * 100)}%</output>
          </span>
          <input
            type="range"
            aria-label="그림 크기"
            min={FIT_ZOOM_MIN}
            max={FIT_ZOOM_MAX}
            step={0.05}
            value={fit.zoom}
            aria-valuetext={`${Math.round(fit.zoom * 100)}%`}
            onChange={(e) => setFit((f) => cleanFit({ ...f, zoom: Number(e.target.value) }))}
          />
        </label>
        {err && <span className="error-inline">{err}</span>}
        <div className="inline">
          <button className="ghost" disabled={fit.x === 0 && fit.y === 0 && fit.zoom === 1} onClick={() => setFit(FIT_DEFAULT)}>
            처음대로
          </button>
          <button className="ghost" onClick={onDone}>
            취소
          </button>
          <button disabled={!changed || !img} onClick={save}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

/** 켤 때만 알림 권한을 묻는다. 거절하면 켜지 않고 안내한다. */
function NotifyToggle({ on, onChange, title, desc }: { on: boolean; onChange: (v: boolean) => void; title: string; desc: string }) {
  const [denied, setDenied] = useState(false);
  return (
    <Toggle
      title={title}
      desc={desc}
      checked={on}
      onChange={async (want) => {
        if (want && !(await askNotifyPermission())) return setDenied(true);
        setDenied(false);
        onChange(want);
      }}
    >
      {denied && <span className="error-inline">알림 권한이 꺼져 있어요. 시스템 설정의 알림에서 mochi-pet을 허용해 주세요.</span>}
    </Toggle>
  );
}

type MonitorChoice = { name: string; label: string };

/** 동작: 자동 시작, 창 위로 올라가기, 펫이 사는 모니터 */
function BehaviorSection({ s }: { s: PetSettings }) {
  // 자동 시작은 OS에 등록된 상태가 진짜라 설정 파일에 따로 두지 않고 그때그때 묻는다
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [monitors, setMonitors] = useState<MonitorChoice[]>([]);
  useEffect(() => {
    import("@tauri-apps/plugin-autostart")
      .then((a) => a.isEnabled())
      .then(setAutostart)
      .catch(() => setAutostart(null));
    const load = async () => {
      const [all, main] = await Promise.all([availableMonitors(), primaryMonitor()]);
      setMonitors(
        all
          .filter((m) => m.name)
          .map((m, i) => ({
            name: m.name!,
            label: `모니터 ${i + 1} · ${Math.round(m.size.width / m.scaleFactor)}x${Math.round(m.size.height / m.scaleFactor)}${main?.name === m.name ? " (주 모니터)" : ""}`,
          })),
      );
    };
    load().catch(() => setMonitors([]));
    window.addEventListener("focus", load); // 모니터를 꽂거나 뺐을 수 있다
    return () => window.removeEventListener("focus", load);
  }, []);
  const missing = s.monitor && monitors.length > 0 && !monitors.some((m) => m.name === s.monitor);
  return (
    <section>
      <h2>동작</h2>
      <Toggle
        title="컴퓨터 켤 때 자동으로 시작"
        desc="재부팅해도 펫이 알아서 켜져요"
        checked={!!autostart}
        disabled={autostart === null}
        onChange={async (want) => {
          try {
            const a = await import("@tauri-apps/plugin-autostart");
            await (want ? a.enable() : a.disable());
            setAutostart(await a.isEnabled());
          } catch {
            setAutostart(null);
          }
        }}
      />
      <Toggle
        title="창 위로 올라가기"
        desc="가끔 맨 앞 창 위 모서리로 올라가 걸어요. 창 위치만 읽어요."
        checked={s.climb}
        onChange={(on) => saveSettings({ climb: on })}
      />
      {monitors.length > 1 || s.monitor ? (
        <label className="field">
          펫이 있을 모니터
          <select value={s.monitor ?? ""} onChange={(e) => saveSettings({ monitor: e.target.value || null })}>
            <option value="">자동 (앱이 켜진 모니터)</option>
            {monitors.map((m) => (
              <option key={m.name} value={m.name}>
                {m.label}
              </option>
            ))}
            {missing && <option value={s.monitor!}>연결 안 된 모니터</option>}
          </select>
          {missing && <span className="hint">고른 모니터가 연결돼 있지 않아서 지금은 앱이 켜진 모니터에 있어요.</span>}
        </label>
      ) : null}
    </section>
  );
}

/** 이벤트: 생일, 퇴근 시간 파티, 기념일·다 모였다 */
function EventSection({ s }: { s: PetSettings }) {
  const [mo, da] = s.birthday ? s.birthday.split("-").map(Number) : [0, 0];
  const setBday = (m: number, d: number) => {
    if (!m) return saveSettings({ birthday: "" });
    const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    const day = Math.min(d || 1, max);
    saveSettings({ birthday: `${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}` });
  };
  const holidays = Object.values(HOLIDAYS)
    .map((h) => h.icon + " " + h.name)
    .join(", ");
  return (
    <section>
      <h2>이벤트</h2>
      <div className="label">생일</div>
      <div className="inline">
        <select aria-label="생일 월" value={mo || ""} onChange={(e) => setBday(Number(e.target.value), da)}>
          <option value="">월</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}월
            </option>
          ))}
        </select>
        <select aria-label="생일 일" value={da || ""} disabled={!mo} onChange={(e) => setBday(mo, Number(e.target.value))}>
          <option value="">일</option>
          {Array.from({ length: mo ? [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1] : 31 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}일
            </option>
          ))}
        </select>
        {s.birthday && (
          <button className="ghost" onClick={() => saveSettings({ birthday: "" })}>
            지우기
          </button>
        )}
      </div>
      <p className="hint">그날 친구 화면에 🎂와 고깔모자가 보여요 (월·일만 공유)</p>
      <Toggle title="퇴근 시간 파티" desc='평일 이 시각에 다 같이 만세해요. 금요일엔 "불금!"' checked={s.offParty} onChange={(on) => saveSettings({ offParty: on })}>
        {s.offParty && (
          <input
            type="time"
            aria-label="퇴근 시각"
            className="time"
            value={s.offTime}
            onChange={(e) => /^\d\d:\d\d$/.test(e.target.value) && saveSettings({ offTime: e.target.value })}
          />
        )}
      </Toggle>
      <Toggle title="기념일 · 다 모였다" desc="기념일에 인사하고 그날 간식이 생겨요. 방 친구가 모두 모이면 만세!" checked={s.eventsOn} onChange={(on) => saveSettings({ eventsOn: on })} />
      <p className="hint">기념일: {holidays}</p>
    </section>
  );
}
