// ============================================================
// app.js — 두뇌 방
// 로그인 판단, 점수 계산, 통계, 화면 전환 등 모든 로직.
// 통신은 api.js(API), 모양은 style.css.
// ============================================================

// ── 앱(프런트엔드) 버전 ──
// 기능이 추가될 때마다 여기 숫자를 올리고 CHANGELOG.md 에 기록을 남깁니다.
// ⚠️ 이것은 API.VERSION(서버 통신 동기화용)과 다릅니다. 서버를 안 건드리는
//    프런트 변경이면 API.VERSION 은 그대로 두고 APP_VERSION 만 올리세요.
const APP_VERSION = 'v12.1.0';

// ── 기본 골프장 (서버에서 못 불러올 때만 쓰는 비상용) ──
const DEF = [
  { id: 'd1', name: '블루원 CC', addr: '경북 경주', status: 'official', layouts: [{ name: '레이크', holes: [4,3,4,5,3,4,5,4,3] }, { name: '파인', holes: [4,5,3,4,4,5,3,4,4] }] },
  { id: 'd2', name: '레이크힐스 CC', addr: '경기 용인', status: 'official', layouts: [{ name: '레이크', holes: [4,4,3,5,4,3,5,4,4] }, { name: '힐스', holes: [5,3,4,4,3,5,4,4,3] }] },
];

// ── 앱 상태 (메모리; 세션만 localStorage에 백업) ──
let A = {
  u: '', isAdm: false,
  rounds: [], official: [...DEF], notes: [],
  allCourses() { return this.official; },                 // 코스는 공식 목록 하나뿐
  sc: { course: null, li: [0, 1], ro: false, eid: null, half: 0,
        scores: Array(18).fill(0), putts: Array(18).fill(2),
        gir: Array(18).fill(false), fir: Array(18).fill(false),
        mulli: Array(18).fill(0), tp: Array(18).fill(0),
        date: '', wx: '☀️ 맑음', partner: '', memo: '' } };

// ── 분석 기준값(신호등) · 관리자가 설정에서 수정 → 서버 공유. 서버 없으면 이 기본값 ──
let BENCH = { survGood: 70, survOk: 60, tpDemote: 3, puttGood: 32, puttBad: 36, girGood: 50, girBad: 28 };
function nf(x) { return Number.isInteger(+x) ? String(+x) : (+x).toFixed(1); }
let _sid = 0, _delId = null, _editOldName = '';

// ── 작은 도우미 ──
const Q = id => document.getElementById(id);
const vsL = v => v === 0 ? 'E' : v > 0 ? '+' + v : String(v);
const pC = v => v < 0 ? 'gp' : v > 0 ? 'rp' : 'ep';
function cls(s, p) { if (!s) return 'e'; const d = s - p; return d <= -2 ? 'eag' : d === -1 ? 'bir' : d === 0 ? 'par' : d === 1 ? 'bog' : d === 2 ? 'dbl' : 'wrs'; }
function showPg(id) { document.querySelectorAll('.page').forEach(p => p.classList.remove('on')); Q('pg-' + id).classList.add('on'); }
function cm(id) { Q(id).classList.remove('on'); }
function om(id) { Q(id).classList.add('on'); }
function load(msg) { Q('ldm').textContent = msg || '불러오는 중...'; Q('ld').classList.add('on'); }
function hide() { Q('ld').classList.remove('on'); }
function toast(m, t) { const el = Q('toast'); el.textContent = m; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), t || 2600); }

// ════════════════════════════════════════
// 로그인 / 인증
// ════════════════════════════════════════
async function doLogin() {
  const n = Q('li-n').value.trim(), p = Q('li-p').value.trim(), err = Q('li-e'), btn = Q('li-btn');
  err.textContent = '';
  if (n.length < 2) { err.textContent = '⚠️ 이름은 2자 이상 입력해주세요'; return; }
  if (!/^\d{4}$/.test(p)) { err.textContent = '⚠️ 비밀번호는 숫자 4자리로 입력해주세요'; return; }
  btn.textContent = '확인 중...'; btn.disabled = true;

  const r = await callAPI(() => API.login(n, p));
  btn.textContent = '로그인 / 가입'; btn.disabled = false;

  if (!r.ok && !r.wrongPin) { const e = explainError(r); err.textContent = '❌ ' + e.msg + ' (' + e.code + ')'; return; }
  if (r.wrongPin) { err.textContent = '❌ 비밀번호가 달라요 (PIN)'; return; }

  // 성공
  A.u = n; A.isAdm = !!r.isAdmin;
  API.setAuth(n, r.token);
  localStorage.setItem('og_s', JSON.stringify({ u: n, token: r.token, isAdm: A.isAdm }));
  if (r.isNew) toast('환영합니다! 가입됐어요 🎉');
  await loadAll();
}

function logout() {
  if (!confirm('로그아웃 하시겠어요?')) return;
  localStorage.removeItem('og_s'); localStorage.removeItem('og_cache');
  API.setAuth('', '');
  Object.assign(A, { u: '', isAdm: false, rounds: [], official: [...DEF], notes: [] });
  Q('li-n').value = ''; Q('li-p').value = ''; showPg('login');
}

async function changePin() {
  const n1 = Q('p-n1').value.trim(), n2 = Q('p-n2').value.trim(), msg = Q('p-msg');
  msg.textContent = '';
  if (!/^\d{4}$/.test(n1)) { msg.textContent = '⚠️ 새 비밀번호는 숫자 4자리'; msg.style.color = 'var(--a)'; return; }
  if (n1 !== n2) { msg.textContent = '❌ 새 비밀번호가 일치하지 않아요'; msg.style.color = 'var(--r)'; return; }
  const r = await callAPI(() => API.updatePin(n1));
  if (!r.ok) { const e = explainError(r); msg.textContent = '❌ ' + e.msg; msg.style.color = 'var(--r)'; return; }
  API.setAuth(A.u, r.token);
  localStorage.setItem('og_s', JSON.stringify({ u: A.u, token: r.token, isAdm: A.isAdm }));
  [Q('p-n1'), Q('p-n2')].forEach(el => el.value = '');
  msg.textContent = '✅ 비밀번호 변경 완료'; msg.style.color = 'var(--g)'; toast('비밀번호 변경됐어요');
}

// ════════════════════════════════════════
// 데이터 불러오기
// ════════════════════════════════════════
async function loadAll(silent) {
  if (!silent) load('데이터 불러오는 중...');  // 캐시로 이미 화면이 떠 있으면(silent) 로딩창 없이 조용히 갱신
  const [rr, cr, br] = await Promise.all([ callAPI(() => API.getRounds()), callAPI(() => API.getCourses()), callAPI(() => API.getBench()) ]);

  if (rr && rr.err === '인증실패') { hide(); logoutSilent(); return; }  // 토큰 만료(초기화 등) — 이때만 로그아웃

  // 네트워크 단절: 로그인은 유지하고 캐시 데이터를 그대로 보여줌(튕기지 않음)
  if (rr && rr.__net) {
    setUserLabels();
    renderHome(); showPg('home'); goHome(); hide();
    if (!silent) toast('오프라인 상태예요 — 저장된 기록을 표시합니다');
    return;
  }

  if (br && br.ok && br.bench && typeof br.bench === 'object') Object.assign(BENCH, br.bench);  // 서버 기준값 반영(없으면 기본값 유지)
  A.rounds = (rr && rr.rounds) || [];
  A.official = (cr && cr.courses && cr.courses.length) ? cr.courses.map(c => ({ ...c, status: 'official' })) : [...DEF];
  try { localStorage.setItem('og_cache', JSON.stringify({ rounds: A.rounds, official: A.official, bench: BENCH })); } catch (e) {}  // 다음 실행 때 즉시 표시용 캐시

  setUserLabels();
  if (A.isAdm) refreshNotes();  // 관리자 알림은 뒤에서 채움(홈 표시를 막지 않음)

  renderHome(); showPg('home');
  goHome();
  hide();
}
function setUserLabels() {
  Q('h-user').textContent = '👤 ' + A.u;
  Q('st-user').textContent = '👤 ' + A.u;
  Q('set-u').textContent = '👤 ' + A.u;
  Q('adm-panel').style.display = A.isAdm ? 'block' : 'none';
}
function logoutSilent() {
  localStorage.removeItem('og_s'); localStorage.removeItem('og_cache'); API.setAuth('', '');
  Object.assign(A, { u: '', isAdm: false, rounds: [], official: [...DEF], notes: [] });
  showPg('login'); toast('다시 로그인해주세요');
}

async function refreshNotes() {
  if (!A.isAdm) return;
  const r = await callAPI(() => API.getNotifications());
  A.notes = (r && r.notes) || [];
  const cnt = A.notes.length;
  const b = Q('ab'); b.textContent = cnt > 9 ? '9+' : cnt; b.style.display = cnt ? 'flex' : 'none';
  const nc = Q('note-cnt'); if (nc) nc.textContent = cnt ? cnt + '건' : '';
}

// ════════════════════════════════════════
// 화면 전환 (탭)
// ════════════════════════════════════════
function goHome() { showPg('home'); renderHome(); document.querySelector('.tab .tb:first-child')?.classList.add('on'); document.querySelector('.tab .tb:last-child')?.classList.remove('on'); }
function goStat() { showPg('stat'); renderStat(0); document.querySelector('.tab .tb:last-child')?.classList.add('on'); document.querySelector('.tab .tb:first-child')?.classList.remove('on'); }
function goSet() { showPg('set'); Q('adm-panel').style.display = A.isAdm ? 'block' : 'none'; renderBenchSettings(); }

