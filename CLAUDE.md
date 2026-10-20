# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**온그린(On Green)** — 골프 스코어카드 모바일 웹앱 (v10.1). 한 명이 라운드 점수를 입력하고 통계를 보는 모바일 우선(max-width 430px) 단일 페이지 앱(SPA)입니다. 코드와 주석은 모두 한국어입니다.

빌드 도구, 패키지 매니저, 테스트 프레임워크가 **없습니다**. 순수 정적 프런트엔드(HTML/CSS/JS) + Google Apps Script 백엔드 구조입니다.

## 실행 / 개발

- 실행: `index.html`을 브라우저로 열면 됩니다. 번들러나 dev 서버가 필요 없습니다. (`fetch` CORS 때문에 `file://`보다는 간단한 정적 서버 권장: 예 `python3 -m http.server`)
- 백엔드: 별도 배포된 Google Apps Script 웹앱(`/exec` URL)과 통신합니다. 백엔드 소스는 **`backend/Apps_Script.gs`** 입니다(v13부터 저장소에서 관리). 고친 뒤에는 Apps Script 편집기에 전체를 붙여넣고 [배포 관리] → [새 버전]으로 배포합니다.
- 빌드/린트 명령 없음.
- **테스트**: `node tests/data-safety.test.js` — 라운드 데이터 안전장치(서버·로컬 병합, 미동기화 대기목록, 코스 라벨 복구) 자동 테스트. 설치할 것 없는 순수 Node 스크립트이며, `app.js` 소스에서 해당 함수를 직접 뽑아 검사합니다. **`mergeRounds`·`pendGet`/`markSaved`/`markDeleted`/`pendResolve`·`applyServerRounds`/`fetchRounds`/`pushRounds`·`healRoundLabels`·삭제 되돌리기(`delHeld`/`delHoldStart`/`delUndo`) 를 고칠 때는 반드시 이 테스트를 돌리세요.** (두 기기+가짜 서버로 "한 기기에서 지운 라운드가 다른 기기 때문에 되살아나지 않는지"도 검사합니다.)
  - `node tests/course-map.test.js` — 골프장 홀맵(공식맵) 저장 안전장치 검사(저장 직전 최신 목록 위에 바뀐 홀만 얹기, id 없는 골프장 혼동 방지). `findCourse`·`refreshOfficial`·`parDiffs`/`applyParDiffs`·`persistParsToOfficial`/`persistParsNow`·`mergeCourseForm` 을 고칠 때 돌리세요.
  - `node tests/backend.test.js` — 서버(`backend/Apps_Script.gs`) 라운드 저장 안전장치 검사. 실제 소스를 가짜 구글 시트(`tests/gas-mock.js`) 위에서 돌립니다. **`saveRounds_`·`getRounds_`·`deleteUser_`·복구(`recover*`·`xlsxSheetRows_`)를 고칠 때 반드시 돌리세요.**
  - `node tests/blowup.test.js` — 블로업 원인 분해(`blowupPartsOf`, `stat.js`)의 원인별 타수 합 = 홀 오버파 검사. `blowupPartsOf` 를 고칠 때 돌리세요.
  - **자동 실행(CI)**: `.github/workflows/test.yml` 이 PR 과 `main` 푸시마다 위 4개 테스트와 문법 검사(`node --check`)를 돌립니다. 테스트를 새로 만들면 여기에도 한 줄 추가하세요.

## 아키텍처 (방 비유)

코드는 "방"이라는 비유로 역할이 명확히 분리되어 있습니다. 새 코드는 역할에 맞는 파일에만 추가하세요.

