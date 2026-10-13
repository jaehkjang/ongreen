// ============================================================
// 온그린 백엔드 (Apps Script) — v14-2026.10.13
// ------------------------------------------------------------
// [방 나누기]
//   ① 설정/공용  ② 라우팅  ③ 인증  ④ 라운드(절대 안 지움)
//   ⑤ 골프장     ⑥ 알림    ⑦ 관리자 ⑧ 헬퍼  ⑨ 최초설정·백업
//   ⑩ 복구(시트 과거 버전에서 지워진 라운드 되살리기)
//
// [v13 데이터 안전 원칙] — 2026-10-13 라운드 기록 유실 사고 재발 방지
//   · 라운드 시트를 절대 비우지(clearContents) 않는다. 한 줄 = 한 라운드를 그 자리에서 고치거나 맨 밑에 붙인다.
//     (예전엔 저장마다 시트 전체를 지우고 다시 썼다. 그 사이 다른 사람의 조회·저장이 끼면
//      "기록 0개"로 보여서 그 사람의 기록 전체가 덮어써졌다.)
//   · 앱이 보낸 목록에 없다고 지우지 않는다. 삭제는 앱이 "이 id 를 지워줘"(dels)라고 콕 집을 때만,
//     그것도 줄을 없애지 않고 '삭제시각' 칸에 표시만 한다(언제든 되살릴 수 있음).
//   · 모든 쓰기는 한 번에 하나씩(LockService). 여러 명이 같은 골프장에서 동시에 저장해도 안 꼬인다.
//   · 더 오래된 수정본(updatedAt 이 작은 것)은 더 새 수정본을 덮지 않는다(켜 둔 옛 기기 대비).
//   · 바뀐 내용은 '라운드_기록' 시트에 계속 쌓는다(지우지 않는 일지). 매일 새벽 파일 통째 백업.
//   · [v14] 골프장 수정은 앱이 "어떤 값을 보고 고쳤는지(base)"를 함께 보내고, 서버가 잠금 안에서
//     지금 저장된 값 위에 "바뀐 부분만" 얹는다 → 관리자·사용자 여러 명이 동시에 같은 골프장을 고쳐도 서로 안 지움.
//
// [최초 1회 / 업데이트 시 할 일]
//   1) 이 파일 전체를 Apps Script 편집기 Code.gs 에 붙여넣고 저장
//   2) 메뉴 ▶ 실행 ▶ setup  (권한 허용 → 일지 시트·매일 백업 예약·첫 백업 생성)
//   3) 배포 ▶ 배포 관리 ▶ (연필) ▶ 버전: 새 버전 ▶ 배포   (URL 은 그대로)
//   4) 지워진 기록 복구: recover1_collect 를 "완료" 가 나올 때까지 반복 실행
//      → recover2_preview 로 사람별 되살릴 개수 확인 → recover3_apply 실행
// ============================================================

// ── ① 설정/공용 ─────────────────────────────────────────────
const VERSION = 'v14-2026.10.13';   // ← 프론트(api.js)와 반드시 동일하게 유지

const SHEETS = {
  users:   ['이름', 'PIN해시', '가입일'],
  rounds:  ['이름','날짜','골프장','코스','날씨','동반자','메모','스코어','파대비','파','퍼팅','GIR%','FIR%','멀리건','상세','삭제시각'],
  courses: ['JSON', '등록자', '날짜'],          // ★ 기존 공식코스 시트 형식 — 절대 초기화 안 함
  notes:   ['시간', '사용자', '동작', '골프장', '확인'],
  log:     ['시각', '사용자', 'id', '동작', '상세'],
  delCourses: ['삭제시각', '삭제자', 'JSON'],
  delUsers: ['삭제시각', '이름', 'PIN해시', '가입일'],
};
const SHEET_KEY = { '사용자': 'users', '라운드': 'rounds', '공식코스': 'courses', '알림': 'notes', '라운드_기록': 'log', '삭제된_골프장': 'delCourses', '삭제된_회원': 'delUsers' };
const RW = SHEETS.rounds.length;   // 라운드 한 줄의 칸 수(16) — 15번째(index 14)=상세 JSON, 16번째(index 15)=삭제시각(ms)
const C_JSON = 14, C_DEL = 15;

function props_() { return PropertiesService.getScriptProperties(); }

function ss_() {
  const p = props_();
  let id = p.getProperty('SSID');
  if (!id) { const s = SpreadsheetApp.create('온그린 데이터'); id = s.getId(); p.setProperty('SSID', id); }
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  const s = ss_();
  let sh = s.getSheetByName(name);
  if (!sh) { sh = s.insertSheet(name); sh.appendRow(SHEETS[SHEET_KEY[name] || 'notes']); styleHead_(sh); }
  return sh;
}
const SH_USERS   = () => sheet_('사용자');
const SH_ROUNDS  = () => roundSheet_();
const SH_COURSES = () => sheet_('공식코스');
const SH_NOTES   = () => sheet_('알림');
const SH_LOG     = () => sheet_('라운드_기록');