// ── 설정 → 📊 분석 기준 : 모두 설명 보기 / 관리자만 수정 ──
function renderBenchSettings() {
  const b = BENCH, box = Q('bench-box'); if (!box) return;
  const expl = `<div style="font-size:13px;color:var(--t2);line-height:1.7">
    신호등은 <b style="color:var(--g)">🟢 좋음</b> / <b style="color:var(--a)">🟡 양호</b> / <b style="color:var(--r)">🔴 부족</b> 3단계입니다.<br><br>
    <b style="color:var(--t)">🚗 드라이버 — 티샷 생존율</b><br>생존율 = (파4·5홀 − M·TP 켜진 홀) ÷ 파4·5홀. 🟢 ${b.survGood}%↑ · 🟡 ${b.survOk}%↑ · 🔴 그 미만. OB/해저드(M+TP)가 라운드당 ${b.tpDemote}홀↑이면 한 단계 강등.<br><br>
    <b style="color:var(--t)">🍩 퍼팅 — 라운드 총 퍼팅</b><br>🟢 ${b.puttGood}개↓ · 🟡 ${b.puttBad}개↓ · 🔴 그 초과.<br><br>
    <b style="color:var(--t)">🎯 아이언 — GIR(그린 적중률)</b><br>🟢 ${b.girGood}%↑ · 🟡 ${b.girBad}%↑ · 🔴 그 미만.</div>`;
  let html = expl;
  if (A.isAdm) {
    const f = (id, label, val) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0"><label style="font-size:13px;color:var(--t2);flex:1">${label}</label><input id="bn-${id}" type="number" inputmode="numeric" value="${val}" style="width:84px;text-align:center;padding:8px;border-radius:8px;border:1.5px solid var(--bd);background:var(--bg3);color:var(--t);font-size:15px;font-weight:700"></div>`;
    html += `<div class="msep"></div><div style="font-size:12px;color:var(--a);font-weight:700;margin-bottom:6px">🔧 관리자 — 기준값 수정 (전체 적용)</div>`
      + f('survGood', '드라이버 생존율 좋음(%)', b.survGood)
      + f('survOk', '드라이버 생존율 양호(%)', b.survOk)
      + f('tpDemote', 'OB/해저드 강등 기준(M+TP, 라운드당 홀)', b.tpDemote)
      + f('puttGood', '퍼팅 좋음(개 이하)', b.puttGood)
      + f('puttBad', '퍼팅 부족(개 초과)', b.puttBad)
      + f('girGood', '아이언 GIR 좋음(%)', b.girGood)
      + f('girBad', '아이언 GIR 부족(%)', b.girBad)
      + `<div id="bench-msg" style="font-size:12px;min-height:16px;margin:8px 0"></div>`
      + `<button class="btn btn-g" onclick="saveBench()" style="width:100%">기준 저장 (전체 반영)</button>`;
  }
  box.innerHTML = html;
}
async function saveBench() {
  const ids = ['survGood', 'survOk', 'tpDemote', 'puttGood', 'puttBad', 'girGood', 'girBad'];
  const nb = {}; for (const id of ids) { const v = parseFloat(Q('bn-' + id).value); if (!isNaN(v)) nb[id] = v; }
  const msg = Q('bench-msg'); msg.style.color = 'var(--t2)'; msg.textContent = '저장 중...';
  const r = await callAPI(() => API.setBench(nb));
  if (r && r.ok) { Object.assign(BENCH, r.bench || nb); msg.style.color = 'var(--g)'; msg.textContent = '✅ 저장됨 — 전체 분석에 반영됩니다'; renderBenchSettings(); }
  else { Object.assign(BENCH, nb); msg.style.color = 'var(--a)'; msg.textContent = '⚠️ 이 기기에만 적용됨 (서버 미연결 — 배포 후 전체 공유)'; renderBenchSettings(); }
}

// ════════════════════════════════════════
// 홈 (라운드 목록)
// ════════════════════════════════════════
function renderHome() {
  const el = Q('h-body'); let h = '';
  if (A.isAdm && A.notes.length) {
    h += `<div class="adm-bnr" onclick="goSet()" style="display:flex">
      <span style="font-size:22px">🔔</span><div style="flex:1">
        <div style="font-size:14px;font-weight:700;color:var(--a)">골프장 변경 알림</div>
        <div style="font-size:12px;color:var(--t2)">${A.notes.length}건 — 설정 ▶ 관리자 패널</div>
      </div><span style="color:var(--a)">→</span></div>`;
  }
  const rounds = A.rounds;
  if (!rounds.length) { el.innerHTML = h + `<div class="empty"><div>⛳</div><p style="color:var(--t3)">아직 라운드가 없어요</p></div>`; return; }
  h += `<div class="lbl">최근 라운드</div>`;
  rounds.forEach(r => {
    const draft = r.isDraft;
    h += `<div class="rc" onclick="${draft ? `resumeDraft(${r.id})` : `openDet(${r.id})`}">
      <div class="rc-top"><div style="flex:1;min-width:0">
        <div class="rc-name">${r.courseName || '?'} <span style="font-size:12px;color:var(--t3)">${r.courseLbl || ''}</span></div>
        <div class="rc-sub">${r.date || ''} · ${r.weather || ''}${r.partner ? ' · ' + r.partner : ''}${r.memo ? ' · ' + r.memo : ''}</div>
      </div>${draft ? `<span style="background:#3a2a0a;color:var(--a);font-size:11px;font-weight:700;padding:4px 10px;border-radius:10px;flex-shrink:0">✏️ 작성중</span>` : `<div class="pill ${pC(r.vs)}">${r.score} (${vsL(r.vs)})</div>`}</div>
      ${draft ? `<div style="margin-top:10px;padding:8px 12px;background:#2a2a0a;border-radius:8px;font-size:12px;color:var(--a)">탭해서 이어서 입력 →</div>` :
      `<div class="rc-meta"><span>🍩 ${r.putts}퍼팅</span><span>🎯 GIR ${r.gir}%</span><span>🚗 FIR ${r.fir}%</span>${(r.mulligan || r.tpCount) ? `<span style="color:var(--r)">🔄 M${r.mulligan || 0}·TP${r.tpCount || 0}</span>` : ''}</div>`}
    </div>`;
  });
  el.innerHTML = h;
}

// ════════════════════════════════════════
// 라운드 (새 라운드 / 저장 / 상세 / 수정 / 삭제)
// ════════════════════════════════════════
function newRound() { Q('nr-d').value = new Date().toISOString().split('T')[0]; Q('nr-p').value = ''; Q('nr-m').value = ''; om('m-nr'); }
function goSelectCourse() {
  A.sc.date = Q('nr-d').value.replaceAll('-', '.'); A.sc.wx = Q('nr-w').value;
  A.sc.partner = Q('nr-p').value; A.sc.memo = Q('nr-m').value;
  A.sc.eid = null; A.sc.ro = false; A.sc.scores = Array(18).fill(0); A.sc.putts = Array(18).fill(2);
  A.sc.gir = Array(18).fill(false); A.sc.fir = Array(18).fill(false); A.sc.mulli = Array(18).fill(0); A.sc.tp = Array(18).fill(0);
  cm('m-nr'); renderCourses(); showPg('course');
}

function buildRound(isDraft) {
  const h = getH(); const par = h.reduce((a, b) => a + b, 0);
  const c = A.sc.course; const [l0, l1] = A.sc.li;
  const tot = A.sc.scores.reduce((a, b) => a + b, 0);
  return {
    id: A.sc.eid || Date.now(), isDraft: !!isDraft,
    courseId: c.id, courseName: c.name, courseLbl: `${c.layouts[l0].name}+${c.layouts[l1].name}`, layoutIdx: [l0, l1],
    date: A.sc.date, weather: A.sc.wx, partner: A.sc.partner, memo: A.sc.memo,
    score: tot, vs: tot - par, par,
    putts: A.sc.putts.reduce((a, b) => a + b, 0),
    gir: Math.round(A.sc.gir.filter(Boolean).length / 18 * 100),
    fir: Math.round(A.sc.fir.filter(Boolean).length / 18 * 100),
    mulligan: A.sc.mulli.reduce((a, b) => a + (b ? 1 : 0), 0),
    tpCount: (A.sc.tp || []).reduce((a, b) => a + (b ? 1 : 0), 0),
    scores: [...A.sc.scores], puttsArr: [...A.sc.putts], girArr: [...A.sc.gir], firArr: [...A.sc.fir],
    mulliArr: [...A.sc.mulli], tpArr: [...(A.sc.tp || Array(18).fill(0))],
    holePars: [...h]   // ★ 박제: 그날 홀별 파를 라운드에 함께 저장 → 나중에 골프장이 바뀌어도 안 흔들림
  };
}

async function saveRound() {
  if (A.sc.ro) return;
  if (!A.sc.scores.filter(x => x > 0).length) { toast('스코어를 입력해주세요'); return; }
  const rd = buildRound(false);
  const btn = Q('sv'); btn.textContent = '저장 중...'; btn.disabled = true;
  if (A.sc.eid) { const i = A.rounds.findIndex(r => r.id === A.sc.eid); if (i >= 0) A.rounds[i] = rd; else A.rounds.unshift(rd); }
  else A.rounds.unshift(rd);
  const r = await callAPI(() => API.saveRounds(A.rounds));
  toast(r.ok ? '✅ 저장 완료' : '⚠️ 저장됐지만 동기화 실패');
  btn.textContent = '저장'; btn.disabled = false;
  A.sc.eid = null; A.sc.ro = false; A.sc.course = null; goHome();
}