- **`api.js` — 통신 방.** 서버와 주고받는 모든 코드. 전역 `API` 객체가 모든 엔드포인트(`login`, `getRounds`, `saveRounds`, `saveCourse`, 관리자 전용 등)를 메서드로 노출합니다. 내부 `_get`/`_post`가 인증 정보(`u`, `token`)를 자동으로 붙입니다. `explainError()`는 서버 에러를 사람이 읽는 문구 + 코드(NET/PIN/AUTH/VER/ERR)로 변환하고, `callAPI()`는 네트워크 단절을 잡는 안전 래퍼입니다. **모든 API 호출은 `callAPI(() => API.xxx())` 형태로 감쌉니다.**
- **`app.js` — 두뇌 방.** 로그인 판단, 점수 계산, 저장·동기화, 화면 전환 등 모든 로직과 UI 렌더링. 빌드 없이 `render*()` 함수가 `innerHTML` 템플릿 문자열로 화면을 직접 그립니다.
  - **🔒 사용자가 입력한 글자(골프장·코스 이름, 주소, 동반자, 메모, 회원 이름, 변경 내역 등)를 `innerHTML` 템플릿에 넣을 때는 반드시 `esc()`로 감쌉니다**(v12.65.0). 안 감싸면 이름에 `'`·`"` 만 있어도 화면이 깨지고, `<img onerror=…>` 같은 글자가 다른 사용자 폰에서 스크립트로 실행됩니다. `onclick` 에 문자열을 넘길 때는 `onclick="fn('${이름}')"` 대신 `data-k="${esc(이름)}" onclick="fn(this.dataset.k)"` 를 씁니다. **`esc()`는 화면에 그릴 때만** 쓰고, 저장·전송하는 값에는 절대 쓰지 않습니다(`textContent`·`.value` 로 넣는 곳은 필요 없음).
- **`stat.js` — 통계 방.** 라운드 기록만으로 통계·분석·추세·블로업을 계산하고 그립니다(`renderStat`, `analyze`, `blowupPartsOf` 등). 저장·통신 코드는 두지 않습니다. 함수 본문에서 `app.js` 의 `A`·`Q` 등을 쓰고, 홈 화면이 시작 직후 `trophyBadges` 를 쓰므로 `index.html` 에서 **`app.js` 보다 먼저** 로드합니다. 최상위에는 상수·변수 선언만 두세요(로드 시점에 `app.js` 것을 바로 부르면 오류).
- **`index.html` — 뼈대.** 6개 페이지(`pg-login`, `pg-home`, `pg-course`, `pg-sc`, `pg-stat`, `pg-set`)의 정적 마크업과 인라인 SVG 아이콘. `api.js` → `stat.js` → `app.js` 순서로 로드합니다. 세 스크립트와 `style.css` 의 `?v=` 는 모두 `APP_VERSION` 과 맞춥니다.
- **`style.css` — 모양.** 다크 테마, iOS 스타일. CSS 변수는 `:root`에 정의(`--bg`, `--g` 등). 신호 색: 빨강 `--r`, 초록 `--g`.
- **`sw.js` — 통과형 서비스 워커 (캐시 없음).** 안드로이드 크롬은 `manifest.json`만 있고 서비스 워커가 없으면 홈 화면 추가를 **진짜 앱 설치(WebAPK)가 아니라 단순 북마크 바로가기**로 처리합니다(아이콘에 크롬 배지가 붙고 주소창 있는 브라우저로 열림). 그래서 `fetch` 핸들러를 가진 최소한의 SW를 등록합니다(v12.26.0).
  - **🚫 여기에 캐시 로직을 절대 추가하지 마세요.** 예전 *캐싱* SW가 GitHub Pages 재배포 순간의 404("There isn't a GitHub Pages site here")를 계속 물고 있어 폐기했던 사고가 있습니다(v12.2.2). 지금 `sw.js`는 요청을 저장하지 않고 네트워크로 그대로 흘려보내기만 해서 그 문제가 구조적으로 생길 수 없습니다. 금지 대상은 **캐싱**이지 서비스 워커 자체가 아닙니다. (자매 앱 DKMK도 같은 통과형 SW를 씁니다.)
  - 버전을 올릴 때 `index.html`의 `?v=` 쿼리스트링은 계속 `APP_VERSION`과 맞춰 갱신합니다.