// 라운드 시트: 16번째 칸(삭제시각)이 있도록 보장. 기존 줄은 그대로 둔다.
function roundSheet_() {
  const sh = sheet_('라운드');
  if (sh.getMaxColumns() < RW) sh.insertColumnsAfter(sh.getMaxColumns(), RW - sh.getMaxColumns());
  if (String(sh.getRange(1, RW).getValue()) !== SHEETS.rounds[RW - 1]) sh.getRange(1, RW).setValue(SHEETS.rounds[RW - 1]);
  return sh;
}

function styleHead_(sh) {
  const n = sh.getLastColumn();
  const h = sh.getRange(1, 1, 1, n);
  h.setBackground('#1B5E20'); h.setFontColor('#fff'); h.setFontWeight('bold');
  sh.setFrozenRows(1);
}

function admins_() {
  return (props_().getProperty('ADMINS') || '장재혁').split(',').map(s => s.trim()).filter(Boolean);
}
function secret_() {
  let s = props_().getProperty('AUTH_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props_().setProperty('AUTH_SECRET', s); }
  return s;
}

// 쓰기는 한 번에 하나씩 — 여러 사람이 동시에 저장해도 서로의 줄을 건드리지 않게.
// 잠금을 못 잡으면(서버가 붐빔) 아무것도 쓰지 않고 실패로 알린다 → 앱은 기기에 보관했다가 자동 재시도.
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return err_('서버가 바빠요 — 잠시 후 자동으로 다시 저장해요');
  try { return fn(); }
  finally { lock.releaseLock(); }
}

// ── ② 라우팅 ───────────────────────────────────────────────
function doGet(e) {
  const a = (e && e.parameter && e.parameter.action) || 'ping';
  const u = (e && e.parameter && e.parameter.u) || '';
  const token = (e && e.parameter && e.parameter.token) || '';

  if (a === 'ping')       return ok_({ version: VERSION, msg: '온그린 연결 성공 ⛳' });
  if (a === 'getCourses') return ok_({ courses: readCourses_() });        // 공개

  if (!verify_(u, token)) return err_('인증실패');
  if (a === 'getRounds')        return ok_(getRounds_(u));               // { rounds, deleted }
  if (a === 'getNotifications') { if (!isAdmin_(u)) return err_('권한없음'); return ok_({ notes: getNotes_() }); }
  if (a === 'getUsers')         { if (!isAdmin_(u)) return err_('권한없음'); return ok_({ users: getUsers_() }); }
  return ok_({});
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const u = d.u || '', token = d.token || '';
    return withLock_(() => {
      // 인증 불필요
      if (d.action === 'login') return login_(d.username, d.pin);

      // 인증 필요
      if (!verify_(u, token)) return err_('인증실패');
      if (d.action === 'saveRounds')  return saveRounds_(u, d.rounds || [], d.dels || []);
      if (d.action === 'saveCourse')  return saveCourse_(u, d.course, !!d.isEdit, d.oldName || '', d.base || null);
      if (d.action === 'reportPar')   { addNote_(u, '홀파수정', d.detail || d.course); return ok_({}); }   // 마스터는 안 건드림, 알림만
      if (d.action === 'updatePin')   return updatePin_(u, d.pin);

      // 관리자 전용
      if (!isAdmin_(u)) return err_('권한없음');
      if (d.action === 'deleteCourse')      return deleteCourse_(u, d.name);
      if (d.action === 'clearNotifications') return clearNotes_();
      if (d.action === 'resetUserPin')      return resetUserPin_(d.target, d.pin);
      if (d.action === 'deleteUser')        return deleteUser_(d.target);
      return ok_({});
    });
  } catch (err) { return err_(String(err)); }
}

// ── ③ 인증 (서버에서만 잠금) ────────────────────────────────
// ★ 아래 계산식을 바꾸면 모든 사용자의 로그인이 풀린다 — 절대 수정 금지
function sha_(str) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8)
    .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}
function hashPin_(pin)            { return sha_(String(pin) + secret_()); }              // 시트에 저장되는 값
function makeToken_(user, stored) { return sha_(user + stored + secret_()); }            // 손목밴드(토큰)

function findUserRow_(username) {
  const sh = SH_USERS();
  if (sh.getLastRow() < 2) return -1;
  const names = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < names.length; i++) if (names[i][0] === username) return i + 2;
  return -1;
}

function login_(username, pin) {
  if (!username || username.length < 2) return err_('이름2자');
  if (!/^\d{4}$/.test(String(pin)))     return err_('비번4자');
  const isAdmin = admins_().includes(username);
  const row = findUserRow_(username);
  const hash = hashPin_(pin);

  if (row === -1) {                                   // 처음 보는 이름 → 자동 가입
    SH_USERS().appendRow([username, hash, new Date().toLocaleDateString('ko-KR')]);
    return ok_({ token: makeToken_(username, hash), isAdmin, isNew: true });
  }
  const stored = String(SH_USERS().getRange(row, 2).getValue());
  if (stored === hash) return ok_({ token: makeToken_(username, stored), isAdmin });
  return ok_({ wrongPin: true });
}