function roundPars(r) {                          // 박제된 파 우선, 없으면 옛 라운드 호환용으로 마스터 참조
  if (r.holePars && r.holePars.length === 18) return r.holePars;
  const c = A.allCourses().find(x => x.id === r.courseId);
  const [l0, l1] = r.layoutIdx || [0, 1];
  return c ? [...(c.layouts[l0]?.holes || []), ...(c.layouts[l1]?.holes || [])] : Array(18).fill(4);
}
function openDet(id) {
  const r = A.rounds.find(x => x.id === id); if (!r) return;
  const hh = roundPars(r);
  const AV = playerAvgs();
  const cP = sig(r.putts, AV.putts, true, 2, AV.n), cG = sig(r.gir, AV.gir, false, 10, AV.n), cF = sig(r.fir, AV.fir, false, 10, AV.n);
  Q('det-t').textContent = `${r.courseName} ${r.date}`;
  Q('det-body').innerHTML = `
    <div class="sgd" style="margin-bottom:12px">
      <div class="sc"><span class="sn">${r.score}</span><span class="sl">총 스코어</span></div>
      <div class="sc"><span class="sn" style="color:${r.vs > 0 ? 'var(--r)' : 'var(--g)'}">${vsL(r.vs)}</span><span class="sl">파 대비</span></div>
      <div class="sc"><span class="sn">${dot(cP)}${r.putts}</span><span class="sl">퍼팅</span></div>
      <div class="sc"><span class="sn">${dot(cG)}${r.gir}<span class="su">%</span></span><span class="sl">GIR</span></div>
      <div class="sc"><span class="sn">${dot(cF)}${r.fir}<span class="su">%</span></span><span class="sl">FIR</span></div>
      <div class="sc"><span class="sn" style="color:var(--r)">${r.mulligan || 0}<span style="font-size:14px;color:var(--t2)">/</span>${r.tpCount || 0}</span><span class="sl">M / TP</span></div>
    </div>
    ${AV.n >= 3 ? `<div style="font-size:11px;color:var(--t3);text-align:center;margin-bottom:10px">🟢 내 평균보다 좋음 · 🟡 평균 수준 · 🔴 평균보다 나쁨</div>` : ''}
    <button id="rana-btn" onclick="toggleRoundAna(${id})" style="width:100%;background:var(--bg3);border:1.5px solid #6a6a6e;border-radius:12px;color:var(--t);font-size:14px;font-weight:700;cursor:pointer;padding:11px;margin-bottom:6px">🔍 이 라운드 분석</button>
    <div id="rana-box" style="display:none;margin-bottom:8px"></div>
    <div class="cb"><div class="cbt">홀별 스코어</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">${(r.scores || []).map((s, i) => { const d = s > 0 ? s - hh[i] : null; const co = d === null ? '#2c2c2e' : d <= -2 ? 'var(--p)' : d === -1 ? 'var(--b)' : d === 0 ? 'var(--g)' : d === 1 ? 'var(--a)' : 'var(--r)'; return `<div style="width:32px;height:32px;border-radius:8px;background:${co};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff">${s > 0 ? s : '-'}</div>`; }).join('')}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button onclick="openSC(${id},false);cm('m-det')" style="flex:1;background:var(--a);border:none;border-radius:12px;padding:12px;color:#000;font-size:14px;font-weight:700;cursor:pointer">✏️ 수정</button>
      <button onclick="askDel(${id});cm('m-det')" style="flex:1;background:#2d0f0f;border:1.5px solid #6a2020;border-radius:12px;padding:12px;color:var(--r);font-size:14px;font-weight:700;cursor:pointer">🗑 삭제</button>
    </div>`;
  om('m-det');
}

function resumeDraft(id) { openSC(id, false); }
function openSC(id, ro) {
  const r = A.rounds.find(x => x.id === id); if (!r) return;
  const master = A.allCourses().find(x => x.id === r.courseId) || A.official[0];
  const [m0, m1] = r.layoutIdx || [0, 1];
  const n0 = (master && master.layouts[m0]?.name) || '전반', n1 = (master && master.layouts[m1]?.name) || '후반';
  const pars = roundPars(r);     // 박제된 그 라운드의 파
  // 라운드 전용 코스 클론 (마스터는 절대 안 건드림)
  const c = { id: r.courseId, name: r.courseName, addr: (master && master.addr) || '',
    layouts: [ { name: n0, holes: pars.slice(0, 9) }, { name: n1, holes: pars.slice(9, 18) } ] };
  A.sc.course = c; A.sc.li = [0, 1]; A.sc.date = r.date; A.sc.wx = r.weather;
  A.sc.partner = r.partner; A.sc.memo = r.memo; A.sc.eid = id; A.sc.ro = ro; A.sc.half = 0;
  A.sc.scores = [...r.scores]; A.sc.putts = [...r.puttsArr];
  A.sc.gir = [...r.girArr]; A.sc.fir = [...r.firArr]; A.sc.mulli = [...(r.mulliArr || Array(18).fill(0))]; A.sc.tp = [...(r.tpArr || Array(18).fill(0))];
  const par = pars.reduce((a, b) => a + b, 0);
  Q('sc-t').textContent = c.name; Q('sc-s').textContent = `${r.date} · ${n0}+${n1} · 파${par}`;
  Q('sc-seg').innerHTML = `<button class="sg on" onclick="swHalf(0,this)">${n0} (1-9)</button><button class="sg" onclick="swHalf(1,this)">${n1} (10-18)</button>`;
  const eb = Q('sc-edit-holes'); if (eb) eb.style.display = ro ? 'none' : 'block';
  if (ro) {
    Q('sc-bnr').innerHTML = `<div style="padding:8px 12px;background:var(--bg2);border-bottom:.5px solid var(--bd)"><div class="bnr ro"><span style="font-size:13px;color:var(--t2)">🔒 읽기 전용</span><button style="background:var(--a);border:none;border-radius:10px;padding:9px 18px;color:#000;font-size:14px;font-weight:700;cursor:pointer" onclick="enableEdit()">✏️ 수정</button></div></div>`;
    const b = Q('sv'); b.disabled = true; b.textContent = '저장됨'; b.className = 'sv';
  } else {
    Q('sc-bnr').innerHTML = `<div style="padding:8px 12px;background:var(--bg2);border-bottom:.5px solid var(--bd)"><div class="bnr ed"><span style="font-size:13px;color:#ff8a80">수정 중</span><button style="background:var(--r);border:none;border-radius:10px;padding:9px 18px;color:#fff;font-size:14px;font-weight:700;cursor:pointer" onclick="askDel(${id})">🗑 삭제</button></div></div>`;
    const b = Q('sv'); b.disabled = false; b.textContent = '저장'; b.className = 'sv';
  }
  renderSC(); showPg('sc');
}
function enableEdit() {
  A.sc.ro = false;
  Q('sc-bnr').innerHTML = `<div style="padding:8px 12px;background:var(--bg2);border-bottom:.5px solid var(--bd)"><div class="bnr ed"><span style="font-size:13px;color:#ff8a80">수정 중</span><button style="background:var(--r);border:none;border-radius:10px;padding:9px 18px;color:#fff;font-size:14px;font-weight:700;cursor:pointer" onclick="askDel(${A.sc.eid})">🗑 삭제</button></div></div>`;
  const b = Q('sv'); b.disabled = false; b.textContent = '수정 저장'; b.className = 'sv';
  const eb = Q('sc-edit-holes'); if (eb) eb.style.display = 'block';
  renderSC();
}

function askDel(id) { _delId = id; om('m-del'); }
async function confirmDel() {
  cm('m-del'); if (!_delId) return;
  A.rounds = A.rounds.filter(r => r.id !== _delId);
  const r = await callAPI(() => API.saveRounds(A.rounds));
  toast(r.ok ? '삭제됐어요' : '⚠️ 삭제됐지만 동기화 실패');
  _delId = null; A.sc.eid = null; A.sc.ro = false; goHome();
}

function scBack() {
  if (!A.sc.ro && A.sc.course) {
    if (A.sc.scores.filter(x => x > 0).length) {
      const draft = buildRound(true);
      if (A.sc.eid) { const i = A.rounds.findIndex(r => r.id === A.sc.eid); if (i >= 0) A.rounds[i] = draft; else A.rounds.unshift(draft); }
      else { A.sc.eid = draft.id; A.rounds.unshift(draft); }
      callAPI(() => API.saveRounds(A.rounds));
      toast('✏️ 임시저장됐어요');
    }
  }
  A.sc.course = null; A.sc.eid = null; A.sc.ro = false; goHome();
}

