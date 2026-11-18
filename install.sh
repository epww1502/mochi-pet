#!/bin/sh
# macOS용 claude-pet 설치: 최신 릴리스 실행 파일을 ~/.local/bin에 받는다.
# curl로 받은 파일은 Gatekeeper 격리 표시가 붙지 않아 바로 실행된다.
set -eu

case "$(uname -sm)" in
  "Darwin arm64") T=aarch64-apple-darwin ;;
  "Darwin x86_64") T=x86_64-apple-darwin ;;
  *) echo "이 설치 스크립트는 macOS용이에요. Windows는 Releases 페이지에서 zip을 받아 주세요."; exit 1 ;;
esac

DIR="${CLAUDE_PET_DIR:-$HOME/.local/bin}"
mkdir -p "$DIR"
curl -fsSL "https://github.com/epww1502/claude-pet/releases/latest/download/claude-pet-$T.tar.gz" | tar xz -C "$DIR"
echo "설치 완료: $DIR/claude-pet"

case ":$PATH:" in
  *":$DIR:"*) ;;
  *) echo "참고: $DIR 가 PATH에 없어요. 플러그인은 이 위치도 찾아보지만, 터미널에서 직접 실행하려면 PATH에 추가하세요." ;;
esac