function verify_(username, token) {
  if (!username || !token) return false;
  const row = findUserRow_(username);
  if (row === -1) return false;
  const stored = String(SH_USERS().getRange(row, 2).getValue());
  return makeToken_(username, stored) === token;
}
function isAdmin_(username) { return admins_().includes(username); }

function updatePin_(u, pin) {
  if (!/^\d{4}$/.test(String(pin))) return err_('비번4자');
  const row = findUserRow_(u);
  if (row === -1) return err_('사용자없음');
  const hash = hashPin_(pin);
  SH_USERS().getRange(row, 2).setValue(hash);
  return ok_({ token: makeToken_(u, hash) });          // 새 토큰 발급
}

// ── ④ 라운드 (단일 시트, 한 줄 = 한 라운드, 절대 안 지움) ─────────
function readRoundRows_(sh) {
  const n = sh.getLastRow() - 1;
  return n < 1 ? [] : sh.getRange(2, 1, n, RW).getValues();
}
function parseRound_(s) { try { const o = JSON.parse(s); return (o && typeof o === 'object') ? o : null; } catch (e) { return null; } }
function roundRow_(u, r, delAt) {
  return [
    u, r.date || '', r.courseName || '', r.courseLbl || '', r.weather || '', r.partner || '', r.memo || '',
    r.score || 0, r.vs || 0, r.par || 72, r.putts || 0, r.gir || 0, r.fir || 0, r.mulligan || 0,
    JSON.stringify(r), delAt || ''
  ];
}
// 날짜 최신순 → 같은 날이면 나중에 만든 라운드 먼저 (앱 홈 목록 순서)
function sortRounds_(list) {
  return list.sort((a, b) => {
    const da = String(a.date || ''), db = String(b.date || '');
    if (da !== db) return da < db ? 1 : -1;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
}

function getRounds_(u) {
  const rows = readRoundRows_(SH_ROUNDS());
  const out = [], deleted = [];
  rows.forEach(r => {
    if (r[0] !== u) return;
    const o = parseRound_(r[C_JSON]);                   // 마지막 칸(상세 JSON)에서 복원
    if (!o || o.id == null) return;
    if (r[C_DEL]) deleted.push(o.id); else out.push(o);
  });
  return { rounds: sortRounds_(out), deleted };
}

// 저장 = "고치거나 붙이기"만 한다. 보낸 목록에 없는 라운드는 그대로 둔다(절대 안 지움).
//  · rounds: 이 사용자의 라운드들(전부여도, 일부여도 됨)
//  · dels:   이 기기에서 사용자가 직접 삭제한 라운드 id → 줄은 남기고 '삭제시각'만 표시
//  · 같은 라운드는 updatedAt 이 더 크거나 같을 때만 덮는다(켜 둔 옛 기기의 옛 값이 새 값을 못 덮게).
//  · 삭제 표시된 라운드는, 삭제 시각보다 나중에 고친 값이 올 때만 되살린다(다른 기기의 옛 목록으로 부활 방지).
function saveRounds_(u, rounds, dels) {
  const sh = SH_ROUNDS();
  const rows = readRoundRows_(sh);
  const now = Date.now(), stamp = new Date().toLocaleString('ko-KR');
  const idx = {};                                      // id → 시트의 줄 위치(0부터)
  rows.forEach((r, i) => {
    if (r[0] !== u) return;
    const o = parseRound_(r[C_JSON]);
    if (o && o.id != null && idx[String(o.id)] === undefined) idx[String(o.id)] = i;
  });
  const touched = {}, appends = [], logs = [];
  (Array.isArray(rounds) ? rounds : []).forEach(r => {
    if (!r || typeof r !== 'object' || r.id == null) return;
    const k = String(r.id), json = JSON.stringify(r);
    const inT = Number(r.updatedAt) || 0;
    if (idx[k] === undefined) {
      idx[k] = rows.length + appends.length;           // 같은 요청에 같은 id 가 두 번 와도 한 줄만
      appends.push(roundRow_(u, r, ''));
      logs.push([stamp, u, k, '추가', json]);
      return;
    }
    const i = idx[k];
    const cur = i < rows.length ? rows[i] : appends[i - rows.length];
    const curObj = parseRound_(cur[C_JSON]) || {};
    const delAt = Number(cur[C_DEL]) || 0;
    if (delAt) {
      if (inT <= delAt) return;                        // 삭제 뒤에 고친 게 아니면 되살리지 않음
    } else {
      if (cur[C_JSON] === json) return;                // 바뀐 게 없음
      if (inT < (Number(curObj.updatedAt) || 0)) return;   // 더 오래된 수정본은 무시
    }
    const nr = roundRow_(u, r, '');
    if (i < rows.length) { rows[i] = nr; touched[i] = true; } else appends[i - rows.length] = nr;
    logs.push([stamp, u, k, delAt ? '되살림' : '수정', json]);
  });
  (Array.isArray(dels) ? dels : []).forEach(id => {
    if (id == null) return;
    const i = idx[String(id)];
    if (i === undefined) return;
    const cur = i < rows.length ? rows[i] : appends[i - rows.length];
    if (cur[C_DEL]) return;
    cur[C_DEL] = now;
    if (i < rows.length) touched[i] = true;
    logs.push([stamp, u, String(id), '삭제', cur[C_JSON]]);
  });
  Object.keys(touched).forEach(i => sh.getRange(Number(i) + 2, 1, 1, RW).setValues([rows[i]]));
  if (appends.length) sh.getRange(rows.length + 2, 1, appends.length, RW).setValues(appends);
  appendLog_(logs);
  return ok_({ synced: (rounds || []).length });
}

// 일지 쓰기가 실패해도(시트 용량 등) 본 저장은 이미 끝났으므로 저장을 실패로 만들지 않는다.
function appendLog_(logs) {
  if (!logs.length) return;
  try {
    const sh = SH_LOG();
    sh.getRange(sh.getLastRow() + 1, 1, logs.length, SHEETS.log.length).setValues(logs);
  } catch (e) { console.error('라운드_기록 쓰기 실패: ' + e); }
}

// ── ⑤ 골프장 (승인 없음 · 이름 중복 금지 · 삭제는 관리자만) ──
function readCourses_() {
  const sh = SH_COURSES();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .map(r => { try { return JSON.parse(r[0]); } catch (e) { return null; } }).filter(Boolean);
}

function findCourseRow_(name) {
  const sh = SH_COURSES();
  if (sh.getLastRow() < 2) return -1;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < rows.length; i++) {
    try { if (JSON.parse(rows[i][0]).name === name) return i + 2; } catch (e) {}
  }
  return -1;
}

// 3자 병합: base(앱이 보고 고친 값) → inc(앱이 보낸 값)에서 "바뀐 것만" cur(지금 서버 값) 위에 얹는다.
//  · 이름·주소 등: 앱이 바꾼 칸만 반영, 안 바꾼 칸은 서버 최신 값 유지
//  · 나인(레이아웃): 이름으로 짝지어 홀마다 비교. 남이 추가한 나인은 유지, 내가 지운 나인만 뺀다.
//    남이 지운 나인은 내가 고친 게 아니면 되살리지 않는다.
function mergeCourse3_(base, cur, inc) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const out = Object.assign({}, cur);
  Object.keys(inc).forEach(k => { if (k !== 'layouts' && !same(inc[k], base[k])) out[k] = inc[k]; });
  const byName = ls => { const m = {}; (ls || []).forEach(l => { if (l && l.name != null && !m[l.name]) m[l.name] = l; }); return m; };
  const bL = byName(base.layouts), iL = byName(inc.layouts);
  const holes = (b, c, i) => {
    if (!Array.isArray(i)) return c;
    if (!Array.isArray(c) || !Array.isArray(b) || c.length !== i.length || b.length !== i.length) return i.slice();
    return c.map((cv, k) => (i[k] !== b[k] ? i[k] : cv));
  };
  const res = [], seen = {};
  (cur.layouts || []).forEach(cl => {
    if (!cl) return;
    const il = iL[cl.name], bl = bL[cl.name];
    seen[cl.name] = true;
    if (!il) { if (!bl) res.push(cl); return; }      // 남이 추가한 나인은 유지 / 내가 지운 나인은 뺌
    res.push(Object.assign({}, cl, il, { holes: holes(bl && bl.holes, cl.holes, il.holes) }));
  });
  (inc.layouts || []).forEach(il => {
    if (!il || seen[il.name]) return;
    const bl = bL[il.name];
    if (bl && same(bl, il)) return;                    // 남이 지운 나인 — 내가 안 만졌으면 되살리지 않음
    res.push(il); seen[il.name] = true;
  });
  out.layouts = res;
  return out;
}

