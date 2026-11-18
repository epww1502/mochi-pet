//! 화면 구석에 사는 픽셀 펫. Claude Code hook이 보내는 이벤트로 표정과 말풍선이 바뀐다.

mod tracker;

use eframe::egui::{self, Color32, Pos2, Rect, Sense, Shape, Stroke, Vec2};
use std::io::Read;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tracker::{Mood, Tracker};

const DEFAULT_PORT: u16 = 47321;
const WIN: Vec2 = Vec2::new(200.0, 200.0);
const PX: f32 = 6.0; // 픽셀 하나의 화면 크기

fn main() -> eframe::Result {
    let port = std::env::var("CLAUDE_PET_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(DEFAULT_PORT);
    // localhost만 연다: 같은 PC의 hook만 받는다.
    let server = match tiny_http::Server::http(("127.0.0.1", port)) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("포트 {port}를 열 수 없어요 (이미 펫이 떠 있나요?): {e}");
            std::process::exit(1);
        }
    };
    let tracker = Arc::new(Mutex::new(Tracker::default()));

    // ponytail: 창(200x200)의 투명한 부분도 클릭을 막는다. 거슬리면 전역 커서 위치를 읽어
    // 캐릭터 밖일 때 ViewportCommand::MousePassthrough(true)로 바꾸는 루프를 넣으면 된다.
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size(WIN)
            .with_resizable(false)
            .with_decorations(false)
            .with_transparent(true)
            .with_has_shadow(false)
            .with_always_on_top()
            .with_taskbar(false),
        ..Default::default()
    };

    eframe::run_native(
        "claude-pet",
        options,
        Box::new(move |cc| {
            load_korean_font(&cc.egui_ctx);
            let ctx = cc.egui_ctx.clone();
            let t = tracker.clone();
            std::thread::spawn(move || serve(server, t, ctx));
            Ok(Box::new(Pet { tracker, born: Instant::now() }))
        }),
    )
}

/// hook이 `curl --data-binary @-`로 보낸 JSON을 받는다.
fn serve(server: tiny_http::Server, tracker: Arc<Mutex<Tracker>>, ctx: egui::Context) {
    for mut req in server.incoming_requests() {
        // 브라우저에서 온 요청(웹페이지가 localhost로 쏘는 것)은 거절. curl은 Origin을 안 붙인다.
        let from_browser = req.headers().iter().any(|h| h.field.equiv("Origin"));
        let code = match (req.method(), req.url()) {
            (tiny_http::Method::Get, "/health") => 200,
            (tiny_http::Method::Post, "/event") if !from_browser => {
                let mut body = String::new();
                let ok = req.as_reader().take(1 << 20).read_to_string(&mut body).is_ok();
                match serde_json::from_str::<serde_json::Value>(&body) {
                    Ok(ev) if ok => {
                        tracker.lock().unwrap().apply(&ev, Instant::now());
                        ctx.request_repaint();
                        204
                    }
                    _ => 400,
                }
            }
            _ => 404,
        };
        let _ = req.respond(tiny_http::Response::empty(code));
    }
}

fn load_korean_font(ctx: &egui::Context) {
    const CANDIDATES: &[&str] = &[
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
        r"C:\Windows\Fonts\malgun.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    ];
    let Some(bytes) = CANDIDATES.iter().find_map(|p| std::fs::read(p).ok()) else {
        eprintln!("한글 폰트를 못 찾았어요. 말풍선 글자가 깨질 수 있어요.");
        return;
    };
    let mut fonts = egui::FontDefinitions::default();
    fonts.font_data.insert("kr".into(), Arc::new(egui::FontData::from_owned(bytes)));
    for fam in [egui::FontFamily::Proportional, egui::FontFamily::Monospace] {
        fonts.families.entry(fam).or_default().insert(0, "kr".into());
    }
    ctx.set_fonts(fonts);
}

struct Pet {
    tracker: Arc<Mutex<Tracker>>,
    born: Instant,
}

impl eframe::App for Pet {
    fn clear_color(&self, _: &egui::Visuals) -> [f32; 4] {
        [0.0; 4]
    }

    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let status = self.tracker.lock().unwrap().status(Instant::now());
        let t = self.born.elapsed().as_secs_f32();
        let ctx = ui.ctx().clone();

        // 캐릭터 위치: 창 아래 가운데, 기분에 따라 들썩인다.
        let hop = match status.mood {
            Mood::Idle => (t * 1.6).sin().max(0.0).round(), // 숨쉬기 1px
            Mood::Working => ((t * 9.0).sin().abs() * 1.5).round(),
            Mood::Waiting => ((t * 6.0).sin().abs() * 4.0).round(),
            Mood::Done => 0.0,
        };
        let origin = Pos2::new((WIN.x - 16.0 * PX) / 2.0, WIN.y - 15.0 * PX - hop * PX);
        let body = Rect::from_min_size(origin, Vec2::new(16.0 * PX, 14.0 * PX));

        let painter = ui.painter();
        draw_pet(painter, origin, status.mood, t);
        if let Some(text) = &status.text {
            draw_bubble(painter, body, text, status.mood);
        }

        // 끌어서 옮기기, 오른쪽 클릭으로 종료. 위치는 eframe이 기억한다.
        let r = ui.interact(body, ui.scope_id().with("pet"), Sense::click_and_drag());
        if r.drag_started() {
            ctx.send_viewport_cmd(egui::ViewportCommand::StartDrag);
        }
        r.context_menu(|ui| {
            if ui.button("펫 종료").clicked() {
                ui.ctx().send_viewport_cmd(egui::ViewportCommand::Close);
            }
        });

        // 애니메이션용으로 초당 약 12번만 다시 그린다 (상시 실행이라 CPU를 아낀다).
        ctx.request_repaint_after(Duration::from_millis(80));
    }
}

