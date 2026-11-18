#!/bin/sh
# Claude Code hook → claude-pet. hook stdin JSON을 그대로 펫에 넘긴다.
# 세션이 시작될 때 펫이 꺼져 있으면 켠다. 펫이 없거나 실패해도 hook은 항상 성공으로 끝난다.
PORT="${CLAUDE_PET_PORT:-47321}"
URL="http://127.0.0.1:$PORT"
body=$(cat)

case "$body" in
  *'"SessionStart"'*)
    if ! curl -s --max-time 1 "$URL/health" >/dev/null 2>&1; then
      bin=$(command -v claude-pet 2>/dev/null || true)
      [ -z "$bin" ] && [ -x "$HOME/.local/bin/claude-pet" ] && bin="$HOME/.local/bin/claude-pet"
      if [ -n "$bin" ]; then
        nohup "$bin" >/dev/null 2>&1 &
        sleep 0.5
      fi
    fi
    ;;
esac

printf '%s' "$body" | curl -s --max-time 1 -X POST --data-binary @- "$URL/event" >/dev/null 2>&1
exit 0
