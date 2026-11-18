#!/bin/sh
# 자동 업데이트 서명 키를 만들어 GitHub Secrets에 등록하고, 공개 키를 앱 설정에 넣는다. 직접 실행하는 스크립트다.
# 앱은 이 키로 서명된 업데이트만 설치한다. 키 파일을 잃어버리면 이후 업데이트를 못 하니 꼭 보관할 것.
#
# 사용: sh scripts/setup-updater-key.sh
set -eu

REPO="epww1502/mochi-pet"
KEY="$HOME/.tauri/mochi-pet.key"
CONF="src-tauri/tauri.conf.json"
cd "$(dirname "$0")/.."

GH_TOKEN=$(gh auth token --user epww1502)
export GH_TOKEN

printf "키 비밀번호 (새로 만들 때 정하고, 이미 있으면 그때 정한 것): "
stty -echo
read -r PASSWORD
stty echo
echo

if [ -f "$KEY" ]; then
  echo "이미 있는 키를 씁니다: $KEY"
else
  mkdir -p "$(dirname "$KEY")"
  npx tauri signer generate --ci -w "$KEY" -p "$PASSWORD" >/dev/null
  chmod 600 "$KEY"
  echo "새 키를 만들었습니다: $KEY  (이 파일과 비밀번호를 안전한 곳에 백업해 두세요)"
fi

# 비밀번호가 맞는지 시험 서명해 본다
TEST=$(mktemp)
echo test > "$TEST"
if ! TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$PASSWORD" npx tauri signer sign "$TEST" >/dev/null 2>&1; then
  rm -f "$TEST" "$TEST.sig"
  echo "비밀번호가 키와 맞지 않아요. 다시 실행해 주세요."
  exit 1
fi
rm -f "$TEST" "$TEST.sig"

gh secret set TAURI_SIGNING_PRIVATE_KEY -R "$REPO" < "$KEY"
printf '%s' "$PASSWORD" | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD -R "$REPO"

# 공개 키는 비밀이 아니다: 앱 설정에 넣어 커밋한다
python3 - "$CONF" "$KEY.pub" <<'PY'
import json, sys
conf, pub = sys.argv[1], sys.argv[2]
c = json.load(open(conf))
c["plugins"]["updater"]["pubkey"] = open(pub).read().strip()
json.dump(c, open(conf, "w"), indent=2, ensure_ascii=False)
open(conf, "a").write("\n")
PY

echo
echo "등록 완료. 공개 키를 $CONF 에 넣었어요."
gh secret list -R "$REPO" | grep TAURI || true
