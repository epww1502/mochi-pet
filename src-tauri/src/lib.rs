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

/// 맨 앞에 있는 다른 앱 창의 위치 [x, y, 너비, 높이] (화면 좌표, 논리 px). 펫이 그 위 모서리로 올라간다.
/// 창의 위치만 읽고 내용·제목은 읽지 않는다. 맥과 윈도우에서 지원.
/// async: 창 목록을 도는 동안 메인 스레드(화면 그리기)를 붙잡지 않는다.
#[tauri::command]
async fn front_window(app: AppHandle) -> Option<[f64; 4]> {
    let r = front_window_rect()?;
    // 윈도우는 실제 픽셀로 준다. 펫 창(main)의 배율로 나눠 펫 창과 같은 논리 px로 맞춘다.
    #[cfg(target_os = "windows")]
    {
        let sf = app.get_webview_window("main").and_then(|w| w.scale_factor().ok()).unwrap_or(1.0);
        Some(r.map(|v| v / sf))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Some(r)
    }
}

#[cfg(target_os = "macos")]
fn front_window_rect() -> Option<[f64; 4]> {
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;
    use core_graphics::geometry::CGRect;
    use core_graphics::window::{copy_window_info, kCGNullWindowID, kCGWindowListExcludeDesktopElements, kCGWindowListOptionOnScreenOnly};

    let list = copy_window_info(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID)?;
    let me = std::process::id() as f64;
    // 목록은 앞에 있는 창부터 온다
    for item in list.iter() {
        let d: CFDictionary<CFString, CFType> = unsafe { CFDictionary::wrap_under_get_rule(*item as _) };
        let num = |k: &str| d.find(CFString::new(k)).and_then(|v| v.downcast::<CFNumber>()).and_then(|n| n.to_f64());
        if num("kCGWindowLayer") != Some(0.0) || num("kCGWindowOwnerPID") == Some(me) || num("kCGWindowAlpha").unwrap_or(1.0) < 0.1 {
            continue; // 메뉴 막대·Dock 같은 특수 창, 우리 앱 창, 안 보이는 창은 건너뛴다
        }
        let bounds = d.find(CFString::new("kCGWindowBounds"))?;
        let bounds: CFDictionary = unsafe { CFDictionary::wrap_under_get_rule(bounds.as_CFTypeRef() as _) };
        let r = CGRect::from_dict_representation(&bounds)?;
        if r.size.width < 200.0 || r.size.height < 100.0 {
            continue; // 작은 팝업은 무시
        }
        return Some([r.origin.x, r.origin.y, r.size.width, r.size.height]);
    }
    None
}

/// 윈도우: 위에서부터 창을 차례로 보며 맥과 같은 기준으로 고른다 (실제 픽셀 좌표).
#[cfg(target_os = "windows")]
fn front_window_rect() -> Option<[f64; 4]> {
    use std::ffi::c_void;
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Dwm::{DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GW_HWNDNEXT, GWL_EXSTYLE, GetClassNameW, GetTopWindow, GetWindow, GetWindowLongW, GetWindowRect, GetWindowTextLengthW,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
    };

    let me = std::process::id();
    unsafe {
        let mut h = GetTopWindow(std::ptr::null_mut()); // 맨 위 창부터
        let mut guard = 0;
        while !h.is_null() && guard < 2000 {
            guard += 1;
            let cur = h;
            h = GetWindow(cur, GW_HWNDNEXT);

            if IsWindowVisible(cur) == 0 || IsIconic(cur) != 0 || GetWindowTextLengthW(cur) == 0 {
                continue; // 안 보이는 창, 최소화된 창, 제목 없는 창(팝업·도구)
            }
            let ex = GetWindowLongW(cur, GWL_EXSTYLE) as u32;
            if ex & (WS_EX_TOOLWINDOW | WS_EX_TOPMOST) != 0 {
                continue; // 작업 표시줄·항상 위 창 (맥의 특수 창 층과 같은 취급)
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(cur, &mut pid);
            if pid == me {
                continue; // 우리 앱 창
            }
            let mut cloaked = 0u32;
            let hr = DwmGetWindowAttribute(cur, DWMWA_CLOAKED as _, &mut cloaked as *mut u32 as *mut c_void, 4);
            if hr == 0 && cloaked != 0 {
                continue; // 다른 가상 데스크톱이나 숨은 스토어 앱 창
            }
            let mut class = [0u16; 32];
            let n = GetClassNameW(cur, class.as_mut_ptr(), class.len() as i32).max(0) as usize;
            let class = String::from_utf16_lossy(&class[..n]);
            if class == "Progman" || class == "WorkerW" {
                continue; // 바탕 화면
            }
            // 눈에 보이는 테두리 기준 (GetWindowRect는 안 보이는 크기 조절 테두리까지 넣는다)
            let mut r = RECT { left: 0, top: 0, right: 0, bottom: 0 };
            let ok = DwmGetWindowAttribute(cur, DWMWA_EXTENDED_FRAME_BOUNDS as _, &mut r as *mut RECT as *mut c_void, std::mem::size_of::<RECT>() as u32) == 0
                || GetWindowRect(cur, &mut r) != 0;
            if !ok {
                continue;
            }
            let (w, hgt) = ((r.right - r.left) as f64, (r.bottom - r.top) as f64);
            if w < 200.0 || hgt < 100.0 {
                continue; // 작은 팝업은 무시
            }
            return Some([r.left as f64, r.top as f64, w, hgt]);
        }
    }
    None
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn front_window_rect() -> Option<[f64; 4]> {
    None
}

/// 펫 오른쪽 클릭 메뉴와 설정 창의 "펫 종료"
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// async여야 한다: 동기 커맨드는 메인 스레드에서 돌아서, 그 안에서 창을 만들면
/// 윈도우(WebView2)는 창 생성을 기다리다 서로 멈춘다(흰 화면 "응답 없음" → 까만 창).
#[tauri::command]
async fn open_settings(app: AppHandle) {
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
        // 자동 업데이트: GitHub 최신 릴리스의 latest.json을 보고, 서명이 맞는 파일만 설치한다
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // 컴퓨터 켤 때 자동 시작 (설정에서 켜고 끈다)
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        // 친구 접속·채팅 알림 (설정에서 켠다)
        .plugin(tauri_plugin_notification::init())
        .manage(HitRects::default())
        .invoke_handler(tauri::generate_handler![set_hit_rects, idle_seconds, open_settings, quit_app, front_window])
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

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "창이 떠 있어야 해서 손으로 돌린다: cargo test -- --ignored --nocapture"]
    fn 맨_앞_창_위치를_읽는다() {
        let r = super::front_window_rect();
        println!("맨 앞 창: {r:?}");
        if let Some([_, _, w, h]) = r {
            assert!(w >= 200.0 && h >= 100.0);
        }
    }
}
