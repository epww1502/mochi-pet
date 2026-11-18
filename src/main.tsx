import React from "react";
import ReactDOM from "react-dom/client";
import { Overlay } from "./Overlay";
import { Settings } from "./Settings";
import "./styles.css";

// 같은 index.html을 두 창이 쓴다: 투명한 펫 창(main)과 설정 창(#settings)
const isSettings = location.hash === "#settings";
document.documentElement.dataset.view = isSettings ? "settings" : "overlay";

// 브라우저(npm run dev)로 화면만 볼 때: Tauri 명령을 가짜로 채운다. ?away 를 붙이면 자리 비움.
if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
  const { mockIPC, mockWindows } = await import("@tauri-apps/api/mocks");
  mockWindows("main");
  const away = new URLSearchParams(location.search).has("away");
  mockIPC((cmd) => (cmd === "idle_seconds" ? (away ? 9999 : 0) : null));
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isSettings ? <Settings /> : <Overlay />}</React.StrictMode>,
);