function saveCourse_(u, course, isEdit, oldName, base) {
  if (!course || !course.name) return err_('코스정보없음');
  const sh = SH_COURSES();
  let c = Object.assign({}, course, { status: 'official' });
  const today = new Date().toLocaleDateString('ko-KR');

  if (isEdit) {
    // 수정: oldName(이름이 바뀌었을 수도) 또는 같은 이름 줄을 덮어씀
    const targetName = oldName || course.name;
    // 이름을 바꾸제둔 경우, 새 이름이 이미 다른 코스로 존재하면 거부
    if (oldName && oldName !== course.name && findCourseRow_(course.name) !== -1)
      return err_('이미 등록된 골프장이에요');
    let row = findCourseRow_(targetName);
    if (row === -1) row = findCourseRow_(course.name);
    if (row !== -1 && base && typeof base === 'object') {
      // 앱이 보고 고친 값(base)과 지금 서버 값이 다르면(그사이 누가 고침) → 바뀐 부분만 얹는다
      let cur = null; try { cur = JSON.parse(sh.getRange(row, 1).getValue()); } catch (e) {}
      if (cur && typeof cur === 'object') {
        c = Object.assign(mergeCourse3_(base, cur, c), { status: 'official' });
        if (c.name !== course.name && findCourseRow_(c.name) !== -1 && findCourseRow_(c.name) !== row) return err_('이미 등록된 골프장이에요');
      }
    }
    if (row !== -1) sh.getRange(row, 1).setValue(JSON.stringify(c));
    else            sh.appendRow([JSON.stringify(c), u, today]);
  } else {
    // 신규: 같은 이름이 있으면 거부 (중복 금지)
    if (findCourseRow_(course.name) !== -1) return err_('이미 등록된 골프장이에요');
    sh.appendRow([JSON.stringify(c), u, today]);
  }

  // 일반 사용자가 추가/수정하면 관리자에게 알림
  if (!isAdmin_(u)) addNote_(u, isEdit ? '수정' : '추가', course.name);
  return ok_({ saved: true });
}

