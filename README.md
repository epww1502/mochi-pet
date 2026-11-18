# mochi-pet

화면 구석에 사는 픽셀 펫. 초대 코드로 친구들을 같은 방에 부르면, 서로의 펫이 나란히 서서 접속 상태를 보여주고 말풍선으로 채팅한다.

- **친구**: 초대 코드 6자리로 같은 방에 들어오면 친구 펫이 내 펫 옆에 선다.
- **온라인 판단**: 실시간 연결 + 1분마다 남기는 접속 기록. 앱을 켠 채 인터넷이 잠깐 끊겨도 온라인이고, 컴퓨터를 끄거나 인터넷이 끊기면 3분 뒤 오프라인.
- **상태**: 이름표 옆 불빛으로 보인다. 🟢 온라인 · 🟠 자리 비움(입력 없이 5분) / 잠수(30분~, "잠수 40분") · 🔴 바쁨(설정에서 켬, 답장 추천 끔) · ⚪ 오프라인(흐린 펫 + "3시간 전"). 입력 중이면 말풍선에 …
- **채팅**: 내 펫을 클릭하고 입력, Enter. 말풍선으로 7초 뜨고, 설정 창에서 최근 대화를 볼 수 있다.
- **캐릭터**: 찹쌀떡, 고양이, 곰, 유령, 쿼카 x 7가지 색. 또는 내 그림(PNG, JPG 등)을 가져와 쓴다. 64x64 이하 픽셀아트는 원본 그대로, 큰 그림은 64x64로 줄인다. 친구 화면에도 그대로 보인다.

- **화면 전체**: 펫 창이 화면 맨 아래에 화면 너비 전체로 깔린다(클릭은 펫 위에서만 받는다).
- **평소 모습**: 온라인이면 펫마다 화면 바닥을 따라 따로 걸어 다니다 쉬고, 자리 비움이면 졸고, 오프라인이면 납작하게 누워 잔다.
- **장난치기**: 내 펫을 끌고 좌우로 흔들면 어지러워하고(XX 눈, 별), 아무 펫이나 머리를 마우스로 문지르면 좋아한다(^^, 하트). 친구 펫을 클릭하면 이모티콘 12종을 보낼 수 있고, 보낼 때 내 펫이 그 이모티콘에 맞는 몸짓(웃기, 깜짝, 눈물, 신남, 손 흔들기, 하트)을 한다. 이모티콘을 받으면 답장 추천 3개가 떠서 바로 같이 반응할 수 있다. 반응은 방 안 모두의 화면에 보인다.
- **꾸미기**: 모자(리본, 왕관, 꽃, 야구모자, 고깔모자)와 이름표 꾸미기(💖 ⭐ 🌱). 친구 화면에도 보인다.
- **선물 상자**: 친구 펫을 눌러 🎁를 보내면 친구 옆에 상자가 놓이고, 친구가 열면 랜덤 모자가 나와 바로 써 볼 수 있다.
- **계절 꾸미기 (켜고 끄기)**: 설정에서 봄·여름·가을·겨울을 각각 켠다(기본 꺼짐). 켜면 계절 모자·이름표가 생기고 꽃잎·반딧불·낙엽·눈이 내린다. 겨울을 켜면 방 친구들과 같이 꾸미는 크리스마스 트리(장식 12개, 서버에 저장)가 생긴다.
- **실제 날씨 (켜고 끄기)**: 설정에서 켜고 도시를 고르면 30분마다 날씨를 받아 맑음(낮엔 해, 밤엔 별)·구름·비·눈·안개·천둥번개를 펫 창에 보여준다. 고른 도시 좌표만 Open-Meteo에 보내고, 위치를 자동으로 찾지 않는다.
- **조용히 모드**: 친구 채팅 말풍선을 숨기고 내 이름표 옆에 안 읽은 개수(💬)만 쌓는다. 누르면 설정 창의 최근 대화에서 모아 본다.
- **크기**: 내 펫 크기를 슬라이더로 60% ~ 240% (20%씩). 친구 화면에도 그 크기로 보여서 펫마다 크기가 다르다.

## 설치