// ════════════════════════════════════════
// 스코어카드
// ════════════════════════════════════════
const SM = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>';
const SP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>';
function getH() { const c = A.sc.course; const [l0, l1] = A.sc.li; return [...c.layouts[l0].holes, ...c.layouts[l1].holes]; }
function renderSC() {
  const h = getH(); const s = A.sc.half * 9; const ro = A.sc.ro; let html = '';
  for (let i = s; i < s + 9; i++) {
    const par = h[i], sc = A.sc.scores[i], gg = A.sc.gir[i], ff = A.sc.fir[i], pp = A.sc.putts[i], mm = A.sc.mulli[i] || 0, tpv = (A.sc.tp && A.sc.tp[i]) || 0;
    const c = sc ? cls(sc, par) : 'e'; const d = sc ? String(sc) : 'P';
    const teeLbl = tpv ? 'TP' : 'M', teeCls = mm ? 'om' : tpv ? 'otp' : '';
    const firCell = par === 3 ? '<span class="htg" style="opacity:.3;cursor:default">·</span>' : (ro ? `<span class="htg ${ff ? 'of' : ''}">FIR</span>` : `<button class="htg ${ff ? 'of' : ''}" onclick="tog(${i},'f')">FIR</button>`);
    if (ro) { html += `<div class="hr"><div class="hl"><div class="hn">${(i % 9) + 1}</div><div class="hp">P${par}</div></div><div class="hrr"><div class="hc"><div class="hv ${c}">${d}</div></div><div class="ht"><span class="htg ${gg ? 'og' : ''}">GIR</span>${firCell}<span class="htg ${pp > 0 ? 'op' : ''}">${pp}🍩</span><span class="htg ${teeCls}">${teeLbl}</span></div></div></div>`; }
    else { html += `<div class="hr"><div class="hl"><div class="hn">${(i % 9) + 1}</div><div class="hp">P${par}</div></div><div class="hrr"><div class="hc"><button class="hb" onclick="adj(${i},-1)">${SM}</button><div class="hv ${c}" onclick="sp(${i})">${d}</div><button class="hb" onclick="adj(${i},1)">${SP}</button></div><div class="ht"><button class="htg ${gg ? 'og' : ''}" onclick="tog(${i},'g')">GIR</button>${firCell}<button class="htg ${pp > 0 ? 'op' : ''}" onclick="cyp(${i})">${pp}🍩</button><button class="htg ${teeCls}" onclick="tom(${i})">${teeLbl}</button></div></div></div>`; }
  }
  Q('sc-body').innerHTML = html; updFt();
  if (!ro) { const done = A.sc.scores.every(x => x > 0); const b = Q('sv'); b.className = done ? 'sv done' : 'sv'; b.textContent = done ? '✓ 완료' : '저장'; b.disabled = false; }
}
function sp(i) { if (A.sc.ro) return; A.sc.scores[i] = getH()[i]; renderSC(); }
function adj(i, d) { if (A.sc.ro) return; const h = getH(); if (!A.sc.scores[i]) A.sc.scores[i] = h[i]; A.sc.scores[i] = Math.max(1, Math.min(12, A.sc.scores[i] + d)); renderSC(); }
function tog(i, t) { if (A.sc.ro) return; if (t === 'f' && getH()[i] === 3) return; if (t === 'g') A.sc.gir[i] = !A.sc.gir[i]; else A.sc.fir[i] = !A.sc.fir[i]; renderSC(); }
function cyp(i) { if (A.sc.ro) return; A.sc.putts[i] = (A.sc.putts[i] % 4) + 1; renderSC(); }
function tom(i) {                                 // 티샷 상태: off → M → TP → off (홀당 1개, M·TP 상호배타)
  if (A.sc.ro) return;
  if (!A.sc.tp) A.sc.tp = Array(18).fill(0);
  const m = A.sc.mulli[i] || 0, t = A.sc.tp[i] || 0;
  if (!m && !t) { A.sc.mulli[i] = 1; A.sc.tp[i] = 0; }       // off → M
  else if (m)   { A.sc.mulli[i] = 0; A.sc.tp[i] = 1; }       // M → TP
  else          { A.sc.mulli[i] = 0; A.sc.tp[i] = 0; }       // TP → off
  renderSC();
}
function swHalf(n, el) { A.sc.half = n; document.querySelectorAll('#sc-seg .sg').forEach(b => b.classList.remove('on')); el.classList.add('on'); renderSC(); }
function updFt() {
  const h = getH(); const pl = A.sc.scores.filter(x => x > 0);
  const tot = pl.reduce((a, b) => a + b, 0), ps = h.slice(0, pl.length).reduce((a, b) => a + b, 0), vs = tot - ps;
  Q('f-tot').textContent = tot || '-'; const ve = Q('f-vs'); ve.textContent = pl.length ? vsL(vs) : '-'; ve.className = 'fv ' + (vs > 0 ? 'r' : vs < 0 ? 'g' : '');
  Q('f-g').textContent = A.sc.gir.filter(Boolean).length; Q('f-p').textContent = A.sc.putts.reduce((a, b) => a + b, 0);
  const mc = A.sc.mulli.reduce((a, b) => a + (b ? 1 : 0), 0), tc = (A.sc.tp || []).reduce((a, b) => a + (b ? 1 : 0), 0);
  Q('f-m').textContent = (mc || tc) ? `${mc}/${tc}` : '-';
}

// ════════════════════════════════════════
// 골프장 (단일 목록 · 승인 없음 · 삭제는 관리자만)
// ════════════════════════════════════════
function renderCourses() {
  const q = (Q('cs-q')?.value || '').trim();
  const all = A.allCourses();
  const list = q ? all.filter(c => c.name.includes(q) || (c.addr || '').includes(q)) : all;
  Q('cs-lbl').textContent = q ? '검색 결과' : '골프장 목록';
  if (!list.length) { Q('cs-list').innerHTML = `<div class="empty" style="padding:30px 0"><div>🔍</div><small>없음</small></div>`; return; }
  // 최근 이용 골프장 순서(라운드 기록 최신순) → 그 외 가나다순
  const recent = [], seen = new Set();
  (A.rounds || []).filter(r => !r.isDraft).forEach(r => { const nm = r.courseName; if (nm && !seen.has(nm)) { seen.add(nm); recent.push(nm); } });
  const rank = nm => { const i = recent.indexOf(nm); return i < 0 ? Infinity : i; };
  const sorted = [...list].sort((a, b) => { const ra = rank(a.name), rb = rank(b.name); return ra !== rb ? ra - rb : a.name.localeCompare(b.name, 'ko'); });
  const card = c => `<div class="cc">
    <div class="cc-info" onclick="selCourse('${c.id || c.name}')">
      <div class="cc-name">${c.name}</div>
      <div class="cc-sub">${c.addr || ''} · ${(c.layouts || []).map(l => l.name).join('/')} · 파${(c.layouts || []).flatMap(l => l.holes || []).reduce((a, b) => a + b, 0)}</div>
    </div>
    <span class="cbg off">✅ 공식</span>
    <button class="ib" style="background:#1a2e1a;border:1px solid var(--g);color:var(--g)" onclick="openEditCourse('${c.id || c.name}')" title="수정">✏️</button>
    ${A.isAdm ? `<button class="ib" style="background:#2d0f0f;border:1px solid #6a2020;color:var(--r)" onclick="delCourse('${c.name}')">🗑</button>` : ''}
  </div>`;
  if (q) { Q('cs-list').innerHTML = sorted.map(card).join(''); return; }   // 검색 중엔 그냥 결과만
  const recentList = sorted.filter(c => rank(c.name) !== Infinity);
  const restList = sorted.filter(c => rank(c.name) === Infinity);
  let html = '';
  if (recentList.length) html += `<div class="lbl" style="margin:4px 0 8px">🕘 최근 이용</div>` + recentList.map(card).join('');
  if (restList.length) html += `<div class="lbl" style="margin:14px 0 8px">가나다순</div>` + restList.map(card).join('');
  Q('cs-list').innerHTML = html;
}

function selCourse(key) {
  const c = A.allCourses().find(x => x.id === key || x.name === key); if (!c) return;
  A.sc.course = c; A.sc.li = [0, 1]; openHoleMdl(c);
}

function openHoleMdl(c) { Q('m-hl-t').textContent = c.name; renderHolePkr(c, 0, 1); om('m-hl'); }
function renderHolePkr(c, l0, l1) {
  A.sc.li = [l0, l1];
  const combos = []; for (let a = 0; a < c.layouts.length; a++) for (let b = 0; b < c.layouts.length; b++) if (a !== b) combos.push([a, b]);
  Q('hl-pkr').innerHTML = `<div style="font-size:13px;font-weight:600;color:var(--t2);margin-bottom:8px">코스 조합</div><div style="display:flex;flex-wrap:wrap;gap:8px">${combos.map(([a, b]) => `<button class="lb ${a === l0 && b === l1 ? 'on' : ''}" onclick="renderHolePkr(A.sc.course,${a},${b})">${c.layouts[a].name}+${c.layouts[b].name}</button>`).join('')}</div>`;
  const all = [...c.layouts[l0].holes, ...c.layouts[l1].holes];
  const nm = [...Array(9).fill(c.layouts[l0].name), ...Array(9).fill(c.layouts[l1].name)];
  Q('hl-lbl').textContent = `${c.layouts[l0].name}+${c.layouts[l1].name} 홀 구성`;
  Q('hl-grid').innerHTML = all.map((p, i) => `<div style="text-align:center;background:var(--bg3);border-radius:10px;padding:8px 4px"><div style="font-size:10px;color:var(--t2);margin-bottom:4px">${nm[i]} ${(i % 9) + 1}H</div><div style="display:flex;align-items:center;justify-content:center;gap:4px"><button onclick="adjHP(${i},-1)" style="width:26px;height:26px;border-radius:50%;border:1.5px solid #6a6a6e;background:var(--bg3);color:#fff;cursor:pointer;font-size:14px">-</button><span id="hp-${i}" style="width:20px;text-align:center;font-size:16px;font-weight:700;color:var(--t)">${p}</span><button onclick="adjHP(${i},1)" style="width:26px;height:26px;border-radius:50%;border:1.5px solid #6a6a6e;background:var(--bg3);color:#fff;cursor:pointer;font-size:14px">+</button></div></div>`).join('');
}
function adjHP(i, d) { const el = Q('hp-' + i); if (!el) return; let v = parseInt(el.textContent) + d; if (v < 3) v = 3; if (v > 5) v = 5; el.textContent = v; }
function startScoringFromPicker() {
  // picker에서 조정한 홀별 파를 이번 라운드에만 적용 (공식 코스 데이터는 그대로 보존)
  const src = A.sc.course; const [s0, s1] = A.sc.li;
  const pars = Array.from({ length: 18 }, (_, i) => { const el = Q('hp-' + i); return el ? parseInt(el.textContent) : (i < 9 ? src.layouts[s0].holes[i] : src.layouts[s1].holes[i - 9]); });
  const clone = { id: src.id, name: src.name, addr: src.addr, status: src.status,
    layouts: [ { name: src.layouts[s0].name, holes: pars.slice(0, 9) }, { name: src.layouts[s1].name, holes: pars.slice(9, 18) } ] };
  A.sc.course = clone; A.sc.li = [0, 1];

  A.sc.scores = Array(18).fill(0); A.sc.putts = Array(18).fill(2);
  A.sc.gir = Array(18).fill(false); A.sc.fir = Array(18).fill(false); A.sc.mulli = Array(18).fill(0); A.sc.tp = Array(18).fill(0);
  A.sc.eid = null; A.sc.ro = false; A.sc.half = 0;
  const c = A.sc.course; const [l0, l1] = A.sc.li; const par = getH().reduce((a, b) => a + b, 0);
  Q('sc-t').textContent = c.name; Q('sc-s').textContent = `${A.sc.date} · ${c.layouts[l0].name}+${c.layouts[l1].name} · 파${par}`;
  Q('sc-seg').innerHTML = `<button class="sg on" onclick="swHalf(0,this)">${c.layouts[l0].name} (1-9)</button><button class="sg" onclick="swHalf(1,this)">${c.layouts[l1].name} (10-18)</button>`;
  Q('sc-bnr').innerHTML = '';
  const eb = Q('sc-edit-holes'); if (eb) eb.style.display = 'block';
  cm('m-hl'); renderSC(); showPg('sc');
}