function deleteCourse_(u, name) {                       // 관리자만 (doPost에서 보장)
  const row = findCourseRow_(name);
  if (row !== -1) {
    const json = SH_COURSES().getRange(row, 1).getValue();
    sheet_('삭제된_골프장').appendRow([new Date().toLocaleString('ko-KR'), u, json]);   // 지우기 전에 보관
    SH_COURSES().deleteRow(row);
  }
  return ok_({ deleted: true });
}

// ── ⑥ 알림 (관리자 배지용) ──────────────────────────────────
function addNote_(user, action, course) {
  SH_NOTES().appendRow([new Date().toLocaleString('ko-KR'), user, action, course, '']);
}
function getNotes_() {
  const sh = SH_NOTES();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues()
    .map((r, i) => ({ at: r[0], user: r[1], action: r[2], course: r[3], seen: r[4] === '확인' }))
    .filter(n => !n.seen).reverse();
}
function clearNotes_() {
  const sh = SH_NOTES();
  if (sh.getLastRow() < 2) return ok_({});
  const n = sh.getLastRow() - 1;
  sh.getRange(2, 5, n, 1).setValues(Array.from({ length: n }, () => ['확인']));
  return ok_({});
}

// ── ⑦ 관리자 ───────────────────────────────────────────────
function getUsers_() {
  const sh = SH_USERS();
  if (sh.getLastRow() < 2) return [];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  const rdata = readRoundRows_(SH_ROUNDS()).filter(x => !x[C_DEL]);
  return rows.filter(r => r[0]).map(r => ({
    username: r[0], at: r[2],
    rounds: rdata.filter(x => x[0] === r[0]).length
  }));
}
function resetUserPin_(target, pin) {
  if (!/^\d{4}$/.test(String(pin))) return err_('비번4자');
  const row = findUserRow_(target);
  if (row === -1) return err_('사용자없음');
  SH_USERS().getRange(row, 2).setValue(hashPin_(pin));
  return ok_({});
}
// 회원 삭제: 계정 줄만 없앤다. 라운드 기록은 지우지 않고 '삭제시각'만 표시(같은 이름으로 다시 와도 되살릴 수 있게).
function deleteUser_(target) {
  const row = findUserRow_(target);
  if (row !== -1) {
    const old = SH_USERS().getRange(row, 1, 1, 3).getValues()[0];
    sheet_('삭제된_회원').appendRow([new Date().toLocaleString('ko-KR')].concat(old));   // 지우기 전에 보관
    SH_USERS().deleteRow(row);
  }
  const sh = SH_ROUNDS();
  const rows = readRoundRows_(sh);
  const now = Date.now(), stamp = new Date().toLocaleString('ko-KR'), logs = [];
  rows.forEach((r, i) => {
    if (r[0] !== target || r[C_DEL]) return;
    r[C_DEL] = now;
    sh.getRange(i + 2, 1, 1, RW).setValues([r]);
    logs.push([stamp, target, String((parseRound_(r[C_JSON]) || {}).id || ''), '회원삭제', r[C_JSON]]);
  });
  appendLog_(logs);
  return ok_({});
}

// ── ⑧ 헬퍼 ────────────────────────────────────────────────
function ok_(d)  { return ContentService.createTextOutput(JSON.stringify(Object.assign({ ok: true }, d))).setMimeType(ContentService.MimeType.JSON); }
function err_(m) { return ContentService.createTextOutput(JSON.stringify({ ok: false, err: m })).setMimeType(ContentService.MimeType.JSON); }

