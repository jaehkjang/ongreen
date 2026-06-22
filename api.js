// ============================================================
// api.js — 통신 방 (우체부)
// 서버(Apps Script)와 편지를 주고받는 모든 코드가 여기에만 있습니다.
// 화면/계산 코드는 app.js, 모양은 style.css.
// ============================================================

const API = {
  // ▼▼▼ 배포 후 받은 웹앱 URL을 여기에 붙여넣으세요 ▼▼▼
  URL: 'https://script.google.com/macros/s/AKfycbwmJhJ3nLOGgIVzXnoOe1YcnXfAq-gHQ44xyouczhr20l1P_k2uDOTRDqZRJWOjzjoXiw/exec',

  VERSION: 'v12-2026.06.21',   // ← Apps_Script.gs 의 VERSION 과 반드시 동일

  // 로그인 후 받은 손목밴드(토큰)를 보관 — 비밀번호는 저장하지 않음
  u: '', token: '',
  setAuth(u, token) { this.u = u || ''; this.token = token || ''; },

  // ── 내부: GET (읽기) ──
  async _get(action, extra) {
    const p = new URLSearchParams(Object.assign({ action, u: this.u, token: this.token }, extra || {}));
    const res = await fetch(this.URL + '?' + p.toString(), { mode: 'cors' });
    return res.json();
  },
  // ── 내부: POST (쓰기) ──
  async _post(data) {
    const res = await fetch(this.URL, {
      method: 'POST', mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(Object.assign({}, data, { u: this.u, token: this.token })),
    });
    return res.json();
  },

  // ── 공개 / 인증 불필요 ──
  ping()            { return this._get('ping'); },
  login(username, pin) { return this._post({ action: 'login', username, pin }); },
  getCourses()      { return this._get('getCourses'); },

  // ── 분석 기준값(신호등) ──
  getBench()        { return this._get('getBench'); },                 // 누구나 읽기 (서버 없으면 실패 → 앱이 기본값 사용)
  setBench(bench)   { return this._post({ action: 'setBench', bench }); }, // 관리자만 (서버에서 권한 체크)

  // ── 인증 필요 ──
  getRounds()       { return this._get('getRounds'); },
  saveRounds(rounds){ return this._post({ action: 'saveRounds', rounds }); },
  saveCourse(course, isEdit, oldName) { return this._post({ action: 'saveCourse', course, isEdit: !!isEdit, oldName: oldName || '' }); },
  reportParChange(course, detail) { return this._post({ action: 'reportPar', course, detail }); },
  updatePin(pin)    { return this._post({ action: 'updatePin', pin }); },

  // ── 관리자 전용 ──
  getNotifications()     { return this._get('getNotifications'); },
  clearNotifications()   { return this._post({ action: 'clearNotifications' }); },
  getUsers()             { return this._get('getUsers'); },
  deleteCourse(name)     { return this._post({ action: 'deleteCourse', name }); },
  resetUserPin(target, pin) { return this._post({ action: 'resetUserPin', target, pin }); },
  deleteUser(target)     { return this._post({ action: 'deleteUser', target }); },
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
