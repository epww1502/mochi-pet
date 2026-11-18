# claude-pet

화면 구석에 사는 찹쌀떡 펫. Claude Code 세션 상태를 표정과 말풍선으로 알려준다.

| 상태 | 언제 | 모습 |
|---|---|---|
| 쉬는 중 | 세션 없음, 끝난 지 8초 지남 | 숨쉬기, 가끔 눈 깜빡 |
| 일하는 중 | 프롬프트 제출, 도구 사용 | 발 동동, 새싹 흔들, `[프로젝트] Bash 하는 중` |
| 확인해줘! | 권한 요청, 입력 대기 알림 | 놀란 눈으로 콩콩 점프, 빨간 말풍선 |
| 끝났어! | 응답 완료 | `^^` 웃는 얼굴 |

세션이 여러 개면 가장 급한 것(확인 대기 > 일하는 중 > 완료)을 보여준다.

## 설치 (2단계)

**1. 펫 실행 파일**

macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/epww1502/claude-pet/main/install.sh | sh
```

`~/.local/bin/claude-pet`에 설치된다. Windows는 [Releases](https://github.com/epww1502/claude-pet/releases)에서 zip을 받는다. Rust가 있으면 `cargo install --git https://github.com/epww1502/claude-pet`도 된다.

**2. Claude Code 플러그인 (hook 자동 설정)**

Claude Code 안에서:

```text
/plugin install mochi-pet --marketplace epww1502/claude-pet
```

또는 터미널에서:

```bash
claude plugin marketplace add epww1502/claude-pet && claude plugin install mochi-pet@mochi-pet
```

이제 Claude Code 세션을 열면 펫이 꺼져 있을 때 자동으로 켜진다. 펫은 `PATH`나 `~/.local/bin`에서 찾는다.

## 사용

- 캐릭터를 끌어서 옮기면 위치를 기억한다.
- 오른쪽 클릭 → 펫 종료.
- 포트 바꾸기: 환경변수 `CLAUDE_PET_PORT` (펫과 Claude Code 양쪽에 같은 값).

## 플러그인 없이 직접 연결

`~/.claude/settings.json`의 `hooks`에 추가한다. 모든 이벤트가 같은 명령을 쓴다 (hook이 stdin으로 주는 JSON을 그대로 전달). 펫이 꺼져 있어도 hook은 조용히 넘어간다. 플러그인과 같이 쓰면 이벤트가 두 번 가니 둘 중 하나만 쓴다.

```json
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "curl -s --max-time 1 -X POST --data-binary @- http://127.0.0.1:47321/event >/dev/null 2>&1 || true" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "curl -s --max-time 1 -X POST --data-binary @- http://127.0.0.1:47321/event >/dev/null 2>&1 || true" }] }],
    "PreToolUse":       [{ "matcher": "*", "hooks": [{ "type": "command", "command": "curl -s --max-time 1 -X POST --data-binary @- http://127.0.0.1:47321/event >/dev/null 2>&1 || true" }] }],
    "PostToolUse":      [{ "matcher": "*", "hooks": [{ "type": "command", "command": "curl -s --max-time 1 -X POST --data-binary @- http://127.0.0.1:47321/event >/dev/null 2>&1 || true" }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "curl -s --max-time 1 -X POST --data-binary @- http://127.0.0.1:47321/event >/dev/null 2>&1 || true" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "curl -s --max-time 1 -X POST --data-binary @- http://127.0.0.1:47321/event >/dev/null 2>&1 || true" }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "curl -s --max-time 1 -X POST --data-binary @- http://127.0.0.1:47321/event >/dev/null 2>&1 || true" }] }]
  }
}
```

손으로 확인해 보기:

```bash
echo '{"session_id":"t","hook_event_name":"Notification","cwd":"/tmp/demo"}' | curl -s -X POST --data-binary @- http://127.0.0.1:47321/event
```

## 구조

- `src/tracker.rs`: hook 이벤트 → 세션별 상태 → 보여줄 상태 하나. 테스트는 `cargo test`.
- `plugin/`: Claude Code 플러그인 (`hooks/pet-hook.sh`가 이벤트 전달과 자동 실행 담당). 마켓플레이스 정의는 `.claude-plugin/marketplace.json`.
- `.github/workflows/release.yml`: `v*` 태그를 push하면 맥/윈도우 실행 파일을 Releases에 올린다.
- `src/main.rs`: 투명 창(eframe), 픽셀 캐릭터, 말풍선, `127.0.0.1` HTTP 수신. `Origin` 헤더가 붙은 요청(브라우저)은 거절한다.

## 개발

```bash
cargo run --release
cargo test
```

## 알려진 한계

- 맥 실행 파일은 서명/공증이 없다. `install.sh`(curl)로 받으면 그대로 실행되지만, 브라우저로 받으면 Gatekeeper가 막는다: `xattr -d com.apple.quarantine claude-pet`.

- 200x200 창의 투명한 부분도 클릭을 막는다. 화면 구석에 두면 거의 안 거슬린다.
- macOS에서 Dock 아이콘이 보이고, 전체화면 앱(별도 Space) 위에는 안 뜬다. 고치려면 `objc2-app-kit`으로 `NSApplicationActivationPolicyAccessory`와 `collectionBehavior`를 설정하면 된다.
- 캐릭터 그림은 `src/main.rs`의 `SPRITE` 배열(16x13 아스키 아트)과 색 상수를 고치면 바뀐다.
