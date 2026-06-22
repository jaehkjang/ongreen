# 체인지로그 (CHANGELOG)

온그린(On Green) 앱의 모든 주요 변경 사항을 이 파일에 기록합니다.

규칙은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식을 따르며,
**기능이 추가될 때마다 버전을 올리고(`app.js`의 `APP_VERSION`) 여기에 항목을 남깁니다.**

> **버전 두 종류 주의**
> - `APP_VERSION` (`app.js`): 프런트엔드 앱 버전. 이 체인지로그가 추적하는 값이며 기능 추가마다 올립니다.
> - `API.VERSION` (`api.js`): 서버(Apps Script)와의 통신 동기화용 버전. 백엔드를 함께 고칠 때만 백엔드 `VERSION`과 맞춰서 바꿉니다.

버전 표기: `vMAJOR.MINOR.PATCH`
- **MAJOR** — 큰 구조 변경 / 호환이 깨지는 변경
- **MINOR** — 새 기능 추가
- **PATCH** — 버그 수정 · 소소한 개선

---

## [v13.0.0] - 2026-06-22

### 변경됨 (Changed) — 백엔드 전환: Google Apps Script + Sheet → Supabase
- **앱 속도 개선이 목적.** 요청마다 Apps Script 콜드 스타트(수 초) + 느린 `SpreadsheetApp`
  호출이 주된 병목이라, 백엔드를 상시 가동되는 **Supabase(PostgreSQL + PostgREST)** 로 옮기고
  프런트가 DB의 RPC 함수를 **직접** 호출하도록 바꿨습니다. (요청 1회 1~5초 → 50~200ms 기대)
- `api.js` 의 전송 계층을 Apps Script `/exec` 호출 → Supabase `/rest/v1/rpc/*` 호출로 교체.
  **메서드 이름과 반환 JSON 모양은 그대로 유지**하여 `app.js` 로직은 변경 없음.
- `API.VERSION` 을 `v13-supabase-2026.06.22` 로 변경(서버 `og_version()` 과 일치).

### 추가됨 (Added)
- `supabase/schema.sql` — 테이블 + 인증/CRUD/관리자/가져오기 RPC 함수 전체.
  (RLS 켜짐 + 정책 없음 → 테이블 직접 접근 차단, 토큰/관리자 권한은 함수 내부에서 검증.)
- `docs/SUPABASE_SETUP.md` — 프로젝트 생성·스키마 실행·연결·첫 관리자 안내.
- `docs/MIGRATION.md` + `tools/migrate.html` + `tools/export_from_sheet.gs.txt`
  — 기존 시트 데이터(라운드/코스/사용자/BENCH)를 한 번에 옮기는 도구.

### 참고
- 기존 인증 모델(사용자명 + 4자리 PIN → 토큰)과 관리자 권한 서버 검증은 그대로 유지.
- 첫 가입자가 자동으로 관리자가 됩니다.

---

## [v12.1.0] - 2026-06-22

### 추가됨 (Added)
- 체인지로그 파일(`CHANGELOG.md`) 신설.
- 프런트엔드 앱 버전 `APP_VERSION` 도입 (서버 통신용 `API.VERSION`과 분리).
- 로그인 화면 하단과 설정 화면 하단에 현재 앱 버전을 옅은 글씨로 표시.

---

## [v12.0.0] - 2026-06-21

### 기준점 (Baseline)
- 이 체인지로그 도입 이전까지의 누적 상태를 v12로 표기합니다.
- 골프 스코어카드 입력, 통계(신호등), 골프장 관리, 관리자 기능, 버전 도장 배너,
  BENCH(분석 기준값) 서버 공유 등 기존 기능 포함.
