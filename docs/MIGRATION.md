# 기존 데이터 → Supabase 마이그레이션

기존 Google Sheet 의 **라운드 / 코스 / 사용자 / BENCH** 를 새 Supabase 백엔드로 한 번에 옮깁니다.

전체 흐름:

```
[기존 시트]  --(A. 내보내기)-->  dump.json  --(B. 가져오기)-->  [Supabase]
```

먼저 [`docs/SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) 의 1~3단계(프로젝트·스키마·연결)를 끝내 두세요.

---

## A. 기존 시트에서 내보내기 (dump.json 만들기)

기존 백엔드(`Apps_Script.gs`)와 시트는 이 저장소에 없고, **시트의 열 구성은 당신만**
알고 있습니다. 그래서 내보내기는 두 방법 중 편한 쪽을 쓰세요.

### 방법 1) 손으로 dump.json 작성 (데이터가 적을 때)

아래 모양에 맞춰 직접 JSON 을 만듭니다. 라운드/코스 객체의 필드는 앱이 쓰던 그대로입니다.

```json
{
  "bench": { "survGood": 70, "survOk": 50, "tpDemote": 2,
             "puttGood": 32, "puttBad": 36, "girGood": 50, "girBad": 30 },
  "courses": [
    { "id": "c1", "name": "OO CC", "addr": "경기 ...",
      "layouts": [ { "name": "동", "holes": [4,4,3,5,4,4,3,5,4] },
                   { "name": "서", "holes": [4,3,4,5,4,4,3,5,4] } ] }
  ],
  "users": [
    { "username": "홍길동", "pin": "1234", "is_admin": true,
      "rounds": [
        { "id": 1736000000000, "courseId":"c1", "courseName":"OO CC", "courseLbl":"동+서",
          "date":"2025.01.01", "weather":"맑음", "score": 89, "vs": 17,
          "putts": 33, "gir": 44, "fir": 50, "mulligan": 1, "tpCount": 0,
          "scores":[4,5,3,6,5,4,4,6,5, 4,5,4,5,5,4,4,6,5],
          "puttsArr":[2,2,1,2,2,2,2,2,2, 2,2,2,2,2,2,2,2,2],
          "girArr":[false,...], "firArr":[true,...],
          "mulliArr":[0,...], "tpArr":[0,...], "isDraft": false }
      ] }
  ]
}
```

- `pin` 을 아는 사용자는 넣으면 그대로 4자리 PIN 으로 로그인됩니다.
- `pin` 을 모르면(시트에 해시로만 있으면) **생략**하세요. 가져온 뒤 관리자가 PIN 을
  재설정하거나, 해당 사용자가 새로 가입하면 됩니다.
- 라운드 객체 필드는 `app.js` 의 라운드 저장 형식과 동일합니다(위 예시 참고).

### 방법 2) Apps Script 로 자동 내보내기

[`tools/export_from_sheet.gs.txt`](../tools/export_from_sheet.gs.txt) 의 코드를 기존 Apps Script
프로젝트(시트에 접근 가능한 그 프로젝트)에 새 파일로 붙여넣고, 상단 **CONFIG 의 시트/열
이름을 당신 시트에 맞게 수정**한 뒤 `ogExportAll` 함수를 실행하세요.
실행 로그에 `dump.json` 의 Drive 다운로드 링크가 출력됩니다.

> 시트 구조(시트명·열 순서)는 프로젝트마다 다릅니다. 그 부분만 맞춰 주면 됩니다.
> 정확한 스크립트가 필요하면 `Apps_Script.gs` 와 시트 열 구성을 알려주세요 — 맞춤으로 만들어 드립니다.

---

## B. Supabase 로 가져오기

1. 브라우저에서 [`tools/migrate.html`](../tools/migrate.html) 을 엽니다.
   (CORS 때문에 `python3 -m http.server` 같은 정적 서버로 여는 걸 권장)
2. **Project URL** 과 **anon public key** 입력.
3. 만든 `dump.json` 을 파일로 올리거나 텍스트로 붙여넣기.
4. **JSON 형식만 검사** 로 한 번 확인 → 사용자/코스 개수, PIN 누락 경고 확인.
5. **가져오기 실행**.
   - 아직 사용자가 한 명도 없으면 인증 없이 **부트스트랩**으로 들어갑니다.
   - 이미 관리자가 있으면 관리자 이름/PIN 을 입력하고 실행하세요.
6. 완료되면 `api.js` 에 같은 URL/key 가 들어가 있는지 확인하고 앱을 사용합니다.

---

## C. 검증

- 앱에 로그인해서 라운드 목록·통계가 보이는지 확인.
- 관리자 설정 화면에서 사용자 목록·코스 목록이 보이는지 확인.
- 안 보이면 [`docs/SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) 의 "자주 묻는 것" 참고.

> 가져오기는 **여러 번 실행해도 안전**합니다(같은 이름/ID 는 덮어씀). 잘못됐으면
> 고쳐서 다시 실행하세요.
