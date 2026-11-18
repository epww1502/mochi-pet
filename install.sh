#!/bin/sh
# macOS용 mochi-pet 설치: 최신 릴리스 실행 파일을 ~/.local/bin에 받는다.
# curl로 받은 파일은 Gatekeeper 격리 표시가 붙지 않아 바로 실행된다.
set -eu

case "$(uname -sm)" in
  "Darwin arm64") T=aarch64-apple-darwin ;;
  "Darwin x86_64") T=x86_64-apple-darwin ;;
  *) echo "이 설치 스크립트는 macOS용이에요. Windows는 mochi-pet-windows-setup.exe를 받아 주세요: https://github.com/epww1502/mochi-pet/releases/latest"; exit 1 ;;
esac

DIR="${MOCHI_PET_DIR:-$HOME/.local/bin}"
mkdir -p "$DIR"
curl -fsSL "https://github.com/epww1502/mochi-pet/releases/latest/download/mochi-pet-$T.tar.gz" | tar xz -C "$DIR"
echo "설치 완료: $DIR/mochi-pet"

case ":$PATH:" in
  *":$DIR:"*) ;;
  *) echo "참고: $DIR 가 PATH에 없어요. 터미널에서 mochi-pet으로 실행하려면 PATH에 추가하세요." ;;
esac
