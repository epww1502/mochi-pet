# mochi-pet

화면 구석에 사는 픽셀 펫. 초대 코드로 친구들을 같은 방에 부르면, 서로의 펫이 나란히 서서 접속 상태를 보여주고 말풍선으로 채팅한다.

- **친구**: 초대 코드 6자리로 같은 방에 들어오면 친구 펫이 내 펫 옆에 선다.
- **상태**: 접속 중, 자리 비움(5분 동안 입력 없음, 조는 표정), 입력 중(…)이 실시간으로 보인다.
- **채팅**: 내 펫을 클릭하고 입력, Enter. 말풍선으로 7초 뜨고, 설정 창에서 최근 대화를 볼 수 있다.
- **캐릭터**: 찹쌀떡, 고양이, 곰, 유령 x 6가지 색. 또는 내 그림(PNG, JPG 등)을 가져오면 32x32 픽셀로 줄여서 쓴다. 친구 화면에도 그대로 보인다.

## 설치

macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/epww1502/mochi-pet/main/install.sh | sh
```

`~/.local/bin/mochi-pet`에 설치된다. Windows는 [Releases](https://github.com/epww1502/mochi-pet/releases)에서 zip을 받는다.

## 사용

- 처음 켜면 설정 창이 뜬다: 닉네임, 캐릭터, 방 만들기 또는 초대 코드 입력.
- 내 펫 클릭: 채팅 / 끌기: 이동(위치 기억) / 오른쪽 클릭: 설정 창.
- 메뉴 막대(트레이) 아이콘: 설정 열기, 종료.

## 구조

- `src-tauri/`: Rust. 투명 창 클릭 통과(펫 위에서만 클릭을 받음), 자리 비움 감지, 트레이, 중복 실행 방지.
- `src/`: React. 펫 오버레이(`Overlay.tsx`), 설정 창(`Settings.tsx`), 픽셀 캐릭터(`sprites.ts`), Supabase 연결과 상태 로직(`state.ts`).
- 서버: Supabase. 방과 메시지 테이블은 RLS로 잠겨 있고 `create_room` / `join_room` / `send_message` / `recent_messages` 함수로만 접근한다. 접속 상태와 그림은 Realtime Presence, 채팅 말풍선은 Broadcast.
- `.github/workflows/release.yml`: `v*` 태그를 push하면 맥/윈도우 실행 파일을 Releases에 올린다.

## 개발

```bash
npm install
npm run tauri dev      # 실제 앱
npm run dev            # 브라우저에서 화면만 (Tauri 기능은 가짜, ?away 로 자리 비움 보기)
npm test && cargo test --manifest-path src-tauri/Cargo.toml
```

## 알려진 한계

- 맥 실행 파일은 서명/공증이 없다. `install.sh`(curl)로 받으면 그대로 실행되지만, 브라우저로 받으면 Gatekeeper가 막는다: `xattr -d com.apple.quarantine mochi-pet`.
- 로그인이 없다. 방 id를 아는 사람은 그 방 멤버로 취급하고, 닉네임은 각자 정한다. 친구끼리 쓰는 용도. 공개 서비스로 키우려면 Supabase Auth + members 테이블 RLS로 올린다.
- 회사 네트워크가 웹소켓을 막으면 친구 상태와 채팅이 안 된다.
- 한 줄에 보이는 친구는 6명 정도까지(창 너비 720px).
- 가져온 그림은 표정이 없고 숨쉬기와 졸기(흐려짐 + z)만 한다.