| 내 컴퓨터 | 받기 |
|---|---|
| 맥 (M1 이후, Apple Silicon) | [mochi-pet-mac-apple-silicon.dmg](https://github.com/epww1502/mochi-pet/releases/latest/download/mochi-pet-mac-apple-silicon.dmg) |
| 맥 (Intel) | [mochi-pet-mac-intel.dmg](https://github.com/epww1502/mochi-pet/releases/latest/download/mochi-pet-mac-intel.dmg) |
| 윈도우 | [mochi-pet-windows-setup.exe](https://github.com/epww1502/mochi-pet/releases/latest/download/mochi-pet-windows-setup.exe) |

내 맥이 어느 쪽인지 모르면: 왼쪽 위 사과 메뉴 → 이 Mac에 관하여 → "칩"에 Apple M이 있으면 Apple Silicon, "프로세서"에 Intel이 있으면 Intel.

**맥**: dmg를 열고 mochi-pet을 응용 프로그램 폴더로 끌어다 놓는다. 개발자 서명이 없는 앱이라 처음 열 때 "확인되지 않은 개발자" 경고가 뜬다.
1. 한 번 열어 보고 경고가 뜨면 닫는다.
2. 시스템 설정 → 개인정보 보호 및 보안 → 아래쪽 "mochi-pet이(가) 차단되었습니다" 옆 **그래도 열기**.
3. 다시 열면 된다. 다음부터는 바로 열린다.

**윈도우**: 설치 파일을 실행한다. "Windows의 PC 보호" 창이 뜨면 **추가 정보 → 실행**. 관리자 권한 없이 내 계정에만 설치된다.

터미널이 편하면 맥은 이 한 줄로도 된다(경고 없이 `~/.local/bin/mochi-pet`에 설치):

```bash
curl -fsSL https://raw.githubusercontent.com/epww1502/mochi-pet/main/install.sh | sh
```

## 사용

- 처음 켜면 설정 창이 뜬다: 닉네임, 캐릭터, 방 만들기 또는 초대 코드 입력.
- 내 펫 클릭: 채팅 / 집어서 끌기: 옮기기(좌우로 흔들면 어지러워함) / 오른쪽 클릭: 설정 창.
- 이름표는 설정에서 머리 위 / 발 아래 중에 고른다.
- 내 펫 더블클릭: 크게 인사 (모두의 화면에서 쑥 커지며 손 흔들기).
- 친구 펫 클릭: 이모티콘 보내기, 물건 던지기(🏐 공 → 어질어질, 🍌 바나나 → 꽈당, 🍅 토마토 → 범벅, 🪶 깃털 → 깔깔) / 빠르게 세 번 클릭: 콕 찌르기(깜짝!) / 머리 문지르기: 쓰다듬기.
- 메뉴 막대(트레이) 아이콘: 설정 열기, 종료.

## 구조

- `src-tauri/`: Rust. 투명 창 클릭 통과(펫 위에서만 클릭을 받음), 자리 비움 감지, 트레이, 중복 실행 방지.
- `src/`: React. 펫 오버레이(`Overlay.tsx`), 설정 창(`Settings.tsx`), 픽셀 캐릭터(`sprites.ts`), Supabase 연결과 상태 로직(`state.ts`).
- 서버: Supabase. 방·메시지·멤버 테이블은 RLS로 잠겨 있고 `create_room` / `join_room` / `send_message` / `recent_messages` / `touch_member` / `list_members` / `leave_room` / `add_ornament` / `list_ornaments` / `clear_tree` 함수로만 접근한다. 켜져 있는 동안 1분마다 마지막 접속 시각을 남긴다. 접속 상태와 그림은 Realtime Presence, 채팅 말풍선은 Broadcast.
- `.github/workflows/release.yml`: `v*` 태그를 push하면 맥/윈도우 실행 파일을 Releases에 올린다.

## 개발

```bash
npm install
npm run tauri dev      # 실제 앱
npm run dev            # 브라우저에서 화면만 (Tauri 기능은 가짜, ?away 자리 비움, ?weather=rain|clouds|snow|fog|storm|clear(&night) 날씨)
npm test && cargo test --manifest-path src-tauri/Cargo.toml
```

## 알려진 한계

- 맥 실행 파일은 서명/공증이 없다. `install.sh`(curl)로 받으면 그대로 실행되지만, 브라우저로 받으면 Gatekeeper가 막는다: `xattr -d com.apple.quarantine mochi-pet`.
- 로그인이 없다. 방 id를 아는 사람은 그 방 멤버로 취급하고, 닉네임은 각자 정한다. 친구끼리 쓰는 용도. 공개 서비스로 키우려면 Supabase Auth + members 테이블 RLS로 올린다.
- 회사 네트워크가 웹소켓을 막으면 친구 상태와 채팅이 안 된다.
- 펫 창은 앱을 켰을 때 있던 모니터에 깔린다.
- 가져온 그림은 표정이 없고 숨쉬기와 졸기(흐려짐 + z)만 한다.

## 맥 서명·공증 (배포하는 사람용)

공증받은 앱은 "확인되지 않은 개발자" 경고 없이 열린다. Apple Developer Program 계정이 필요하다.

1. **인증서**: Xcode → Settings → Accounts → 내 Apple ID → Manage Certificates → `+` → **Developer ID Application**. 그다음 키체인 접근 → 로그인 → 내 인증서에서 그 인증서를 오른쪽 클릭 → 내보내기 → `.p12`(비밀번호 지정).
2. **공증 키**: App Store Connect → 사용자 및 액세스 → 통합 → App Store Connect API → 팀 키 `+` (액세스: 개발자) → `AuthKey_XXXX.p8` 다운로드, 키 ID와 Issuer ID 메모.
3. **등록**: `sh scripts/set-apple-secrets.sh 인증서.p12 AuthKey_XXXX.p8` → GitHub Secrets에 저장된다.
4. 새 태그(`v*`)를 push하면 릴리스 빌드가 서명 → 앱 공증 → dmg 공증·스테이플까지 한다. Secrets가 없으면 예전처럼 임시 서명만 한다.
