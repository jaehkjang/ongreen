# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**온그린(On Green)** — 골프 스코어카드 모바일 웹앱 (v10.1). 한 명이 라운드 점수를 입력하고 통계를 보는 모바일 우선(max-width 430px) 단일 페이지 앱(SPA)입니다. 코드와 주석은 모두 한국어입니다.

빌드 도구, 패키지 매니저, 테스트 프레임워크가 **없습니다**. 순수 정적 프런트엔드(HTML/CSS/JS) + **Supabase(PostgreSQL) 백엔드** 구조입니다. (v13부터 Google Apps Script + Sheet → Supabase 로 전환 — 속도 개선. 설정은 `docs/SUPABASE_SETUP.md`.)

## 실행 / 개발

- 실행: `index.html`을 브라우저로 열면 됩니다. 번들러나 dev 서버가 필요 없습니다. (`fetch` CORS 때문에 `file://`보다는 간단한 정적 서버 권장: 예 `python3 -m http.server`)
- 백엔드: **Supabase(PostgreSQL + PostgREST)**. 백엔드 정의는 이 저장소의 `supabase/schema.sql`(테이블 + `og_*` RPC 함수)에 있고, Supabase SQL Editor 에서 실행해 배포합니다. `api.js`의 `URL`/`ANON_KEY`에 프로젝트 값을 넣어 연결합니다.
- 빌드/린트/테스트 명령 없음.

## 아키텍처 (방 비유)

코드는 "방"이라는 비유로 역할이 명확히 분리되어 있습니다. 새 코드는 역할에 맞는 파일에만 추가하세요.

- **`api.js` — 통신 방.** 서버와 주고받는 모든 코드. 전역 `API` 객체가 모든 엔드포인트(`login`, `getRounds`, `saveRounds`, `saveCourse`, `getBench`/`setBench`, 관리자 전용 등)를 **Supabase RPC 호출**로 노출합니다. 내부 `_rpc`(POST `/rest/v1/rpc/og_*`)와 `_auth`(인증 정보 `u`,`token` 자동 첨부)를 거칩니다. `explainError()`는 서버 에러를 사람이 읽는 문구 + 코드(NET/PIN/AUTH/VER/ERR)로 변환하고, `callAPI()`는 네트워크 단절을 잡는 안전 래퍼입니다. **모든 API 호출은 `callAPI(() => API.xxx())` 형태로 감쌉니다.** 메서드 이름·반환 모양은 백엔드 전환 후에도 그대로라 `app.js`는 영향받지 않습니다.
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

`BENCH` 객체는 통계 색상 판정 임계값입니다(예: `puttGood:32`, `girGood:50`). 관리자가 설정 화면에서 수정하면 서버 `og_settings` 테이블의 `BENCH` 행에 저장되어(`og_set_bench`) **모든 사용자가 공유**합니다. 서버가 없거나 실패하면 app.js의 내장 기본값을 사용하므로 앱은 항상 동작합니다.

## 버전 관리 & 체인지로그 (필수 규칙)

**기능을 추가할 때마다 반드시 버전을 올리고 체인지로그에 기록합니다.** 다음 순서를 지키세요.

1. `app.js` 상단의 `APP_VERSION` 값을 올립니다. 표기는 `vMAJOR.MINOR.PATCH` — 새 기능은 MINOR, 버그 수정은 PATCH, 호환 깨짐은 MAJOR.
2. `CHANGELOG.md` 맨 위에 새 버전 항목을 추가해 변경 내용을 기록합니다(추가됨/변경됨/수정됨/제거됨).
3. 현재 앱 버전은 로그인 화면 하단과 설정 화면 하단에 옅은 글씨(`.ver-tag`)로 자동 표시됩니다 — 별도 작업 불필요(`checkVersion()`이 `APP_VERSION`을 그려줌).

> **버전 두 종류를 헷갈리지 마세요.**
> - `APP_VERSION`(`app.js`) — 프런트엔드 앱 버전. CHANGELOG가 추적하며 기능마다 올림. 서버와 무관.
> - `API.VERSION`(`api.js`) — 서버 통신 동기화용. 백엔드 `supabase/schema.sql`의 `og_version()` 반환값과 함께 바꿀 때만 변경(아래 참고).

## 주의사항

- **버전 일치**: `api.js`의 `API.VERSION`은 백엔드 `supabase/schema.sql`의 `og_version()` 반환값과 **반드시 동일**해야 합니다. 불일치 시 경고 배너가 뜹니다. (프런트만 바꾸는 변경에서는 `API.VERSION`을 건드리지 말고 `APP_VERSION`만 올리세요.)
- **권한 체크는 서버에서**: 관리자 전용 동작은 클라이언트가 아니라 서버(RPC 함수 내부의 `is_admin` 검증)에서 확인합니다. 프런트의 표시 숨김은 편의일 뿐입니다.
- **보안 모델**: 모든 테이블은 RLS 켜짐 + 정책 없음 → anon 키로 테이블 직접 접근 불가. 데이터 접근은 `SECURITY DEFINER` RPC 함수로만 이뤄지고, 그 안에서 토큰/권한을 검증합니다.
- 인증은 사용자명 + 4자리 PIN → 토큰 방식. PIN은 저장하지 않고 토큰만 보관합니다(서버엔 bcrypt 해시 저장).
- 백엔드 수정 후에는 Supabase SQL Editor 에서 `supabase/schema.sql`을 다시 실행하면 됩니다(`create or replace` 라 안전, URL/key 안 바뀜).
- **작업 제출 규칙**: 모든 변경은 `main`에 직접 커밋하지 말고, **반드시 새 브랜치를 만들어 Pull Request(PR)로 제출**합니다.
