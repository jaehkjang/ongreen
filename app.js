// ============================================================
// app.js — 두뇌 방
// 로그인 판단, 점수 계산, 통계, 화면 전환 등 모든 로직.
// 통신은 api.js(API), 모양은 style.css.
// ============================================================

// ── 앱(프런트엔드) 버전 ──
// 기능이 추가될 때마다 여기 숫자를 올리고 CHANGELOG.md 에 기록을 남깁니다.
// ⚠️ 이것은 API.VERSION(서버 통신 동기화용)과 다릅니다. 서버를 안 건드리는
//    프런트 변경이면 API.VERSION 은 그대로 두고 APP_VERSION 만 올리세요.
const APP_VERSION = 'v12.16.1';

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
let BENCH = { survGood: 70, survOk: 60, tpDemote: 3, puttGood: 32, puttBad: 36, girGood: 50, girBad: 28,
              gpGood: 1.9, gpBad: 2.05, scrGood: 40, scrBad: 25 };  // gp=GIR홀 퍼팅(개/홀·순수 퍼팅력) · scr=스크램블링(%)

// ── 📢 공지 게시판 (읽기 전용) ──
// 사용자는 읽기만 합니다. 새 글(id가 마지막으로 본 id보다 큼)이 있으면 홈의 📢 배지에 알림이 뜹니다.
// 사용 설명서·통계 설명은 body 를 "함수"로 두어 → 기능/기준값이 바뀌면 본문이 자동으로 갱신됩니다.
//   · id 가 클수록 최신(맨 위). 글 본문만 자동 갱신될 때는 id 를 그대로 두어 불필요한 알림을 막습니다.
//   · 진짜 새 공지를 추가할 때만 id 를 올리세요(그래야 사용자에게 NEW 알림이 뜸).
const NOTICE_GUIDE_ID = 3;   // 첫 로그인 팝업으로 띄울 "사용 설명서" 글 id
const NOTICE_UPDATE_ID = 4;  // 앱 업데이트 때 띄울 "업데이트 소식" 글 id (글을 새로 만들지 않고 이 하나만 갱신)
const NOTICES = [
  { id: 4, date: '2026.06.23', cat: '업데이트', pin: true, title: '📣 업데이트 소식', body: updateNewsHTML },
  { id: 3, date: '2026.06.22', cat: '설명서', pin: true, title: '📖 사용 설명서 — 스코어카드 작성', body: guideScorecardHTML },
  { id: 2, date: '2026.06.22', cat: '설명서', pin: true, title: '📊 통계 분석 — 지표 설명', body: guideStatsHTML },
  { id: 1, date: '2026.06.22', cat: '공지', title: '🎉 온그린에 오신 걸 환영합니다', body:
    `<p style="line-height:1.6">라운드 점수를 기록하면 통계로 실력을 진단해주는 앱이에요.</p>
     <p style="margin-top:8px;line-height:1.6">여기 게시판의 <b>사용 설명서</b>·<b>통계 지표 설명</b>은 늘 최신으로 유지돼요(읽기 전용). 새 공지는 홈 📢 아이콘 알림으로 알려드려요.</p>` },
];
function nf(x) { return Number.isInteger(+x) ? String(+x) : (+x).toFixed(1); }
let _sid = 0, _delId = null, _editOldName = '';
let _trendMetric = 0;   // 발전 추세 그래프에서 보고 있는 지표(0 스코어·1 퍼팅·2 GIR·3 FIR)