// ── 라운드 도중 "코스 수정" (홀별 파만 · 이 라운드에만 · 마스터 안 건드림) ──
let _ehTmp = [];
function openEditHoles() {
  if (A.sc.ro || !A.sc.course) return;
  _ehTmp = getH().slice();
  const c = A.sc.course;
  Q('eh-t').textContent = c.name;
  const nm = [...Array(9).fill(c.layouts[0].name), ...Array(9).fill(c.layouts[1].name)];
  Q('eh-grid').innerHTML = _ehTmp.map((p, i) => `<div style="text-align:center;background:var(--bg3);border-radius:10px;padding:8px 4px"><div style="font-size:10px;color:var(--t2);margin-bottom:4px">${nm[i]} ${(i % 9) + 1}H</div><div style="display:flex;align-items:center;justify-content:center;gap:4px"><button onclick="adjEH(${i},-1)" style="width:26px;height:26px;border-radius:50%;border:1.5px solid #6a6a6e;background:var(--bg3);color:#fff;cursor:pointer;font-size:14px">-</button><span id="eh-${i}" style="width:20px;text-align:center;font-size:16px;font-weight:700;color:var(--t)">${p}</span><button onclick="adjEH(${i},1)" style="width:26px;height:26px;border-radius:50%;border:1.5px solid #6a6a6e;background:var(--bg3);color:#fff;cursor:pointer;font-size:14px">+</button></div></div>`).join('');
  om('m-edh');
}
function adjEH(i, d) { const el = Q('eh-' + i); if (!el) return; let v = parseInt(el.textContent) + d; if (v < 3) v = 3; if (v > 5) v = 5; el.textContent = v; }
function masterParsFor(course) {                 // 마스터 공식 파 18개 (이름 매칭). 없으면 null
  const m = A.official.find(x => x.id === course.id || x.name === course.name); if (!m) return null;
  const f = (m.layouts.find(l => l.name === course.layouts[0].name) || {}).holes;
  const s = (m.layouts.find(l => l.name === course.layouts[1].name) || {}).holes;
  if (!f || !s) return null;
  return [...f, ...s];
}
async function applyEditHoles() {
  const newPars = Array.from({ length: 18 }, (_, i) => parseInt(Q('eh-' + i).textContent));
  // 이 라운드 전용 클론에만 반영 (마스터는 건드리지 않음)
  A.sc.course.layouts[0].holes = newPars.slice(0, 9);
  A.sc.course.layouts[1].holes = newPars.slice(9, 18);
  cm('m-edh'); renderSC(); toast('✅ 이 라운드의 홀 파가 수정됐어요');

  // 마스터와 다르면 관리자에게 알림 (관리자 본인이 고친 건 제외)
  if (!A.isAdm) {
    const mp = masterParsFor(A.sc.course);
    if (mp) {
      const diff = [];
      newPars.forEach((p, i) => { if (p !== mp[i]) diff.push(`${i + 1}번 P${mp[i]}→P${p}`); });
      if (diff.length) {
        const detail = `${A.sc.course.name}: ${diff.slice(0, 4).join(', ')}${diff.length > 4 ? ' 외' : ''}`;
        callAPI(() => API.reportParChange(A.sc.course.name, detail));
      }
    }
  }
}

// ── 코스 추가/수정 폼 ──
function pGrid(uid, cnt, ex) {
  let h = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:4px">`;
  for (let i = 0; i < parseInt(cnt); i++) { const p = (ex && ex[i]) || 4; h += `<div style="text-align:center;background:#2a2a2c;border-radius:10px;padding:8px 4px"><div style="font-size:10px;color:var(--t2);margin-bottom:4px">${i + 1}홀</div><div style="display:flex;align-items:center;justify-content:center;gap:4px"><button onclick="ap(${uid},${i},-1)" style="width:26px;height:26px;border-radius:50%;border:1.5px solid #6a6a6e;background:var(--bg3);color:#fff;cursor:pointer;font-size:14px">-</button><span id="sp-${uid}-${i}" style="width:20px;text-align:center;font-size:16px;font-weight:700;color:var(--t)">${p}</span><button onclick="ap(${uid},${i},1)" style="width:26px;height:26px;border-radius:50%;border:1.5px solid #6a6a6e;background:var(--bg3);color:#fff;cursor:pointer;font-size:14px">+</button></div></div>`; }
  return h + '</div>';
}
function ap(uid, i, d) { const el = Q('sp-' + uid + '-' + i); if (!el) return; let v = parseInt(el.textContent) + d; if (v < 3) v = 3; if (v > 5) v = 5; el.textContent = v; }
function gp(uid, n) { return Array.from({ length: parseInt(n) }, (_, i) => { const el = Q('sp-' + uid + '-' + i); return el ? parseInt(el.textContent) : 4; }); }
function updPG(uid) { const s = Q('cs-s-' + uid); if (!s) return; const n = s.querySelector('.cs-hn')?.value || 9; const g = s.querySelector('.pgrid'); if (g) g.innerHTML = pGrid(uid, n); }
function addSec(name, ex) {
  const uid = ++_sid; const d = document.createElement('div');
  d.className = 'css'; d.id = 'cs-s-' + uid;
  d.innerHTML = `<div class="csh"><span style="font-size:14px;font-weight:700;color:var(--t2)">코스 ${uid}</span><button onclick="delSec(${uid})" style="background:#3d1a1a;border:1.5px solid #6a2020;border-radius:8px;color:var(--r);font-size:12px;font-weight:600;cursor:pointer;padding:5px 12px">삭제</button></div>
    <div class="mr2" style="margin-bottom:12px">
      <div class="mf" style="margin:0"><label>코스 이름</label><input class="cs-name si" value="${name || ''}" placeholder="레이크..."></div>
      <div class="mf" style="margin:0"><label>홀 수</label><select class="cs-hn si" onchange="updPG(${uid})" style="-webkit-appearance:none"><option value="9">9홀</option><option value="18">18홀</option></select></div>
    </div>
    <div class="mf" style="margin:0"><label>홀별 파 (개별 수정)</label><div class="pgrid">${pGrid(uid, (ex && ex.length === 18) ? 18 : 9, ex)}</div></div>`;
  Q('cs-secs').appendChild(d);
  if (ex && ex.length === 18) d.querySelector('.cs-hn').value = '18';
}
function delSec(uid) {
  if (document.querySelectorAll('.css').length <= 2) { toast('최소 2개 코스 필요'); return; }
  if (!confirm('이 코스를 삭제할까요?')) return;
  Q('cs-s-' + uid)?.remove();
}

function openAddCourse() {
  _sid = 0; _editOldName = ''; Q('cs-secs').innerHTML = ''; Q('cs-n').value = ''; Q('cs-a').value = '';
  Q('cs-eid').value = '';
  Q('m-cs-t').textContent = '새 골프장 등록'; Q('m-cs-btn').textContent = '등록 후 스코어카드 시작';
  addSec('전반'); addSec('후반'); om('m-cs');
}
function openEditCourse(key) {
  const c = A.allCourses().find(x => x.id === key || x.name === key); if (!c) { toast('코스 없음'); return; }
  _sid = 0; _editOldName = c.name; Q('cs-secs').innerHTML = ''; Q('cs-n').value = c.name || ''; Q('cs-a').value = c.addr || '';
  Q('cs-eid').value = c.id || c.name;
  Q('m-cs-t').textContent = '골프장 수정'; Q('m-cs-btn').textContent = '✅ 수정 저장';
  (c.layouts || []).forEach(l => addSec(l.name, l.holes)); om('m-cs');
}

