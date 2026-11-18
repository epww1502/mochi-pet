#!/bin/sh
# 맥 앱 서명·공증에 필요한 값을 GitHub 저장소 Secrets에 등록한다. 직접 실행하는 스크립트다.
# 비밀번호와 키는 화면에 표시하지 않고, GitHub에만 저장한다(이 컴퓨터의 다른 곳에 남기지 않는다).
#
# 사용: sh scripts/set-apple-secrets.sh <인증서.p12> <AuthKey_XXXX.p8>
set -eu

REPO="epww1502/mochi-pet"
P12="${1:-}"
P8="${2:-}"
if [ ! -f "$P12" ] || [ ! -f "$P8" ]; then
  echo "사용: sh scripts/set-apple-secrets.sh <인증서.p12> <AuthKey_XXXX.p8>"
  exit 1
fi

# 개인 GitHub 계정으로 등록 (회사 계정이 활성이어도)
GH_TOKEN=$(gh auth token --user epww1502)
export GH_TOKEN

# 키체인에 있는 Developer ID 인증서 이름 (예: Developer ID Application: Hong Gildong (H8ZH4RLJ36))
IDENTITY=$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -1)
if [ -z "$IDENTITY" ]; then
  echo "키체인에서 Developer ID Application 인증서를 못 찾았어요. 안내의 1단계를 먼저 해 주세요."
  exit 1
fi
echo "서명 인증서: $IDENTITY"

printf ".p12 내보낼 때 정한 비밀번호: "
stty -echo
read -r P12_PASSWORD
stty echo
echo
printf "App Store Connect API 키 ID (예: 2X9R4HXF34): "
read -r KEY_ID
printf "Issuer ID (예: 57246542-96fe-1a63-e053-0824d011072a): "
read -r ISSUER

base64 -i "$P12" | gh secret set APPLE_CERTIFICATE -R "$REPO"
printf '%s' "$P12_PASSWORD" | gh secret set APPLE_CERTIFICATE_PASSWORD -R "$REPO"
printf '%s' "$IDENTITY" | gh secret set APPLE_SIGNING_IDENTITY -R "$REPO"
printf '%s' "$KEY_ID" | gh secret set APPLE_API_KEY -R "$REPO"
printf '%s' "$ISSUER" | gh secret set APPLE_API_ISSUER -R "$REPO"
gh secret set APPLE_API_KEY_P8 -R "$REPO" < "$P8"

echo
echo "등록 완료. 지금 등록된 Secrets:"
gh secret list -R "$REPO"
echo
echo "이제 새 버전 태그를 올리면 맥 dmg가 서명·공증돼서 경고 없이 열려요."
