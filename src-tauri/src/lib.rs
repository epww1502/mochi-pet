//! 펫 앱의 Rust 쪽: 투명 창 클릭 통과, 자리 비움 감지, 트레이 메뉴.
//! 화면(펫, 채팅, 설정)과 친구 연결은 React가 맡는다.

use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// 화면 좌표(CSS px, 창 기준) 사각형들. 이 안에 커서가 있을 때만 창이 클릭을 받는다.
#[derive(Default)]
struct HitRects(Mutex<Vec<[f64; 4]>>);

#[tauri::command]
fn set_hit_rects(rects: Vec<[f64; 4]>, state: tauri::State<HitRects>) {
    *state.0.lock().unwrap() = rects;
}

#[tauri::command]
fn idle_seconds() -> u64 {
    user_idle::UserIdle::get_time().map(|t| t.as_seconds()).unwrap_or(0)
}

#[tauri::command]
fn open_settings(app: AppHandle) {
    show_settings(&app);
}

fn show_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html#settings".into()))
        .title("펫 설정")
        .inner_size(420.0, 640.0)
        .resizable(true)
        .build();
}

pub fn run() {
    tauri::Builder::default()
        // 두 번 켜면 새로 띄우지 않고 설정 창을 연다
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show_settings(app)))
        .manage(HitRects::default())
        .invoke_handler(tauri::generate_handler![set_hit_rects, idle_seconds, open_settings])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory); // Dock 아이콘 숨김

            let handle = app.handle().clone();
            std::thread::spawn(move || click_through_loop(handle));

            let menu = Menu::with_items(
                app,
                &[
                    &MenuItem::with_id(app, "settings", "설정 열기", true, None::<&str>)?,
                    &MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?,
                ],
            )?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("mochi-pet")
                .menu(&menu)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "settings" => show_settings(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("펫을 시작하지 못했어요");
}

/// 투명 창은 기본적으로 클릭을 통과시키고, 커서가 펫이나 입력창 위에 올라오면 클릭을 받는다.
/// 클릭 통과 중에는 마우스 이벤트가 안 오므로 전역 커서 위치를 주기적으로 읽는다.
fn click_through_loop(app: AppHandle) {
    let mut ignoring: Option<bool> = None;
    loop {
        std::thread::sleep(Duration::from_millis(40));
        let Some(win) = app.get_webview_window("main") else { continue };
        let (Ok(cursor), Ok(pos), Ok(scale)) = (app.cursor_position(), win.outer_position(), win.scale_factor()) else {
            continue;
        };
        let (x, y) = ((cursor.x - pos.x as f64) / scale, (cursor.y - pos.y as f64) / scale);
        let over = app
            .state::<HitRects>()
            .0
            .lock()
            .unwrap()
            .iter()
            .any(|[l, t, w, h]| x >= *l && x <= l + w && y >= *t && y <= t + h);
        if ignoring != Some(!over) && win.set_ignore_cursor_events(!over).is_ok() {
            ignoring = Some(!over);
        }
    }
}