async function submitCourseForm() {
  const name = Q('cs-n').value.trim(), eid = Q('cs-eid').value, isEdit = !!eid;
  if (!name) { toast('골프장 이름이 필요해요'); return; }
  const secs = document.querySelectorAll('.css'); if (secs.length < 2) { toast('코스를 2개 이상 만들어주세요'); return; }
  const layouts = [];
  secs.forEach(s => { const uid = s.id.replace('cs-s-', ''); const n = s.querySelector('.cs-name').value.trim() || '코스'; const hn = s.querySelector('.cs-hn').value || '9'; layouts.push({ name: n, holes: gp(uid, hn) }); });

  const c = { id: eid || ('c' + Date.now()), name, addr: Q('cs-a').value.trim(), layouts, status: 'official' };
  const btn = Q('m-cs-btn'); btn.disabled = true; btn.textContent = '저장 중...';
  const r = await callAPI(() => API.saveCourse(c, isEdit, _editOldName));
  btn.disabled = false; btn.textContent = isEdit ? '✅ 수정 저장' : '등록 후 스코어카드 시작';

  if (!r.ok) { const e = explainError(r); toast('❌ ' + e.msg); return; }

  // 로컬 목록 갱신
  if (isEdit) {
    const i = A.official.findIndex(x => x.name === _editOldName || x.name === name);
    if (i >= 0) A.official[i] = { ...c }; else A.official.unshift({ ...c });
    toast('✅ 수정됐어요: ' + name); cm('m-cs'); renderCourses();
    if (A.isAdm) admLoadOfficial();
  } else {
    A.official.unshift({ ...c });
    cm('m-cs'); toast('✅ 등록됐어요: ' + name);
    A.sc.course = c; openHoleMdl(c);   // 바로 스코어카드로
  }
}

async function delCourse(name) {                 // 관리자만 호출 (버튼이 관리자에게만 보임)
  if (!confirm(`"${name}" 골프장을 삭제할까요? 목록에서 영구 삭제됩니다.`)) return;
  const r = await callAPI(() => API.deleteCourse(name));
  if (r.ok) { A.official = A.official.filter(c => c.name !== name); renderCourses(); if (A.isAdm) admLoadOfficial(); toast('✅ 삭제 완료'); }
  else { const e = explainError(r); toast('❌ ' + e.msg); }
}

// ════════════════════════════════════════
// 통계 (서버 없이 라운드 기록으로 즉시 계산)
// ════════════════════════════════════════
function statCard(n, u, l) { return `<div class="sc"><span class="sn">${n}${u ? `<span class="su">${u}</span>` : ''}</span><span class="sl">${l}</span></div>`; }

// ── 🚦 진단 분석 (절대기준 신호등 3지표) ──
function analyze(rounds) {
  rounds = (rounds || []).filter(r => !r.isDraft);
  const n = rounds.length;
  let par45 = 0, cleanFir = 0, teeLost = 0, girHit = 0, girHoles = 0,
      puttSum = 0, threePutt = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0,
      scoreSum = 0, vsSum = 0, girPuttSum = 0, girPuttN = 0;
  rounds.forEach(r => {
    const hh = roundPars(r);
    const sc = r.scores || [], pa = r.puttsArr || [], gi = r.girArr || [], fi = r.firArr || [], mu = r.mulliArr || [], tpa = r.tpArr || [];
    scoreSum += r.score || 0; vsSum += r.vs || 0;
    for (let i = 0; i < 18; i++) {
      const s = sc[i]; if (!s || s <= 0) continue;        // 미입력 홀 스킵
      const par = hh[i] || 4, mull = mu[i] || 0, tpv = tpa[i] || 0, putt = pa[i] || 0;
      girHoles++; if (gi[i]) { girHit++; girPuttSum += putt; girPuttN++; }   // GIR홀 퍼팅(순수 퍼팅력)
      puttSum += putt; if (putt >= 3) threePutt++;
      if (putt <= 1) p1++; else if (putt === 2) p2++; else if (putt === 3) p3++; else p4++;
      if (par > 3) {                                       // 드라이버는 파4·5만 (파3의 M/TP는 제외)
        par45++;
        if (mull || tpv) teeLost++;                        // 티샷 사망(OB/해저드) — M·TP 둘 다 사망
        if (fi[i] && !mull && !tpv) cleanFir++;            // 보정 FIR(M·TP로 살린 홀 제외)
      }
    }
  });
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0, f1 = (a, b) => b ? a / b : 0;
  const survPct = pct(par45 - teeLost, par45), adjFir = pct(cleanFir, par45), girPct = pct(girHit, girHoles);
  const teeLostPer = f1(teeLost, n), puttAvg = f1(puttSum, n), threeAvg = f1(threePutt, n), girPuttAvg = f1(girPuttSum, girPuttN);
  // 드라이버 등급: 생존율 기준 + OB/해저드(M+TP) 잦으면 한 단계 강등
  let dst = survPct >= BENCH.survGood ? 'g' : survPct >= BENCH.survOk ? 'y' : 'r';
  if (teeLostPer >= BENCH.tpDemote) dst = dst === 'g' ? 'y' : 'r';
  const S = (status, icon, area, value, msg, note) => ({ status, icon, area, value, msg, note });
  const sig = [
    S(dst, '🚗', '드라이버',
      `생존 ${survPct}% (페어웨이 ${adjFir}% · OB/해저드 ${nf(teeLostPer)}홀)`,
      dst === 'g' ? `티샷에서 공을 거의 잃지 않습니다. 드라이버 안정성이 좋아요. (페어웨이 ${adjFir}%)` :
      dst === 'y' ? `대체로 살리지만 가끔 공을 잃습니다. 페어웨이 ${adjFir}% · OB/해저드 ${nf(teeLostPer)}홀.` :
      `티샷에서 공을 자주 잃습니다(OB/해저드 ${nf(teeLostPer)}홀). 스코어 손실의 큰 원인입니다.`,
      `생존율 = (파4·5홀 − M·TP 켜진 홀) ÷ 파4·5홀 · M=벌타 없이 다시 침, TP=벌타 받고 진행 · 둘 다 "공 잃음"으로 동일 처리`),
    S(puttAvg <= BENCH.puttGood ? 'g' : puttAvg > BENCH.puttBad ? 'r' : 'y', '🍩', '퍼팅',
      `${nf(puttAvg)}개 · 3퍼팅 ${nf(threeAvg)}홀`,
      puttAvg <= BENCH.puttGood ? `퍼팅 수가 적습니다. 그린에서 타수를 잘 지키고 있어요.` :
      puttAvg > BENCH.puttBad ? `퍼팅 수가 많습니다. 쓰리퍼팅 ${nf(threeAvg)}홀 — 첫 퍼트 거리감이 주 원인일 가능성이 큽니다.` :
      `퍼팅 보통. 쓰리퍼팅이 라운드당 ${nf(threeAvg)}홀 — 여기서 타수가 새고 있습니다.`,
      `라운드 총 퍼팅 평균(적을수록 좋음). 참고: GIR홀 퍼팅 ${girPuttN ? nf(girPuttAvg) + '개' : '-'}가 순수 퍼팅력에 더 가깝습니다.`),
    S(girPct >= BENCH.girGood ? 'g' : girPct < BENCH.girBad ? 'r' : 'y', '🎯', '아이언(GIR)',
      `GIR ${girPct}%`,
      girPct >= BENCH.girGood ? `그린 적중률이 높습니다. 아이언으로 기회를 잘 만들고 있어요.` :
      girPct < BENCH.girBad ? `그린 적중률이 낮습니다. 대부분 그린을 놓쳐 어프로치·숏게임 부담이 커집니다.` :
      `그린 적중 보통. 절반가량은 정규 타수에 그린을 못 올립니다.`,
      `GIR = 정규타수(파−2) 안에 그린 올린 홀 비율. 파3 티샷 실수도 여기 반영됩니다.`)
  ];
  return { n, scoreAvg: f1(scoreSum, n), vsAvg: f1(vsSum, n), survPct, adjFir, teeLostPer, puttAvg, threeAvg, girPuttAvg, p1A: f1(p1, n), p2A: f1(p2, n), p3A: f1(p3, n), p4A: f1(p4, n), girPct, sig };
}
function analysisHTML(a) {
  if (!a.n) return `<div class="empty" style="padding:24px 0"><div>📊</div><p>분석할 라운드가 없습니다</p></div>`;
  const dotc = { g: '🟢', y: '🟡', r: '🔴' };
  const cards = a.sig.map(s => `<div class="dgi ${s.status}">
    <div class="dgi-h"><span class="dgi-t">${dotc[s.status]} ${s.icon} ${s.area}</span><span class="dgi-v ${s.status}">${s.value}</span></div>
    <div class="dgi-m">${s.msg}</div>${s.note ? `<div class="dgi-n">ℹ️ ${s.note}</div>` : ''}</div>`).join('');
  return `${cards}<div style="font-size:10px;color:var(--t3);margin-top:8px;line-height:1.5">※ ${a.n}개 라운드 기준 · 파3의 M·TP는 드라이버에서 빠지고 GIR(아이언)에 반영 · 기준값은 설정 → 분석 기준에서 조정</div>`;
}
function toggleRoundAna(id) {
  const r = A.rounds.find(x => x.id === id); if (!r) return;
  const box = Q('rana-box'), btn = Q('rana-btn'); if (!box) return;
  if (box.style.display === 'block') { box.style.display = 'none'; if (btn) btn.textContent = '🔍 이 라운드 분석'; }
  else { box.innerHTML = analysisHTML(analyze([r])); box.style.display = 'block'; if (btn) btn.textContent = '🔍 분석 닫기'; }
}