// ── ⑨ 최초설정 / 백업 ──────────────────────────────────────
function setup() {
  if (!props_().getProperty('ADMINS')) props_().setProperty('ADMINS', '장재혁');
  secret_();                       // 시크릿 자동 생성
  SH_USERS(); SH_ROUNDS(); SH_COURSES(); SH_NOTES(); SH_LOG();   // 시트 준비 (공식코스는 있으면 그대로)
  // 매일 새벽 4시 파일 통째 백업 예약 (이미 있으면 그대로)
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'backupNow')) {
    ScriptApp.newTrigger('backupNow').timeBased().everyDays(1).atHour(4).create();
  }
  backupNow();
  Logger.log('setup 완료. 관리자=' + admins_().join(',') + ' · 매일 백업 예약됨 · 첫 백업 생성됨');
}

// 데이터 파일 전체를 Drive 의 '온그린_백업' 폴더에 사본으로 남긴다. 백업은 절대 지우지 않는다(하루 1개 ≈ 100KB, 1년 ≈ 40MB).
function backupNow() {
  const it = DriveApp.getFoldersByName('온그린_백업');
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder('온그린_백업');
  const name = '온그린 백업 ' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  DriveApp.getFileById(ss_().getId()).makeCopy(name, folder);
  Logger.log('백업 완료: ' + name);
}

// ★ 계정 초기화 — 사용자·라운드·알림을 모두 비운다. 실수로 실행되지 않게 잠가 둠.
//   정말 필요할 때만: 프로젝트 설정 ▶ 스크립트 속성에 ALLOW_RESET = YES 추가 후 실행(실행 전 자동 백업, 실행 후 잠금 해제값 삭제).
function resetAccounts() {
  if (props_().getProperty('ALLOW_RESET') !== 'YES') { Logger.log('잠겨 있음: 스크립트 속성 ALLOW_RESET=YES 가 있어야 실행됩니다.'); return; }
  props_().deleteProperty('ALLOW_RESET');
  backupNow();
  const u = SH_USERS(); u.clearContents(); u.appendRow(SHEETS.users); styleHead_(u);
  const r = SH_ROUNDS(); r.clearContents(); r.appendRow(SHEETS.rounds); styleHead_(r);
  const n = SH_NOTES(); n.clearContents(); n.appendRow(SHEETS.notes); styleHead_(n);
  Logger.log('계정 초기화 완료(백업 생성됨). 골프장은 보존됨. 관리자=' + admins_().join(','));
}

function openSheet() { Logger.log(ss_().getUrl()); }

// ── ⑩ 복구: 시트의 과거 버전들에서 지워진 라운드를 모아 되살린다 ──────
// 구글 시트는 바뀔 때마다 버전(revision)을 남긴다. 각 버전을 엑셀(xlsx)로 받아 '라운드' 탭을 읽고,
// (사용자, 라운드 id) 마다 가장 나중 버전의 내용을 모은다. 적용은 "지금 시트에 없는 라운드만 맨 밑에 추가" —
// 지금 있는 줄은 하나도 건드리지 않는다. 작업용 기록은 별도 파일 '온그린 복구작업' 에 둔다.
//   recover1_collect  : 한 번에 약 4분씩 버전을 읽는다. 로그에 "완료" 가 나올 때까지 반복 실행.
//   recover2_preview  : 사람별로 몇 개가 되살아날지 보여준다(쓰기 없음).
//   recover3_apply    : 실제로 되살린다(실행 전 자동 백업).
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function recoverBook_() {
  const p = props_();
  let id = p.getProperty('RECOVER_SSID');
  if (!id) {
    const s = SpreadsheetApp.create('온그린 복구작업');
    s.getSheets()[0].setName('수집').appendRow(['사용자', 'id', '발견버전시각', '삭제됨', 'JSON']);
    s.insertSheet('진행').appendRow(['revisionId', '버전시각', '라운드수', '결과']);
    id = s.getId(); p.setProperty('RECOVER_SSID', id);
  }
  return SpreadsheetApp.openById(id);
}

function listRevisions_() {
  const token = ScriptApp.getOAuthToken(), out = [];
  let pageToken = '';
  do {
    const url = 'https://www.googleapis.com/drive/v3/files/' + ss_().getId() + '/revisions?pageSize=1000'
      + '&fields=nextPageToken,revisions(id,modifiedTime,exportLinks)' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('버전 목록을 못 받았어요: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
    const j = JSON.parse(res.getContentText());
    (j.revisions || []).forEach(r => out.push(r));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out.sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));   // 최신 버전부터
}