const OUTLINE: Color32 = Color32::from_rgb(0x5b, 0x3a, 0x29);
const BODY: Color32 = Color32::from_rgb(0xff, 0xe7, 0xc7);
const SHINE: Color32 = Color32::WHITE;
const LEAF: Color32 = Color32::from_rgb(0x5d, 0xbb, 0x63);
const EYE: Color32 = Color32::from_rgb(0x2b, 0x1b, 0x14);
const CHEEK: Color32 = Color32::from_rgb(0xf5, 0x9a, 0xa0);

/// 새싹이 난 찹쌀떡. 16x13 + 발.
const SPRITE: [&str; 13] = [
    ".......ll.......",
    ".....oooooo.....",
    "...oobbbbbboo...",
    "..obsbbbbbbbbo..",
    ".obsbbbbbbbbbbo.",
    ".obbbbbbbbbbbbo.",
    "obbbbbbbbbbbbbbo",
    "obbbbbbbbbbbbbbo",
    "obbbbbbbbbbbbbbo",
    "obbbbbbbbbbbbbbo",
    ".obbbbbbbbbbbbo.",
    "..oobbbbbbbboo..",
    "....oooooooo....",
];

fn draw_pet(p: &egui::Painter, origin: Pos2, mood: Mood, t: f32) {
    let dot = |x: i32, y: i32, c: Color32| {
        let min = origin + Vec2::new(x as f32 * PX, y as f32 * PX);
        p.rect_filled(Rect::from_min_size(min, Vec2::splat(PX)), 0.0, c);
    };
    let working = mood == Mood::Working;
    let leaf_shift = i32::from(working && (t * 4.0) as i32 % 2 == 0);
    for (y, row) in SPRITE.iter().enumerate() {
        for (x, ch) in row.chars().enumerate() {
            let (x, y) = (x as i32, y as i32);
            match ch {
                'o' => dot(x, y, OUTLINE),
                'b' => dot(x, y, BODY),
                's' => dot(x, y, SHINE),
                'l' => dot(x + leaf_shift, y, LEAF),
                _ => {}
            }
        }
    }
    // 발: 일할 때는 번갈아 동동
    let step = (t * 8.0) as i32 % 2 == 0;
    for (xs, lifted) in [([3, 4], working && step), ([11, 12], working && !step)] {
        for x in xs {
            dot(x, 13 - i32::from(lifted), OUTLINE);
        }
    }

    let blink = mood == Mood::Idle && t % 3.5 < 0.15;
    let eyes: &[(i32, i32)] = match mood {
        _ if blink => &[(4, 7), (5, 7), (10, 7), (11, 7)],
        Mood::Idle => &[(5, 6), (5, 7), (10, 6), (10, 7)],
        Mood::Working => &[(5, 7), (5, 8), (10, 7), (10, 8)], // 아래(키보드)를 본다
        Mood::Waiting => &[(4, 6), (5, 6), (4, 7), (5, 7), (10, 6), (11, 6), (10, 7), (11, 7)],
        Mood::Done => &[(4, 7), (5, 6), (6, 7), (9, 7), (10, 6), (11, 7)], // ^^
    };
    for &(x, y) in eyes {
        dot(x, y, EYE);
    }
    let mouth: &[(i32, i32)] = match mood {
        Mood::Waiting => &[(7, 9), (8, 9), (7, 10), (8, 10)],
        Mood::Done => &[(6, 9), (7, 10), (8, 10), (9, 9)],
        _ => &[(7, 9), (8, 9)],
    };
    for &(x, y) in mouth {
        dot(x, y, EYE);
    }
    if !working {
        dot(3, 8, CHEEK);
        dot(12, 8, CHEEK);
    }
}

fn draw_bubble(p: &egui::Painter, body: Rect, text: &str, mood: Mood) {
    let (fill, line) = match mood {
        Mood::Waiting => (Color32::from_rgb(0xff, 0xe3, 0xe3), Color32::from_rgb(0xd6, 0x45, 0x45)),
        _ => (Color32::WHITE, OUTLINE),
    };
    let galley = p.layout(text.to_owned(), egui::FontId::proportional(13.0), EYE, WIN.x - 24.0);
    let size = galley.size() + Vec2::new(16.0, 10.0);
    let bottom = body.top() - 8.0;
    let rect = Rect::from_min_size(Pos2::new((WIN.x - size.x) / 2.0, bottom - size.y), size);
    let cx = WIN.x / 2.0;
    let tail = vec![Pos2::new(cx - 6.0, bottom - 1.0), Pos2::new(cx + 6.0, bottom - 1.0), Pos2::new(cx, bottom + 7.0)];
    p.add(Shape::convex_polygon(tail, fill, Stroke::new(2.0, line)));
    p.rect(rect, 8.0, fill, Stroke::new(2.0, line), egui::StrokeKind::Inside);
    // 꼬리와 몸통 사이 테두리를 지운다
    p.line_segment([Pos2::new(cx - 4.0, bottom - 1.0), Pos2::new(cx + 4.0, bottom - 1.0)], Stroke::new(3.0, fill));
    p.galley(rect.min + Vec2::new(8.0, 5.0), galley, EYE);
}
