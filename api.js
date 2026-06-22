// ============================================================
// api.js — 통신 방 (우체부)
// 서버(Supabase)와 편지를 주고받는 모든 코드가 여기에만 있습니다.
// 화면/계산 코드는 app.js, 모양은 style.css.
//
// 백엔드는 Supabase(PostgreSQL + PostgREST)입니다. 느린 Apps Script 계층을
//없애고, 프런트가 DB의 RPC 함수(supabase/schema.sql)를 직접 호출합니다.
// 메서드 이름과 반환 모양은 기존과 동일하므로 app.js 는 바뀌지 않습니다.
// ============================================================

const API = {
  // ▼▼▼ Supabase 프로젝트 설정값을 여기에 붙여넣으세요 ▼▼▼
  //   대시보드 → Project Settings → API 에서 확인:
  //   - URL      : Project URL          (예: https://abcd1234.supabase.co)
  //   - ANON_KEY : Project API keys → anon public  (공개되어도 되는 키)
  URL: 'https://YOUR-PROJECT.supabase.co',
  ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',
  // ▲▲▲ 두 값을 채우기 전에는 서버 연결이 되지 않습니다 ▲▲▲

  // 화면 하단 버전 표기에만 쓰입니다(서버 og_version() 과 동일해야 경고 배너 안 뜸)
  VERSION: 'v13-supabase-2026.06.22',

  // 로그인 후 받은 손목밴드(토큰)를 보관 — 비밀번호는 저장하지 않음
  u: '', token: '',
  setAuth(u, token) { this.u = u || ''; this.token = token || ''; },

  // ── 내부: Supabase RPC 호출 ──
  //   POST {URL}/rest/v1/rpc/{fn}  body=JSON(params)  →  함수가 반환한 JSON
  async _rpc(fn, params) {
    const res = await fetch(this.URL + '/rest/v1/rpc/' + fn, {
      method: 'POST', mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.ANON_KEY,
        'Authorization': 'Bearer ' + this.ANON_KEY,
      },
      body: JSON.stringify(params || {}),
    });
    if (!res.ok) {
      // PostgREST 오류(권한/문법 등) → 사람이 읽을 err 로 변환해 반환
      let b = null; try { b = await res.json(); } catch (e) {}
      return { ok: false, err: (b && (b.message || b.hint || b.details)) || ('서버오류 ' + res.status) };
    }
    return res.json();
  },
  // 인증 정보(u, token)를 자동으로 붙이는 래퍼
  _auth(fn, extra) {
    return this._rpc(fn, Object.assign({ p_u: this.u, p_token: this.token }, extra || {}));
  },

  // ── 공개 / 인증 불필요 ──
  ping()               { return this._rpc('og_ping'); },
  login(username, pin) { return this._rpc('og_login', { p_username: username, p_pin: pin }); },
  getCourses()         { return this._rpc('og_get_courses'); },

  // ── 분석 기준값(신호등) ──
  getBench()           { return this._rpc('og_get_bench'); },          // 누구나 읽기
  setBench(bench)      { return this._auth('og_set_bench', { p_bench: bench }); }, // 관리자만(서버에서 권한 체크)

  // ── 인증 필요 ──
  getRounds()          { return this._auth('og_get_rounds'); },
  saveRounds(rounds)   { return this._auth('og_save_rounds', { p_rounds: rounds }); },
  saveCourse(course, isEdit, oldName) { return this._auth('og_save_course', { p_course: course, p_is_edit: !!isEdit, p_old_name: oldName || '' }); },
  reportParChange(course, detail)     { return this._auth('og_report_par', { p_course: course, p_detail: detail }); },
  updatePin(pin)       { return this._auth('og_update_pin', { p_pin: pin }); },

  // ── 관리자 전용 ──
  getNotifications()        { return this._auth('og_get_notifications'); },
  clearNotifications()      { return this._auth('og_clear_notifications'); },
  getUsers()                { return this._auth('og_get_users'); },
  deleteCourse(name)        { return this._auth('og_delete_course', { p_name: name }); },
  resetUserPin(target, pin) { return this._auth('og_reset_user_pin', { p_target: target, p_pin: pin }); },
  deleteUser(target)        { return this._auth('og_delete_user', { p_target: target }); },

  // ── 마이그레이션 전용(tools/migrate.html 에서 사용) ──
  importDump(dump)     { return this._auth('og_import_dump', { p_dump: dump }); },
};

// 실패 사유를 사람이 읽기 쉬운 말 + 코드로 바꿔줍니다.  (NET / PIN / AUTH / VER / ERR)
function explainError(e) {
  if (e && e.__net)        return { msg: '인터넷 연결을 확인해주세요', code: 'NET' };
  if (!e)                  return { msg: '잠시 후 다시 시도해주세요', code: 'ERR' };
  if (e.wrongPin)          return { msg: '비밀번호가 달라요', code: 'PIN' };
  if (e.err === '인증실패') return { msg: '다시 로그인해주세요', code: 'AUTH' };
  if (e.err === '권한없음') return { msg: '권한이 없어요', code: 'AUTH' };
  if (e.err === '이름2자')  return { msg: '이름은 2자 이상 입력해주세요', code: 'PIN' };
  if (e.err === '비번4자')  return { msg: '비밀번호는 숫자 4자리로 입력해주세요', code: 'PIN' };
  return { msg: (e.err || '잠시 후 다시 시도해주세요'), code: 'ERR' };
}

// 통신 자체가 끊긴 경우(NET)를 잡아주는 안전 래퍼
async function callAPI(promiseFactory) {
  try { return await promiseFactory(); }
  catch (e) { return { ok: false, __net: true }; }
}