- **`manifest.json` — PWA 매니페스트.** 앱 이름·시작 URL·`display: standalone`·아이콘(192/512, `any`+`maskable`)을 선언합니다. 아이콘 파일은 저장소 루트의 `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`입니다. 아이콘이나 앱 이름을 바꾸면 이 파일도 함께 고치세요.

### 상태 관리

- 전역 객체 **`A`**(app.js 상단)가 앱 전체 상태를 메모리에 보관합니다: 사용자(`u`, `isAdm`), `rounds`, `official`(코스 목록), 그리고 현재 입력 중인 스코어카드 `A.sc`(홀별 `scores`/`putts`/`gir`/`fir` 등 18칸 배열).
- **🚫 라운드 데이터는 어떤 경우에도 지우지 않습니다 (2026-10-13 유실 사고, v12.62.0 / 서버 v13).** 서버는 라운드 시트를 비우지(`clearContents`) 않고 한 줄씩 고치거나 붙이기만 합니다. "보낸 목록에 없으면 삭제" 같은 방식은 금지입니다. 삭제는 `dels`로 콕 집은 것만 `삭제시각`에 표시합니다. 모든 쓰기는 `LockService` 안에서 합니다. 앱은 서버 목록에서 라운드가 설명 없이 사라지면 이 기기의 값을 다시 올립니다(`lostRounds`). 골프장 수정은 `base`(보고 고친 값)를 함께 보내 서버가 잠금 안에서 바뀐 부분만 병합합니다(`mergeCourse3_`). 로그아웃·토큰 만료 때 미동기화 대기목록은 지우지 않고 `og_park_<이름>`에 보관합니다(`pendPark`/`pendSwitchUser`). `pendClear`를 로그아웃 경로에서 직접 부르지 마세요.
- **라운드 삭제 되돌리기(v12.66.0)**: 삭제는 화면·대기목록(`og_pending.dels`)에는 바로 반영하지만, 서버로는 `UNDO_MS`(5초) 뒤에 보냅니다(`_delHold`, `pushRounds` 가 `delHeld` 인 삭제를 빼고 보냄). 되돌리면 서버는 삭제를 모른 채로 끝납니다. "서버에서 지운 뒤 다시 올려 되살리기"로 바꾸지 마세요 — 서버는 휴대폰 시계(`updatedAt`)와 서버 시계(삭제시각)를 비교하므로 기기 시계가 늦으면 되살리기가 조용히 실패합니다. 앱이 가려지면(`visibilitychange`/`pagehide`) `delRelease()` 로 바로 보내고, 로그아웃은 `delDrop()` 후 `pendPark` 로 보관합니다.
- **확인창은 `await askConfirm(제목, 문구, 버튼글자)`** 를 씁니다(브라우저 기본 `confirm()` 금지, v12.66.0). 어떻게 닫혀도(취소·배경·뒤로가기) `false` 입니다.
- `localStorage`는 세션/인증(`og_s`), 화면 캐시(`og_cache`), 미동기화 대기목록(`og_pending`), 서버에서 본 라운드 id(`og_seen`)를 보관합니다. 라운드 데이터는 **서버가 원본**이고, 기기에는 대기분만 서버 목록 위에 얹습니다. 서버에도 대기목록에도 없는 라운드를 캐시에서 되살려 서버에 올리면 안 됩니다(다른 기기에서 지운 기록이 되살아나는 사고, v12.59.0).
- 라운드 기록을 들고 있으면 통계는 **서버 호출 없이 클라이언트에서 즉시 계산**됩니다(`renderStat`).

### 화면 전환

페이지는 CSS 클래스 토글로 전환됩니다. `showPg(id)`가 모든 `.page`에서 `.on`을 빼고 `pg-{id}`에만 추가합니다. 모달은 `om(id)`/`cm(id)`로 여닫습니다. 짧은 헬퍼(`Q`=getElementById, `toast`, `load`/`hide`)가 app.js 상단에 모여 있습니다.

## 버전 관리 & 체인지로그 (필수 규칙)

**기능을 추가할 때마다 반드시 버전을 올리고 체인지로그에 기록합니다.** 다음 순서를 지키세요.

