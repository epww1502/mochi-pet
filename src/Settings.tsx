import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { PetCanvas } from "./Pet";
import { HATS, SEASONS, SEASON_IDS, TAGS, available, type HatId, type TagId } from "./decor";
import { CHARACTERS, COLORS, type CharacterId } from "./sprites";
import { PRESETS, WEATHER_LABEL, searchPlaces, type Place } from "./weather";
import { useWeather } from "./WeatherFx";
import { MSG_MAX, PX_DEFAULT, PX_MAX, PX_MIN, cleanMsg, importImage, percentOf, saveSettings, supabase, useSettings, type Room } from "./state";

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
    saveSettings({ room });
    setCode("");
    setRoomName("");
  }

  const trimmed = name.trim();
  return (
    <main className="settings">
      <h1>펫 설정</h1>

      <section>
        <h2>내 펫</h2>
        <div className="preview">
          <PetCanvas character={s.character} color={s.color} image={s.image} mood="idle" px={6} hat={s.hat} />
        </div>
        <label>
          닉네임
          <div className="inline">
            <input value={name} maxLength={20} placeholder="친구들에게 보일 이름" onChange={(e) => setName(e.target.value)} />
            <button disabled={!trimmed || trimmed === s.name} onClick={() => saveSettings({ name: trimmed })}>
              저장
            </button>
          </div>
        </label>
        <div className="label">캐릭터</div>
        <div className="choices">
          {(Object.keys(CHARACTERS) as CharacterId[]).map((id) => (
            <button
              key={id}
              className={`choice${!s.image && s.character === id ? " on" : ""}`}
              onClick={() => saveSettings({ character: id, image: null })}
              aria-pressed={!s.image && s.character === id}
            >
              <PetCanvas character={id} color={s.color} mood="idle" px={3} />
              <span>{CHARACTERS[id].name}</span>
            </button>
          ))}
          <label className={`choice upload${s.image ? " on" : ""}`}>
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
                  saveSettings({ image: await importImage(file) });
                } catch {
                  setMsg("그림을 읽지 못했어요. PNG나 JPG 파일로 다시 해 주세요.");
                }
              }}
            />
          </label>
        </div>
        <p className="muted small-left">큰 그림은 64x64 픽셀로 줄어들고, 친구에게도 보여요. 배경이 투명한 PNG 픽셀아트가 제일 잘 어울려요.</p>
        <label className="size">
          <span>
            내 펫 크기 <output>{percentOf(s.px)}%</output> <span className="muted">· 친구 화면에도 이 크기로 보여요</span>
          </span>
          <div className="inline">
            <input
              type="range"
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
        </label>
        <div className="label">이름표 위치</div>
        <div className="choices" role="radiogroup" aria-label="이름표 위치">
          {(
            [
              ["above", "머리 위"],
              ["below", "발 아래"],
            ] as const
          ).map(([pos, label]) => (
            <button key={pos} className={`pill${s.labelPos === pos ? " on" : ""}`} role="radio" aria-checked={s.labelPos === pos} onClick={() => saveSettings({ labelPos: pos })}>
              {label}
            </button>
          ))}
        </div>
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
      </section>

      <section>
        <h2>꾸미기</h2>
        <div className="label">모자</div>
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
        <div className="label">이름표</div>
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
        <p className="muted small-left">친구가 보낸 선물 상자를 열면 랜덤 모자가 나와요. 꾸미기는 친구 화면에도 보여요.</p>
      </section>

      <section>
        <h2>계절 꾸미기</h2>
        <p className="muted small-left">켜고 싶은 계절만 골라요. 켜면 그 계절 모자·이름표가 생기고 화면에 계절 효과가 보여요. 내 화면에만 적용돼요.</p>
        {SEASON_IDS.map((id) => (
          <label key={id} className="check">
            <input
              type="checkbox"
              checked={s.seasons.includes(id)}
              onChange={(e) =>
                saveSettings({
                  seasons: e.target.checked ? [...s.seasons, id] : s.seasons.filter((x) => x !== id),
                  // 계절을 끄면 그 계절 모자·이름표도 벗는다
                  ...(!e.target.checked && s.hat && HATS[s.hat].season === id ? { hat: null } : {}),
                  ...(!e.target.checked && s.tag && TAGS[s.tag].season === id ? { tag: null } : {}),
                })
              }
            />
            <span>
              <b>
                {SEASONS[id].icon} {SEASONS[id].name}
              </b>
              <br />
              <span className="muted">{SEASONS[id].desc}</span>
            </span>
          </label>
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
        <label className="check">
          <input type="checkbox" checked={s.weatherOn} onChange={(e) => saveSettings({ weatherOn: e.target.checked })} />
          <span>
            <b>실제 날씨 보여주기</b>
            <br />
            <span className="muted">비가 오면 비, 구름이 끼면 구름, 맑으면 해(밤엔 별)가 펫 창에 보여요. 30분마다 새로 받아요.</span>
          </span>
        </label>
        {s.weatherOn && (
          <>
            <div className="label">
              도시 {s.place ? `· ${s.place.name}` : "· 아직 안 골랐어요"}
              {weather && (
                <span className="muted">
                  {" "}
                  — 지금 {WEATHER_LABEL[weather.kind]} {weather.temp}°C
                </span>
              )}
            </div>
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
              <input value={placeQ} maxLength={40} placeholder="다른 지역 검색 (예: 춘천시, Gangneung)" onChange={(e) => setPlaceQ(e.target.value)} />
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
            <p className="muted small-left">고른 도시의 좌표만 날씨 서비스(Open-Meteo)에 보내요. 내 위치를 자동으로 찾지 않아요.</p>
          </>
        )}
      </section>

      <section>
        <h2>내 상태</h2>
        <label>
          상태 메시지 <span className="muted">· 친구 화면에도 펫 위에 작게 보여요</span>
          <div className="inline">
            <input
              value={msgDraft}
              maxLength={MSG_MAX}
              placeholder="예: 점심 먹는 중 🍜"
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
        </label>
        <label className="check">
          <input type="checkbox" checked={s.busy} onChange={(e) => saveSettings({ busy: e.target.checked })} />
          <span>
            <b>바쁨 (방해 금지)</b>
            <br />
            <span className="muted">친구에게 빨간 불로 보이고, 이모티콘을 받아도 답장 추천을 띄우지 않아요.</span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.quiet} onChange={(e) => saveSettings({ quiet: e.target.checked })} />
          <span>
            <b>조용히 모드</b>
            <br />
            <span className="muted">친구 채팅 말풍선을 띄우지 않아요. 내 펫 이름표 옆에 안 읽은 개수(💬)만 쌓이고, 아래 최근 대화에서 모아 볼 수 있어요.</span>
          </span>
        </label>
        <p className="muted small-left">
          🟢 온라인 · 🟠 자리 비움(5분) / 잠수(30분~) · 🔴 바쁨 · ⚪ 오프라인. 자리 비움은 키보드와 마우스 입력으로 판단해요.
        </p>
      </section>

      <section>
        <h2>방</h2>
        {s.room ? (
          <>
            <p>
              <b>{s.room.name}</b>에 있어요. 친구에게 초대 코드를 알려주세요.
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
                  // 친구들 화면에서 내 회색 펫도 지운다 (실패해도 나가기는 한다)
                  await supabase.rpc("leave_room", { p_room: s.room!.id, p_device: s.deviceId });
                  saveSettings({ room: null });
                }}
              >
                나가기
              </button>
            </div>
          </>
        ) : (
          <>
            <label>
              초대 코드로 들어가기
              <div className="inline">
                <input value={code} maxLength={6} placeholder="예: 26MMRA" onChange={(e) => setCode(e.target.value.toUpperCase())} />
                <button disabled={code.trim().length !== 6} onClick={() => enter(supabase.rpc("join_room", { p_code: code }), "그런 코드의 방이 없어요")}>
                  들어가기
                </button>
              </div>
            </label>
            <label>
              새 방 만들기
              <div className="inline">
                <input value={roomName} maxLength={30} placeholder="방 이름 (비우면 '우리 방')" onChange={(e) => setRoomName(e.target.value)} />
                <button onClick={() => enter(supabase.rpc("create_room", { p_name: roomName }), "방을 만들지 못했어요")}>만들기</button>
              </div>
            </label>
          </>
        )}
        {msg && <p className="error">{msg}</p>}
      </section>

      {s.room && (
        <section>
          <h2>최근 대화</h2>
          {history.length === 0 ? (
            <p className="muted">아직 대화가 없어요. 펫을 클릭하면 말할 수 있어요.</p>
          ) : (
            <ul className="history">
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

      <section className="quit">
        <button className="ghost" onClick={() => invoke("quit_app")}>
          펫 종료
        </button>
        <span className="muted">메뉴 막대의 쿼카 아이콘이나 펫 오른쪽 클릭으로도 끌 수 있어요</span>
      </section>

      <p className="muted small">펫 클릭: 채팅 · 끌기: 옮기기 · 오른쪽 클릭: 설정·종료 메뉴</p>
    </main>
  );
}