// ── 작은 도우미 ──
const Q = id => document.getElementById(id);
const vsL = v => v === 0 ? 'E' : v > 0 ? '+' + v : String(v);
const pC = v => v < 0 ? 'gp' : v > 0 ? 'rp' : 'ep';
function cls(s, p) { if (!s) return 'e'; const d = s - p; return d <= -2 ? 'eag' : d === -1 ? 'bir' : d === 0 ? 'par' : d === 1 ? 'bog' : d === 2 ? 'dbl' : 'wrs'; }
function showPg(id) { document.querySelectorAll('.page').forEach(p => p.classList.remove('on')); Q('pg-' + id).classList.add('on'); }
// 현재 보이는 페이지 id(예: 'home','set','stat'). 백그라운드 데이터 갱신이 사용자가 보던 화면을 함부로 바꾸지 않도록 판단에 씀.
function curPg() { const p = document.querySelector('.page.on'); return p ? p.id.replace('pg-', '') : ''; }
function cm(id) { Q(id).classList.remove('on'); }
function om(id) { Q(id).classList.add('on'); }
function load(msg) { Q('ldm').textContent = msg || '불러오는 중...'; Q('ld').classList.add('on'); }
function hide() { Q('ld').classList.remove('on'); }
function toast(m, t) { const el = Q('toast'); el.textContent = m; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), t || 2600); }
// ── 공유: 휴대폰 공유시트(카톡 등) → 없으면 클립보드 복사 → 최후엔 프롬프트 ──
async function shareText(title, text) {
  if (navigator.share) {                                  // 모바일: 네이티브 공유시트 (원터치)
    try { await navigator.share({ title, text }); }
    catch (e) { /* 사용자가 취소했거나 실패 — 조용히 무시 */ }
    return;
  }
  try { await navigator.clipboard.writeText(text); toast('📋 복사했어요. 친구에게 붙여넣기 하세요'); }  // 데스크톱 등
  catch (e) { prompt('아래 내용을 복사해 공유하세요', text); }
}
// ── 앱(링크) 공유 / 초대 ── 현재 접속 주소를 그대로 공유. 아이폰은 사파리로 열어 홈 화면 추가 안내 포함.
function shareApp() {
  const url = location.href.split('#')[0];   // 현재 앱 주소(쿼리는 유지, 앵커만 제거)
  const text =
    `🟢 온그린 — 골프 스코어카드\n${url}\n\n` +
    `📱 아이폰: 사파리(Safari)로 열고 → 아래 공유 버튼 → '홈 화면에 추가'를 누르면 앱처럼 쓸 수 있어요.\n` +
    `🤖 안드로이드: 크롬(Chrome)으로 열고 → 메뉴(⋮) → '홈 화면에 추가'.`;
  shareText('온그린 — 골프 스코어카드', text);
}

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
    // 사용자가 그새 다른 화면(설정·관리자·통계 등)으로 이동했으면 그 화면을 유지하고 홈은 뒤에서만 갱신.
    if (['home', 'login', ''].includes(curPg())) goHome(); else renderHome();
    hide();
    if (!silent) toast('오프라인 상태예요 — 저장된 기록을 표시합니다');
    maybeShowStartupPopup();   // 첫 로그인=설명서 / 업데이트되면 변경 내용 팝업(각각 한 번만)
    return;
  }

  if (br && br.ok && br.bench && typeof br.bench === 'object') Object.assign(BENCH, br.bench);  // 서버 기준값 반영(없으면 기본값 유지)
  A.rounds = (rr && rr.rounds) || [];
  A.official = (cr && cr.courses && cr.courses.length) ? cr.courses.map(c => ({ ...c, status: 'official' })) : [...DEF];
  try { localStorage.setItem('og_cache', JSON.stringify({ rounds: A.rounds, official: A.official, bench: BENCH })); } catch (e) {}  // 다음 실행 때 즉시 표시용 캐시

  setUserLabels();
  if (A.isAdm) refreshNotes();  // 관리자 알림은 뒤에서 채움(홈 표시를 막지 않음)

  // 백그라운드 갱신이 끝나도 사용자가 보던 화면을 가로채지 않음 — 홈/로그인 상태일 때만 홈으로.
  // (예전엔 무조건 홈으로 튕겨, 로딩 중 설정·관리자 화면을 열면 자꾸 라운드 목록으로 되돌아가는 버그가 있었음)
  if (['home', 'login', ''].includes(curPg())) goHome(); else renderHome();
  hide();
  maybeShowStartupPopup();   // 첫 로그인=설명서 / 업데이트되면 변경 내용 팝업(각각 한 번만)
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
function goSet() { showPg('set'); Q('adm-panel').style.display = A.isAdm ? 'block' : 'none'; renderBenchSettings(); if (A.isAdm) { if (_admOffLoaded) renderAdmOfficial(); else admLoadOfficial(); } }   // 관리자는 설정을 열 때 목록을 미리 불러와 바로 검색되게(불러오기→재검색 불필요)
// 홈 상단 노란 알림 배너 → 설정의 관리자 "골프장 변경 알림" 메뉴로 바로 이동.
// 알림 목록(누가·어느 코스·어느 구성을 어떻게 고쳤는지)을 자동으로 펼치고 그 위치로 스크롤한다.
async function goAdmNotes() {
  goSet();
  if (!A.isAdm) return;
  await admLoadNotes();                                  // 변경 내역 자동 로드 (상세 포함)
  const el = Q('adm-notes');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── 🚦 진단 신호등 계산식 (단일 소스) ──
// 공지(통계 가이드)·관리자 설정·사용자 통계 화면이 모두 이 함수를 끌어다 씁니다.
// 기준값(BENCH)이 바뀌면 세 곳의 설명이 함께 자동 갱신돼 서로 어긋날 일이 없습니다.
function benchFormulaHTML() {
  const b = BENCH;
  return `<div style="font-size:13px;color:var(--t2);line-height:1.7">
    신호등은 <b style="color:var(--g)">🟢 좋음</b> / <b style="color:var(--a)">🟡 양호</b> / <b style="color:var(--r)">🔴 부족</b> 3단계입니다.<br><br>
    <b style="color:var(--t)">🚗 드라이버 — 티샷 생존율</b><br>생존율 = (파4·5홀 − M·TP 켜진 홀) ÷ 파4·5홀. 🟢 ${b.survGood}%↑ · 🟡 ${b.survOk}%↑ · 🔴 그 미만. OB/해저드(M+TP)가 라운드당 ${b.tpDemote}홀↑이면 한 단계 강등.<br><span style="color:var(--t3)">※ 함께 보이는 <b>페어웨이%</b> = 티샷이 페어웨이에 떨어진 홀(FIR) ÷ 파4·5홀. M·TP로 살린 홀은 제외합니다. 등급 판정에는 쓰지 않는 참고 지표예요.</span><br><br>
    <b style="color:var(--t)">🎯 아이언 — GIR(그린 적중률)</b><br>정규타수(파−2) 안에 그린 올린 홀 비율. 🟢 ${b.girGood}%↑ · 🟡 ${b.girBad}%↑ · 🔴 그 미만.<br><br>
    <b style="color:var(--t)">⛳ 숏게임 — 스크램블링</b><br>그린 놓친 홀 중 파 이하로 막은 비율. 🟢 ${b.scrGood}%↑ · 🟡 ${b.scrBad}%↑ · 🔴 그 미만.<br><br>
    <b style="color:var(--t)">🍩 퍼팅 — GIR홀 퍼팅(순수 퍼팅력)</b><br>정규로 올린 홀의 홀당 퍼팅으로 판정(총 퍼팅은 GIR에 좌우돼 제외). 🟢 ${b.gpGood}개↓ · 🟡 ${b.gpBad}개↓ · 🔴 그 초과. <span style="color:var(--t3)">(GIR홀이 없으면 총 퍼팅 ${b.puttGood}/${b.puttBad}개로 폴백)</span></div>`;
}

// ── 설정 → 📊 분석 기준 : 모두 설명 보기 / 관리자만 수정 ──
function renderBenchSettings() {
  const b = BENCH, box = Q('bench-box'); if (!box) return;
  let html = benchFormulaHTML();
  if (A.isAdm) {
    const f = (id, label, val) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0"><label style="font-size:13px;color:var(--t2);flex:1">${label}</label><input id="bn-${id}" type="number" inputmode="decimal" step="any" value="${val}" style="width:84px;text-align:center;padding:8px;border-radius:8px;border:1.5px solid var(--bd);background:var(--bg3);color:var(--t);font-size:15px;font-weight:700"></div>`;
    html += `<div class="msep"></div><div style="font-size:12px;color:var(--a);font-weight:700;margin-bottom:6px">🔧 관리자 — 기준값 수정 (전체 적용)</div>`
      + f('survGood', '드라이버 생존율 좋음(%)', b.survGood)
      + f('survOk', '드라이버 생존율 양호(%)', b.survOk)
      + f('tpDemote', 'OB/해저드 강등 기준(M+TP, 라운드당 홀)', b.tpDemote)
      + f('girGood', '아이언 GIR 좋음(%)', b.girGood)
      + f('girBad', '아이언 GIR 부족(%)', b.girBad)
      + f('scrGood', '숏게임 스크램블 좋음(%)', b.scrGood)
      + f('scrBad', '숏게임 스크램블 부족(%)', b.scrBad)
      + f('gpGood', 'GIR홀 퍼팅 좋음(개/홀 이하)', b.gpGood)
      + f('gpBad', 'GIR홀 퍼팅 부족(개/홀 초과)', b.gpBad)
      + f('puttGood', '총 퍼팅 폴백 좋음(개 이하)', b.puttGood)
      + f('puttBad', '총 퍼팅 폴백 부족(개 초과)', b.puttBad)
      + `<div id="bench-msg" style="font-size:12px;min-height:16px;margin:8px 0"></div>`
      + `<button class="btn btn-g" onclick="saveBench()" style="width:100%">기준 저장 (전체 반영)</button>`;
  }
  box.innerHTML = html;
}
async function saveBench() {
  const ids = ['survGood', 'survOk', 'tpDemote', 'puttGood', 'puttBad', 'girGood', 'girBad', 'gpGood', 'gpBad', 'scrGood', 'scrBad'];
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
  // 🟢 분석 철학 배너 — 온그린이 통계를 보는 큰 그림으로 안내
  h += `<div onclick="goPhil()" style="background:linear-gradient(135deg,#0d2e1a,#0a1f14);border:1px solid var(--g);border-radius:14px;padding:13px 14px;margin-bottom:14px;cursor:pointer;display:flex;align-items:center;gap:11px">
    <span style="font-size:22px">🟢</span>
    <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:700;color:var(--g)">온그린은 이렇게 분석해요</div><div style="font-size:12px;color:var(--t2);margin-top:2px">숫자 너머 '다음 한 타' — 분석 철학 보기</div></div>
    <span style="color:var(--g);flex-shrink:0">→</span></div>`;
  if (A.isAdm && A.notes.length) {
    h += `<div class="adm-bnr" onclick="goAdmNotes()" style="display:flex">
      <span style="font-size:22px">🔔</span><div style="flex:1">
        <div style="font-size:14px;font-weight:700;color:var(--a)">골프장 변경 알림</div>
        <div style="font-size:12px;color:var(--t2)">${A.notes.length}건 — 눌러서 수정 내역 보기</div>
      </div><span style="color:var(--a)">→</span></div>`;
  }
  const rounds = A.rounds;
  if (!rounds.length) { el.innerHTML = h + `<div class="empty"><div>⛳</div><p style="color:var(--t3)">아직 라운드가 없어요</p></div>`; return; }
  h += `<div class="lbl">최근 라운드</div>`;
  rounds.forEach(r => {
    const draft = r.isDraft;
    h += `<div class="rc" onclick="${draft ? `resumeDraft(${r.id})` : `openDet(${r.id})`}">
      <div class="rc-top"><div style="flex:1;min-width:0">
        <div class="rc-name">${r.courseName || '?'} <span style="font-size:12px;color:var(--t3)">${r.courseLbl || ''}</span> ${trophyBadges(r)}</div>
        <div class="rc-sub">${r.date || ''} · ${r.weather || ''}${r.partner ? ' · ' + r.partner : ''}${r.memo ? ' · ' + r.memo : ''}</div>
      </div>${draft ? `<span style="background:#3a2a0a;color:var(--a);font-size:11px;font-weight:700;padding:4px 10px;border-radius:10px;flex-shrink:0">✏️ 작성중</span>` : `<div class="pill ${pC(r.vs)}">${r.score} (${vsL(r.vs)})</div>`}</div>
      ${draft ? `<div style="margin-top:10px;padding:8px 12px;background:#2a2a0a;border-radius:8px;font-size:12px;color:var(--a)">탭해서 이어서 입력 →</div>` :
      `<div class="rc-meta"><span>🚗 FIR ${r.fir}%</span><span>🎯 GIR ${r.gir}%</span><span>🍩 ${r.putts}퍼팅</span>${(r.mulligan || r.tpCount) ? `<span style="color:var(--r)">🔄 M${r.mulligan || 0}·TP${r.tpCount || 0}</span>` : ''}</div>`}
    </div>`;
  });
  el.innerHTML = h;
  updateNoticeBadge();   // 📢 새 공지 알림 배지 갱신
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
// ── 같은 골프장 이전 기록과 비교 (코스별 평균을 대신해 스코어카드 안에서 바로 보여줌) ──
function courseCompareHTML(r) {
  const same = A.rounds.filter(x => !x.isDraft && x.courseName === r.courseName && x.id !== r.id);
  if (!same.length) return '';
  const prevAvg = same.reduce((a, x) => a + (x.score || 0), 0) / same.length;
  const prevBest = Math.min(...same.map(x => x.score));
  const d = r.score - prevAvg;                  // 음수면 이전 평균보다 좋음
  const arrow = d < -0.05 ? '▼' : d > 0.05 ? '▲' : '·';
  const col = d < -0.05 ? 'var(--g)' : d > 0.05 ? 'var(--r)' : 'var(--t2)';
  const row = (l, v) => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--t2);padding:5px 0"><span>${l}</span>${v}</div>`;
  return `<div class="cb" style="margin-top:8px;padding:12px 16px">
    <div class="cbt" style="margin-bottom:6px">📍 이 골프장 이전 기록과 비교 (이전 ${same.length}R)</div>
    ${row('이전 평균', `<b style="color:var(--t)">${prevAvg.toFixed(1)}</b>`)}
    ${row('이전 베스트', `<b style="color:var(--t)">${prevBest}</b>`)}
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--t2);padding:5px 0;border-top:.5px solid var(--bd);margin-top:3px">
      <span>이번 라운드</span><b style="color:${col}">${r.score} <span style="font-size:11px">(평균 대비 ${arrow}${Math.abs(d).toFixed(1)})</span></b></div>
  </div>`;
}
function openDet(id) {
  const r = A.rounds.find(x => x.id === id); if (!r) return;
  const hh = roundPars(r);
  const AV = playerAvgs();
  const cP = sig(r.putts, AV.putts, true, 2, AV.n), cG = sig(r.gir, AV.gir, false, 10, AV.n), cF = sig(r.fir, AV.fir, false, 10, AV.n);
  Q('det-t').textContent = `${r.courseName} ${r.date}`;
  const trs = roundTrophies(r);
  Q('det-body').innerHTML = `
    ${trs.length ? `<div style="text-align:center;margin-bottom:10px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">${trs.map(x => `<span style="background:var(--bg3);border:.5px solid var(--bd);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--t)">${x.i} ${x.l}</span>`).join('')}</div>` : ''}
    <div class="sgd" style="margin-bottom:12px">
      <div class="sc"><span class="sn">${r.score}</span><span class="sl">총 스코어</span></div>
      <div class="sc"><span class="sn" style="color:${r.vs > 0 ? 'var(--r)' : 'var(--g)'}">${vsL(r.vs)}</span><span class="sl">파 대비</span></div>
      <div class="sc"><span class="sn">${dot(cF)}${r.fir}<span class="su">%</span></span><span class="sl">FIR</span></div>
      <div class="sc"><span class="sn">${dot(cG)}${r.gir}<span class="su">%</span></span><span class="sl">GIR</span></div>
      <div class="sc"><span class="sn">${dot(cP)}${r.putts}</span><span class="sl">퍼팅</span></div>
      <div class="sc"><span class="sn" style="color:var(--r)">${r.mulligan || 0}<span style="font-size:14px;color:var(--t2)">/</span>${r.tpCount || 0}</span><span class="sl">M / TP</span></div>
    </div>
    ${AV.n >= 3 ? `<div style="font-size:11px;color:var(--t3);text-align:center;margin-bottom:10px">🟢 내 평균보다 좋음 · 🟡 평균 수준 · 🔴 평균보다 나쁨</div>` : ''}
    <button id="rana-btn" onclick="toggleRoundAna(${id})" style="width:100%;background:var(--bg3);border:1.5px solid #6a6a6e;border-radius:12px;color:var(--t);font-size:14px;font-weight:700;cursor:pointer;padding:11px;margin-bottom:6px">🔍 이 라운드 분석</button>
    <div id="rana-box" style="display:none;margin-bottom:8px"></div>
    <div class="cb"><div class="cbt">홀별 스코어</div>
      ${[[0, 9], [9, 18]].map(([from, to]) => `<div style="display:flex;gap:5px;margin-top:${from ? 5 : 0}px">${Array.from({ length: to - from }, (_, j) => { const i = from + j; const s = (r.scores || [])[i]; const d = s > 0 ? s - hh[i] : null; const co = d === null ? '#2c2c2e' : d <= -2 ? 'var(--p)' : d === -1 ? 'var(--b)' : d === 0 ? 'var(--g)' : d === 1 ? 'var(--a)' : 'var(--r)'; return `<div style="width:32px;height:32px;border-radius:8px;background:${co};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff">${s > 0 ? s : '-'}</div>`; }).join('')}</div>`).join('')}
    </div>
    ${courseCompareHTML(r)}
    <button onclick="shareRound(${id})" style="width:100%;margin-top:8px;background:var(--bg3);border:1.5px solid #6a6a6e;border-radius:12px;padding:12px;color:var(--t);font-size:14px;font-weight:700;cursor:pointer">📤 스코어카드 공유</button>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button onclick="openSC(${id},false);cm('m-det')" style="flex:1;background:var(--a);border:none;border-radius:12px;padding:12px;color:#000;font-size:14px;font-weight:700;cursor:pointer">🔧 수정</button>
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
    Q('sc-bnr').innerHTML = `<div style="padding:8px 12px;background:var(--bg2);border-bottom:.5px solid var(--bd)"><div class="bnr ro"><span style="font-size:13px;color:var(--t2)">🔒 읽기 전용</span><button style="background:var(--a);border:none;border-radius:10px;padding:9px 18px;color:#000;font-size:14px;font-weight:700;cursor:pointer" onclick="enableEdit()">🔧 수정</button></div></div>`;
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
    if (ro) { html += `<div class="hr"><div class="hl"><div class="hn">${(i % 9) + 1}</div><div class="hp">P${par}</div></div><div class="hrr"><div class="hc"><div class="hv ${c}">${d}</div></div><div class="ht">${firCell}<span class="htg ${gg ? 'og' : ''}">GIR</span><span class="htg ${pp > 0 ? 'op' : ''}">${pp}P</span><span class="htg ${teeCls}">${teeLbl}</span></div></div></div>`; }
    else { html += `<div class="hr"><div class="hl"><div class="hn">${(i % 9) + 1}</div><div class="hp">P${par}</div></div><div class="hrr"><div class="hc"><button class="hb" onclick="adj(${i},-1)">${SM}</button><div class="hv ${c}" onclick="sp(${i})">${d}</div><button class="hb" onclick="adj(${i},1)">${SP}</button></div><div class="ht">${firCell}<button class="htg ${gg ? 'og' : ''}" onclick="tog(${i},'g')">GIR</button><button class="htg ${pp > 0 ? 'op' : ''}" onclick="cyp(${i})">${pp}P</button><button class="htg ${teeCls}" onclick="tom(${i})">${teeLbl}</button></div></div></div>`; }
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
// ── 스코어카드 원터치 공유 (저장 완료된 라운드만) ──
function shareRound(id) {
  const r = A.rounds.find(x => x.id === id);
  if (!r) { toast('공유할 스코어카드가 없어요'); return; }
  if (r.isDraft) { toast('작성 중인 카드는 저장 후 공유할 수 있어요'); return; }
  const h = roundPars(r);
  const scores = r.scores || [];
  if (!scores.some(x => x > 0)) { toast('입력된 점수가 없어요'); return; }
  const fmt = a => a.map(x => x > 0 ? x : '-').join(' ');
  const f9 = scores.slice(0, 9).reduce((a, b) => a + b, 0), b9 = scores.slice(9, 18).reduce((a, b) => a + b, 0);
  let t = `⛳ ${r.courseName}`;
  if (r.date) t += ` (${r.date})`;
  t += `\n총타수 ${r.score} (파대비 ${vsL(r.vs)})\n\n`;
  t += `전반  ${fmt(scores.slice(0, 9))}  = ${f9 || '-'}\n`;
  t += `후반  ${fmt(scores.slice(9, 18))}  = ${b9 || '-'}\n\n`;
  t += `🚗 FIR ${r.fir}% · 🎯 GIR ${r.gir}% · 🍩 퍼팅 ${r.putts}`;
  if (r.mulligan || r.tpCount) t += ` · M/TP ${r.mulligan || 0}/${r.tpCount || 0}`;
  if (r.partner) t += `\n함께: ${r.partner}`;
  t += `\n\n— 온그린`;
  shareText('온그린 스코어카드', t);
}

// ════════════════════════════════════════
// 골프장 (단일 목록 · 승인 없음 · 삭제는 관리자만)
// ════════════════════════════════════════
// ── 골프장 카드 슬라이드-삭제 ──
// 카드를 왼쪽으로 끌면 뒤에 숨은 삭제 버튼이 드러난다. 목록 컨테이너에 한 번만
// 위임 핸들러를 달고, 열려 있는 카드는 _ccOpen 으로 추적한다.
let _ccOpen = null;
function initCourseSwipe() {
  const list = Q('cs-list');
  if (!list || list._swipeReady) return;
  list._swipeReady = true;
  let wrap = null, startX = 0, startY = 0, dx = 0, dir = 0, width = 88;   // dir: 0 미정 1 가로 2 세로
  const setX = x => { const cc = wrap.querySelector('.cc'); if (cc) cc.style.transform = x ? `translateX(${x}px)` : ''; };
  list.addEventListener('touchstart', e => {
    const w = e.target.closest('.cc-wrap');
    if (_ccOpen && _ccOpen !== w) { _ccOpen.classList.remove('open'); _ccOpen = null; }   // 다른 카드 열려있으면 닫기
    if (!w || !w.querySelector('.cc-del')) { wrap = null; return; }
    wrap = w; startX = e.touches[0].clientX; startY = e.touches[0].clientY; dx = 0; dir = 0;
    width = w.querySelector('.cc-del').offsetWidth || 88;
    const cc = w.querySelector('.cc'); if (cc) cc.style.transition = 'none';
  }, { passive: true });
  list.addEventListener('touchmove', e => {
    if (!wrap) return;
    dx = e.touches[0].clientX - startX;
    if (!dir) dir = (Math.abs(dx) > Math.abs(e.touches[0].clientY - startY)) ? 1 : 2;
    if (dir !== 1) return;
    const base = wrap.classList.contains('open') ? -width : 0;
    let t = base + dx; if (t > 0) t = 0; if (t < -width) t = -width;
    setX(t);
  }, { passive: true });
  list.addEventListener('touchend', () => {
    if (!wrap) return;
    const cc = wrap.querySelector('.cc'); if (cc) cc.style.transition = '';
    const base = wrap.classList.contains('open') ? -width : 0;
    const open = (base + dx) < -width / 2;
    wrap.classList.toggle('open', open);
    _ccOpen = open ? wrap : (_ccOpen === wrap ? null : _ccOpen);
    setX(0);
    wrap = null;
  });
}
function renderCourses() {
  initCourseSwipe(); _ccOpen = null;          // 슬라이드-삭제 핸들러 준비 + 열린 카드 상태 초기화
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
  // 카드: 연필(수정)·삭제 버튼은 없애고, 관리자는 왼쪽으로 슬라이드하면 삭제 버튼이 나옴
  const card = c => `<div class="cc-wrap">
    ${A.isAdm ? `<div class="cc-del"><button onclick="delCourse('${c.name}')">🗑 삭제</button></div>` : ''}
    <div class="cc">
      <div class="cc-info" onclick="selCourse('${c.id || c.name}')">
        <div class="cc-name">${c.name}</div>
        <div class="cc-sub">${c.addr || ''} · ${(c.layouts || []).map(l => l.name).join('/')} · 파${(c.layouts || []).flatMap(l => l.holes || []).reduce((a, b) => a + b, 0)}</div>
      </div>
      <span class="cbg off">✅ 공식</span>
    </div>
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
  A.sc.course = c; A.sc.li = [0, 1];
  A.sc.holeEdits = {};          // 코스 새로 고를 때 홀파 수정값 초기화 (레이아웃이름 → 9홀 파 배열)
  openHoleMdl(c);
}

function openHoleMdl(c) { Q('m-hl-t').textContent = c.name; renderHolePkr(c, 0, 1); om('m-hl'); }
function renderHolePkr(c, l0, l1) {
  A.sc.li = [l0, l1];
  const combos = []; for (let a = 0; a < c.layouts.length; a++) for (let b = 0; b < c.layouts.length; b++) if (a !== b) combos.push([a, b]);
  Q('hl-pkr').innerHTML = `<div style="font-size:13px;font-weight:600;color:var(--t2);margin-bottom:8px">코스 조합</div><div style="display:flex;flex-wrap:wrap;gap:8px">${combos.map(([a, b]) => `<button class="lb ${a === l0 && b === l1 ? 'on' : ''}" onclick="renderHolePkr(A.sc.course,${a},${b})">${c.layouts[a].name}+${c.layouts[b].name}</button>`).join('')}</div>`;
  // 코스(레이아웃)별 수정값이 있으면 마스터 대신 그걸 표시 → 조합 바꿔도 수정 유지
  const ed = A.sc.holeEdits || {};
  const h0 = ed[c.layouts[l0].name] || c.layouts[l0].holes;
  const h1 = ed[c.layouts[l1].name] || c.layouts[l1].holes;
  const all = [...h0, ...h1];
  const nm = [...Array(9).fill(c.layouts[l0].name), ...Array(9).fill(c.layouts[l1].name)];
  Q('hl-lbl').textContent = `${c.layouts[l0].name}+${c.layouts[l1].name} 홀 구성`;
  Q('hl-grid').innerHTML = all.map((p, i) => `<div style="text-align:center;background:var(--bg3);border-radius:10px;padding:8px 4px"><div style="font-size:10px;color:var(--t2);margin-bottom:4px">${nm[i]} ${(i % 9) + 1}H</div><div style="display:flex;align-items:center;justify-content:center;gap:4px"><button onclick="adjHP(${i},-1)" style="width:26px;height:26px;border-radius:50%;border:1.5px solid #6a6a6e;background:var(--bg3);color:#fff;cursor:pointer;font-size:14px">-</button><span id="hp-${i}" style="width:20px;text-align:center;font-size:16px;font-weight:700;color:var(--t)">${p}</span><button onclick="adjHP(${i},1)" style="width:26px;height:26px;border-radius:50%;border:1.5px solid #6a6a6e;background:var(--bg3);color:#fff;cursor:pointer;font-size:14px">+</button></div></div>`).join('');
}
function adjHP(i, d) {
  const el = Q('hp-' + i); if (!el) return;
  let v = parseInt(el.textContent) + d; if (v < 3) v = 3; if (v > 5) v = 5; el.textContent = v;
  // 수정값을 코스(레이아웃)별로 저장해 조합을 바꿔도 유지 (마스터 데이터는 건드리지 않음)
  const c = A.sc.course; if (!c) return;
  const [l0, l1] = A.sc.li;
  const ly = i < 9 ? c.layouts[l0] : c.layouts[l1];
  const li = i < 9 ? i : i - 9;
  if (!A.sc.holeEdits) A.sc.holeEdits = {};
  if (!A.sc.holeEdits[ly.name]) A.sc.holeEdits[ly.name] = ly.holes.slice();
  A.sc.holeEdits[ly.name][li] = v;
}
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
  // detail 에 "어느 코스 · 어느 구성(레이아웃 조합) · 몇 번 홀이 어떻게" 까지 담아
  // 관리자가 알림만 보고도 무엇이 바뀌었는지 바로 알 수 있게 한다.
  if (!A.isAdm) {
    const mp = masterParsFor(A.sc.course);
    if (mp) {
      const c = A.sc.course;
      const lname = i => (i < 9 ? c.layouts[0].name : c.layouts[1].name);   // 홀이 속한 레이아웃 이름
      const diff = [];
      newPars.forEach((p, i) => { if (p !== mp[i]) diff.push(`${lname(i)} ${(i % 9) + 1}번 P${mp[i]}→P${p}`); });
      if (diff.length) {
        const combo = `${c.layouts[0].name}+${c.layouts[1].name}`;          // 어느 구성(코스 조합)
        const detail = `${c.name} (${combo}) · ${diff.slice(0, 4).join(', ')}${diff.length > 4 ? ` 외 ${diff.length - 4}곳` : ''}`;
        callAPI(() => API.reportParChange(c.name, detail));
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
  // 왜 안 눌리는지(저장이 안 되는지) 분명히 알려준다 — 빈 칸이면 그 칸으로 안내.
  if (!name) {
    toast('⚠️ 골프장 이름을 입력하세요');
    const el = Q('cs-n'); if (el) { el.focus(); el.style.borderColor = 'var(--r)'; el.addEventListener('input', () => el.style.borderColor = '', { once: true }); }
    return;
  }
  const secs = document.querySelectorAll('.css'); if (secs.length < 2) { toast('⚠️ 코스(전반·후반)를 2개 이상 만들어주세요'); return; }
  const emptySec = [...secs].find(s => !s.querySelector('.cs-name').value.trim());
  if (emptySec) {
    toast('⚠️ 각 코스의 이름을 입력하세요 (예: 레이크)');
    const el = emptySec.querySelector('.cs-name'); if (el) { el.focus(); el.style.borderColor = 'var(--r)'; el.addEventListener('input', () => el.style.borderColor = '', { once: true }); }
    return;
  }
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
    if (A.isAdm && _admOffLoaded) renderAdmOfficial();   // 마지막으로 보던 목록(검색어·펼침 상태) 유지
  } else {
    A.official.unshift({ ...c });
    cm('m-cs'); toast('✅ 등록됐어요: ' + name);
    A.sc.course = c; openHoleMdl(c);   // 바로 스코어카드로
  }
}

async function delCourse(name) {                 // 관리자만 호출 (버튼이 관리자에게만 보임)
  if (!confirm(`"${name}" 골프장을 삭제할까요? 목록에서 영구 삭제됩니다.`)) return;
  const r = await callAPI(() => API.deleteCourse(name));
  if (r.ok) { A.official = A.official.filter(c => c.name !== name); renderCourses(); if (A.isAdm && _admOffLoaded) renderAdmOfficial(); toast('✅ 삭제 완료'); }   // 마지막으로 보던 목록 유지
  else { const e = explainError(r); toast('❌ ' + e.msg); }
}

// ════════════════════════════════════════
// 통계 (서버 없이 라운드 기록으로 즉시 계산)
// ════════════════════════════════════════
function statCard(n, u, l) { return `<div class="sc"><span class="sn">${n}${u ? `<span class="su">${u}</span>` : ''}</span><span class="sl">${l}</span></div>`; }

// ── 🚦 진단 분석 (절대기준 신호등 4지표: 드라이버·아이언·숏게임·퍼팅) ──
function analyze(rounds) {
  rounds = (rounds || []).filter(r => !r.isDraft);
  const n = rounds.length;
  let par45 = 0, cleanFir = 0, teeLost = 0, girHit = 0, girHoles = 0,
      puttSum = 0, threePutt = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0,
      scoreSum = 0, vsSum = 0, girPuttSum = 0, girPuttN = 0,
      missGreen = 0, scrSave = 0;                       // 숏게임: 그린 미스 홀 / 그중 파 이하로 막은 홀
  rounds.forEach(r => {
    const hh = roundPars(r);
    const sc = r.scores || [], pa = r.puttsArr || [], gi = r.girArr || [], fi = r.firArr || [], mu = r.mulliArr || [], tpa = r.tpArr || [];
    scoreSum += r.score || 0; vsSum += r.vs || 0;
    for (let i = 0; i < 18; i++) {
      const s = sc[i]; if (!s || s <= 0) continue;        // 미입력 홀 스킵
      const par = hh[i] || 4, mull = mu[i] || 0, tpv = tpa[i] || 0, putt = pa[i] || 0;
      girHoles++; if (gi[i]) { girHit++; girPuttSum += putt; girPuttN++; }   // GIR홀 퍼팅(순수 퍼팅력)
      else { missGreen++; if (s <= par) scrSave++; }                         // 그린 놓침 → 파 이하로 막으면 스크램블 성공
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
  const survPct = pct(par45 - teeLost, par45), adjFir = pct(cleanFir, par45), girPct = pct(girHit, girHoles), scrPct = pct(scrSave, missGreen);
  const teeLostPer = f1(teeLost, n), puttAvg = f1(puttSum, n), threeAvg = f1(threePutt, n), girPuttAvg = f1(girPuttSum, girPuttN), missAvg = f1(missGreen, n);
  // 드라이버 등급: 생존율 기준 + OB/해저드(M+TP) 잦으면 한 단계 강등
  let dst = survPct >= BENCH.survGood ? 'g' : survPct >= BENCH.survOk ? 'y' : 'r';
  if (teeLostPer >= BENCH.tpDemote) dst = dst === 'g' ? 'y' : 'r';
  // 퍼팅 등급은 GIR홀 퍼팅(순수 퍼팅력)으로 판정 — 총 퍼팅은 GIR에 크게 좌우돼 교란되므로 등급에서 제외.
  // 단, GIR홀이 하나도 없으면(초보 등) 총 퍼팅으로 폴백.
  const hasGP = girPuttN > 0;
  const putStatus = hasGP
    ? (girPuttAvg <= BENCH.gpGood ? 'g' : girPuttAvg > BENCH.gpBad ? 'r' : 'y')
    : (puttAvg <= BENCH.puttGood ? 'g' : puttAvg > BENCH.puttBad ? 'r' : 'y');
  const scrStatus = missGreen ? (scrPct >= BENCH.scrGood ? 'g' : scrPct < BENCH.scrBad ? 'r' : 'y') : 'g';
  const S = (status, icon, area, value, msg, note) => ({ status, icon, area, value, msg, note });
  // 표시 순서: 드라이버(티샷) → 아이언(어프로치) → 숏게임 → 퍼팅
  const sig = [
    S(dst, '🚗', '드라이버',
      `생존 ${survPct}% (페어웨이 ${adjFir}% · OB/해저드 ${nf(teeLostPer)}홀)`,
      dst === 'g' ? `티샷에서 공을 거의 잃지 않습니다. 드라이버 안정성이 좋아요. (페어웨이 ${adjFir}%)` :
      dst === 'y' ? `대체로 살리지만 가끔 공을 잃습니다. 페어웨이 ${adjFir}% · OB/해저드 ${nf(teeLostPer)}홀.` :
      `티샷에서 공을 자주 잃습니다(OB/해저드 ${nf(teeLostPer)}홀). 스코어 손실의 큰 원인입니다.`,
      `생존율 = (파4·5홀 − M·TP 켜진 홀) ÷ 파4·5홀 · M=벌타 없이 다시 침, TP=벌타 받고 진행 · 둘 다 "공 잃음"으로 동일 처리 · 페어웨이 ${adjFir}% = 티샷이 페어웨이에 떨어진 비율(파4·5홀 중·M·TP로 살린 홀 제외)으로 등급엔 안 쓰는 참고 지표`),
    S(girPct >= BENCH.girGood ? 'g' : girPct < BENCH.girBad ? 'r' : 'y', '🎯', '아이언(GIR)',
      `GIR ${girPct}%`,
      girPct >= BENCH.girGood ? `그린 적중률이 높습니다. 아이언으로 기회를 잘 만들고 있어요.` :
      girPct < BENCH.girBad ? `그린 적중률이 낮습니다. 대부분 그린을 놓쳐 어프로치·숏게임 부담이 커집니다.` :
      `그린 적중 보통. 절반가량은 정규 타수에 그린을 못 올립니다.`,
      `GIR = 정규타수(파−2) 안에 그린 올린 홀 비율. 파3 티샷 실수도 여기 반영됩니다.`),
    S(scrStatus, '⛳', '숏게임',
      missGreen ? `스크램블 ${scrPct}% (그린 미스 ${nf(missAvg)}홀)` : `그린 미스 없음`,
      !missGreen ? `그린을 놓친 홀이 없어 평가할 수치가 없습니다.` :
      scrStatus === 'g' ? `그린을 놓쳐도 파 이하로 잘 막습니다. 어프로치·쇼트퍼팅이 좋아요.` :
      scrStatus === 'r' ? `그린 미스 후 회복이 적습니다. 어프로치 붙이기·파세이브 퍼팅에서 타수가 샙니다.` :
      `그린 미스 후 회복은 보통입니다. 어프로치를 더 붙이면 스코어가 줄어요.`,
      `스크램블링 = 그린 놓친 홀 중 파 이하로 막은 비율(높을수록 좋음). 라운드당 그린 미스 ${nf(missAvg)}홀.`),
    S(putStatus, '🍩', '퍼팅',
      hasGP ? `GIR홀 ${nf(girPuttAvg)}개 · 총 ${nf(puttAvg)} · 3퍼팅 ${nf(threeAvg)}홀` : `총 ${nf(puttAvg)}개 · 3퍼팅 ${nf(threeAvg)}홀`,
      putStatus === 'g' ? (hasGP ? `GIR홀에서 ${nf(girPuttAvg)}퍼팅 — 순수 퍼팅력이 좋습니다.` : `퍼팅 수가 적습니다. 그린에서 타수를 잘 지키고 있어요.`) :
      putStatus === 'r' ? `퍼팅이 많습니다(${hasGP ? `GIR홀 ${nf(girPuttAvg)}퍼팅` : `총 ${nf(puttAvg)}개`}). 쓰리퍼팅 ${nf(threeAvg)}홀 — 첫 퍼트 거리감이 주 원인일 가능성이 큽니다.` :
      `퍼팅 보통. 쓰리퍼팅이 라운드당 ${nf(threeAvg)}홀 — 여기서 타수가 새고 있습니다.`,
      hasGP ? `등급은 GIR홀(정규로 올린 홀) 퍼팅 ${nf(girPuttAvg)}개로 판정 — 총 퍼팅은 GIR에 크게 좌우돼 등급에서 제외했습니다.`
            : `GIR홀이 없어 총 퍼팅 평균으로 판정했습니다(적을수록 좋음).`)
  ];
  return { n, scoreAvg: f1(scoreSum, n), vsAvg: f1(vsSum, n), survPct, adjFir, teeLostPer, puttAvg, threeAvg, girPuttAvg, p1A: f1(p1, n), p2A: f1(p2, n), p3A: f1(p3, n), p4A: f1(p4, n), girPct, scrPct, missGreen, scrSave, missAvg, sig };
}
function analysisHTML(a) {
  if (!a.n) return `<div class="empty" style="padding:24px 0"><div>📊</div><p>분석할 라운드가 없습니다</p></div>`;
  const dotc = { g: '🟢', y: '🟡', r: '🔴' };
  const cards = a.sig.map(s => `<div class="dgi ${s.status}">
    <div class="dgi-h"><span class="dgi-t">${dotc[s.status]} ${s.icon} ${s.area}</span><span class="dgi-v ${s.status}">${s.value}</span></div>
    <div class="dgi-m">${s.msg}</div>${s.note ? `<div class="dgi-n">ℹ️ ${s.note}</div>` : ''}</div>`).join('');
  return `${cards}<div style="font-size:11px;color:var(--t2);margin-top:8px;line-height:1.55;word-break:keep-all">※ ${a.n}개 라운드 기준 · 파3의 M·TP는 드라이버에서 빠지고 GIR(아이언)에 반영 · 기준값은 설정 → 분석 기준에서 조정</div>`;
}
// ════════════════════════════════════════
// 발전 분석 (시간축 · "과거의 나와 비교")
// ════════════════════════════════════════
// 시간순(오름차순) 라운드 — 추세/발전용. date 우선, 없으면 id(생성시각)
function roundsChrono() {
  return A.rounds.filter(r => !r.isDraft).slice().sort((a, b) => {
    const da = a.date || '', db = b.date || '';
    if (da && db && da !== db) return da < db ? -1 : 1;
    return (a.id || 0) - (b.id || 0);
  });
}
// 이동 표준편차(기복) — 각 시점의 직전 win개 창으로 편차 계산. 창이 3개 미만이면 건너뜀.
function rollingSD(vals, win) {
  const out = [];
  for (let i = 0; i < vals.length; i++) {
    const w = vals.slice(Math.max(0, i - win + 1), i + 1);
    if (w.length < 3) continue;                            // 편차는 최소 3R부터 의미
    const m = w.reduce((a, b) => a + b, 0) / w.length;
    out.push(Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length));
  }
  return out;
}
// 단순 선형회귀 기울기(라운드당 변화량)
function regSlope(ys) {
  const n = ys.length; if (n < 2) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  ys.forEach((y, x) => { sx += x; sy += y; sxy += x * y; sxx += x * x; });
  const den = n * sxx - sx * sx; return den ? (n * sxy - sx * sy) / den : 0;
}
// 추정 핸디(베스트 기반 간이) — 최근 20R 오버파 중 좋은 N개 평균. 코스 난이도(슬로프) 미반영.
function estHandicap(rsChrono) {
  const last = rsChrono.slice(-20).map(r => r.vs).filter(v => typeof v === 'number').sort((a, b) => a - b);
  const n = last.length; if (!n) return null;
  const cnt = n >= 20 ? 8 : n >= 19 ? 7 : n >= 17 ? 6 : n >= 15 ? 5 : n >= 12 ? 4 : n >= 9 ? 3 : n >= 6 ? 2 : 1;
  const best = last.slice(0, cnt);
  return best.reduce((a, b) => a + b, 0) / best.length;
}

// ── 발전 추세: 지표 선택 그래프(이동평균) + 추세 판정 + 구간 비교 ──
const TREND_METRICS = [
  { k: 'score', lbl: '스코어', low: true,  u: '' },
  { k: 'putts', lbl: '퍼팅',   low: true,  u: '' },
  { k: 'gir',   lbl: 'GIR',    low: false, u: '%' },
  { k: 'fir',   lbl: 'FIR',    low: false, u: '%' },
  { k: 'consist', lbl: '기복', low: true,  u: '' },   // 최근 5R 스코어 편차(작을수록 일정)
];
function setTrend(k) { _trendMetric = k; const w = Q('trend-wrap'); if (w) w.innerHTML = trendWrapHTML(); }
function trendWrapHTML() {
  const rs = roundsChrono(); const M = TREND_METRICS[_trendMetric] || TREND_METRICS[0];
  const toggle = `<div class="seg" style="margin-bottom:10px">${TREND_METRICS.map((m, i) => `<button class="sg ${i === _trendMetric ? 'on' : ''}" onclick="setTrend(${i})">${m.lbl}</button>`).join('')}</div>`;
  // 기복(consist)은 라운드별 값이 아니라 최근 5R 스코어 편차의 흐름으로 계산
  const vals = M.k === 'consist' ? rollingSD(rs.map(r => +(r.score || 0)), 5) : rs.map(r => +(r[M.k] || 0));
  if (vals.length < 2) return toggle + `<div class="cb" style="text-align:center;color:var(--t3);font-size:12px;padding:20px">${M.k === 'consist' ? '라운드가 4개 이상이면 기복 추세가 표시됩니다' : '라운드가 2개 이상이면 추세가 표시됩니다'}</div>`;
  const fmt = v => (M.k === 'gir' || M.k === 'fir') ? Math.round(v) + '%' : (M.k === 'consist' ? '±' + v.toFixed(1) : v.toFixed(1));
  const slope = regSlope(vals);
  const improving = M.low ? slope < -0.05 : slope > 0.05;
  const worsening = M.low ? slope > 0.05 : slope < -0.05;
  const vc = improving ? 'var(--g)' : worsening ? 'var(--r)' : 'var(--a)';
  const vTxt = improving ? '개선 중 📈' : worsening ? '주의 필요' : '정체';
  const perR = (slope >= 0 ? '+' : '') + slope.toFixed(2) + (M.u || '');
  const seg = Math.max(1, Math.min(5, Math.round(rs.length / 3)));
  const early = vals.slice(0, seg), recent = vals.slice(-seg);
  const ea = early.reduce((a, b) => a + b, 0) / early.length, ra = recent.reduce((a, b) => a + b, 0) / recent.length;
  const dd = ra - ea, ddGood = M.low ? dd < -0.05 : dd > 0.05;
  const ddTxt = (M.k === 'gir' || M.k === 'fir') ? (dd >= 0 ? '+' : '') + Math.round(dd) + '%' : (dd >= 0 ? '+' : '') + dd.toFixed(1);
  const cmp = `<div class="sgd" style="margin-top:12px">
    ${statCard(fmt(ea), '', '초기 ' + seg + 'R')}
    ${statCard(fmt(ra), '', '최근 ' + seg + 'R')}
    <div class="sc" style="grid-column:1/-1"><span class="sn" style="color:${ddGood ? 'var(--g)' : Math.abs(dd) < 0.05 ? 'var(--t)' : 'var(--r)'}">${ddTxt}</span><span class="sl">초기 → 최근 변화 ${ddGood ? '(좋아짐 🎉)' : Math.abs(dd) < 0.05 ? '' : '(나빠짐)'}</span></div></div>`;
  return toggle + trendChartSVG(vals, M, vc) +
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:0 2px">
      <span style="font-size:12px;color:var(--t2)">추세: 라운드당 <b style="color:${vc}">${perR}</b></span>
      <span style="font-size:13px;font-weight:700;color:${vc}">${vTxt}</span></div>` + cmp;
}
function trendChartSVG(vals, M, lc) {
  const W = 300, H = 116, pl = 6, pr = 6, pt = 12, pb = 10;
  const n = vals.length;
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = (mx - mn) || 1;
  const X = i => pl + (n === 1 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (n - 1));
  const Y = v => pt + (1 - (v - mn) / rng) * (H - pt - pb);
  const ma = vals.map((_, i) => { const s = Math.max(0, i - 4); const a = vals.slice(s, i + 1); return a.reduce((x, y) => x + y, 0) / a.length; });
  const ptsRaw = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const ptsMa = ma.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const dots = vals.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2" fill="var(--t3)" vector-effect="non-scaling-stroke"/>`).join('');
  const u = M.u || '';
  return `<div class="cb" style="padding:12px 12px 8px">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:120px;display:block">
      <polyline points="${ptsRaw}" fill="none" stroke="var(--bd)" stroke-width="1" vector-effect="non-scaling-stroke"/>
      ${dots}
      <polyline points="${ptsMa}" fill="none" stroke="${lc}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--t3);margin-top:4px">
      <span>최저 ${nf(mn)}${u}</span><span style="color:${lc}">━ 5R 이동평균 (${n}R)</span><span>최고 ${nf(mx)}${u}</span></div></div>`;
}

// ── 약점 항목(간이 스트로크게인): 영역별 손실 타수 추정 (처방·우선순위 공용) ──
function weaknessItems(a) {
  const scrRate = a.missGreen ? a.scrSave / a.missGreen : 1;   // 스크램블 성공률(analyze 집계 재사용)
  return [
    { area: '🚗 드라이버', lost: a.teeLostPer * 1.0, tip: 'OB·해저드 줄이기 (티샷 안정)', drill: '드라이버 대신 페어웨이우드·롱아이언으로 티샷 안정 우선' },
    { area: '🎯 아이언', lost: Math.max(0, (BENCH.girGood - a.girPct) / 100) * 18 * 0.5, tip: '그린 적중률(GIR) 올리기', drill: '핀이 아니라 그린 센터를 노려 큰 미스 줄이기' },
    { area: '⛳ 숏게임', lost: a.missAvg * (1 - scrRate) * 0.5, tip: '어프로치·파세이브', drill: '30·50·70m 거리별 어프로치를 반복해 그린 미스 후 회복' },
    { area: '🍩 퍼팅', lost: Math.max(0, a.puttAvg - BENCH.puttGood), tip: '거리감·3퍼팅 줄이기', drill: '롱퍼트 첫 퍼트를 홀 옆에 붙이는 거리감 연습' },
  ].sort((x, y) => y.lost - x.lost);
}
// ── 💊 오늘의 처방: 4부서 중 손해 가장 큰 한 곳을 콕 집어 행동 지시 ──
function prescriptionHTML(a) {
  if (!a.n) return '';
  const top = weaknessItems(a)[0];
  if (!top || top.lost < 0.3) {   // 큰 약점이 없음 — 균형 잡힌 상태
    return `<div class="cb" style="border-left:3px solid var(--g)">
      <div style="font-size:13px;font-weight:800;color:var(--g);margin-bottom:4px">💊 오늘의 처방</div>
      <div style="font-size:13px;color:var(--t2);line-height:1.6">4개 영역이 고르게 좋아요. 뚜렷한 약점이 없으니 <b style="color:var(--t)">지금 루틴을 유지</b>하세요.</div></div>`;
  }
  const name = top.area.replace(/^[^ ]+\s/, '');   // 이모지 제거한 영역 이름
  return `<div class="cb" style="border-left:3px solid var(--a)">
    <div style="font-size:13px;font-weight:800;color:var(--a);margin-bottom:5px">💊 오늘의 처방</div>
    <div style="font-size:16px;font-weight:700;color:var(--t);line-height:1.4">${top.area.split(' ')[0]} ${name} 한 곳만 잡으세요</div>
    <div style="font-size:13px;color:var(--t2);line-height:1.6;margin-top:6px">${name}에서 약 <b style="color:var(--a)">${top.lost.toFixed(1)}타</b>를 손해 보고 있어요.<br>→ <b style="color:var(--t)">${top.drill}</b></div></div>`;
}
// ── 약점 우선순위(간이 스트로크게인): 영역별 손실 타수 추정 → 고칠 순서 ──
function weaknessHTML(a, rounds) {
  if (!a.n) return '';
  const items = weaknessItems(a);
  const mx = Math.max(...items.map(i => i.lost), 0.1);
  const co = ['var(--r)', 'var(--a)', '#6a6a6e', '#4a4a4e'];
  const rows = items.map((it, idx) => `<div style="margin-bottom:11px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
      <span style="font-size:13px;font-weight:700;color:var(--t)">${idx === 0 ? '⭐ ' : ''}${it.area}${idx === 0 ? ' <span style="font-size:10px;color:var(--a);font-weight:700">최우선</span>' : ''}</span>
      <span style="font-size:13px;font-weight:700;color:${co[idx]}">+${it.lost.toFixed(1)}타</span></div>
    <div class="bt"><div class="bf" style="width:${Math.round(it.lost / mx * 100)}%;background:${co[idx]};min-width:3px"></div></div>
    <div style="font-size:10px;color:var(--t3);margin-top:4px">→ ${it.tip}</div></div>`).join('');
  return `<div class="cb">${rows}<div style="font-size:10px;color:var(--t3);line-height:1.5;margin-top:2px">※ 라운드당 손실 타수 추정(설정 기준값 대비). 영역 간 중복이 있을 수 있는 상대 비교용입니다.</div></div>`;
}

// ── 💥 큰 실수(블로업)의 원인 분해: 더블보기↑ 홀이 무엇 때문에 났는지 ──
// 한 홀에 원인이 겹칠 수 있으므로(예: 티샷 OB + 3퍼팅) 각 원인별로 따로 셉니다.
function blowupCauseHTML(rounds) {
  let big = 0, teeC = 0, puttC = 0, missC = 0;
  rounds.forEach(r => {
    const hp = roundPars(r), sc = r.scores || [], gi = r.girArr || [], pa = r.puttsArr || [], mu = r.mulliArr || [], tp = r.tpArr || [];
    for (let i = 0; i < 18; i++) {
      const s = sc[i]; if (!(s > 0)) continue;
      const par = hp[i] || 4; if (s - par < 2) continue;     // 더블보기 이상만
      big++;
      const tee = (mu[i] || 0) || (tp[i] || 0);              // 티샷 사고(OB·해저드)
      if (tee) teeC++;
      if ((pa[i] || 0) >= 3) puttC++;                        // 3퍼팅 이상
      if (!gi[i] && !tee) missC++;                           // 그린 미스(티샷 사고는 위에서 집계해 중복 제외)
    }
  });
  if (!big) return `<div class="cb" style="font-size:13px;color:var(--t2);line-height:1.6">🎉 더블보기 이상(큰 실수)이 없어요. 큰 점수가 안 나오는 게 최고의 강점입니다.</div>`;
  const rows = [
    ['🚗 티샷 사고(OB·해저드)', teeC, 'var(--r)'],
    ['🍩 3퍼팅 이상', puttC, 'var(--a)'],
    ['🎯 그린 미스(어프로치)', missC, 'var(--b)'],
  ];
  const mx = Math.max(...rows.map(x => x[1]), 1);
  const body = rows.map(([l, c, co]) => `<div class="br"><div class="bl">${l}</div><div class="bt"><div class="bf" style="width:${Math.round(c / mx * 100)}%;background:${co};min-width:${c ? 18 : 0}px"><span>${c}</span></div></div></div>`).join('');
  const top = [...rows].sort((a, b) => b[1] - a[1])[0];
  return `<div class="cb"><div class="cbt">💥 큰 실수(더블보기↑) ${big}개의 원인</div>${body}
    <div style="font-size:10px;color:var(--t3);line-height:1.55;margin-top:8px">한 홀에 원인이 겹칠 수 있어 합계는 ${big}개와 다를 수 있어요. <b style="color:var(--t2)">가장 잦은 범인: ${top[0]}</b> — 여기만 줄여도 큰 점수가 확 줄어요.</div></div>`;
}

// ── 파 종류별 × 부서 교차: 파3는 GIR, 파4·5는 FIR/GIR과 함께 파 대비를 본다 ──
function parCrossHTML(rounds) {
  const T = { 3: { n: 0, vs: 0, gir: 0, fir: 0, firN: 0, putt: 0, puttN: 0 }, 4: { n: 0, vs: 0, gir: 0, fir: 0, firN: 0, putt: 0, puttN: 0 }, 5: { n: 0, vs: 0, gir: 0, fir: 0, firN: 0, putt: 0, puttN: 0 } };
  rounds.forEach(r => {
    const hp = roundPars(r), sc = r.scores || [], gi = r.girArr || [], fi = r.firArr || [], pa = r.puttsArr || [];
    for (let i = 0; i < 18; i++) {
      const s = sc[i]; if (!(s > 0)) continue;
      const p = hp[i] || 4; const t = T[p]; if (!t) continue;
      t.n++; t.vs += s - p; if (gi[i]) t.gir++;
      const pt = pa[i] || 0; if (pt > 0) { t.putt += pt; t.puttN++; }
      if (p > 3) { t.firN++; if (fi[i]) t.fir++; }
    }
  });
  const pct = (a, b) => b ? Math.round(a / b * 100) : null;
  const card = (lbl, t, showFir) => {
    if (!t.n) return `<div class="cb" style="margin-bottom:10px;padding:12px 14px"><div style="display:flex;justify-content:space-between"><span style="font-size:14px;font-weight:700;color:var(--t)">${lbl}</span><span style="font-size:13px;color:var(--t3)">기록 없음</span></div></div>`;
    const vsA = t.vs / t.n;
    const vc = vsA > 0.05 ? 'var(--r)' : vsA < -0.05 ? 'var(--g)' : 'var(--t)';
    const firTxt = pct(t.fir, t.firN);
    const puttTxt = t.puttN ? (t.putt / t.puttN).toFixed(2) : null;
    return `<div class="cb" style="margin-bottom:10px;padding:12px 14px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><span style="font-size:14px;font-weight:700;color:var(--t)">${lbl}</span><span style="font-size:16px;font-weight:800;color:${vc}">${vsA >= 0 ? '+' : ''}${vsA.toFixed(2)} <span style="font-size:11px;color:var(--t3);font-weight:600">타/홀</span></span></div>
      <div style="display:flex;gap:16px;font-size:12px;color:var(--t2);flex-wrap:wrap">
        ${showFir ? `<span>🚗 FIR <b style="color:var(--t)">${firTxt == null ? '-' : firTxt + '%'}</b></span>` : `<span style="color:var(--t3)">티샷이 곧 그린샷</span>`}
        <span>🎯 GIR <b style="color:var(--t)">${pct(t.gir, t.n)}%</b></span>
        <span>🍩 퍼팅 <b style="color:var(--t)">${puttTxt == null ? '-' : puttTxt + '<span style="font-size:10px;color:var(--t3);font-weight:600">개/홀</span>'}</b></span>
      </div></div>`;
  };
  return card('파3', T[3], false) + card('파4', T[4], true) + card('파5', T[5], true);
}

// ── 추가 집계(홀 기준): 실력 비율 · 퍼팅 분포 · 정확도의 가치 ──
function extraStats(rounds) {
  let played = 0, parOrBetter = 0, bogey = 0, dblPlus = 0;
  let firHitVs = 0, firHitN = 0, firMissVs = 0, firMissN = 0;
  let girHitVs = 0, girHitN = 0, girMissVs = 0, girMissN = 0;
  let p1 = 0, p2 = 0, p3 = 0, p4 = 0, puttHoles = 0;
  rounds.forEach(r => {
    const hp = roundPars(r), sc = r.scores || [], gi = r.girArr || [], fi = r.firArr || [], pa = r.puttsArr || [];
    for (let i = 0; i < 18; i++) {
      const s = sc[i]; if (!(s > 0)) continue;
      const par = hp[i] || 4, d = s - par;
      played++;
      if (d <= 0) parOrBetter++;
      if (d === 1) bogey++;
      if (d >= 2) dblPlus++;
      if (gi[i]) { girHitN++; girHitVs += d; } else { girMissN++; girMissVs += d; }
      if (par > 3) { if (fi[i]) { firHitN++; firHitVs += d; } else { firMissN++; firMissVs += d; } }
      const pt = pa[i] || 0; if (pt > 0) { puttHoles++; if (pt <= 1) p1++; else if (pt === 2) p2++; else if (pt === 3) p3++; else p4++; }
    }
  });
  const pct = (x, y) => y ? Math.round(x / y * 100) : null, avg = (x, y) => y ? x / y : null;
  return { played, parSaveRate: pct(parOrBetter, played), bogeyRate: pct(bogey, played), dblPlusRate: pct(dblPlus, played),
    firHitAvg: avg(firHitVs, firHitN), firMissAvg: avg(firMissVs, firMissN), girHitAvg: avg(girHitVs, girHitN), girMissAvg: avg(girMissVs, girMissN),
    p1, p2, p3, p4, puttHoles, onePuttRate: pct(p1, puttHoles) };
}

// ── 🏆 개인기록 + 트로피(기록 보유 라운드 배지) ──
function bestRecords() {
  const rs = A.rounds.filter(r => !r.isDraft);
  if (rs.length < 2) return null;                 // 라운드 2개↑부터 트로피 의미 있음
  const birds = r => { const hp = roundPars(r); return (r.scores || []).filter((s, i) => s > 0 && s - (hp[i] || 4) === -1).length; };
  const pen = r => (r.mulligan || 0) + (r.tpCount || 0);   // 패널티/멀리건 합(적을수록 좋음)
  const pens = rs.map(pen), penMin = Math.min(...pens), penMax = Math.max(...pens);
  return {
    score: Math.min(...rs.map(r => r.score)),
    putts: Math.min(...rs.map(r => r.putts != null ? r.putts : Infinity)),
    gir: Math.max(...rs.map(r => r.gir || 0)),
    fir: Math.max(...rs.map(r => r.fir || 0)),
    birdies: Math.max(...rs.map(birds)),
    penalty: penMax > penMin ? penMin : null,   // 차이가 있을 때만 "최소 패널티" 기록으로 인정
    birdsOf: birds, penOf: pen,
  };
}
function roundTrophies(r) {
  const R = bestRecords(); if (!R || r.isDraft) return [];
  const t = [];
  if (r.score === R.score) t.push({ i: '🏆', l: '베스트 스코어' });
  if (r.putts != null && r.putts === R.putts) t.push({ i: '🍩', l: '최소 퍼팅' });
  if ((r.gir || 0) === R.gir && R.gir > 0) t.push({ i: '🎯', l: '최고 GIR' });
  if ((r.fir || 0) === R.fir && R.fir > 0) t.push({ i: '🚗', l: '최고 FIR' });
  if (R.birdies > 0 && R.birdsOf(r) === R.birdies) t.push({ i: '🕊️', l: '최다 버디' });
  if (R.penalty != null && R.penOf(r) === R.penalty) t.push({ i: '🛟', l: '최소 패널티' });
  return t;
}
// 기록 보유 라운드엔 ⭐ 별표로 한눈에 표시 + 어떤 기록인지 이모지 배지로 함께.
function trophyBadges(r) {
  const t = roundTrophies(r); if (!t.length) return '';
  const titles = t.map(x => x.l).join(', ');
  return `<span style="display:inline-flex;align-items:center;gap:2px;vertical-align:middle" title="${titles}"><span style="font-size:13px">⭐</span>${t.map(x => `<span title="${x.l}" style="font-size:13px">${x.i}</span>`).join('')}</span>`;
}
function recordsHTML(rsChrono) {
  const rs = rsChrono, n = rs.length; if (!n) return '';
  const best = rs.reduce((b, r) => r.score < b.score ? r : b);
  const minP = rs.reduce((b, r) => (r.putts != null ? r.putts : 99) < (b.putts != null ? b.putts : 99) ? r : b);
  const maxG = rs.reduce((b, r) => (r.gir || 0) > (b.gir || 0) ? r : b);
  const maxF = rs.reduce((b, r) => (r.fir || 0) > (b.fir || 0) ? r : b);
  const birds = r => { const hp = roundPars(r); return (r.scores || []).filter((s, i) => s > 0 && s - (hp[i] || 4) === -1).length; };
  const maxB = rs.reduce((b, r) => birds(r) > birds(b) ? r : b);
  const ms = t => { const r = rs.find(x => x.score < t); return r ? `✅ ${r.date || ''}` : '🔒 미달성'; };
  const row = (icon, lbl, val, sub) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:.5px solid var(--bd)"><span style="font-size:18px">${icon}</span><div style="flex:1;min-width:0"><div style="font-size:13px;color:var(--t)">${lbl}</div>${sub ? `<div style="font-size:11px;color:var(--t3)">${sub}</div>` : ''}</div><span style="font-size:15px;font-weight:700;color:var(--t);flex-shrink:0">${val}</span></div>`;
  return `<div class="cb" style="padding:6px 16px">
    ${row('🏆', '베스트 스코어', best.score, `${best.courseName || ''} · ${best.date || ''}`)}
    ${row('🍩', '최소 퍼팅 라운드', minP.putts != null ? minP.putts : '-', minP.date || '')}
    ${row('🎯', '최고 GIR', (maxG.gir || 0) + '%', maxG.date || '')}
    ${row('🚗', '최고 FIR', (maxF.fir || 0) + '%', maxF.date || '')}
    ${row('🕊️', '최다 버디(1R)', birds(maxB) + '개', maxB.date || '')}
  </div>
  <div class="lbl" style="margin-top:14px">🚩 마일스톤 (첫 돌파)</div>
  <div class="cb" style="padding:6px 16px">
    ${row('💯', '100 깨기 (99↓)', ms(100))}
    ${row('9️⃣', '90 깨기 (89↓)', ms(90))}
    ${row('8️⃣', '80 깨기 (79↓)', ms(80))}
  </div>`;
}

function toggleRoundAna(id) {
  const r = A.rounds.find(x => x.id === id); if (!r) return;
  const box = Q('rana-box'), btn = Q('rana-btn'); if (!box) return;
  if (box.style.display === 'block') { box.style.display = 'none'; if (btn) btn.textContent = '🔍 이 라운드 분석'; }
  else { const a = analyze([r]); box.innerHTML = analysisHTML(a) + `<div class="lbl">파 종류별 (부서 교차)</div>${parCrossHTML([r])}` + prescriptionHTML(a); box.style.display = 'block'; if (btn) btn.textContent = '🔍 분석 닫기'; }
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
    const aAll = analyze(rounds);                         // 진단·약점 공용
    const ex = extraStats(rounds);                        // 실력 비율·퍼팅 분포·정확도 가치
    const chrono = roundsChrono(); const hcp = estHandicap(chrono);
    const segN = Math.max(1, Math.min(5, Math.round(chrono.length / 3)));
    const earlyAvg = chrono.slice(0, segN).reduce((a, r) => a + r.score, 0) / segN;
    const recentAvg = chrono.slice(-segN).reduce((a, r) => a + r.score, 0) / segN;
    const prog = recentAvg - earlyAvg;                    // 음수면 발전(타수 줄어듦)

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
    const eagle = allD.filter(d => d <= -2).length, birdie = allD.filter(d => d === -1).length, par2 = allD.filter(d => d === 0).length, bogey = allD.filter(d => d === 1).length, dbl2 = allD.filter(d => d === 2).length, trip = allD.filter(d => d >= 3).length;
    const mx = Math.max(eagle, birdie, par2, bogey, dbl2, trip) || 1;
    const blowup = trip / n;

    // ── 요약 대시보드 ──
    h += `<div class="lbl">📋 요약</div><div class="sgd">
      ${statCard(n, '', '총 라운드')}
      ${statCard(best, '', '베스트')}
      ${statCard(avg('score').toFixed(1), '', '평균 스코어')}
      ${statCard(hcp == null ? '-' : (hcp >= 0 ? '+' : '') + hcp.toFixed(1), '', '추정 핸디')}</div>`;
    if (chrono.length >= 4) h += `<div class="cb" style="display:flex;align-items:center;gap:12px;padding:14px">
      <span style="font-size:24px">${prog < 0 ? '📈' : prog > 0 ? '📉' : '➡️'}</span>
      <div style="font-size:13px;color:var(--t2);line-height:1.5">최근 ${segN}R 평균 <b style="color:var(--t)">${recentAvg.toFixed(1)}</b> · 초기 ${segN}R 대비 <b style="color:${prog < 0 ? 'var(--g)' : prog > 0 ? 'var(--r)' : 'var(--t)'}">${prog < 0 ? '▼' : prog > 0 ? '▲' : ''}${Math.abs(prog).toFixed(1)}타</b>${prog < 0 ? ' — 좋아지고 있어요 🎉' : prog > 0 ? '' : ' — 유지 중'}</div></div>`;
    h += `<div style="font-size:10px;color:var(--t3);margin:-4px 2px 4px">💡 추정 핸디 = 최근 20R 중 좋은 라운드의 오버파 평균(간이). 코스 난이도 미반영.</div>`;

    // ── 진단 신호등 ──
    // 진단 카드 + 계산식(접이식). 공지·설정과 같은 benchFormulaHTML() 단일 소스를 써서 설명이 어긋나지 않음.
    h += `<div class="lbl">🚦 진단 (전체 라운드)</div>${analysisHTML(aAll)}`;
    h += `<details style="margin:8px 2px 0;background:var(--bg2);border:.5px solid var(--bd);border-radius:12px;padding:10px 12px">
      <summary style="font-size:12px;font-weight:700;color:var(--t2);cursor:pointer;list-style:none">🧮 진단 신호등 계산식 보기</summary>
      <div style="margin-top:8px">${benchFormulaHTML()}</div></details>`;

    // ── 발전 추세 (과거의 나와 비교) ──
    h += `<div class="lbl">📈 발전 추세 (과거의 나와 비교)</div><div id="trend-wrap">${trendWrapHTML()}</div>`;

    // ── 약점 우선순위 ──
    h += `<div class="lbl">🎯 약점 우선순위 (고칠 순서)</div>${weaknessHTML(aAll, rounds)}`;

    // ── 핵심 지표 ──
    h += `<div class="lbl">핵심 지표</div><div class="sgd">${statCard(avg('score').toFixed(1), '', '평균 스코어')}${statCard((avg('vs') >= 0 ? '+' : '') + avg('vs').toFixed(1), '', '평균 오버파')}${statCard(avg('putts').toFixed(1), '', '평균 퍼팅')}${statCard(avg('gir').toFixed(0), '%', 'GIR')}${statCard(avg('fir').toFixed(0), '%', 'FIR')}${statCard('±' + sd.toFixed(1), '', '기복(편차)')}</div>`;

    // ── 실력 비율 (홀 기준) ──
    const birdieRate = ex.played ? Math.round(birdie / ex.played * 100) : null;
    h += `<div class="lbl">실력 비율 (홀 기준)</div><div class="sgd">
      ${statCard(ex.parSaveRate == null ? '-' : ex.parSaveRate, ex.parSaveRate == null ? '' : '%', '파 이하')}
      ${statCard(birdieRate == null ? '-' : birdieRate, birdieRate == null ? '' : '%', '🕊️ 버디')}
      ${statCard(ex.bogeyRate == null ? '-' : ex.bogeyRate, ex.bogeyRate == null ? '' : '%', '보기')}
      ${statCard(ex.dblPlusRate == null ? '-' : ex.dblPlusRate, ex.dblPlusRate == null ? '' : '%', '더블+')}
      ${statCard(nf(blowup), '', '블로업/R')}</div>
    <div style="font-size:10px;color:var(--t3);margin:-6px 2px 4px">💡 블로업 = 트리플보기 이상 홀(라운드당 ${nf(blowup)}홀). 줄이면 스코어가 크게 떨어져요.</div>`;

    // ── 큰 실수(블로업)의 원인 ──
    h += `<div class="lbl">💥 큰 실수의 원인</div>${blowupCauseHTML(rounds)}`;

    // ── 파 종류별 × 부서 교차 ──
    h += `<div class="lbl">파 종류별 (부서 교차)</div>${parCrossHTML(rounds)}`;

    // ── 퍼팅 · 쇼트게임 ──
    h += `<div class="lbl">퍼팅 · 쇼트게임</div><div class="sgd">
      ${statCard(girPuttAvg == null ? '-' : girPuttAvg.toFixed(2), '', 'GIR홀 퍼팅')}
      ${statCard((threeP / n).toFixed(1), '', '3퍼팅/라운드')}
      ${statCard(ex.onePuttRate == null ? '-' : ex.onePuttRate, ex.onePuttRate == null ? '' : '%', '1퍼팅율')}
      ${statCard(scrRate == null ? '-' : scrRate.toFixed(0), scrRate == null ? '' : '%', '스크램블링')}</div>`;
    const pmx = Math.max(ex.p1, ex.p2, ex.p3, ex.p4) || 1;
    h += `<div class="cb"><div class="cbt">퍼팅 분포 (홀 수)</div>${[['1퍼팅', ex.p1, 'var(--g)'], ['2퍼팅', ex.p2, 'var(--b)'], ['3퍼팅', ex.p3, 'var(--a)'], ['4+', ex.p4, 'var(--r)']].map(([l, c, co]) => `<div class="br"><div class="bl">${l}</div><div class="bt"><div class="bf" style="width:${Math.round(c / pmx * 100)}%;background:${co}"><span>${c}</span></div></div></div>`).join('')}</div>
    <div style="font-size:10px;color:var(--t3);margin:-6px 2px 4px">💡 <b>스크램블링</b> — 그린 놓친 홀을 파 이하로 막은 비율(높을수록 좋음).</div>`;

    // ── 전반 / 후반 ──
    h += `<div class="lbl">전반 / 후반</div><div class="sgd">
      ${statCard(f9a == null ? '-' : f9a.toFixed(1), '', '전반(1-9)')}
      ${statCard(b9a == null ? '-' : b9a.toFixed(1), '', '후반(10-18)')}
      ${statCard((f9a != null && b9a != null) ? ((b9a - f9a >= 0 ? '+' : '') + (b9a - f9a).toFixed(1)) : '-', '', '후반 차이')}</div>`;

    // ── 타수 분포 ──
    h += `<div class="lbl">타수 분포</div>
    <div class="cb">${[['이글↑', eagle, 'var(--p)'], ['버디', birdie, 'var(--b)'], ['파', par2, 'var(--g)'], ['보기', bogey, 'var(--a)'], ['더블', dbl2, 'var(--r)'], ['트리플+', trip, '#7f1d1d']].map(([l, c, co]) => `<div class="br"><div class="bl">${l}</div><div class="bt"><div class="bf" style="width:${Math.round(c / mx * 100)}%;background:${co}"><span>${c}</span></div></div></div>`).join('')}</div>`;

    // ── 🏆 개인기록 · 마일스톤 ──
    h += `<div class="lbl">🏆 개인기록</div>${recordsHTML(chrono)}`;

  } else {
    // 라운드별 — 내 평균 대비 신호등
    if (AV.n >= 3) h += `<div style="font-size:11px;color:var(--t3);padding:0 2px 8px">🟢 내 평균보다 좋음 · 🟡 평균 수준 · 🔴 평균보다 나쁨</div>`;
    h += `<div class="lbl">라운드별</div>`;
    rounds.forEach(r => {
      const cS = sig(r.score, AV.score, true, 2, AV.n), cP = sig(r.putts, AV.putts, true, 2, AV.n), cG = sig(r.gir, AV.gir, false, 10, AV.n), cF = sig(r.fir, AV.fir, false, 10, AV.n);
      h += `<div class="rc" onclick="openDet(${r.id})"><div class="rc-top"><div style="flex:1"><div class="rc-name">${r.courseName || '?'} <span style="font-size:12px;color:var(--t3)">${r.courseLbl || ''}</span> ${trophyBadges(r)}</div><div class="rc-sub">${r.date || ''} · ${r.weather || ''}</div></div><div class="pill ${pC(r.vs)}">${r.score} (${vsL(r.vs)})</div></div><div class="rc-meta"><span>${dot(cF)}FIR ${r.fir}%</span><span>${dot(cG)}GIR ${r.gir}%</span><span>${dot(cP)}퍼팅 ${r.putts}</span>${r.mulligan ? `<span style="color:var(--r)">멀리건 ${r.mulligan}</span>` : ''}</div></div>`;
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
    ${nt.detail ? `<div style="font-size:12px;color:var(--t);margin-top:5px;padding:6px 8px;background:var(--bg3);border-radius:8px;line-height:1.5">✏️ ${nt.detail}</div>` : ''}
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
  const el = Q('adm-off');
  const prevQ = Q('adm-off-q')?.value || '';   // 불러오는 동안 입력해 둔 검색어를 잃지 않도록 보관(다시 검색할 필요 없게)
  el.innerHTML = '<div style="color:var(--t2);font-size:13px">불러오는 중...</div>';
  const r = await callAPI(() => API.getCourses());
  const list = (r && r.courses) || [];
  if (!list.length) { el.innerHTML = '<div style="color:var(--t2);font-size:13px">공식 코스 없음</div>'; return; }
  A.official = list.map(c => ({ ...c, status: 'official' }));
  _admOffLoaded = true; _admOffOpen = false;
  renderAdmOfficial();
  if (prevQ) { const qi = Q('adm-off-q'); if (qi) { qi.value = prevQ; renderAdmOffList(); } }   // 보관해 둔 검색어 복원 후 바로 결과 표시
}
function admOffToggle() {
  if (!_admOffLoaded) { admLoadOfficial(); return; }   // 아직 안 불러왔으면 이 버튼으로도 불러오기
  _admOffOpen = !_admOffOpen; renderAdmOfficial();
}
function renderAdmOfficial() {
  const el = Q('adm-off'); if (!el) return;
  // 검색 input 은 '한 번만' 만들고 이후엔 재생성하지 않는다.
  // (매 키 입력마다 input 을 다시 그리면 한글 조합이 끊겨 마지막 글자가 안 써지는 버그가 생김 — v12.12.1)
  // 검색창은 불러오기 전에도 항상 보이게 한다(처음부터 검색 UI 노출).
  if (!Q('adm-off-q')) {
    el.innerHTML = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
      <div class="sbar" style="flex:1;margin:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="var(--t2)" stroke-width="2"/><path d="M16.5 16.5L21 21" stroke="var(--t2)" stroke-width="2" stroke-linecap="round"/></svg><input id="adm-off-q" placeholder="골프장 검색..." oninput="renderAdmOffList()"></div>
      <button id="adm-off-toggle" onclick="admOffToggle()" style="flex-shrink:0;background:var(--bg3);border:1.5px solid #6a6a6e;border-radius:10px;color:var(--t);font-size:12px;font-weight:600;cursor:pointer;padding:10px 12px;white-space:nowrap"></button></div>
    <div id="adm-off-list"></div>`;
  }
  renderAdmOffList();
}
// 검색바(입력 요소)는 그대로 두고 목록 영역만 다시 그린다.
function renderAdmOffList() {
  const listEl = Q('adm-off-list'); if (!listEl) return;
  const q = (Q('adm-off-q')?.value || '').trim();
  const all = A.official || [];
  const tgl = Q('adm-off-toggle'); if (tgl) tgl.textContent = !_admOffLoaded ? '불러오기' : (_admOffOpen ? '접기' : `전체 ${all.length}`);
  if (!_admOffLoaded) {   // 아직 불러오기 전 — 검색창만 보여주고 안내
    listEl.innerHTML = `<div style="color:var(--t3);font-size:12px;padding:8px 2px">위 "골프장 목록 불러오기"를 누르면 목록이 나와요</div>`; return;
  }
  let list;
  if (q) list = all.filter(c => c.name.includes(q) || (c.addr || '').includes(q));
  else if (_admOffOpen) list = all;
  else { listEl.innerHTML = `<div style="color:var(--t3);font-size:12px;padding:8px 2px">검색하거나 "전체 ${all.length}"를 눌러 펼치세요</div>`; return; }
  // 결과 총 개수 표시 — 검색 시 "검색 결과 N개", 전체 펼침 시 "전체 N개"
  const cnt = `<div style="color:var(--t2);font-size:12px;font-weight:600;padding:4px 2px 8px">${q ? '🔍 검색 결과' : '전체'} ${list.length}개</div>`;
  if (!list.length) { listEl.innerHTML = cnt + `<div style="color:var(--t2);font-size:13px;padding:8px 2px">검색 결과 없음</div>`; return; }
  listEl.innerHTML = cnt + (list.map(c => `<div style="padding:12px 0;border-bottom:.5px solid var(--bd)">
    <div style="font-size:14px;font-weight:700;color:var(--t);margin-bottom:4px">🗺️ ${c.name}</div>
    <div style="font-size:11px;color:var(--t2);margin-bottom:8px">${c.addr || ''} · ${(c.layouts || []).map(l => l.name).join('/')}</div>
    <div style="display:flex;gap:6px">
      <button onclick="openEditCourse('${c.name}')" style="flex:1;background:#1a2e5a;border:1px solid var(--b);border-radius:8px;color:#7dd4ff;font-size:12px;font-weight:600;cursor:pointer;padding:7px">✏️ 수정</button>
      <button onclick="delCourse('${c.name}')" style="flex:1;background:#3d1a1a;border:1px solid #6a2020;border-radius:8px;color:var(--r);font-size:12px;font-weight:600;cursor:pointer;padding:7px">🗑 삭제</button>
    </div></div>`).join(''));
}

async function admLoadUsers() {
  const el = Q('adm-usr'); el.innerHTML = '<div style="color:var(--t2);font-size:13px">불러오는 중...</div>';
  const r = await callAPI(() => API.getUsers());
  if (!r.users || !r.users.length) { el.innerHTML = '<div style="color:var(--t2);font-size:13px">없음</div>'; return; }
  el.innerHTML = r.users.map(u => `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:.5px solid var(--bd)">
    <div><div style="font-size:14px;font-weight:600;color:var(--t)">👤 ${u.username}</div><div style="font-size:11px;color:var(--t2)">🕒 마지막 접속 ${u.at || '기록 없음'} · ${u.rounds}라운드</div></div>
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
// 📤 스코어카드 내보내기 (구글시트용 CSV) — 모든 사용자
// 누구나 자기 전체 라운드를 한 파일로 받아 구글시트(파일→가져오기)·엑셀 등으로 열 수 있게.
// 서버를 거치지 않고 메모리의 A.rounds 로 즉시 생성합니다(API.VERSION 무관·백엔드 변경 없음).
// 홀 번호와 홀별 파 구성을 반드시 함께 적습니다.
// ════════════════════════════════════════
function csvCell(v) {                            // CSV 한 칸 안전 처리(콤마·따옴표·줄바꿈 → 따옴표로 감쌈)
  const s = (v === null || v === undefined) ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportScorecards() {
  const rounds = (A.rounds || []).filter(r => !r.isDraft);   // 작성중(임시저장)은 제외
  if (!rounds.length) { toast('내보낼 라운드가 없어요'); return; }

  const rows = [];
  const push = arr => rows.push(arr.map(csvCell).join(','));
  const blank = () => rows.push('');
  const sum = a => a.reduce((x, y) => x + (+y || 0), 0);
  const today = new Date().toISOString().split('T')[0];

  push(['온그린 스코어카드 내보내기']);
  push(['사용자', A.u]);
  push(['내보낸 날짜', today.replaceAll('-', '.')]);
  push(['총 라운드', rounds.length + 'R']);
  blank();

  rounds.forEach((r, idx) => {
    const pars = roundPars(r);                   // 그 라운드에 박제된 홀별 파(18칸)
    const sc = r.scores || [], pu = r.puttsArr || [], gi = r.girArr || [], fi = r.firArr || [], mu = r.mulliArr || [], tp = r.tpArr || [];
    const at18 = (arr, i) => (arr[i] === undefined || arr[i] === null) ? '' : arr[i];

    push([`■ 라운드 ${idx + 1}`]);
    push(['골프장', r.courseName || '', '코스 구성', r.courseLbl || '']);
    push(['날짜', r.date || '', '날씨', r.weather || '']);
    push(['동반자', r.partner || '', '메모', r.memo || '']);
    push(['총타수', r.score, '파대비', vsL(r.vs)]);
    push(['FIR(%)', r.fir, 'GIR(%)', r.gir, '총퍼팅', r.putts, '멀리건', r.mulligan || 0, '트러블샷', r.tpCount || 0]);

    // ── 홀 테이블 (홀 번호 + 홀별 파 구성 포함) ──
    const holeHdr = ['']; for (let i = 0; i < 18; i++) holeHdr.push('홀' + (i + 1)); holeHdr.push('합계');
    push(holeHdr);
    push(['파', ...pars.slice(0, 18), sum(pars)]);
    push(['스코어', ...Array.from({ length: 18 }, (_, i) => at18(sc, i)), r.score]);
    push(['퍼팅', ...Array.from({ length: 18 }, (_, i) => at18(pu, i)), r.putts]);
    push(['GIR', ...Array.from({ length: 18 }, (_, i) => gi[i] ? 'O' : ''), gi.filter(Boolean).length]);
    push(['FIR', ...Array.from({ length: 18 }, (_, i) => pars[i] === 3 ? '-' : (fi[i] ? 'O' : '')), fi.filter(Boolean).length]);
    push(['멀리건', ...Array.from({ length: 18 }, (_, i) => mu[i] ? 'O' : ''), r.mulligan || 0]);
    push(['트러블샷', ...Array.from({ length: 18 }, (_, i) => tp[i] ? 'O' : ''), r.tpCount || 0]);
    blank();
  });

  const csv = '﻿' + rows.join('\r\n');      // BOM: 구글시트/엑셀 한글 깨짐 방지
  downloadCSV(csv, `온그린_스코어카드_${A.u}_${today}.csv`);
}
function downloadCSV(text, filename) {
  let url = '';
  try {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('📥 CSV를 내려받았어요 — 구글시트 [파일→가져오기]로 열어요');
  } catch (e) {                                  // 일부 모바일: 다운로드가 막히면 새 탭으로 폴백
    try { if (url) window.open(url, '_blank'); else throw e; }
    catch (e2) { toast('❌ 내보내기에 실패했어요'); }
  }
}

// ════════════════════════════════════════
// 📢 공지 게시판 (읽기 전용 · 새 글 알림)
// ════════════════════════════════════════
function latestNoticeId() { return NOTICES.reduce((m, n) => Math.max(m, n.id), 0); }
function noticeSeenId() { return parseInt(localStorage.getItem('og_notice_seen') || '0', 10) || 0; }
// 업데이트 소식(단일 글)은 id 가 그대로라도 APP_VERSION 이 바뀌면 "새 글"로 취급 → 배지가 다시 뜸.
function updatePending() { return localStorage.getItem('og_update_seen') !== APP_VERSION; }
function unreadNoticeCount() {
  const s = noticeSeenId();
  const newPosts = NOTICES.filter(n => n.id > s && n.id !== NOTICE_UPDATE_ID).length;  // 새로 추가된 글
  return newPosts + (updatePending() ? 1 : 0);   // 업데이트 소식은 버전 기준으로 NEW 판정
}
function updateNoticeBadge() {
  const b = Q('nb'); if (!b) return;
  const c = unreadNoticeCount();
  b.textContent = c > 9 ? '9+' : c; b.style.display = c ? 'flex' : 'none';
}
// 게시판을 열면 모두 읽음 처리 — 글 id 기준과 업데이트 버전 기준을 함께 갱신해 배지를 지움.
function markNoticesSeen() {
  localStorage.setItem('og_notice_seen', String(latestNoticeId()));
  localStorage.setItem('og_update_seen', APP_VERSION);
  updateNoticeBadge();
}
function noticeBodyHTML(n) { return typeof n.body === 'function' ? n.body() : n.body; }

function goNotice() { showPg('notice'); renderNotices(); }
function renderNotices() {
  const seen = noticeSeenId();                 // 표시는 "보기 전" 기준으로 NEW 판정
  const updNew = updatePending();              // 업데이트 소식 NEW 여부도 읽음 처리 전 기준으로 고정
  const el = Q('notice-body'); if (!el) return;
  const chip = c => {
    const co = c === '설명서' ? 'var(--b)' : 'var(--a)';
    return `<span style="flex-shrink:0;font-size:11px;font-weight:700;color:${co};border:1px solid ${co};border-radius:8px;padding:2px 8px">${c}</span>`;
  };
  let h = `<div class="lbl">📢 공지 게시판</div>
    <p style="font-size:12px;color:var(--t3);margin:-2px 2px 12px;line-height:1.6">읽기 전용입니다. 📌 표시 글은 기능이 바뀌면 늘 최신으로 자동 갱신돼요.</p>`;
  NOTICES.forEach(n => {
    const isNew = n.id === NOTICE_UPDATE_ID ? updNew : n.id > seen;
    h += `<div class="rc" onclick="openNotice(${n.id})">
      <div style="display:flex;align-items:center;gap:8px">
        ${chip(n.cat)}
        <span class="rc-name" style="flex:1;min-width:0;font-size:15px">${n.title}</span>
        ${isNew ? `<span style="flex-shrink:0;background:var(--r);color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:8px">NEW</span>` : ''}
      </div>
      <div style="font-size:12px;color:var(--t3);margin-top:6px">${n.date}${n.pin ? ' · 📌 항상 최신' : ''}</div>
    </div>`;
  });
  el.innerHTML = h;
  markNoticesSeen();                           // 목록을 열었으니 모두 읽음 처리 → 배지 제거
}
function openNotice(id) {
  const n = NOTICES.find(x => x.id === id); if (!n) return;
  Q('notice-t').textContent = n.title;
  Q('notice-read').innerHTML = noticeBodyHTML(n);
  om('m-notice');
}
// 시작 팝업: ① 이 기기 첫 로그인엔 "사용 설명서"를, ② 그 뒤 앱이 업데이트되면 "업데이트 소식"을
// 각각 한 번씩 팝업으로 띄움(관리자 포함). 닫는 방식과 무관하게 같은 상황에선 다시 뜨지 않음.
function maybeShowStartupPopup() {
  if (!localStorage.getItem('og_guide_seen')) {
    // 이 기기 첫 로그인 — 사용 설명서 한 번. 첫 설치는 이미 최신이라 업데이트 팝업은 생략.
    localStorage.setItem('og_guide_seen', '1');
    localStorage.setItem('og_update_popped', APP_VERSION);
    openNotice(NOTICE_GUIDE_ID);
    return;
  }
  if (localStorage.getItem('og_update_popped') !== APP_VERSION) {
    // 앱이 업데이트됨 — 변경 내용(버전 포함)을 한 번. 배지는 게시판을 열 때(markNoticesSeen) 사라짐.
    localStorage.setItem('og_update_popped', APP_VERSION);
    openNotice(NOTICE_UPDATE_ID);
  }
}

// ── 업데이트 소식 본문(단일 글) ──
// 앱이 업데이트될 때마다 "이 함수만" 최신 변경 내용으로 고쳐 주세요. 글을 새로 추가하지 않아
// 게시판엔 항상 이 한 글만 남고, APP_VERSION 이 바뀌면 팝업·배지로 사용자에게 자동 알립니다.
// 맨 위·아래에 버전 번호를 작게 표시합니다.
function updateNewsHTML() {
  const S = (t) => `<div style="font-size:14px;font-weight:800;color:var(--g);margin:14px 0 5px">${t}</div>`;
  const li = (t) => `<div style="display:flex;gap:7px;align-items:flex-start;margin:5px 0"><span style="flex-shrink:0;color:var(--g)">•</span><span style="font-size:13px;color:var(--t2);line-height:1.55">${t}</span></div>`;
  return `
  <div style="font-size:12px;color:var(--t3);margin-bottom:6px">버전 ${APP_VERSION}</div>
  <p style="color:var(--t2);font-size:13px;line-height:1.6">앱이 새로 업데이트됐어요. 이번에 바뀐 내용이에요.</p>

  ${S('📣 이번 업데이트 — 더 똑똑해진 분석')}
  ${li('🟢 <b>분석 철학 배너</b> — 라운드 탭 맨 위에서 온그린이 통계를 보는 큰 그림을 한 페이지로 볼 수 있어요.')}
  ${li('💊 <b>오늘의 처방</b> — 라운드 상세의 "🔍 이 라운드 분석"에서 손해가 가장 큰 한 곳을 콕 집어 무엇을 연습할지 알려줘요.')}
  ${li('💥 <b>큰 실수의 원인</b> — 더블보기↑가 티샷·3퍼팅·그린미스 중 무엇 때문인지 분해해요.')}
  ${li('🎯 <b>파 종류별 부서 교차</b> — 파3은 GIR, 파4·5는 FIR·GIR로 약한 홀 유형을 진단해요.')}
  ${li('📈 <b>기복 추세</b> — 발전 추세에서 기복 지표를 골라 점수가 점점 일정해지는지 볼 수 있어요.')}

  <div style="margin-top:14px;padding-top:10px;border-top:.5px solid var(--bd);font-size:11px;color:var(--t3)">📌 ${APP_VERSION} · 업데이트될 때마다 이 글이 자동으로 바뀝니다.</div>`;
}

// ── 사용 설명서 본문(자동 생성) : 스코어카드 작성 위주 ──
// 기능이 바뀌면 이 함수만 손보면 게시판 글이 자동으로 갱신됩니다(별도 글 수정 불필요).
function guideScorecardHTML() {
  const courseCnt = (A.official || []).length;
  const S = (t) => `<div style="font-size:14px;font-weight:800;color:var(--g);margin:14px 0 5px">${t}</div>`;
  const btn = (b, t) => `<div style="display:flex;gap:8px;align-items:flex-start;margin:5px 0"><span style="flex-shrink:0;display:inline-block;min-width:30px;text-align:center;background:var(--bg3);border:1px solid var(--bd);border-radius:8px;padding:2px 7px;font-size:12px;font-weight:700;color:var(--t)">${b}</span><span style="font-size:13px;color:var(--t2);line-height:1.55">${t}</span></div>`;
  return `
  <p style="color:var(--t2);font-size:13px;line-height:1.6">홀별로 점수를 넣으면 통계·진단이 자동 계산돼요.</p>

  ${S('① 라운드 만들기')}
  <div style="font-size:13px;color:var(--t2);line-height:1.6">홈 <b style="color:var(--t)">[＋ 추가]</b> → 날짜·날씨·동반자·메모 → <b style="color:var(--t)">[골프장 선택]</b>.</div>

  ${S('② 골프장 고르기')}
  <div style="font-size:13px;color:var(--t2);line-height:1.6"><b style="color:var(--a)">리스트는 아직 채우는 중</b>(현재 ${courseCnt}곳)이라, 없으면 <b style="color:var(--t)">[＋ 추가]</b>로 직접 등록해 바로 쓰면 돼요. 등록한 곳은 목록에 남습니다.</div>

  ${S('③ 홀 파(par) 확인')}
  <div style="font-size:13px;color:var(--t2);line-height:1.6">같은 골프장도 도는 코스 조합에 따라 파가 달라요. 뜨는 창에서 ＋/－로 그날 파를 맞추세요(<b style="color:var(--g)">이 라운드에만</b> 적용, 공식 데이터는 안 바뀜). 작성 중에도 상단 <b>⛳ 파수정</b>으로 가능.</div>

  ${S('④ 버튼 의미')}
  ${btn('－ ＋', '타수 −1/＋1. 가운데 <b>숫자(P)</b> 탭 = 파로 바로 입력.')}
  ${btn('GIR', '정규타수(파−2) 안에 그린 올렸으면 ON. (아이언 지표)')}
  ${btn('FIR', '티샷이 페어웨이면 ON. 파4·5만, <b>파3은 자동 비활성(·)</b>.')}
  ${btn('2P', '퍼팅 수. 탭마다 1P→2P→3P→4P 순환(기본 2P).')}
  ${btn('M／TP', '티샷 사고. 끄기→<b>M</b>(멀리건·벌타X)→<b>TP</b>(벌타 받고 진행)→끄기. 드라이버 생존율 진단에 쓰여요.')}

  ${S('⑤ 저장')}
  <div style="font-size:13px;color:var(--t2);line-height:1.6">위 세그먼트로 전·후반 전환, 아래 바에 합계가 실시간 집계. 다 채우면 <b style="color:var(--g)">✓ 완료</b>로 저장. 덜 쳤는데 뒤로 가면 <b style="color:var(--a)">작성중</b>으로 임시저장돼 이어서 입력 가능. 저장 후 라운드를 탭하면 🔧수정·🗑삭제·📤공유.</div>

  <div style="margin-top:14px;padding-top:10px;border-top:.5px solid var(--bd);font-size:11px;color:var(--t3)">📌 ${APP_VERSION} 기준 · 기능이 바뀌면 자동 갱신.</div>`;
}

// ── 통계 분석 지표 설명(자동 생성) : 각 지표가 무엇을 뜻하는지 ──
// 신호등 기준값(BENCH)을 그대로 끌어와 기준이 바뀌면 설명도 함께 갱신됩니다.
function guideStatsHTML() {
  const S = (t) => `<div style="font-size:14px;font-weight:800;color:var(--g);margin:14px 0 5px">${t}</div>`;
  const it = (name, desc) => `<div style="margin:6px 0"><div style="font-size:13px;font-weight:700;color:var(--t)">${name}</div><div style="font-size:12px;color:var(--t2);line-height:1.5">${desc}</div></div>`;
  return `
  <p style="color:var(--t2);font-size:13px;line-height:1.6"><b>통계</b> 탭에서 자동 계산되는 지표들의 뜻이에요.</p>

  ${S('🚦 진단 신호등 — 계산식')}
  ${benchFormulaHTML()}

  ${S('📋 요약 · 발전')}
  ${it('추정 핸디', '최근 20R 중 좋은 라운드들의 오버파 평균(간이 추정). 코스 난이도는 미반영이에요.')}
  ${it('발전 한 줄 · 발전 추세', '초기 vs 최근 평균 비교로 발전 정도를 보여줘요. 추세 그래프는 지표(스코어/퍼팅/GIR/FIR/<b>기복</b>)를 골라 5R 이동평균선·라운드당 변화량(개선/정체/주의)으로 표시. <b>기복</b>은 최근 5R 스코어 편차의 흐름(작아질수록 일정해짐).')}
  ${it('💊 오늘의 처방', '라운드 상세의 "🔍 이 라운드 분석"에서, 4부서 중 손해가 가장 큰 한 곳을 콕 집어 무엇을 연습할지 한 줄로 알려줘요.')}
  ${it('🎯 약점 우선순위', '드라이버·아이언·숏게임·퍼팅을 설정 기준값과 비교해 라운드당 손실 타수를 추정 → 고칠 순서를 ⭐최우선부터. (상대 비교용)')}

  ${S('스코어')}
  ${it('평균 스코어·오버파·기복', '총타수 평균 / 파 대비(+오버·−언더) / 점수 편차(작을수록 일정).')}
  ${it('실력 비율 · 블로업', '홀 기준 파 이하·보기·더블+ 비율. 블로업 = 라운드당 트리플보기↑ 홀.')}
  ${it('파 종류별 (부서 교차) · 전·후반', '파3·4·5별 파 대비 평균에 더해, 파3은 GIR / 파4·5는 FIR·GIR을 함께 보여줘 어느 홀 유형에서 어느 부서가 약한지 교차로 진단. / 앞뒤 9홀 평균·차이(후반 무너짐).')}
  ${it('💥 큰 실수의 원인', '더블보기 이상(블로업) 홀이 티샷 사고·3퍼팅·그린 미스 중 무엇 때문이었는지 원인별로 분해해요(한 홀에 겹칠 수 있음).')}

  ${S('정확도 · 쇼트게임')}
  ${it('GIR · FIR', '그린 적중률 / 페어웨이 적중률(%).')}
  ${it('GIR홀 퍼팅 · 3퍼팅 · 1퍼팅율 · 퍼팅 분포', '그린 정규로 올린 홀 퍼팅(순수 퍼팅력) / 3퍼팅 수 / 1퍼팅 비율 / 1·2·3·4+ 퍼팅 홀 수.')}
  ${it('스크램블링', '그린 놓친 홀을 파 이하로 막은 비율(높을수록 좋음).')}

  ${S('🏆 기록 · 트로피')}
  ${it('개인기록 · 마일스톤', '베스트·최소퍼팅·최고GIR/FIR·최다버디 기록 / 100·90·80 첫 돌파 날짜.')}
  ${it('트로피 배지', '개인 기록을 보유한 라운드 카드엔 ⭐ 별표가 붙고, 어떤 기록인지 🏆베스트·🍩최소퍼팅·🎯GIR·🚗FIR·🕊️버디·🛟최소패널티 배지로 함께 보여요(홈·라운드별·상세).')}
  ${it('타수 분포 · 코스 비교', '이글↑·버디·파·보기·더블·트리플+ 개수 / 라운드 상세에서 같은 골프장 이전 기록(평균·베스트)과 비교.')}

  <div style="margin-top:10px;font-size:12px;color:var(--t2);line-height:1.5">※ <b>라운드별</b> 탭은 각 라운드를 내 평균과 비교해 🟢🟡🔴로 표시(3R↑).</div>
  <div style="margin-top:12px;padding-top:10px;border-top:.5px solid var(--bd);font-size:11px;color:var(--t3)">📌 ${APP_VERSION} 기준 · 지표가 바뀌면 자동 갱신.</div>`;
}

// ════════════════════════════════════════
// 🟢 분석 철학 (라운드 탭 배너 → 모달)
// ════════════════════════════════════════
// 온그린이 통계를 보는 큰 그림을 한 페이지로 설명합니다. 라운드 탭 상단 배너에서 엽니다.
function goPhil() { const el = Q('phil-read'); if (el) el.innerHTML = philosophyHTML(); om('m-phil'); }
function philosophyHTML() {
  const S = (t) => `<div style="font-size:15px;font-weight:800;color:var(--g);margin:16px 0 6px">${t}</div>`;
  const P = (t) => `<p style="font-size:13px;color:var(--t2);line-height:1.65;margin:4px 0">${t}</p>`;
  return `
  <p style="font-size:14px;color:var(--t);line-height:1.7;font-weight:600">온그린은 점수를 <u>기록</u>하는 앱이 아니라, 다음 라운드에서 한 타를 줄여줄 <b style="color:var(--g)">코치</b>를 지향해요.</p>
  ${P(`그래서 모든 숫자는 단 하나의 질문에 답하도록 설계했어요 — <b style="color:var(--t)">"무엇을 연습해야 가장 빨리 줄어드는가?"</b>`)}

  ${S(`① 점수가 아니라 '원인'을 본다`)}
  ${P(`스코어는 <b style="color:var(--t)">결과</b>일 뿐이에요. 온그린은 골프를 만드는 4개 부서 — <b>🚗 드라이버 · 🎯 아이언 · ⛳ 숏게임 · 🍩 퍼팅</b> — 로 쪼개 신호등(🟢🟡🔴)으로 진단해요. "오늘 90 쳤다"가 아니라 "숏게임이 🔴라서 90이 나왔다"를 말해줘요.`)}

  ${S(`② 두 개의 잣대로 본다`)}
  ${P(`<b style="color:var(--t)">세상 기준</b>(분석 기준값)으로 내 객관적 위치를, <b style="color:var(--t)">내 평균</b>(라운드별 🟢🟡🔴)으로 오늘의 컨디션을 봐요. 같은 데이터를 두 렌즈로 비춰요.`)}

  ${S(`③ 과거의 나와 경쟁한다`)}
  ${P(`남과 비교하면 좌절뿐이라, 온그린은 <b style="color:var(--t)">성장 서사</b>로 동기를 만들어요. 발전 추세, 100·90·80 첫 돌파, 그리고 <b>기복 추세</b>(점점 일정해지는지)로요.`)}

  ${S(`④ 운을 걷어낸 '순수 실력'을 잰다`)}
  ${P(`그냥 총 퍼팅이 아니라 <b style="color:var(--t)">GIR홀 퍼팅</b>만 떼서 봐요(어프로치 붙여 넣은 1퍼팅이 "퍼팅 잘함"으로 둔갑하는 걸 막아요). 드라이버도 M·TP를 빼고 <b style="color:var(--t)">티샷 생존율</b>로 봐서 "진짜 내 실력"이 얼마인지 보여줘요.`)}

  ${S('🧭 그래서 이렇게 안내해요')}
  ${P(`💊 <b style="color:var(--t)">오늘의 처방</b> — 라운드 분석에서 가장 손해 큰 한 곳만 콕 집어줘요.`)}
  ${P(`💥 <b style="color:var(--t)">큰 실수의 원인</b> — 더블보기↑가 티샷·3퍼팅·그린미스 중 무엇 때문인지 분해해요.`)}
  ${P(`📈 <b style="color:var(--t)">기복 추세</b> — 라운드를 거듭할수록 점수가 일정해지는지 봐요.`)}

  <div style="margin-top:16px;padding:12px 14px;background:#0d2e1a;border:1px solid var(--g);border-radius:12px;font-size:13px;color:var(--g);line-height:1.6;font-weight:600">숫자를 보지 말고, 숫자가 가리키는 <b>다음 한 타</b>를 보세요. 그게 온그린의 전부예요. 🟢</div>
  <div style="margin-top:10px;font-size:11px;color:var(--t3)">📌 ${APP_VERSION} 기준</div>`;
}

// ════════════════════════════════════════
// 제스처: 화면을 오른쪽으로 슬라이드하면 뒤로 (iOS 스타일) + 모달 배경 탭으로 닫기
// ════════════════════════════════════════
// 페이지별 "뒤로" 동작. 뒤로 갈 곳이 없는 화면(홈·통계·로그인)은 등록하지 않음.
const BACK_ACTIONS = { course: goHome, sc: scBack, set: goHome, notice: goHome };
function initSwipeBack() {
  const app = document.querySelector('.app');
  if (!app || app._swipeBackReady) return;
  app._swipeBackReady = true;
  let active = false, sx = 0, sy = 0, dx = 0, dir = 0, pageEl = null, action = null;
  const W = () => window.innerWidth || 430;
  app.addEventListener('touchstart', e => {
    active = false;
    if (e.touches.length !== 1) return;
    if (document.querySelector('.mo.on')) return;          // 모달이 떠 있으면 무시
    if (e.target.closest('.cc-wrap')) return;              // 골프장 카드(자체 가로 스와이프)에서 시작하면 양보
    action = BACK_ACTIONS[curPg()];
    if (!action) return;                                   // 뒤로 갈 화면이 아님
    pageEl = Q('pg-' + curPg());
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; dir = 0; active = true;
  }, { passive: true });
  app.addEventListener('touchmove', e => {
    if (!active) return;
    dx = e.touches[0].clientX - sx; const dy = e.touches[0].clientY - sy;
    if (!dir) { if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; dir = Math.abs(dx) > Math.abs(dy) ? 1 : 2; }
    if (dir === 2) { active = false; return; }              // 세로 스크롤이면 양보
    if (dx <= 0) { pageEl.style.transform = ''; pageEl.style.opacity = ''; return; }  // 오른쪽으로 끄는 동작만
    pageEl.style.transition = 'none';
    pageEl.style.transform = `translateX(${dx}px)`;
    pageEl.style.opacity = String(Math.max(0.4, 1 - dx / W()));
  }, { passive: true });
  const finish = () => {
    if (!active) return; active = false;
    const el = pageEl; if (!el) return;
    el.style.transition = 'transform .2s ease, opacity .2s ease';
    if (dir === 1 && dx > W() * 0.33) {                     // 충분히 끌었으면 뒤로 완료
      el.style.transform = `translateX(${W()}px)`; el.style.opacity = '0';
      setTimeout(() => { action(); el.style.transition = el.style.transform = el.style.opacity = ''; }, 180);
    } else {                                                // 아니면 제자리 복귀
      el.style.transform = ''; el.style.opacity = '';
      setTimeout(() => { el.style.transition = ''; }, 200);
    }
  };
  app.addEventListener('touchend', finish);
  app.addEventListener('touchcancel', finish);
}
// 아래에서 위로 올라오는 모달(.mo): 뒤 배경을 누르면 닫는다.
function initModalBackdrop() {
  document.querySelectorAll('.mo').forEach(mo => {
    if (mo._bdReady) return; mo._bdReady = true;
    mo.addEventListener('click', e => { if (e.target === mo) cm(mo.id); });   // 시트(.ms) 안쪽 클릭은 통과
  });
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
  initSwipeBack();      // 화면 슬라이드로 뒤로가기
  initModalBackdrop();  // 모달 배경 탭으로 닫기
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