1. `app.js` 상단의 `APP_VERSION` 값을 올립니다. 표기는 `vMAJOR.MINOR.PATCH` — 새 기능은 MINOR, 버그 수정은 PATCH, 호환 깨짐은 MAJOR.
2. `CHANGELOG.md` 맨 위에 새 버전 항목을 추가해 변경 내용을 기록합니다(추가됨/변경됨/수정됨/제거됨).
3. 현재 앱 버전은 로그인 화면 하단과 설정 화면 하단에 옅은 글씨(`.ver-tag`)로 자동 표시됩니다 — 별도 작업 불필요(`checkVersion()`이 `APP_VERSION`을 그려줌).

> **버전 두 종류를 헷갈리지 마세요.**
> - `APP_VERSION`(`app.js`) — 프런트엔드 앱 버전. CHANGELOG가 추적하며 기능마다 올림. 서버와 무관.
> - `API.VERSION`(`api.js`) — 서버(Apps Script) 통신 동기화용. 백엔드 `Apps_Script.gs`의 `VERSION`과 함께 바꿀 때만 변경(아래 참고).

## 주의사항

- **버전 일치**: `api.js`의 `API.VERSION`은 백엔드 `Apps_Script.gs`의 `VERSION`과 **반드시 동일**해야 합니다. 불일치 시 "버전이 안 맞아요" VER 에러가 나서 앱이 서버와 통신하지 못합니다.
- **🚫 절대 하지 말 것 — 프런트 전용 변경에서 `API.VERSION`을 올리지 마세요.** `API.VERSION`은 **백엔드 `Apps_Script.gs`를 실제로 고쳐서 새로 배포할 때만** 그 `VERSION`과 똑같이 맞춰 바꿉니다. UI·계산·공유 버튼 등 **프런트만 바뀌는 변경은 `app.js`의 `APP_VERSION`만** 올리고 `api.js`의 `API.VERSION`은 **그대로 둡니다**.
  - **실제 사고 사례(재발 방지):** 원터치 공유(프런트 전용) 기능을 추가하며 `API.VERSION`을 `v12-2026.06.21` → `v13-2026.06.22`로 같이 올렸는데, 서버는 그대로 v12라서 모든 사용자에게 VER 에러가 발생했습니다. 백엔드는 바뀐 게 없었으므로 잘못된 건 프런트의 `API.VERSION`이었고, 다시 v12로 되돌려 해결했습니다.
  - **체크리스트:** 이번 변경이 `Apps_Script.gs`를 건드렸나? → **아니오면 `API.VERSION` 손대지 않기.** → **예면** `Apps_Script.gs`의 `VERSION`과 `api.js`의 `API.VERSION`을 같은 값으로 바꾸고 Apps Script [배포 관리] → [새 버전] 배포까지 끝내기.
- **권한 체크는 서버에서**: 관리자 전용 동작은 클라이언트가 아니라 서버(`isAdm`)에서 검증됩니다. 프런트의 표시 숨김은 편의일 뿐입니다.
- **로그인 보안(서버 v15)**: 같은 이름으로 PIN 을 5번 연달아 틀리면 15분 잠김(`PIN_MAX_FAIL`/`PIN_LOCK_MS`, 스크립트 속성 `PINFAIL_*`). 관리자 이름(`ADMINS`)은 자동 가입 불가, 관리자 계정은 회원 삭제 불가 — 새 관리자는 먼저 일반 가입한 뒤 `ADMINS` 에 추가합니다. 이 부분을 고치면 `node tests/backend.test.js` 를 돌리세요.
- 인증은 사용자명 + 4자리 PIN → 토큰 방식. PIN은 저장하지 않고 토큰만 보관합니다.
- 백엔드 수정 후에는 Apps Script에서 [배포 관리] → [새 버전] 배포가 필요합니다(URL은 안 바뀜).
- **작업 제출 규칙**: 모든 변경은 `main`에 직접 커밋하지 말고, **반드시 새 브랜치를 만들어 Pull Request(PR)로 제출**합니다.