// ── 신호등 기준: "내 평균 대비" ──
function playerAvgs() {
  const rs = A.rounds.filter(r => !r.isDraft); const n = rs.length;
  if (!n) return { n: 0 };
  const m = k => rs.reduce((a, r) => a + (r[k] || 0), 0) / n;
  return { n, score: m('score'), putts: m('putts'), gir: m('gir'), fir: m('fir') };
}
// 색 반환: betterLow=작을수록 좋음. margin=노랑(평균수준) 구간 폭. 라운드 3개 미만이면 색 없음
function sig(val, avg, betterLow, margin, n) {
  if (n < 3 || avg == null) return '';
  const d = val - avg;
  const good = betterLow ? d <= -margin : d >= margin;
  const bad = betterLow ? d >= margin : d <= -margin;
  return good ? 'var(--g)' : bad ? 'var(--r)' : 'var(--a)';
}
function dot(c) { return c ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:4px;vertical-align:middle"></span>` : ''; }

function renderStat(m) {
  const el = Q('st-body'); const rounds = A.rounds.filter(r => !r.isDraft);
  let h = `<div class="sg2"><button class="${m === 0 ? 'on' : ''}" onclick="renderStat(0)">전체</button><button class="${m === 1 ? 'on' : ''}" onclick="renderStat(1)">라운드별</button></div>`;
  if (!rounds.length) { el.innerHTML = h + `<div class="empty"><div>📊</div><p>라운드를 기록하면 통계가 표시됩니다</p></div>`; return; }
  const AV = playerAvgs();

  if (m === 0) {
    const n = rounds.length, avg = k => rounds.reduce((a, r) => a + (r[k] || 0), 0) / n;
    const scores = rounds.map(r => r.score); const mean = scores.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    const best = Math.min(...scores);
    const last5 = rounds.slice(0, Math.min(5, n)); const l5avg = last5.reduce((a, r) => a + r.score, 0) / last5.length;
    const form = l5avg - mean;   // 음수면 좋아지는 중

    // 홀 단위 집계 (실제로 친 홀만)
    const parSum = { 3: [0, 0], 4: [0, 0], 5: [0, 0] }; let girPutt = [0, 0], threeP = 0, scrT = 0, scrS = 0;
    const f9 = [0, 0], b9 = [0, 0];
    rounds.forEach(r => {
      const hp = roundPars(r); const sc = r.scores || [], pa = r.puttsArr || [], gi = r.girArr || [];
      sc.forEach((s, i) => {
        if (!(s > 0)) return; const p = hp[i] || 4;
        if (parSum[p]) { parSum[p][0] += s; parSum[p][1]++; }
        if (gi[i]) { girPutt[0] += (pa[i] || 0); girPutt[1]++; }
        if ((pa[i] || 0) >= 3) threeP++;
        if (!gi[i]) { scrT++; if (s <= p) scrS++; }
      });
      const fr = sc.slice(0, 9), bk = sc.slice(9, 18);
      if (fr.length === 9 && fr.every(x => x > 0)) { f9[0] += fr.reduce((a, b) => a + b, 0); f9[1]++; }
      if (bk.length === 9 && bk.every(x => x > 0)) { b9[0] += bk.reduce((a, b) => a + b, 0); b9[1]++; }
    });
    const parAvg = p => parSum[p][1] ? (parSum[p][0] / parSum[p][1]) : null;
    const parVs = p => { const a = parAvg(p); return a == null ? '-' : (a - p >= 0 ? '+' : '') + (a - p).toFixed(2); };
    const girPuttAvg = girPutt[1] ? girPutt[0] / girPutt[1] : null;
    const scrRate = scrT ? scrS / scrT * 100 : null;
    const f9a = f9[1] ? f9[0] / f9[1] : null, b9a = b9[1] ? b9[0] / b9[1] : null;

    const allD = rounds.flatMap(r => { const hh = roundPars(r); return (r.scores || []).map((s, i) => s > 0 ? s - (hh[i] || 4) : null).filter(x => x !== null); });
    const eagle = allD.filter(d => d <= -2).length, birdie = allD.filter(d => d === -1).length, par2 = allD.filter(d => d === 0).length, bogey = allD.filter(d => d === 1).length, dbl = allD.filter(d => d >= 2).length, mx = Math.max(eagle, birdie, par2, bogey, dbl) || 1;
    const td = [...rounds].reverse().slice(-10);

    h += `<div class="lbl">🚦 진단 (전체 라운드)</div>${analysisHTML(analyze(rounds))}`;

    h += `<div class="lbl">핵심 지표</div><div class="sgd">${statCard(avg('score').toFixed(1), '', '평균 스코어')}${statCard((avg('vs') >= 0 ? '+' : '') + avg('vs').toFixed(1), '', '평균 오버파')}${statCard(avg('putts').toFixed(1), '', '평균 퍼팅')}${statCard(avg('gir').toFixed(0), '%', 'GIR')}${statCard(avg('fir').toFixed(0), '%', 'FIR')}${statCard(n, '', '라운드수')}</div>

    <div class="lbl">베스트 · 최근 폼 · 기복</div><div class="sgd">
      ${statCard(best, '', '베스트 스코어')}
      ${statCard((form <= 0 ? '▼' : '▲') + Math.abs(form).toFixed(1), '', '최근5R 폼')}
      ${statCard('±' + sd.toFixed(1), '', '기복(편차)')}</div>

    <div class="lbl">파 종류별 (파 대비)</div><div class="sgd">
      ${statCard(parVs(3), '', '파3')}${statCard(parVs(4), '', '파4')}${statCard(parVs(5), '', '파5')}</div>

    <div class="lbl">퍼팅 · 쇼트게임</div><div class="sgd">
      ${statCard(girPuttAvg == null ? '-' : girPuttAvg.toFixed(2), '', 'GIR홀 퍼팅')}
      ${statCard((threeP / n).toFixed(1), '', '3퍼팅/라운드')}
      ${statCard(scrRate == null ? '-' : scrRate.toFixed(0), scrRate == null ? '' : '%', '스크램블링')}</div>

    <div class="lbl">전반 / 후반</div><div class="sgd">
      ${statCard(f9a == null ? '-' : f9a.toFixed(1), '', '전반(1-9)')}
      ${statCard(b9a == null ? '-' : b9a.toFixed(1), '', '후반(10-18)')}
      ${statCard((f9a != null && b9a != null) ? ((b9a - f9a >= 0 ? '+' : '') + (b9a - f9a).toFixed(1)) : '-', '', '후반 차이')}</div>

    <div class="lbl">스코어 추이</div>
    <div class="cb"><div style="display:flex;align-items:flex-end;gap:4px;height:80px">${(() => { const mn = Math.min(...td.map(r => r.score)), mxs = Math.max(...td.map(r => r.score)), rng = mxs - mn || 1; return td.map(r => { const bh = Math.round((r.score - mn) / rng * 60) + 12; const co = r.score <= mean - 2 ? 'var(--g)' : r.score >= mean + 2 ? 'var(--r)' : 'var(--a)'; return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><span style="font-size:9px;color:var(--t2)">${r.score}</span><div style="width:100%;height:${bh}px;background:${co};border-radius:4px 4px 0 0"></div><span style="font-size:8px;color:var(--t3)">${(r.courseName || '').substring(0, 3)}</span></div>`; }).join(''); })()}</div>
    <div style="font-size:10px;color:var(--t3);margin-top:8px;text-align:center">색: 내 평균(${mean.toFixed(0)}타) 대비 — 🟢더 좋음 🟡비슷 🔴더 나쁨</div></div>

    <div class="lbl">타수 분포</div>
    <div class="cb">${[['이글↑', eagle, 'var(--p)'], ['버디', birdie, 'var(--b)'], ['파', par2, 'var(--g)'], ['보기', bogey, 'var(--a)'], ['더블+', dbl, 'var(--r)']].map(([l, c, co]) => `<div class="br"><div class="bl">${l}</div><div class="bt"><div class="bf" style="width:${Math.round(c / mx * 100)}%;background:${co}"><span>${c}</span></div></div></div>`).join('')}</div>`;

    // 코스별 평균
    const byC = {}; rounds.forEach(r => { const k = r.courseName || '?'; (byC[k] = byC[k] || []).push(r.score); });
    const cks = Object.keys(byC).sort((a, b) => byC[b].length - byC[a].length);
    h += `<div class="lbl">코스별 평균</div><div class="cb">${cks.map(k => { const arr = byC[k]; const a = (arr.reduce((x, y) => x + y, 0) / arr.length).toFixed(1); return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:.5px solid var(--bd)"><span style="font-size:13px;color:var(--t)">${k}</span><span style="font-size:13px;color:var(--t2)">평균 <b style="color:var(--t)">${a}</b> · ${arr.length}R</span></div>`; }).join('')}</div>`;

  } else {
    // 라운드별 — 내 평균 대비 신호등
    if (AV.n >= 3) h += `<div style="font-size:11px;color:var(--t3);padding:0 2px 8px">🟢 내 평균보다 좋음 · 🟡 평균 수준 · 🔴 평균보다 나쁨</div>`;
    h += `<div class="lbl">라운드별</div>`;
    rounds.forEach(r => {
      const cS = sig(r.score, AV.score, true, 2, AV.n), cP = sig(r.putts, AV.putts, true, 2, AV.n), cG = sig(r.gir, AV.gir, false, 10, AV.n), cF = sig(r.fir, AV.fir, false, 10, AV.n);
      h += `<div class="rc" onclick="openDet(${r.id})"><div class="rc-top"><div style="flex:1"><div class="rc-name">${r.courseName || '?'} <span style="font-size:12px;color:var(--t3)">${r.courseLbl || ''}</span></div><div class="rc-sub">${r.date || ''} · ${r.weather || ''}</div></div><div class="pill ${pC(r.vs)}">${r.score} (${vsL(r.vs)})</div></div><div class="rc-meta"><span>${dot(cP)}퍼팅 ${r.putts}</span><span>${dot(cG)}GIR ${r.gir}%</span><span>${dot(cF)}FIR ${r.fir}%</span>${r.mulligan ? `<span style="color:var(--r)">멀리건 ${r.mulligan}</span>` : ''}</div></div>`;
    });
  }
  el.innerHTML = h;
}

// ════════════════════════════════════════
// 관리자 패널
// ════════════════════════════════════════
async function admLoadNotes() {
  const el = Q('adm-notes'); el.innerHTML = '<div style="color:var(--t2);font-size:13px">불러오는 중...</div>';
  await refreshNotes();
  if (!A.notes.length) { el.innerHTML = '<div style="color:var(--t2);font-size:13px">새 변경 없음 ✅</div>'; return; }
  el.innerHTML = A.notes.map(nt => `<div class="pi">
    <div style="font-size:14px;font-weight:700;color:var(--t)">🗺️ ${nt.course}</div>
    <div style="font-size:12px;color:var(--t2);margin-top:3px">${nt.user} 님이 <b style="color:${nt.action === '추가' ? 'var(--g)' : 'var(--a)'}">${nt.action}</b> · ${nt.at}</div>
  </div>`).join('') +
  `<button onclick="admClearNotes()" style="width:100%;margin-top:6px;background:var(--bg3);border:1.5px solid #6a6a6e;border-radius:10px;color:var(--t);font-size:13px;font-weight:600;cursor:pointer;padding:10px">확인 (배지 지우기)</button>`;
}
async function admClearNotes() {
  const r = await callAPI(() => API.clearNotifications());
  if (r.ok) { A.notes = []; await refreshNotes(); admLoadNotes(); toast('확인 완료'); renderHome(); }
  else toast('❌ 실패');
}

let _admOffLoaded = false, _admOffOpen = false;
async function admLoadOfficial() {
  const el = Q('adm-off'); el.innerHTML = '<div style="color:var(--t2);font-size:13px">불러오는 중...</div>';
  const r = await callAPI(() => API.getCourses());
  const list = (r && r.courses) || [];
  if (!list.length) { el.innerHTML = '<div style="color:var(--t2);font-size:13px">공식 코스 없음</div>'; return; }
  A.official = list.map(c => ({ ...c, status: 'official' }));
  _admOffLoaded = true; _admOffOpen = false;
  renderAdmOfficial();
}
function admOffToggle() { _admOffOpen = !_admOffOpen; renderAdmOfficial(); }
function renderAdmOfficial() {
  const el = Q('adm-off'); if (!el || !_admOffLoaded) return;
  const q = (Q('adm-off-q')?.value || '').trim();
  const all = A.official || [];
  const head = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
    <div class="sbar" style="flex:1;margin:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="var(--t2)" stroke-width="2"/><path d="M16.5 16.5L21 21" stroke="var(--t2)" stroke-width="2" stroke-linecap="round"/></svg><input id="adm-off-q" placeholder="골프장 검색..." value="${q}" oninput="renderAdmOfficial()"></div>
    <button onclick="admOffToggle()" style="flex-shrink:0;background:var(--bg3);border:1.5px solid #6a6a6e;border-radius:10px;color:var(--t);font-size:12px;font-weight:600;cursor:pointer;padding:10px 12px;white-space:nowrap">${_admOffOpen ? '접기' : `전체 ${all.length}`}</button></div>`;
  let list;
  if (q) list = all.filter(c => c.name.includes(q) || (c.addr || '').includes(q));
  else if (_admOffOpen) list = all;
  else { el.innerHTML = head + `<div style="color:var(--t3);font-size:12px;padding:8px 2px">검색하거나 "전체 ${all.length}"를 눌러 펼치세요</div>`; return; }
  const rows = list.map(c => `<div style="padding:12px 0;border-bottom:.5px solid var(--bd)">
    <div style="font-size:14px;font-weight:700;color:var(--t);margin-bottom:4px">🗺️ ${c.name}</div>
    <div style="font-size:11px;color:var(--t2);margin-bottom:8px">${c.addr || ''} · ${(c.layouts || []).map(l => l.name).join('/')}</div>
    <div style="display:flex;gap:6px">
      <button onclick="openEditCourse('${c.name}')" style="flex:1;background:#1a2e5a;border:1px solid var(--b);border-radius:8px;color:#7dd4ff;font-size:12px;font-weight:600;cursor:pointer;padding:7px">✏️ 수정</button>
      <button onclick="delCourse('${c.name}')" style="flex:1;background:#3d1a1a;border:1px solid #6a2020;border-radius:8px;color:var(--r);font-size:12px;font-weight:600;cursor:pointer;padding:7px">🗑 삭제</button>
    </div></div>`).join('') || `<div style="color:var(--t2);font-size:13px;padding:8px 2px">검색 결과 없음</div>`;
  el.innerHTML = head + rows;
  const inp = Q('adm-off-q'); if (inp && q) { inp.focus(); inp.setSelectionRange(q.length, q.length); }
}

async function admLoadUsers() {
  const el = Q('adm-usr'); el.innerHTML = '<div style="color:var(--t2);font-size:13px">불러오는 중...</div>';
  const r = await callAPI(() => API.getUsers());
  if (!r.users || !r.users.length) { el.innerHTML = '<div style="color:var(--t2);font-size:13px">없음</div>'; return; }
  el.innerHTML = r.users.map(u => `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:.5px solid var(--bd)">
    <div><div style="font-size:14px;font-weight:600;color:var(--t)">👤 ${u.username}</div><div style="font-size:11px;color:var(--t2)">${u.at} · ${u.rounds}라운드</div></div>
    ${u.username === A.u ? '<span style="color:var(--a);font-size:11px">👑 나</span>' : `<div style="display:flex;gap:6px">
      <button onclick="admResetPin('${u.username}')" style="background:#1a3a28;border:1px solid var(--g);border-radius:8px;color:var(--g);font-size:11px;font-weight:600;cursor:pointer;padding:5px 10px">🔑 PIN</button>
      <button onclick="admDelUser('${u.username}')" style="background:#3d1a1a;border:1px solid #6a2020;border-radius:8px;color:var(--r);font-size:11px;font-weight:600;cursor:pointer;padding:5px 10px">삭제</button>
    </div>`}</div>`).join('');
}
async function admResetPin(u) {
  const n = prompt(u + ' 님의 새 비밀번호 (숫자 4자리):', ''); if (!n || !/^\d{4}$/.test(n)) { toast('⚠️ 숫자 4자리가 필요해요'); return; }
  const r = await callAPI(() => API.resetUserPin(u, n));
  toast(r.ok ? '✅ ' + u + ' 비밀번호 변경' : '❌ 실패');
}
async function admDelUser(u) {
  if (!confirm(`"${u}" 님을 삭제할까요? 라운드 기록도 함께 삭제됩니다.`)) return;
  const r = await callAPI(() => API.deleteUser(u));
  if (r.ok) { toast('✅ 삭제 완료'); admLoadUsers(); } else toast('❌ 실패');
}

// ════════════════════════════════════════
// 시작 (버전 도장 확인 + 자동 로그인)
// ════════════════════════════════════════
async function checkVersion() {
  const r = await callAPI(() => API.ping());
  const lf = Q('login-ver'); if (lf) lf.textContent = APP_VERSION;
  const tag = Q('ver-tag'); if (tag) tag.textContent = APP_VERSION + ' · 통신 ' + API.VERSION + (r && r.version ? ' / 서버 ' + r.version : ' / 서버 응답 없음');
  if (r && r.version && r.version !== API.VERSION) {
    const b = Q('ver-banner');
    if (b) { b.textContent = `⚠️ 버전이 안 맞아요 (앱 ${API.VERSION} / 서버 ${r.version}). 새로고침 또는 재배포가 필요해요`; b.classList.add('on'); }
  }
}

(async () => {
  checkVersion();  // 비블로킹: 버전 배너는 응답이 오면 그때 표시(자동 로그인을 막지 않음)
  const s = JSON.parse(localStorage.getItem('og_s') || '{}');
  if (s.u && s.token) {
    A.u = s.u; A.isAdm = s.isAdm || false; API.setAuth(s.u, s.token);
    let shownFromCache = false;
    try {
      const cache = JSON.parse(localStorage.getItem('og_cache') || 'null');  // 지난번 받아둔 데이터로 즉시 화면 표시
      if (cache && cache.rounds) {
        A.rounds = cache.rounds;
        A.official = (cache.official && cache.official.length) ? cache.official : [...DEF];
        if (cache.bench && typeof cache.bench === 'object') Object.assign(BENCH, cache.bench);
        setUserLabels(); renderHome(); showPg('home'); goHome();
        shownFromCache = true;
      }
    } catch (e) {}
    loadAll(shownFromCache);  // 뒤에서 최신 데이터로 갱신(캐시로 떴으면 로딩창 없이)
  } else {
    showPg('login');
  }
})();
