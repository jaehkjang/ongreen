# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**온그린(On Green)** — 골프 스코어카드 모바일 웹앱 (v10.1). 한 명이 라운드 점수를 입력하고 통계를 보는 모바일 우선(max-width 430px) 단일 페이지 앱(SPA)입니다. 코드와 주석은 모두 한국어입니다.

빌드 도구, 패키지 매니저, 테스트 프레임워크가 **없습니다**. 순수 정적 프런트엔드(HTML/CSS/JS) + Google Apps Script 백엔드 구조입니다.

## 실행 / 개발

- 실행: `index.html`을 브라우저로 열면 됩니다. 번들러나 dev 서버가 필요 없습니다. (`fetch` CORS 때문에 `file://`보다는 간단한 정적 서버 권장: 예 `python3 -m http.server`)
- 백엔드: 별도 배포된 Google Apps Script 웹앱(`/exec` URL)과 통신합니다. 백엔드 소스는 이 폴더에 없고, `Apps_Script.gs`로 따로 관리되며 Apps Script 편집기에서 배포합니다.
- 빌드/린트/테스트 명령 없음.

## 아키텍처 (방 비유)

코드는 "방"이라는 비유로 역할이 명확히 분리되어 있습니다. 새 코드는 역할에 맞는 파일에만 추가하세요.

- **`api.js` — 통신 방.** 서버와 주고받는 모든 코드. 전역 `API` 객체가 모든 엔드포인트(`login`, `getRounds`, `saveRounds`, `saveCourse`, `getBench`/`setBench`, 관리자 전용 등)를 메서드로 노출합니다. 내부 `_get`/`_post`가 인증 정보(`u`, `token`)를 자동으로 붙입니다. `explainError()`는 서버 에러를 사람이 읽는 문구 + 코드(NET/PIN/AUTH/VER/ERR)로 변환하고, `callAPI()`는 네트워크 단절을 잡는 안전 래퍼입니다. **모든 API 호출은 `callAPI(() => API.xxx())` 형태로 감쌉니다.**
- **`app.js` — 두뇌 방.** 로그인 판단, 점수 계산, 통계, 화면 전환 등 모든 로직과 UI 렌더링. 빌드 없이 `render*()` 함수가 `innerHTML` 템플릿 문자열로 화면을 직접 그립니다.
- **`index.html` — 뼈대.** 6개 페이지(`pg-login`, `pg-home`, `pg-course`, `pg-sc`, `pg-stat`, `pg-set`)의 정적 마크업과 인라인 SVG 아이콘. `api.js` → `app.js` 순서로 로드합니다.
- **`style.css` — 모양.** 다크 테마, iOS 스타일. CSS 변수는 `:root`에 정의(`--bg`, `--g` 등). 신호 색: 빨강 `--r`, 초록 `--g`.

### 상태 관리

- 전역 객체 **`A`**(app.js 상단)가 앱 전체 상태를 메모리에 보관합니다: 사용자(`u`, `isAdm`), `rounds`, `official`(코스 목록), 그리고 현재 입력 중인 스코어카드 `A.sc`(홀별 `scores`/`putts`/`gir`/`fir` 등 18칸 배열).
- `localStorage`는 **세션/인증(`og_s` 키)만** 백업합니다. 라운드 데이터는 서버가 원본입니다.
- 라운드 기록을 들고 있으면 통계는 **서버 호출 없이 클라이언트에서 즉시 계산**됩니다(`renderStat`).

### 화면 전환

페이지는 CSS 클래스 토글로 전환됩니다. `showPg(id)`가 모든 `.page`에서 `.on`을 빼고 `pg-{id}`에만 추가합니다. 모달은 `om(id)`/`cm(id)`로 여닫습니다. 짧은 헬퍼(`Q`=getElementById, `toast`, `load`/`hide`)가 app.js 상단에 모여 있습니다.

### BENCH (분석 기준값 / 신호등)

`BENCH` 객체는 통계 색상 판정 임계값입니다(예: `puttGood:32`, `girGood:50`). 관리자가 설정 화면에서 수정하면 서버 Script Properties의 `BENCH` 키에 저장되어 **모든 사용자가 공유**합니다. 서버가 없거나 실패하면 app.js의 내장 기본값을 사용하므로 앱은 항상 동작합니다. `Apps_Script_추가분_bench.gs.txt`는 이 기능을 기존 백엔드에 붙이는 패치 안내입니다.

## 주의사항

- **버전 일치**: `api.js`의 `API.VERSION`은 백엔드 `Apps_Script.gs`의 `VERSION`과 **반드시 동일**해야 합니다. 불일치 시 VER 에러가 납니다.
- **권한 체크는 서버에서**: 관리자 전용 동작은 클라이언트가 아니라 서버(`isAdm`)에서 검증됩니다. 프런트의 표시 숨김은 편의일 뿐입니다.
- 인증은 사용자명 + 4자리 PIN → 토큰 방식. PIN은 저장하지 않고 토큰만 보관합니다.
- 백엔드 수정 후에는 Apps Script에서 [배포 관리] → [새 버전] 배포가 필요합니다(URL은 안 바뀜).