function recover1_collect() {
  const t0 = Date.now();
  const book = recoverBook_(), shC = book.getSheetByName('수집'), shP = book.getSheetByName('진행');
  const done = {};
  if (shP.getLastRow() > 1) shP.getRange(2, 1, shP.getLastRow() - 1, 1).getValues().forEach(r => { done[String(r[0])] = true; });
  const col = {};                                      // "사용자\u0001id" → [사용자, id, 버전시각, 삭제됨, JSON]
  if (shC.getLastRow() > 1) shC.getRange(2, 1, shC.getLastRow() - 1, 5).getValues().forEach(r => { col[r[0] + '\u0001' + r[1]] = r; });
  const revs = listRevisions_();
  const token = ScriptApp.getOAuthToken();
  let processed = 0, retry = 0;
  // 예전 버전이 429 로 "처리 완료" 표시된 기록은 다시 읽도록 지운다(작업용 파일만 수정)
  if (shP.getLastRow() > 1) {
    const pv = shP.getRange(2, 1, shP.getLastRow() - 1, 4).getValues();
    const keep = pv.filter(r => !/^HTTP (429|5\d\d)$/.test(String(r[3])));
    if (keep.length !== pv.length) {
      shP.getRange(2, 1, pv.length, 4).clearContent();
      if (keep.length) shP.getRange(2, 1, keep.length, 4).setValues(keep);
      Object.keys(done).forEach(k => delete done[k]);
      keep.forEach(r => { done[String(r[0])] = true; });
    }
  }
  for (const rev of revs) {
    if (done[String(rev.id)]) continue;
    if (Date.now() - t0 > 4 * 60 * 1000) break;        // 6분 실행 제한 전에 멈추고 다음 실행에서 이어서
    const link = rev.exportLinks && rev.exportLinks[XLSX_MIME];
    let count = 0, result = 'ok';
    if (!link) result = '내보내기 링크 없음';
    else {
      const res = UrlFetchApp.fetch(link, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) result = 'HTTP ' + res.getResponseCode();
      else {
        const files = {};
        Utilities.unzip(res.getBlob().setContentType('application/zip')).forEach(b => {
          const nm = b.getName();
          if (/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(nm)) files[nm] = b.getDataAsString('UTF-8');
        });
        const rows = xlsxSheetRows_(files, '라운드');
        count = collectRows_(col, rows, rev.modifiedTime);
      }
    }
    if (/^HTTP (429|5\d\d)$/.test(result)) {          // 구글이 "잠깐 쉬어"(429)·일시 오류 → 처리 완료로 표시하지 않고 다음 실행에서 다시
      retry++;
      Utilities.sleep(5000);
      if (retry >= 5) break;                           // 계속 막히면 이번 실행은 멈춤(조금 뒤 다시 실행)
      continue;
    }
    shP.appendRow([String(rev.id), rev.modifiedTime, count, result]);
    processed++;
    Utilities.sleep(1200);                             // 요청 간격 — 429 예방
  }
  const all = Object.keys(col).map(k => col[k]);
  if (shC.getLastRow() > 1) shC.getRange(2, 1, shC.getLastRow() - 1, 5).clearContent();   // 작업용 파일만 갱신(원본 데이터 아님)
  if (all.length) shC.getRange(2, 1, all.length, 5).setValues(all);
  const remain = revs.filter(r => !done[String(r.id)]).length - processed;
  if (retry >= 5) Logger.log('⏳ 구글이 요청을 잠시 막았어요(429). 1~2분 뒤 recover1_collect 를 다시 실행하세요.');
  Logger.log('이번에 읽은 버전 ' + processed + '개 · 남은 버전 ' + remain + '개 / 전체 ' + revs.length + '개 · 모인 라운드 ' + all.length + '개');
  Logger.log(remain > 0 ? '▶ 아직 남았어요. recover1_collect 를 한 번 더 실행하세요.' : '✅ 완료! 이제 recover2_preview → recover3_apply 순서로 실행하세요.');
}

// 한 버전의 '라운드' 탭 행들을 모음표에 반영. 같은 (사용자,id)는 더 나중 버전의 내용을 남긴다.
function collectRows_(col, rows, revTime) {
  let n = 0;
  (rows || []).slice(1).forEach(r => {
    const user = r[0], o = parseRound_(r[C_JSON]);
    if (!user || !o || o.id == null) return;
    n++;
    const k = user + '\u0001' + String(o.id);
    const prev = col[k];
    if (!prev || String(prev[2]) < String(revTime)) col[k] = [user, String(o.id), revTime, r[C_DEL] ? 'Y' : '', r[C_JSON]];
  });
  return n;
}

function recoverPlan_() {
  const book = recoverBook_(), shC = book.getSheetByName('수집');
  const users = {};
  readUsersList_().forEach(n => { users[n] = true; });
  const have = {};
  readRoundRows_(SH_ROUNDS()).forEach(r => { const o = parseRound_(r[C_JSON]); if (o && o.id != null) have[r[0] + '\u0001' + String(o.id)] = true; });
  const add = [], skippedUser = {};
  if (shC.getLastRow() > 1) shC.getRange(2, 1, shC.getLastRow() - 1, 5).getValues().forEach(r => {
    const k = r[0] + '\u0001' + String(r[1]);
    if (have[k] || r[3] === 'Y') return;               // 지금 시트에 있으면(삭제 표시 포함) 손대지 않음
    if (!users[r[0]]) { skippedUser[r[0]] = (skippedUser[r[0]] || 0) + 1; return; }   // 지금은 없는 계정
    const o = parseRound_(r[4]);
    if (!o) return;
    have[k] = true;
    add.push({ user: r[0], round: o });
  });
  return { add, skippedUser };
}
function readUsersList_() {
  const sh = SH_USERS();
  return sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => r[0]).filter(Boolean);
}
function summarizePlan_(plan) {
  const by = {};
  plan.add.forEach(a => { const b = by[a.user] = by[a.user] || { n: 0, draft: 0 }; b.n++; if (a.round.isDraft) b.draft++; });
  Object.keys(by).forEach(u => Logger.log(u + ': ' + by[u].n + '개 되살림' + (by[u].draft ? ' (그중 작성중 ' + by[u].draft + '개)' : '')));
  Object.keys(plan.skippedUser).forEach(u => Logger.log('(건너뜀) ' + u + ': 지금 없는 계정이라 ' + plan.skippedUser[u] + '개는 수집표에만 보관'));
  Logger.log('합계 ' + plan.add.length + '개');
}
function recover2_preview() { summarizePlan_(recoverPlan_()); Logger.log('(미리보기 — 아무것도 쓰지 않았습니다)'); }

