//! Claude Code hook 이벤트를 받아 세션별 상태를 기억하고, 펫이 보여줄 "가장 급한" 상태 하나를 고른다.

use std::collections::HashMap;
use std::time::{Duration, Instant};

/// 우선순위 순서대로 정렬됨: 뒤에 있을수록 급하다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Mood {
    Idle,
    Done,
    Working,
    Waiting,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Status {
    pub mood: Mood,
    /// 말풍선에 띄울 문구 (Idle이면 None)
    pub text: Option<String>,
}

struct Session {
    mood: Mood,
    project: String,
    detail: Option<String>,
    at: Instant,
}

/// 끝났다는 말풍선을 이만큼 보여주고 Idle로 돌아간다.
const DONE_SHOW: Duration = Duration::from_secs(8);
/// Stop hook이 누락돼도(세션 강제 종료 등) 영원히 일하는 척하지 않게.
const STALE: Duration = Duration::from_secs(15 * 60);

#[derive(Default)]
pub struct Tracker {
    sessions: HashMap<String, Session>,
}

impl Tracker {
    /// hook stdin JSON을 그대로 받는다. 모르는 이벤트는 무시.
    pub fn apply(&mut self, ev: &serde_json::Value, now: Instant) {
        let s = |k: &str| ev.get(k).and_then(|v| v.as_str());
        let Some(id) = s("session_id") else { return };
        let mood = match s("hook_event_name") {
            Some("SessionEnd") => {
                self.sessions.remove(id);
                return;
            }
            Some("SessionStart") => Mood::Idle,
            Some("UserPromptSubmit" | "PreToolUse" | "PostToolUse") => Mood::Working,
            Some("Notification") => Mood::Waiting,
            Some("Stop") => Mood::Done,
            _ => return,
        };
        let project = s("cwd")
            .and_then(|c| std::path::Path::new(c).file_name())
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let detail = if s("hook_event_name") == Some("PreToolUse") {
            s("tool_name").map(str::to_owned)
        } else {
            None
        };
        self.sessions.insert(id.to_owned(), Session { mood, project, detail, at: now });
    }

    pub fn status(&self, now: Instant) -> Status {
        let live = |x: &Session| -> Mood {
            let age = now.saturating_duration_since(x.at);
            match x.mood {
                Mood::Done if age > DONE_SHOW => Mood::Idle,
                Mood::Working | Mood::Waiting if age > STALE => Mood::Idle,
                m => m,
            }
        };
        // 같은 우선순위면 가장 최근 세션
        let Some(top) = self.sessions.values().max_by_key(|x| (live(x), x.at)) else {
            return Status { mood: Mood::Idle, text: None };
        };
        let mood = live(top);
        let waiting_others = self
            .sessions
            .values()
            .filter(|x| live(x) == Mood::Waiting)
            .count()
            .saturating_sub(1);
        let tag = if top.project.is_empty() { String::new() } else { format!("[{}] ", top.project) };
        let text = match mood {
            Mood::Idle => None,
            Mood::Done => Some(format!("{tag}끝났어!")),
            Mood::Working => Some(match &top.detail {
                Some(tool) => format!("{tag}{tool} 하는 중"),
                None => format!("{tag}생각하는 중"),
            }),
            Mood::Waiting if waiting_others > 0 => Some(format!("{tag}확인해줘! (+{waiting_others})")),
            Mood::Waiting => Some(format!("{tag}확인해줘!")),
        };
        Status { mood, text }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ev(id: &str, name: &str) -> serde_json::Value {
        json!({ "session_id": id, "hook_event_name": name, "cwd": format!("/Users/me/git/{id}") })
    }

    #[test]
    fn 아무_세션도_없으면_쉬고_있다() {
        assert_eq!(Tracker::default().status(Instant::now()).mood, Mood::Idle);
    }

    #[test]
    fn 도구를_쓰면_프로젝트와_도구_이름을_보여준다() {
        let mut t = Tracker::default();
        let now = Instant::now();
        let mut e = ev("glab", "PreToolUse");
        e["tool_name"] = json!("Bash");
        t.apply(&e, now);
        assert_eq!(t.status(now).text.as_deref(), Some("[glab] Bash 하는 중"));
    }

    #[test]
    fn 한_세션이_일하는_중이어도_다른_세션이_확인을_기다리면_확인대기를_보여준다() {
        let mut t = Tracker::default();
        let now = Instant::now();
        t.apply(&ev("glab", "Notification"), now);
        t.apply(&ev("doit2", "UserPromptSubmit"), now + Duration::from_secs(1));
        let s = t.status(now + Duration::from_secs(1));
        assert_eq!(s.mood, Mood::Waiting);
        assert_eq!(s.text.as_deref(), Some("[glab] 확인해줘!"));
    }

    #[test]
    fn 확인을_기다리는_세션이_여럿이면_나머지_개수를_붙인다() {
        let mut t = Tracker::default();
        let now = Instant::now();
        t.apply(&ev("a", "Notification"), now);
        t.apply(&ev("b", "Notification"), now + Duration::from_secs(1));
        assert_eq!(t.status(now + Duration::from_secs(1)).text.as_deref(), Some("[b] 확인해줘! (+1)"));
    }

    #[test]
    fn 권한을_허락하면_다시_일하는_중으로_돌아간다() {
        let mut t = Tracker::default();
        let now = Instant::now();
        t.apply(&ev("a", "Notification"), now);
        t.apply(&ev("a", "PostToolUse"), now + Duration::from_secs(1));
        assert_eq!(t.status(now + Duration::from_secs(1)).mood, Mood::Working);
    }

    #[test]
    fn 끝났다는_표시는_잠시_뒤_사라진다() {
        let mut t = Tracker::default();
        let now = Instant::now();
        t.apply(&ev("a", "Stop"), now);
        assert_eq!(t.status(now).mood, Mood::Done);
        assert_eq!(t.status(now + DONE_SHOW + Duration::from_secs(1)).mood, Mood::Idle);
    }

    #[test]
    fn 종료_hook이_빠져도_오래되면_일하는_척을_멈춘다() {
        let mut t = Tracker::default();
        let now = Instant::now();
        t.apply(&ev("a", "UserPromptSubmit"), now);
        assert_eq!(t.status(now + STALE + Duration::from_secs(1)).mood, Mood::Idle);
    }

    #[test]
    fn 세션이_끝나면_목록에서_빠진다() {
        let mut t = Tracker::default();
        let now = Instant::now();
        t.apply(&ev("a", "Notification"), now);
        t.apply(&ev("a", "SessionEnd"), now);
        assert_eq!(t.status(now).mood, Mood::Idle);
    }

    #[test]
    fn 세션_id가_없거나_모르는_이벤트는_무시한다() {
        let mut t = Tracker::default();
        let now = Instant::now();
        t.apply(&json!({ "hook_event_name": "Stop" }), now);
        t.apply(&ev("a", "PreCompact"), now);
        assert_eq!(t.status(now).mood, Mood::Idle);
    }
}
