# Supabase 백엔드 설정 가이드

온그린의 백엔드를 **Google Apps Script + Sheet** 에서 **Supabase(PostgreSQL)** 로 옮겨
앱 속도를 크게 개선합니다. (보통 요청 1회 1~5초 → 50~200ms)

> 왜 빨라지나요? 기존엔 요청마다 Apps Script 웹앱이 **콜드 스타트(수 초)** 되고
> `SpreadsheetApp` 호출이 느렸습니다. Supabase 는 상시 떠 있는 Postgres + 자동 REST API라
> 콜드 스타트가 없고, 프런트가 DB 함수를 직접 호출합니다.

---

## 1. Supabase 프로젝트 만들기 (무료)

1. <https://supabase.com> 가입 → **New project** 생성.
2. 리전은 한국에서 가까운 곳(예: **Northeast Asia (Seoul)** 또는 Tokyo) 권장 → 더 빠릅니다.
3. 데이터베이스 비밀번호는 적당히 정하고 보관(나중에 직접 쓸 일은 거의 없음).
4. 프로젝트가 만들어지면 **Project Settings → API** 에서 두 값을 복사해 둡니다.
   - **Project URL** : `https://xxxx.supabase.co`
   - **anon public** 키 : `eyJ...` (공개되어도 되는 키 — 프런트에 넣는 키)

> 무료 등급: 500MB DB, 월 5만 MAU 인증, 충분합니다. 단, **7일간 활동이 없으면
> 프로젝트가 일시정지**될 수 있으니 가끔 접속하거나 유료 전환을 고려하세요.

---

## 2. 스키마(테이블 + 함수) 만들기

1. Supabase 대시보드 → 왼쪽 **SQL Editor** → **New query**.
2. 이 저장소의 [`supabase/schema.sql`](../supabase/schema.sql) 내용을 **전체 복사**해 붙여넣고 **Run**.
3. 오류 없이 `Success` 가 뜨면 끝. (테이블 5개 + RPC 함수들이 생성됩니다.)

이 스키마의 보안 모델:

- 모든 테이블은 **RLS 켜짐 + 정책 없음** → anon 키로 테이블에 **직접 접근 불가**.
- 데이터 접근은 오직 `og_*` **RPC 함수**(SECURITY DEFINER)를 통해서만 이뤄지고,
  함수 안에서 **토큰/관리자 권한을 검증**합니다. (기존 Apps Script 와 동일한 모델)

---

## 3. 프런트에 연결 정보 넣기

[`api.js`](../api.js) 상단을 수정합니다.

```js
URL: 'https://xxxx.supabase.co',   // ← 1번에서 복사한 Project URL
ANON_KEY: 'eyJ...',                // ← anon public 키
```

> `anon` 키는 공개 키라서 프런트에 넣어도 됩니다. 실제 권한 검증은 서버 함수에서 합니다.

---

## 4. 첫 관리자 만들기

- 앱을 열고 로그인 화면에서 **원하는 이름 + 4자리 PIN** 으로 로그인하면 가입됩니다.
- **가장 먼저 가입한 사용자가 자동으로 관리자**가 됩니다.
- 다른 사용자를 관리자로 올리려면 SQL Editor 에서:
  ```sql
  update og_users set is_admin = true where username = '홍길동';
  ```

---

## 5. 기존 데이터 옮기기 (선택)

쓰던 데이터가 있으면 [`docs/MIGRATION.md`](./MIGRATION.md) 를 따라 한 번에 가져옵니다.

---

## 자주 묻는 것

- **버전 경고 배너가 떠요** → `api.js` 의 `VERSION` 과 `supabase/schema.sql` 의 `og_version()`
  반환값이 같아야 합니다. 스키마를 최신으로 다시 실행하세요.
- **`서버오류 401/permission denied`** → 스키마 끝의 `grant execute ...` 가 실행됐는지 확인.
- **로그인은 되는데 데이터가 안 보여요** → URL/key 오타, 또는 리전이 멀어 느린 것일 수 있습니다.
- **되돌리고 싶어요** → `git` 으로 이전 `api.js`(Apps Script 버전)로 되돌리면 됩니다.