function recover3_apply() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) { Logger.log('서버가 바빠요. 잠시 후 다시 실행하세요.'); return; }
  try {
    backupNow();                                       // 되살리기 전 상태도 백업
    const plan = recoverPlan_();
    if (!plan.add.length) { Logger.log('되살릴 라운드가 없어요(이미 모두 있음).'); return; }
    const sh = SH_ROUNDS();
    const rows = plan.add.map(a => roundRow_(a.user, a.round, ''));
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, RW).setValues(rows);
    const stamp = new Date().toLocaleString('ko-KR');
    appendLog_(plan.add.map(a => [stamp, a.user, String(a.round.id), '복구', JSON.stringify(a.round)]));
    summarizePlan_(plan);
    Logger.log('✅ 되살리기 완료. 앱을 새로고침하면 보입니다.');
  } finally { lock.releaseLock(); }
}

// ── xlsx 읽기 (순수 함수: 파일이름→XML 문자열 맵을 받아 시트의 2차원 배열 반환) ──
function xmlText_(s) {
  return String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, g) => {
    if (g[0] === '#') return String.fromCodePoint(g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10));
    return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[g];
  });
}
function xmlAttrs_(tag) {
  const a = {}; let m; const re = /([\w:]+)\s*=\s*"([^"]*)"/g;
  while ((m = re.exec(tag))) a[m[1]] = xmlText_(m[2]);
  return a;
}
function siText_(si) {                                 // <si> 안의 모든 <t> 를 이어붙임(읽는 법 표기 <rPh> 제외)
  const body = si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '', m; const re = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g;
  while ((m = re.exec(body))) out += m[1] ? xmlText_(m[1]) : '';
  return out;
}
function colIndex_(ref) {
  const letters = String(ref).replace(/[^A-Z]/g, '');
  let n = 0; for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}
function xlsxSheetRows_(files, sheetName) {
  const wb = files['xl/workbook.xml'] || '', rels = files['xl/_rels/workbook.xml.rels'] || '';
  let rid = null; let m;
  const sre = /<sheet\b[^>]*\/?>/g;
  while ((m = sre.exec(wb))) { const a = xmlAttrs_(m[0]); if (a.name === sheetName) { rid = a['r:id']; break; } }
  if (!rid) return [];
  let target = null;
  const rre = /<Relationship\b[^>]*\/?>/g;
  while ((m = rre.exec(rels))) { const a = xmlAttrs_(m[0]); if (a.Id === rid) { target = a.Target; break; } }
  if (!target) return [];
  const path = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  const xml = files[path]; if (!xml) return [];
  const ss = [];
  const sst = files['xl/sharedStrings.xml'] || '';
  const sire = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
  while ((m = sire.exec(sst))) ss.push(m[1] ? siText_(m[1]) : '');
  const out = [];
  const rowre = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g;
  let autoRow = 0;
  while ((m = rowre.exec(xml))) {
    const ra = xmlAttrs_('<x ' + (m[1] || m[3] || '') + '>');
    const ri = ra.r ? Number(ra.r) - 1 : autoRow;
    autoRow = ri + 1;
    const cells = [];
    const body = m[2] || '';
    const cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let c, autoCol = 0;
    while ((c = cre.exec(body))) {
      const ca = xmlAttrs_('<x ' + c[1] + '>');
      const ci = ca.r ? colIndex_(ca.r) : autoCol;
      autoCol = ci + 1;
      const inner = c[2] || '';
      let v = '';
      if (ca.t === 's') { const vm = /<v>([\s\S]*?)<\/v>/.exec(inner); v = vm ? (ss[Number(vm[1])] || '') : ''; }
      else if (ca.t === 'inlineStr') { const im = /<is>([\s\S]*?)<\/is>/.exec(inner); v = im ? siText_(im[1]) : ''; }
      else { const vm = /<v>([\s\S]*?)<\/v>/.exec(inner); v = vm ? xmlText_(vm[1]) : ''; }
      cells[ci] = v;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    out[ri] = cells;
  }
  for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = [];
  return out;
}
