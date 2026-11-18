import { useEffect, useState } from "react";
import { PetCanvas } from "./Pet";
import { CHARACTERS, COLORS, type CharacterId } from "./sprites";
import { PX_DEFAULT, PX_MAX, PX_MIN, importImage, percentOf, saveSettings, supabase, useSettings, type Room } from "./state";

type Message = { id: number; sender_id: string; sender_name: string; body: string; created_at: string };

export function Settings() {
  const s = useSettings();
  const [name, setName] = useState(s.name);
  const [roomName, setRoomName] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<Message[]>([]);
  const [copied, setCopied] = useState(false);

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
          <PetCanvas character={s.character} color={s.color} image={s.image} mood="idle" px={6} />
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
            크기 <output>{percentOf(s.px)}%</output>
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
              <button className="ghost" onClick={() => saveSettings({ room: null })}>
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

      <p className="muted small">펫 클릭: 채팅 · 끌기: 이동 · 오른쪽 클릭: 이 창 · 트레이 아이콘: 종료</p>
    </main>
  );
}
