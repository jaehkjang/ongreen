// ============================================================
// app.js — 두뇌 방
// 로그인 판단, 점수 계산, 통계, 화면 전환 등 모든 로직.
// 통신은 api.js(API), 모양은 style.css.
// ============================================================

// ── 앱(프런트엔드) 버전 ──
// 기능이 추가될 때마다 여기 숫자를 올리고 CHANGELOG.md 에 기록을 남깁니다.
// ⚠️ 이것은 API.VERSION(서버 통신 동기화용)과 다릅니다. 서버를 안 건드리는
//    프런트 변경이면 API.VERSION 은 그대로 두고 APP_VERSION 만 올리세요.
const APP_VERSION = 'v12.46.0';

// ── 기본 골프장 (서버에서 못 불러올 때만 쓰는 비상용) ──
const DEF = [
  { id: 'd1', name: '블루원 CC', addr: '경북 경주', status: 'official', layouts: [{ name: '레이크', holes: [4,3,4,5,3,4,5,4,3] }, { name: '파인', holes: [4,5,3,4,4,5,3,4,4] }] },
  { id: 'd2', name: '레이크힐스 CC', addr: '경기 용인', status: 'official', layouts: [{ name: '레이크', holes: [4,4,3,5,4,3,5,4,4] }, { name: '힐스', holes: [5,3,4,4,3,5,4,4,3] }] },
];

// ── 앱 상태 (메모리; 세션만 localStorage에 백업) ──
let A = {
  u: '', isAdm: false, loaded: false,   // loaded: 서버에서 라운드를 "확실히" 받았는지 (저장 안전장치용)
  rounds: [], official: [...DEF], notes: [],
  allCourses() { return this.official; },                 // 코스는 공식 목록 하나뿐
  sc: { course: null, li: [0, 1], ro: false, eid: null, half: 0, hIdx: 0,
        scores: Array(18).fill(0), putts: Array(18).fill(2), og: Array(18).fill(0),
        gir: Array(18).fill(false), fir: Array(18).fill(false),
        mulli: Array(18).fill(0), tp: Array(18).fill(0), teeSel: Array(18).fill(null), miss: Array(18).fill(''),
        xhz: Array(18).fill(0), xob: Array(18).fill(0),
        date: '', wx: '☀️ 맑음', partner: '', memo: '' } };

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
function nfs(x) { const v = +x; return (v > 0 ? '+' : '') + nf(v); }   // 파 대비처럼 부호가 중요한 값 (+0.4 / -0.2)
let _sid = 0, _delId = null, _editOldName = '';
let _trendMetric = 0;   // 발전 추세 그래프에서 보고 있는 지표(TREND_METRICS 인덱스)

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
  // 아직 서버에 못 올린 변경이 있으면 분명히 알려주고 확인받는다 (로그아웃하면 로컬 캐시와 함께 사라짐)
  const p = pendGet(); const n = Object.keys(p.edits).length + p.dels.length;
  if (!confirm(n ? `⚠️ 아직 서버에 못 올린 변경이 ${n}건 있어요.\n로그아웃하면 이 변경은 사라집니다. 계속할까요?` : '로그아웃 하시겠어요?')) return;
  localStorage.removeItem('og_s'); localStorage.removeItem('og_cache'); pendClear();
  API.setAuth('', '');
  Object.assign(A, { u: '', isAdm: false, loaded: false, rounds: [], official: [...DEF], notes: [] });
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
  const [rr, cr] = await Promise.all([ callAPI(() => API.getRounds()), callAPI(() => API.getCourses()) ]);

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

  // ── 라운드: 서버가 "확실히 성공"(ok + rounds 배열)일 때만 교체. 그 외(서버 일시오류·이상 응답)엔
  //    절대 빈 배열로 덮지 않는다. (서버 saveRounds_ 가 clearContents 라, 이후 빈 배열 저장 시 유실되므로)
  const roundsOk = rr && rr.ok && Array.isArray(rr.rounds);
  if (roundsOk) {
    const m = mergeRounds(rr.rounds, A.rounds, pendGet());
    A.rounds = m.rounds;
    A.loaded = true;
    if (m.needSync) pushRounds();   // 미동기화분 즉시 반영 (성공하면 pushRounds 가 대기목록을 정리)
  } else if (!Array.isArray(A.rounds)) {
    A.rounds = [];   // 이전 데이터가 아예 없을 때만 방어적 초기화
  }
  // ── 코스: 성공일 때만 교체, 실패 시 기존/캐시 보존 (빈 목록으로 덮지 않음)
  A.official = (cr && cr.courses && cr.courses.length) ? cr.courses.map(c => ({ ...c, status: 'official' }))
                                                       : ((A.official && A.official.length) ? A.official : [...DEF]);
  // ── 캐시는 "라운드를 성공적으로 받았을 때만" 갱신 (실패 응답으로 캐시를 비우지 않도록)
  if (roundsOk) { try { localStorage.setItem('og_cache', JSON.stringify({ rounds: A.rounds, official: A.official })); } catch (e) {} }
  else if (!silent) toast('⚠️ 기록 동기화 실패 — 저장된 기록을 그대로 표시합니다');

  // 과거 버그로 뒤바뀐 코스 조합 라벨을 박제된 파 기준으로 자동 복구(스코어·기록은 불변). 바뀐 게 있으면 서버에도 반영.
  if (roundsOk && healRoundLabels()) {
    pushRounds();
    try { localStorage.setItem('og_cache', JSON.stringify({ rounds: A.rounds, official: A.official })); } catch (e) {}
  }

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
  localStorage.removeItem('og_s'); localStorage.removeItem('og_cache'); pendClear(); API.setAuth('', '');   // 다른 계정 로그인 시 이전 사용자의 미동기화분이 섞이지 않게
  Object.assign(A, { u: '', isAdm: false, loaded: false, rounds: [], official: [...DEF], notes: [] });
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
function goSet() { showPg('set'); Q('adm-panel').style.display = A.isAdm ? 'block' : 'none'; if (A.isAdm) { if (_admOffLoaded) renderAdmOfficial(); else admLoadOfficial(); } }   // 관리자는 설정을 열 때 목록을 미리 불러와 바로 검색되게(불러오기→재검색 불필요)
// 홈 상단 노란 알림 배너 → 설정의 관리자 "골프장 변경 알림" 메뉴로 바로 이동.
// 알림 목록(누가·어느 코스·어느 구성을 어떻게 고쳤는지)을 자동으로 펼치고 그 위치로 스크롤한다.
async function goAdmNotes() {
  goSet();
  if (!A.isAdm) return;
  await admLoadNotes();                                  // 변경 내역 자동 로드 (상세 포함)
  const el = Q('adm-notes');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      `<div class="rc-meta"><span>🚗 FIR ${r.fir}%</span><span>🎯 GIR ${r.gir}%</span><span>🍩 ${r.putts}퍼팅</span>${(r.mulligan || r.tpCount) ? `<span style="color:var(--r)">🔄 M${r.mulligan || 0}·TP${r.tpCount || 0}</span>` : ''}</div>${courseAvgChip(r) ? `<div style="margin-top:8px">${courseAvgChip(r)}</div>` : ''}`}
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
  A.sc.eid = null; A.sc.ro = false; A.sc.hIdx = 0; A.sc.scores = Array(18).fill(0); A.sc.putts = Array(18).fill(2); A.sc.og = Array(18).fill(0);
  A.sc.gir = Array(18).fill(false); A.sc.fir = Array(18).fill(false); A.sc.mulli = Array(18).fill(0); A.sc.tp = Array(18).fill(0); A.sc.teeSel = Array(18).fill(null); A.sc.miss = Array(18).fill('');
  A.sc.xhz = Array(18).fill(0); A.sc.xob = Array(18).fill(0);
  cm('m-nr'); renderCourses(); showPg('course');
}

function buildRound(isDraft) {
  const h = getH(); const par = h.reduce((a, b) => a + b, 0);
  const c = A.sc.course; const [l0, l1] = A.sc.li;
  const tot = A.sc.scores.reduce((a, b) => a + b, 0);
  return {
    id: A.sc.eid || Date.now(), isDraft: !!isDraft,
    courseId: c.id, courseName: c.name, courseLbl: `${c.layouts[l0].name}+${c.layouts[l1].name}`,
    layoutIdx: [l0, l1], layoutNames: [c.layouts[l0].name, c.layouts[l1].name],   // ★ 실제 플레이한 나인 이름을 박제(인덱스에 의존 안 함 → 마스터 순서 바뀌어도 안 뒤바뀜)
    date: A.sc.date, weather: A.sc.wx, partner: A.sc.partner, memo: A.sc.memo,
    score: tot, vs: tot - par, par,
    putts: A.sc.putts.reduce((a, b) => a + b, 0),
    gir: Math.round(A.sc.gir.filter(Boolean).length / 18 * 100),
    fir: Math.round(A.sc.fir.filter(Boolean).length / 18 * 100),
    mulligan: A.sc.mulli.reduce((a, b) => a + (b ? 1 : 0), 0),
    tpCount: (A.sc.tp || []).reduce((a, b) => a + (b ? 1 : 0), 0),
    scores: [...A.sc.scores], puttsArr: [...A.sc.putts], girArr: [...A.sc.gir], firArr: [...A.sc.fir],
    mulliArr: [...A.sc.mulli], tpArr: [...(A.sc.tp || Array(18).fill(0))],
    missArr: [...(A.sc.miss || Array(18).fill(''))],   // 러프/벙커 구분(v12.37+) — 페널티 계산엔 안 쓰고 미스 유형 집계에만 씀
    xhzArr: [...(A.sc.xhz || Array(18).fill(0))], xobArr: [...(A.sc.xob || Array(18).fill(0))],   // 티샷 외(어프로치 등) 해저드·OB 횟수(v12.42+)
    holePars: [...h]   // ★ 박제: 그날 홀별 파를 라운드에 함께 저장 → 나중에 골프장이 바뀌어도 안 흔들림
  };
}

// 라운드 전체를 서버에 덮어쓰기 전 안전장치 (★ 스코어카드 유실 방지 ★)
//  ① 로컬 캐시는 "항상" 갱신 → 오프라인 입력·삭제도 보존되고 다음 실행에 반영됨
//  ② 서버에서 권위 데이터(A.loaded)를 아직 못 받았으면 서버를 덮지 않는다 —
//     서버 saveRounds_ 가 clearContents 라, 불완전한 A.rounds 로 덮으면 기존 기록이 통째로 날아간다.
// ── 미동기화 변경 추적 (og_pending) ────────────────────────────────────────
// 오프라인·서버 실패로 서버에 못 올린 변경(신규/수정/삭제)을 기억해 둔다.
// 예전엔 로드할 때 "서버에 없는 id"만 보존해서, 이미 서버에 있는 라운드를 오프라인에서
// 수정하면 다음 로드에 옛 값으로 조용히 되돌아갔고, 오프라인 삭제는 되살아났다.
const PEND_KEY = 'og_pending';
function sameId(a, b) { return a != null && b != null && String(a) === String(b); }   // 서버가 id를 문자열로 돌려줘도 안전하게 매칭
function pendGet() {
  try {
    const p = JSON.parse(localStorage.getItem(PEND_KEY) || 'null');
    if (p && typeof p === 'object') return { edits: (p.edits && typeof p.edits === 'object') ? p.edits : {}, dels: Array.isArray(p.dels) ? p.dels : [] };
  } catch (e) {}
  return { edits: {}, dels: [] };
}
function pendSet(p) { try { localStorage.setItem(PEND_KEY, JSON.stringify(p)); } catch (e) {} }
function pendClear() { try { localStorage.removeItem(PEND_KEY); } catch (e) {} }
function markSaved(rd) {                        // 저장/임시저장한 라운드를 대기목록에 기록
  if (!rd || rd.id == null) return;
  const p = pendGet(); p.edits[rd.id] = rd; p.dels = p.dels.filter(x => !sameId(x, rd.id)); pendSet(p);
}
function markDeleted(id) {                      // 삭제한 라운드를 대기목록에 기록(되살아나지 않게)
  if (id == null) return;
  const p = pendGet(); delete p.edits[id]; if (!p.dels.some(x => sameId(x, id))) p.dels.push(id); pendSet(p);
}

// ── 서버 목록 + 로컬 목록 + 미동기화 대기분 합치기 (순수 함수 — tests/data-safety.test.js 가 검증) ──
// 예전엔 "서버에 없는 id만 보존"이라, 서버에 이미 있는 라운드의 오프라인 수정은 옛 값으로 되돌아가고
// 오프라인 삭제는 되살아났다. 이제 대기분(edits/dels)을 서버 값 위에 다시 얹어 그 유실을 막는다.
function mergeRounds(server, local, p) {
  const pend = { edits: (p && p.edits) || {}, dels: (p && p.dels) || [] };
  const srv = (server || []).filter(s => s && s.id != null);
  // ① 로컬에서 지운 라운드는 서버 목록에서도 뺀다 (동기화 실패로 되살아나지 않게)
  const merged = srv.filter(s => !pend.dels.some(d => sameId(d, s.id)));
  // ② 로컬 수정/신규분을 서버 값 위에 다시 얹는다 (오프라인 수정이 옛 값으로 안 되돌아가게)
  Object.keys(pend.edits).forEach(k => {
    const er = pend.edits[k]; if (!er || er.id == null) return;
    const i = merged.findIndex(m => sameId(m.id, er.id));
    if (i >= 0) merged[i] = er; else merged.unshift(er);
  });
  // ③ 서버에도 대기목록에도 없는 로컬 전용 라운드(옛 캐시 등)도 보존
  const localOnly = (local || []).filter(lr => lr && lr.id != null
    && !srv.some(s => sameId(s.id, lr.id))
    && !pend.dels.some(d => sameId(d, lr.id))
    && !Object.keys(pend.edits).some(k => sameId(k, lr.id)));
  return { rounds: [...localOnly, ...merged],
           needSync: !!(localOnly.length || Object.keys(pend.edits).length || pend.dels.length) };
}

// 서버 반영이 확인된 대기분만 지운다. (그 사이 새로 생긴 변경까지 지우면 그 변경이 유실되므로,
//  보낸 내용과 지금 대기 중인 내용이 같을 때만 제거한다.)
function pendResolve(snap) {
  const p = pendGet();
  Object.keys(snap.edits || {}).forEach(k => {
    if (p.edits[k] !== undefined && JSON.stringify(p.edits[k]) === JSON.stringify(snap.edits[k])) delete p.edits[k];
  });
  p.dels = p.dels.filter(d => !(snap.dels || []).some(s => sameId(s, d)));
  pendSet(p);
}

let _pushChain = Promise.resolve();   // 저장 요청 직렬화용
async function pushRounds() {
  try { const c = JSON.parse(localStorage.getItem('og_cache') || 'null') || {}; c.rounds = A.rounds; localStorage.setItem('og_cache', JSON.stringify(c)); } catch (e) {}
  if (!A.loaded) return { ok: false, __unsafe: true };   // 아직 서버 원본 미확보 → 덮어쓰기 금지(로컬엔 보존됨)
  // 저장 요청을 한 줄로 세운다. 서버 saveRounds_ 는 전체 덮어쓰기라, 동시에 두 요청이 날아가면
  // 늦게 도착한 "옛 스냅샷"이 최신 저장을 되돌릴 수 있다. 각 요청은 자기 차례에 A.rounds 를 다시 읽는다.
  const send = () => {
    const snap = pendGet();                              // 이번 요청이 실어 보내는 대기분
    return callAPI(() => API.saveRounds(A.rounds)).then(r => { if (r && r.ok) pendResolve(snap); return r; });
  };
  const run = _pushChain.then(send, send);
  _pushChain = run.then(() => {}, () => {});   // 실패해도 다음 요청이 막히지 않게
  return await run;
}

// ── 입력 중인 스코어카드를 라운드 목록에 반영하고 "기기에" 즉시 보존 ──────────
// 서버 통신 없이 먼저 로컬에 남기므로, 앱이 꺼지거나 인터넷이 끊겨도 입력이 사라지지 않는다.
// 정식 저장(저장 버튼)을 이미 누른 라운드는 임시저장으로 되돌리지 않는다(기존 isDraft 유지).
function stashSC() {
  const prev = A.sc.eid ? A.rounds.find(r => sameId(r.id, A.sc.eid)) : null;
  const rd = buildRound(prev ? !!prev.isDraft : true);
  if (A.sc.eid) { const i = A.rounds.findIndex(r => sameId(r.id, A.sc.eid)); if (i >= 0) A.rounds[i] = rd; else A.rounds.unshift(rd); }
  else { A.sc.eid = rd.id; A.rounds.unshift(rd); }
  // 대기목록(og_pending)에 이 라운드 자체를 통째로 넣어두면, 앱이 곧바로 꺼져도 다음 실행 때
  // mergeRounds 가 되살린다. 전체 기록 캐시(og_cache) 쓰기는 무거워서 pushRounds 쪽에 맡긴다.
  markSaved(rd);
  return rd;
}

// ── 자동 저장: 점수·퍼팅·GIR·FIR·M/TP 를 건드릴 때마다 호출 ──────────────────
// 기기 저장은 즉시(위 stashSC), 서버 전송은 잠깐 모았다가(디바운스) 보낸다.
// 그래서 +/- 를 연타해도 서버로 요청이 쏟아지지 않는다.
let _asTimer = null;
function autoSaveSC() {
  if (A.sc.ro || !A.sc.course) return;
  if (!A.sc.scores.some(x => x > 0)) return;       // 아직 아무 점수도 없으면 저장할 게 없음
  stashSC();
  setSaveHint('기기에 저장됨');
  clearTimeout(_asTimer);
  _asTimer = setTimeout(async () => {
    const r = await pushRounds();
    setSaveHint(r.ok ? '자동 저장됨 ✓' : '기기에 저장됨 · 연결되면 자동 동기화');
  }, 2000);
}
function setSaveHint(msg) { const el = Q('sc-save-hint'); if (el) el.textContent = msg; }
function flushAutoSave() {                         // 화면을 벗어나거나 앱이 가려질 때 즉시 전송
  if (!_asTimer) return;
  clearTimeout(_asTimer); _asTimer = null;
  pushRounds();
}

async function saveRound() {
  if (A.sc.ro) return;
  if (!A.sc.scores.filter(x => x > 0).length) { toast('스코어를 입력해주세요'); return; }
  clearTimeout(_asTimer); _asTimer = null;         // 대기 중인 자동저장은 취소(지금 바로 보내므로)
  const rd = buildRound(false);                    // 정식 저장(임시저장 해제)
  const btn = Q('sv'); btn.textContent = '저장 중...'; btn.disabled = true;
  if (A.sc.eid) { const i = A.rounds.findIndex(r => sameId(r.id, A.sc.eid)); if (i >= 0) A.rounds[i] = rd; else A.rounds.unshift(rd); }
  else A.rounds.unshift(rd);
  A.sc.eid = rd.id;                                // ★ 화면에 머무르므로 같은 라운드를 계속 수정하도록 id 유지(중복 저장 방지)
  markSaved(rd);                                   // 동기화 실패해도 다음 로드에서 안 되돌아가게 기록
  const r = await pushRounds();
  toast(r.ok ? '✅ 저장 완료' : (r.__unsafe ? '✅ 기기에 저장됨 · 연결 후 자동 동기화' : '⚠️ 저장됐지만 동기화 실패'));
  setSaveHint(r.ok ? '저장됨 ✓' : '기기에 저장됨 · 연결되면 자동 동기화');
  btn.disabled = false;
  if (rd.scores.every(x => x > 0)) {               // 18홀 다 채우고 저장했으면 이 라운드의 분석 화면으로 바로 이동
    A.sc.course = null; A.sc.eid = null; A.sc.ro = false;
    goHome(); openDet(rd.id);
  } else {
    renderSC();                                    // 아직 다 안 쳤으면 화면에 머무르며 버튼 라벨(저장/✓ 완료)만 복구
  }
}

function roundPars(r) {                          // 박제된 파 우선, 없으면 옛 라운드 호환용으로 마스터 참조
  if (r.holePars && r.holePars.length === 18) return r.holePars;
  const c = A.allCourses().find(x => x.id === r.courseId || x.name === r.courseName);
  if (!c) return Array(18).fill(4);
  // 이름으로 레이아웃을 찾고(마스터 순서가 바뀌어도 안전), 없으면 옛 방식(인덱스)로 폴백
  const nm = (r.layoutNames && r.layoutNames.length === 2) ? r.layoutNames : (r.courseLbl && r.courseLbl.includes('+') ? r.courseLbl.split('+') : null);
  const byName = n => (c.layouts.find(l => l.name === n) || {}).holes;
  let h0 = nm ? byName(nm[0]) : null, h1 = nm ? byName(nm[1]) : null;
  if (!h0 || !h1) { const [l0, l1] = r.layoutIdx || [0, 1]; h0 = c.layouts[l0]?.holes; h1 = c.layouts[l1]?.holes; }
  return [...(h0 || Array(9).fill(4)), ...(h1 || Array(9).fill(4))];
}

// ── 과거 버그로 뒤바뀐 "코스 조합 라벨" 자동 복구 ────────────────────────────
// 예전엔 저장된 layoutIdx(클론 기준 [0,1])로 마스터를 역참조해 레이아웃 이름을 구했는데,
// 마스터의 실제 나인 순서와 다르면(예: 레이크+오션 → 오션+…) 라벨이 뒤바뀌었다.
// 홀별 파(holePars)는 그날 그대로 박제돼 있으므로, 각 나인의 파를 마스터 레이아웃과 대조해
// "어느 나인이었는지"를 되찾아 courseLbl/layoutNames 만 바로잡는다.
//  · 스코어·퍼팅·GIR·FIR·파(점수/vs/par)는 절대 건드리지 않는다 (라벨 메타만 교정).
//  · 파가 마스터와 정확히·유일하게 안 맞으면(그날 파를 손수 고쳤거나 애매하면) 건드리지 않는다.
function healRoundLabels() {
  let changed = false;
  const eqNine = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === 9 && b.length === 9 && a.every((v, i) => v === b[i]);
  (A.rounds || []).forEach(r => {
    if (!r || !r.holePars || r.holePars.length !== 18) return;
    const master = A.official.find(x => x.id === r.courseId || x.name === r.courseName);
    if (!master || !(master.layouts || []).length) return;
    const uniq = nine => { const m = master.layouts.filter(l => eqNine(l.holes, nine)); return m.length === 1 ? m[0].name : null; };
    const n0 = uniq(r.holePars.slice(0, 9)), n1 = uniq(r.holePars.slice(9, 18));
    if (!n0 || !n1 || n0 === n1) return;      // 유일하게 못 가리면(애매/수정된 파) 그대로 둠
    const lbl = `${n0}+${n1}`;
    if (r.courseLbl !== lbl || !r.layoutNames || r.layoutNames[0] !== n0 || r.layoutNames[1] !== n1) {
      r.courseLbl = lbl; r.layoutNames = [n0, n1]; changed = true;   // 라벨/이름만 교정
    }
  });
  return changed;
}
// ── 같은 골프장의 "자신을 뺀" 다른 라운드 평균·베스트 — courseCompareHTML과 courseAvgChip이 공유 ──
function courseOtherAvg(r) {
  const same = A.rounds.filter(x => !x.isDraft && x.courseName === r.courseName && x.id !== r.id);
  if (!same.length) return null;
  return { n: same.length, avg: same.reduce((a, x) => a + (x.score || 0), 0) / same.length, best: Math.min(...same.map(x => x.score)) };
}
// ── 같은 골프장 이전 기록과 비교 (코스별 평균을 대신해 스코어카드 안에서 바로 보여줌) ──
function courseCompareHTML(r) {
  const oa = courseOtherAvg(r);
  if (!oa) return '';
  const d = r.score - oa.avg;                  // 음수면 이전 평균보다 좋음
  const arrow = d < -0.05 ? '▼' : d > 0.05 ? '▲' : '·';
  const col = d < -0.05 ? 'var(--g)' : d > 0.05 ? 'var(--r)' : 'var(--t2)';
  const row = (l, v) => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--t2);padding:5px 0"><span>${l}</span>${v}</div>`;
  return `<div class="cb" style="margin-top:8px;padding:12px 16px">
    <div class="cbt" style="margin-bottom:6px">📍 이 골프장 이전 기록과 비교 (이전 ${oa.n}R)</div>
    ${row('이전 평균', `<b style="color:var(--t)">${oa.avg.toFixed(1)}</b>`)}
    ${row('이전 베스트', `<b style="color:var(--t)">${oa.best}</b>`)}
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--t2);padding:5px 0;border-top:.5px solid var(--bd);margin-top:3px">
      <span>이번 라운드</span><b style="color:${col}">${r.score} <span style="font-size:11px">(평균 대비 ${arrow}${Math.abs(d).toFixed(1)})</span></b></div>
  </div>`;
}
// ── 라운드별 목록 카드용: "이 골프장 평균 대비" 작은 칩 (자신을 뺀 같은 골프장 평균 기준) ──
function courseAvgChip(r) {
  const oa = courseOtherAvg(r);
  if (!oa) return '';
  const d = r.score - oa.avg;
  const arrow = d < -0.05 ? '▼' : d > 0.05 ? '▲' : '·';
  const col = d < -0.05 ? 'var(--g)' : d > 0.05 ? 'var(--r)' : 'var(--t2)';
  return `<span style="display:inline-flex;align-items:center;gap:3px;background:var(--bg3);border:.5px solid var(--bd);border-radius:8px;padding:4px 9px;font-size:12px;color:${col}">⛳ 코스평균대비 ${arrow}${Math.abs(d).toFixed(1)}</span>`;
}
function openDet(id) {
  const r = A.rounds.find(x => x.id === id); if (!r) return;
  const hh = roundPars(r);
  const AV = playerAvgs(r.id);   // 이 라운드 자신은 빼고 "내 다른 라운드" 평균과 비교
  const cP = sig(r.putts, AV.putts, true, 2, AV.n), cG = sig(r.gir, AV.gir, false, 10, AV.n), cF = sig(r.fir, AV.fir, false, 10, AV.n);
  const a = analyze([r]);
  Q('det-t').textContent = `${r.courseName} ${r.date}`;
  const trs = roundTrophies(r);
  Q('det-body').innerHTML = `
    ${trs.length ? `<div style="text-align:center;margin-bottom:10px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">${trs.map(x => `<span style="background:var(--bg3);border:.5px solid var(--bd);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--t)">${x.i} ${x.l}</span>`).join('')}</div>` : ''}
    <div class="sgd" style="margin-bottom:12px">
      <div class="sc"><span class="sn">${r.score}</span><span class="sl">총 스코어</span></div>
      <div class="sc"><span class="sn" style="color:${r.vs > 0 ? 'var(--r)' : 'var(--g)'}">${vsL(r.vs)}</span><span class="sl">오버파</span></div>
      <div class="sc"><span class="sn">${dot(cF)}${r.fir}<span class="su">%</span></span><span class="sl">FIR</span></div>
      <div class="sc"><span class="sn">${dot(cG)}${r.gir}<span class="su">%</span></span><span class="sl">GIR</span></div>
      <div class="sc"><span class="sn">${dot(cP)}${r.putts}</span><span class="sl">퍼팅</span></div>
      <div class="sc"><span class="sn">${r.mulligan || 0}</span><span class="sl">멀리건 (페널티 없음)</span></div>
      <div class="sc" style="grid-column:1/-1"><span class="sn" style="color:${lossStrokesOf(r) > 0 ? 'var(--r)' : 'var(--g)'}">${lossStrokesOf(r)}<span style="font-size:14px;color:var(--t2)">타</span></span><span class="sl">티샷 패널티 (OB ${obCountOf(r)}회 · 해저드 ${hzCountOf(r)}회)</span></div>
    </div>
    ${courseAvgChip(r) ? `<div style="text-align:center;margin-bottom:10px">${courseAvgChip(r)}</div>` : ''}
    ${AV.n >= 3 ? `<div style="font-size:11px;color:var(--t3);text-align:center;margin-bottom:10px">🟢 내 평균보다 좋음 · 🟡 평균 수준 · 🔴 평균보다 나쁨</div>` : ''}
    ${skillRatioHTML([r])}
    ${blowupCauseHTML([r])}
    <div class="lbl">파 종류별</div>${parCrossHTML([r])}
    ${teeStabilityHTML(a)}
    ${driverHTML(a)}
    ${approachHTML(a)}
    ${shortGameHTML(a)}
    ${puttingHTML(a)}
    ${frontBackHTML([r])}
    <div class="cb"><div class="cbt">홀별 스코어 <span style="font-size:11px;color:var(--t3);font-weight:400">· 홀을 누르면 상세 기록</span></div>
      ${[[0, 9], [9, 18]].map(([from, to]) => `<div style="display:flex;gap:5px;margin-top:${from ? 5 : 0}px">${Array.from({ length: to - from }, (_, j) => { const i = from + j; const s = (r.scores || [])[i]; const d = s > 0 ? s - hh[i] : null; const co = d === null ? '#2c2c2e' : d <= -2 ? 'var(--p)' : d === -1 ? 'var(--b)' : d === 0 ? 'var(--g)' : d === 1 ? 'var(--a)' : 'var(--r)'; return `<div onclick="holeDetail(${id},${i})" style="width:32px;height:32px;border-radius:8px;background:${co};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;cursor:pointer">${s > 0 ? s : '-'}</div>`; }).join('')}</div>`).join('')}
    </div>
    ${scoreDistHTML([r])}
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
  // 레이아웃 이름은 저장된 실제 이름(layoutNames) → courseLbl 분해 → (구버전) 마스터 인덱스 순으로 복원.
  // 예전엔 layoutIdx(클론 기준 [0,1])로 마스터를 역참조해, 마스터 나인 순서와 다르면 코스가 뒤바뀌었음.
  let n0, n1;
  if (r.layoutNames && r.layoutNames.length === 2) { [n0, n1] = r.layoutNames; }
  else if (r.courseLbl && r.courseLbl.includes('+')) { const p = r.courseLbl.split('+'); n0 = p[0]; n1 = p[1]; }
  else { const [m0, m1] = r.layoutIdx || [0, 1]; n0 = (master && master.layouts[m0]?.name) || '전반'; n1 = (master && master.layouts[m1]?.name) || '후반'; }
  const pars = roundPars(r);     // 박제된 그 라운드의 파
  // 라운드 전용 코스 클론 (마스터는 절대 안 건드림)
  const c = { id: r.courseId, name: r.courseName, addr: (master && master.addr) || '',
    layouts: [ { name: n0, holes: pars.slice(0, 9) }, { name: n1, holes: pars.slice(9, 18) } ] };
  A.sc.course = c; A.sc.li = [0, 1]; A.sc.date = r.date; A.sc.wx = r.weather;
  A.sc.partner = r.partner; A.sc.memo = r.memo; A.sc.eid = id; A.sc.ro = ro; A.sc.half = 0; A.sc.hIdx = 0;
  A.sc.scores = [...r.scores]; A.sc.putts = [...r.puttsArr];
  A.sc.gir = [...r.girArr]; A.sc.fir = [...r.firArr]; A.sc.mulli = [...(r.mulliArr || Array(18).fill(0))]; A.sc.tp = [...(r.tpArr || Array(18).fill(0))];
  A.sc.miss = [...(r.missArr || Array(18).fill(''))];   // 러프/벙커 구분(없는 옛 기록은 빈 값)
  A.sc.xhz = [...(r.xhzArr || Array(18).fill(0))]; A.sc.xob = [...(r.xobArr || Array(18).fill(0))];   // 티샷 외 해저드·OB(없는 옛 기록은 0)
  // 온그린 타수는 저장하지 않으므로(스코어=온그린+퍼팅) 기존 기록에서 역산해 복원한다.
  A.sc.og = pars.map((p, i) => { const s = A.sc.scores[i] || 0, pt = A.sc.putts[i] || 0; return s > 0 ? Math.max(0, s - pt) : Math.max(1, p - 2); });
  A.sc.teeSel = deriveTeeSel();   // 티샷 선택 칩 상태도 fir/mulli/tp 로부터 추정 복원(러프/미선택은 구분 불가 → 미선택으로)
  const par = pars.reduce((a, b) => a + b, 0);
  Q('sc-t').textContent = c.name; Q('sc-s').textContent = `${r.date} · ${n0}+${n1} · 파${par}`;
  Q('sc-seg').innerHTML = `<button class="sg on" onclick="swHalf(0,this)">${n0} (1-9)</button><button class="sg" onclick="swHalf(1,this)">${n1} (10-18)</button>`;
  const eb = Q('sc-edit-holes'); if (eb) eb.style.display = ro ? 'none' : 'block';
  clearTimeout(_asTimer); _asTimer = null; setSaveHint('');   // 다른 라운드를 열었으니 자동저장 상태 초기화
  { const box = Q('sc-body'); if (box) box.scrollTop = 0; }   // 새로 연 라운드는 첫 홀부터
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
  A.rounds = A.rounds.filter(r => !sameId(r.id, _delId));
  markDeleted(_delId);                             // 동기화 실패해도 다음 로드에서 안 되살아나게 기록
  const r = await pushRounds();
  toast(r.ok ? '삭제됐어요' : (r.__unsafe ? '기기에서 삭제됨 · 연결 후 동기화' : '⚠️ 삭제됐지만 동기화 실패'));
  _delId = null; A.sc.eid = null; A.sc.ro = false; goHome();
}

function scBack() {
  if (!A.sc.ro && A.sc.course) {
    if (A.sc.scores.filter(x => x > 0).length) {
      // stashSC 가 기존 isDraft 를 유지한다 → 이미 "저장" 누른 라운드가 임시저장으로 되돌아가지 않음
      const rd = stashSC();
      clearTimeout(_asTimer); _asTimer = null;
      pushRounds();
      toast(rd.isDraft ? '✏️ 임시저장됐어요' : '✅ 저장돼 있어요');
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
// score(실제 타수)를 넘기면 1타(홀인원)를 별도로 구분해서 이름 붙인다 — 파3이 아니어도 1타면 홀인원.
function scoreLabel(d, score) {
  if (score === 1) return '홀인원';
  return d <= -3 ? '알바트로스' : d === -2 ? '이글' : d === -1 ? '버디' : d === 0 ? '파' : d === 1 ? '보기' : d === 2 ? '더블보기' : '트리플보기 이상';
}
function renderSC() { A.sc.ro ? renderScReadOnly() : renderHoleWizard(); }

// ── 읽기 전용(저장된 라운드 조회) — 전·후반 9홀을 리스트로 보여주기만 함 ──
function renderScReadOnly() {
  const h = getH(); const s = A.sc.half * 9; let html = '';
  for (let i = s; i < s + 9; i++) {
    const par = h[i], sc = A.sc.scores[i], gg = A.sc.gir[i], ff = A.sc.fir[i], pp = A.sc.putts[i], mm = A.sc.mulli[i] || 0, tpv = (A.sc.tp && A.sc.tp[i]) || 0;
    const c = sc ? cls(sc, par) : 'e'; const d = sc ? String(sc) : 'P';
    const teeLbl = mm ? '멀리건' : tpv === 2 ? 'OB' : tpv ? '해저드' : '티샷', teeCls = mm ? 'om' : tpv ? 'otp' : '';
    const firCell = par === 3 ? '<span class="htg" style="opacity:.3;cursor:default">·</span>' : `<span class="htg ${ff ? 'of' : ''}">FIR</span>`;
    html += `<div class="hr" onclick="holeDetail(${A.sc.eid},${i})" style="cursor:pointer"><div class="hl"><div class="hn">${(i % 9) + 1}</div><div class="hp">P${par}</div></div><div class="hrr"><div class="hc"><div class="hv ${c}">${d}</div></div><div class="ht">${firCell}<span class="htg ${gg ? 'og' : ''}">GIR</span><span class="htg ${pp > 0 ? 'op' : ''}">${pp}P</span><span class="htg ${teeCls}">${teeLbl}</span></div></div></div>`;
  }
  const box = Q('sc-body'); const keepTop = box ? box.scrollTop : 0;
  box.innerHTML = html;
  if (keepTop) box.scrollTop = keepTop;
  updFt();
}

// ════════════════════════════════════════
// 스코어 입력 — 한 홀씩 전체화면(위저드)
// 스코어는 직접 두드리지 않는다: "온그린까지 타수" + "퍼팅 수"를 입력하면
// 스코어(=온그린+퍼팅)·GIR(온그린 ≤ 파−2)이 저절로 계산된다.
// 티샷 결과는 순환 버튼이 아니라 나열된 선택지(페어웨이/러프/해저드/OB/멀리건) 중 하나를 고른다.
//  · 해저드/OB 구분은 A.sc.tp 값(1=해저드, 2=OB)으로 저장 — 통계(analyze())는 여전히 truthy만 보므로 기존 로직과 호환.
//  · 온그린 타수(A.sc.og)는 저장 스키마에 없다 — 라운드를 다시 열 때 scores−putts 로 역산해 복원한다(openSC 참고).
// ════════════════════════════════════════
// 티샷 선택 상태는 fir/mulli/tp 만으로는 되짚을 수 없다 — "러프"(fir:false,mulli:0,tp:0)와
// "아직 아무것도 안 고름"이 데이터상 완전히 같은 값이라, 러프를 골라도 칩이 켜진 티가 안 나던 버그가 있었다.
// 그래서 실제 선택 상태는 A.sc.teeSel 에 문자열로 직접 저장하고, fir/mulli/tp 는 그 결과로만 채운다(저장·통계 호환용).
function teeState(i) { return (A.sc.teeSel && A.sc.teeSel[i]) || null; }
function deriveTeeSel() {                          // 저장된 라운드를 다시 열 때 fir/mulli/tp(+miss)로부터 복원
  const h = getH();
  return Array.from({ length: 18 }, (_, i) => {
    if (A.sc.mulli[i]) return 'mull';
    const t = (A.sc.tp && A.sc.tp[i]) || 0;
    if (t === 2) return 'ob';
    if (t === 1) return 'hazard';
    if (A.sc.fir[i]) return 'fw';
    if (A.sc.miss && A.sc.miss[i]) return A.sc.miss[i];   // 러프/벙커 — v12.37+ 저장분만 구분 가능
    if (h[i] === 3 && A.sc.gir[i]) return 'green';        // 파3 온그린은 GIR(온그린까지 1타)로 추정 복원
    return null;                                    // 그 외(옛 기록의 파4·5 러프/벙커 등)는 구분 불가 — 미선택으로 되돌림(무해)
  });
}
function setTee(i, key) {
  if (A.sc.ro) return;
  if (key === 'fw' && getH()[i] === 3) return;   // 파3엔 페어웨이 개념 없음(직접 그린을 노림) — 러프는 파3도 놓친 결과라 허용
  if (key === 'green' && getH()[i] !== 3) return;                     // 온그린 칩은 파3 전용(파4·5는 온그린까지 숫자로 입력)
  if (!A.sc.teeSel) A.sc.teeSel = Array(18).fill(null);
  if (!A.sc.miss) A.sc.miss = Array(18).fill('');
  const next = A.sc.teeSel[i] === key ? null : key;                   // 같은 걸 다시 누르면 선택 해제
  A.sc.teeSel[i] = next;
  A.sc.fir[i] = next === 'fw';
  A.sc.mulli[i] = next === 'mull' ? 1 : 0;
  A.sc.tp[i] = next === 'ob' ? 2 : next === 'hazard' ? 1 : 0;
  A.sc.miss[i] = (next === 'rough' || next === 'bunker') ? next : '';   // 러프/벙커 구분 저장(페널티 계산엔 안 씀)
  renderSC(); autoSaveSC();
}
function recalcHole(i) {                          // 온그린·퍼팅이 확정된 홀만 스코어·GIR을 다시 계산
  const par = getH()[i], og = (A.sc.og && A.sc.og[i]) || 0;
  if (og > 0) { A.sc.scores[i] = og + (A.sc.putts[i] || 0); A.sc.gir[i] = og <= Math.max(1, par - 2); }
}
// 아직 입력 전(미조정) 홀은 미리보기 값이 항상 파와 같으므로, 그 값 그대로 원터치 확정한다.
function confirmPar(i) {
  if (A.sc.ro || A.sc.scores[i] > 0) return;
  if (!A.sc.og) A.sc.og = Array(18).fill(0);
  const par = getH()[i];
  A.sc.og[i] = Math.max(1, par - 2);
  A.sc.putts[i] = 2;
  recalcHole(i); renderSC(); autoSaveSC();
}
function ogAdj(i, d) {
  if (A.sc.ro) return;
  if (!A.sc.og) A.sc.og = Array(18).fill(0);
  if (!A.sc.og[i]) A.sc.og[i] = Math.max(1, getH()[i] - 2);          // 처음 누르면 기본값(파−2)에서 시작
  A.sc.og[i] = Math.max(1, Math.min(10, A.sc.og[i] + d));
  recalcHole(i); renderSC(); autoSaveSC();
}
function puttAdjW(i, d) {
  if (A.sc.ro) return;
  if (!A.sc.og) A.sc.og = Array(18).fill(0);
  if (!A.sc.og[i]) A.sc.og[i] = Math.max(1, getH()[i] - 2);          // 퍼팅만 먼저 만져도 스코어가 확정되게
  A.sc.putts[i] = Math.max(0, Math.min(10, (A.sc.putts[i] || 0) + d));
  recalcHole(i); renderSC(); autoSaveSC();
}
// ── 티샷 외(어프로치 등) 해저드·OB 횟수 — 티샷 칩(tp)과 별도로 세는 홀당 카운터. 스코어 계산엔 관여 안 함(이미 og에 반영된 타수임) ──
function xhzAdj(i, d) {
  if (A.sc.ro) return;
  if (!A.sc.xhz) A.sc.xhz = Array(18).fill(0);
  A.sc.xhz[i] = Math.max(0, Math.min(9, (A.sc.xhz[i] || 0) + d));
  renderSC(); autoSaveSC();
}
function xobAdj(i, d) {
  if (A.sc.ro) return;
  if (!A.sc.xob) A.sc.xob = Array(18).fill(0);
  A.sc.xob[i] = Math.max(0, Math.min(9, (A.sc.xob[i] || 0) + d));
  renderSC(); autoSaveSC();
}
// 스코어 입력 화면에서 이 홀의 파를 바로 바꾼다 — "⛳ 파수정"과 동일하게 공식 코스 데이터에도 반영(마스터와 다를 때만, best-effort).
async function setHolePar(i, p) {
  if (A.sc.ro) return;
  const c = A.sc.course; if (!c || c.layouts[i < 9 ? 0 : 1].holes[i < 9 ? i : i - 9] === p) return;
  const li = i < 9 ? 0 : 1, hi = i < 9 ? i : i - 9;
  const before = masterParsFor(c);
  c.layouts[li].holes[hi] = p;
  recalcHole(i); renderSC(); autoSaveSC();
  const res = await persistParsToOfficial(c, { [c.layouts[li].name]: c.layouts[li].holes.slice() });
  if (res.ok) {
    toast('✅ 공식 코스 파가 모두에게 반영됐어요');
    if (!A.isAdm && before && before[i] !== p) {
      callAPI(() => API.reportParChange(c.name, `${c.name} (${c.layouts[0].name}+${c.layouts[1].name}) · ${c.layouts[li].name} ${hi + 1}번 P${before[i]}→P${p} [반영됨]`));
    }
  } else if (res.ok === false) toast('⚠️ 이 라운드엔 적용됐지만 공유 저장 실패 (인터넷 확인)');
}
function hJump(i) { A.sc.hIdx = Math.max(0, Math.min(17, i)); A.sc.half = A.sc.hIdx < 9 ? 0 : 1; const box = Q('sc-body'); if (box) box.scrollTop = 0; renderSC(); }
function hGo(d) { hJump((A.sc.hIdx || 0) + d); }
// "저장·다음 홀"/"저장·완료" 버튼 — 아무것도 안 만지고 눌러도 파로 자동 확정 후 진행(confirmPar는 이미 입력된 홀엔 아무 일도 안 함)
function advanceHole(i) { confirmPar(i); if (i < 17) hGo(1); else saveRound(); }

function renderHoleWizard() {
  const i = A.sc.hIdx || 0, h = getH(), par = h[i];
  const entered = A.sc.scores[i] > 0;
  if (!A.sc.og) A.sc.og = Array(18).fill(0);
  const og = A.sc.og[i] || Math.max(1, par - 2);
  const putt = A.sc.putts[i] != null ? A.sc.putts[i] : 2;
  if (!A.sc.xhz) A.sc.xhz = Array(18).fill(0);
  if (!A.sc.xob) A.sc.xob = Array(18).fill(0);
  const xhz = A.sc.xhz[i] || 0, xob = A.sc.xob[i] || 0;
  const score = entered ? A.sc.scores[i] : og + putt;
  const d = score - par, cc = entered ? cls(score, par) : 'e';
  const ts = teeState(i);
  const chip = (key, lbl) => `<button class="lb ${ts === key ? 'on' : ''}" style="flex:1;min-width:64px;padding:10px 4px;font-size:13px" onclick="setTee(${i},'${key}')">${lbl}</button>`;
  const chips = (par === 3 ? [chip('green', '온그린'), chip('rough', '러프'), chip('bunker', '벙커')] : [chip('fw', '페어웨이'), chip('rough', '러프'), chip('bunker', '벙커')]).concat([chip('hazard', '해저드'), chip('ob', 'OB'), chip('mull', '멀리건')]);
  const parTab = p => `<button class="sg ${par === p ? 'on' : ''}" onclick="setHolePar(${i},${p})">파${p}</button>`;
  const holeCell = idx => { const on = idx === i, done = A.sc.scores[idx] > 0;
    return `<button onclick="hJump(${idx})" style="flex:1;height:38px;min-width:0;border:none;border-radius:9px;cursor:pointer;font-size:13px;
      background:${on ? 'var(--g)' : done ? '#48484a' : 'var(--bg3)'};color:${on ? '#000' : done ? 'var(--t)' : 'var(--t3)'};font-weight:${on ? '800' : '600'}">${idx + 1}</button>`; };
  const holeRow = half => `<div style="display:flex;gap:4px;flex:1">${Array.from({ length: 9 }, (_, k) => holeCell(half * 9 + k)).join('')}</div>`;

  Q('sc-body').innerHTML = `
    <div style="padding:6px 4px 16px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">${holeRow(0)}<span style="font-size:10px;color:var(--t3);flex-shrink:0;width:20px">전반</span></div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:16px">${holeRow(1)}<span style="font-size:10px;color:var(--t3);flex-shrink:0;width:20px">후반</span></div>
      <div style="text-align:center;margin-bottom:14px">
        <div style="font-size:38px;font-weight:800;color:var(--t);line-height:1.1">${(i % 9) + 1}<span style="font-size:16px;font-weight:700;color:var(--t2)">번 홀</span></div>
        <div style="font-size:12px;color:var(--t3);margin-top:2px">${A.sc.course.layouts[i < 9 ? 0 : 1].name}</div>
      </div>
      <div class="seg" style="margin-bottom:14px">${parTab(3)}${parTab(4)}${parTab(5)}</div>
      <div style="font-size:12px;color:var(--t2);margin-bottom:6px">⛳ 티샷 결과</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">${chips.join('')}</div>
      <div style="display:flex;gap:10px;margin-bottom:14px">
        <div style="flex:1;text-align:center;background:var(--bg2);border-radius:14px;padding:14px 8px">
          <div style="font-size:12px;color:var(--t2);margin-bottom:8px">온그린까지</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:10px">
            <button class="hb" onclick="ogAdj(${i},-1)">${SM}</button>
            <div style="width:34px;font-size:22px;font-weight:700;text-align:center;color:var(--t)">${og}</div>
            <button class="hb" onclick="ogAdj(${i},1)">${SP}</button>
          </div>
          <div style="font-size:11px;color:var(--t3);margin-top:6px">타수</div>
        </div>
        <div style="flex:1;text-align:center;background:var(--bg2);border-radius:14px;padding:14px 8px">
          <div style="font-size:12px;color:var(--t2);margin-bottom:8px">퍼팅</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:10px">
            <button class="hb" onclick="puttAdjW(${i},-1)">${SM}</button>
            <div style="width:34px;font-size:22px;font-weight:700;text-align:center;color:var(--t)">${putt}</div>
            <button class="hb" onclick="puttAdjW(${i},1)">${SP}</button>
          </div>
          <div style="font-size:11px;color:var(--t3);margin-top:6px">수</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:14px">
        <div style="flex:1;text-align:center;background:var(--bg2);border-radius:14px;padding:10px 8px">
          <div style="font-size:11px;color:var(--t2);margin-bottom:6px">🌊 티샷 외 해저드</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:8px">
            <button class="hb" onclick="xhzAdj(${i},-1)">${SM}</button>
            <div style="width:26px;font-size:17px;font-weight:700;text-align:center;color:var(--t)">${xhz}</div>
            <button class="hb" onclick="xhzAdj(${i},1)">${SP}</button>
          </div>
        </div>
        <div style="flex:1;text-align:center;background:var(--bg2);border-radius:14px;padding:10px 8px">
          <div style="font-size:11px;color:var(--t2);margin-bottom:6px">🚫 티샷 외 OB</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:8px">
            <button class="hb" onclick="xobAdj(${i},-1)">${SM}</button>
            <div style="width:26px;font-size:17px;font-weight:700;text-align:center;color:var(--t)">${xob}</div>
            <button class="hb" onclick="xobAdj(${i},1)">${SP}</button>
          </div>
        </div>
      </div>
      <div style="font-size:10px;color:var(--t3);margin:-10px 2px 10px;line-height:1.5">💡 티샷(첫 샷)이 아닌 다른 샷에서 해저드·OB가 났을 때만 여기에 횟수를 더하세요. 스코어에는 영향이 없어요(이미 "온그린까지 타수"에 포함돼 있어요) — 원인 분석용 기록입니다.</div>
      <div class="${entered ? cc : ''}" style="border-radius:14px;padding:14px;text-align:center;margin-bottom:18px${entered ? '' : ';cursor:pointer;background:#0d2e1a;border:1.5px dashed var(--g)'}"${entered ? '' : ` onclick="confirmPar(${i})"`}>
        <div style="font-size:18px;font-weight:800;${entered ? '' : 'color:var(--g)'}">${entered ? scoreLabel(d, score) : '👆 입력 전'}</div>
        <div style="font-size:13px;margin-top:3px;${entered ? 'opacity:.85' : 'color:var(--g);font-weight:800'}">${entered ? `${vsL(d)} · 총 ${score}타` : `탭 한 번으로 파(${par}) 입력!`}</div>
      </div>
      <div style="display:flex;gap:8px">
        ${i > 0 ? `<button onclick="hGo(-1)" style="flex:0 0 108px;background:var(--bg3);border:1.5px solid #6a6a6e;border-radius:12px;color:var(--t);font-size:14px;font-weight:700;cursor:pointer">◀ 이전 홀</button>` : ''}
        <button onclick="advanceHole(${i})" style="flex:1;background:var(--g);border:none;border-radius:12px;padding:13px;color:#000;font-size:15px;font-weight:800;cursor:pointer">${i < 17 ? '저장 · 다음 홀 →' : '저장 · 완료'}</button>
      </div>
    </div>`;
  updFt();
  const done = A.sc.scores.every(x => x > 0); const b = Q('sv'); b.className = done ? 'sv done' : 'sv'; b.textContent = done ? '✓ 완료' : '저장'; b.disabled = false;
}
function swHalf(n, el) {
  A.sc.half = n; document.querySelectorAll('#sc-seg .sg').forEach(b => b.classList.remove('on')); el.classList.add('on');
  if (!A.sc.ro) A.sc.hIdx = n * 9;                         // 입력 화면(위저드)에서는 그 나인의 첫 홀로 이동
  const box = Q('sc-body'); if (box) box.scrollTop = 0;   // 다른 나인으로 바꿨으니 첫 홀부터 보여줌
  renderSC();
}
function updFt() {
  const h = getH(); const pl = A.sc.scores.filter(x => x > 0);
  const tot = pl.reduce((a, b) => a + b, 0), ps = h.slice(0, pl.length).reduce((a, b) => a + b, 0), vs = tot - ps;
  Q('f-tot').textContent = tot || '-'; const ve = Q('f-vs'); ve.textContent = pl.length ? vsL(vs) : '-'; ve.className = 'fv ' + (vs > 0 ? 'r' : vs < 0 ? 'g' : '');
  Q('f-g').textContent = A.sc.gir.filter(Boolean).length; Q('f-p').textContent = A.sc.putts.reduce((a, b) => a + b, 0);
  const mc = A.sc.mulli.reduce((a, b) => a + (b ? 1 : 0), 0), tc = (A.sc.tp || []).reduce((a, b) => a + (b ? 1 : 0), 0);
  Q('f-m').textContent = (mc || tc) ? `${mc}/${tc}` : '-';
}
// ── 홀 상세: 라운드의 한 홀에 내가 기록한 값(점수·FIR·GIR·퍼팅·티샷 사고)을 보여준다 ──
// 진입: 라운드 상세 모달의 "홀별 스코어" 격자, 그리고 읽기 전용 스코어카드의 홀 행.
function holeDetail(id, i) {
  const r = A.rounds.find(x => x.id === id); if (!r) return;
  const hp = roundPars(r);
  const par = hp[i] || 4, sc = (r.scores || [])[i] || 0;
  const gg = (r.girArr || [])[i], ff = (r.firArr || [])[i], pp = (r.puttsArr || [])[i] || 0;
  const mm = (r.mulliArr || [])[i] || 0, tpv = (r.tpArr || [])[i] || 0;
  const d = sc - par;
  const name = !sc ? '미입력' : scoreLabel(d, sc);
  const row = (k, v) => `<div class="hd-row"><span style="color:var(--t2)">${k}</span><span>${v}</span></div>`;
  const firRow = par === 3
    ? row('🚗 티샷 (FIR)', '<span style="color:var(--t3)">파3 · 해당 없음</span>')
    : row('🚗 티샷 (FIR)', ff ? '<b style="color:#ffd060">페어웨이 ⭕</b>' : '<span style="color:var(--t2)">놓침 ❌</span>');
  const girRow = row('🎯 그린 (GIR)', gg ? '<b style="color:#7dd4ff">온그린 ⭕</b>' : '<span style="color:var(--t2)">놓침 ❌</span>');
  const puttRow = row('🍩 퍼팅 수', `<b>${pp}</b>퍼팅${pp >= 3 ? ' <span style="color:var(--a)">(3퍼팅↑)</span>' : ''}`);
  const teeTxt = mm ? '<b style="color:#ffcc80">멀리건 (다시 침 · 벌타 없음)</b>'
    : tpv === 2 ? '<b style="color:#ff8a80">OB (스코어에 벌타 포함됨)</b>'
    : tpv ? '<b style="color:#ff8a80">해저드 (스코어에 벌타 포함됨)</b>'
    : (par !== 3 && !ff) ? '<span style="color:var(--t3)">러프/벙커 (사고 없음)</span>' : '<span style="color:var(--t3)">사고 없음</span>';
  const teeRow = row('⛳ 티샷 사고', teeTxt);
  Q('hd-t').textContent = `${i + 1}번 홀 · 파${par}`;
  Q('hd-body').innerHTML = `
    <div style="text-align:center;margin-bottom:16px">
      <div class="hv ${sc ? cls(sc, par) : 'e'}" style="margin:0 auto 8px">${sc || '-'}</div>
      <div style="font-size:15px;font-weight:700;color:var(--t)">${name}${sc ? ` · 오버파 ${vsL(d)}` : ''}</div>
    </div>
    <div class="hd-card">${firRow}${girRow}${puttRow}${teeRow}</div>`;
  om('m-hd');
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
  t += `\n총타수 ${r.score} (오버파 ${vsL(r.vs)})\n\n`;
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
  // 카드: 누구나 쓰는 ✏️ 수정 버튼을 카드 안에 항상 노출(코스 전체 수정 → 공식맵 공유).
  //       삭제(파괴적)는 기존대로 관리자만 왼쪽 슬라이드로 나옴.
  const card = c => `<div class="cc-wrap">
    ${A.isAdm ? `<div class="cc-del"><button onclick="delCourse('${c.id || c.name}')">🗑 삭제</button></div>` : ''}
    <div class="cc">
      <div class="cc-info" onclick="selCourse('${c.id || c.name}')">
        <div class="cc-name">${c.name}</div>
        <div class="cc-sub">${c.addr || ''} · ${(c.layouts || []).map(l => l.name).join('/')} · 파${(c.layouts || []).flatMap(l => l.holes || []).reduce((a, b) => a + b, 0)}</div>
      </div>
      <button onclick="openEditCourse('${c.id || c.name}')" title="코스 수정" style="flex-shrink:0;background:var(--bg3);border:1.5px solid #6a6a6e;border-radius:8px;color:var(--t);font-size:13px;font-weight:600;cursor:pointer;padding:6px 12px;white-space:nowrap">수정</button>
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

// 코스 선택(조합) 모달을 열 때 홀파 수정값을 항상 초기화한다.
// selCourse 말고 "새 골프장 등록 직후"(submitCourseForm)에서도 열리는데, 그 경로엔 초기화가 없어서
// 직전 코스에서 만진 holeEdits 가 남아 있다가 이름이 같은 나인이 있으면 새 코스에 잘못 반영될 수 있었다.
function openHoleMdl(c) { A.sc.holeEdits = {}; Q('m-hl-t').textContent = c.name; renderHolePkr(c, 0, 1); om('m-hl'); }
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
  // picker에서 조정한 홀별 파를 이번 라운드에 적용하고, 공식맵(모두 공유)에도 반영한다.
  const src = A.sc.course; const [s0, s1] = A.sc.li;
  const pars = Array.from({ length: 18 }, (_, i) => { const el = Q('hp-' + i); return el ? parseInt(el.textContent) : (i < 9 ? src.layouts[s0].holes[i] : src.layouts[s1].holes[i - 9]); });
  // 공식맵에 반영할 수정분: picker에서 만진 모든 레이아웃(holeEdits) + 지금 화면의 2개 (이름 키)
  const edits = Object.assign({}, A.sc.holeEdits || {});
  edits[src.layouts[s0].name] = pars.slice(0, 9);
  edits[src.layouts[s1].name] = pars.slice(9, 18);
  const clone = { id: src.id, name: src.name, addr: src.addr, status: src.status,
    layouts: [ { name: src.layouts[s0].name, holes: pars.slice(0, 9) }, { name: src.layouts[s1].name, holes: pars.slice(9, 18) } ] };
  A.sc.course = clone; A.sc.li = [0, 1];

  A.sc.scores = Array(18).fill(0); A.sc.putts = Array(18).fill(2); A.sc.og = Array(18).fill(0);
  A.sc.gir = Array(18).fill(false); A.sc.fir = Array(18).fill(false); A.sc.mulli = Array(18).fill(0); A.sc.tp = Array(18).fill(0); A.sc.teeSel = Array(18).fill(null); A.sc.miss = Array(18).fill('');
  A.sc.xhz = Array(18).fill(0); A.sc.xob = Array(18).fill(0);
  A.sc.eid = null; A.sc.ro = false; A.sc.half = 0; A.sc.hIdx = 0;
  const c = A.sc.course; const [l0, l1] = A.sc.li; const par = getH().reduce((a, b) => a + b, 0);
  Q('sc-t').textContent = c.name; Q('sc-s').textContent = `${A.sc.date} · ${c.layouts[l0].name}+${c.layouts[l1].name} · 파${par}`;
  Q('sc-seg').innerHTML = `<button class="sg on" onclick="swHalf(0,this)">${c.layouts[l0].name} (1-9)</button><button class="sg" onclick="swHalf(1,this)">${c.layouts[l1].name} (10-18)</button>`;
  Q('sc-bnr').innerHTML = '';
  const eb = Q('sc-edit-holes'); if (eb) eb.style.display = 'block';
  clearTimeout(_asTimer); _asTimer = null; setSaveHint('');   // 새 라운드 시작 — 자동저장 상태 초기화
  { const box = Q('sc-body'); if (box) box.scrollTop = 0; }   // 새 라운드는 첫 홀부터
  cm('m-hl'); renderSC(); showPg('sc');

  // 공식맵(모두 공유) 반영은 백그라운드로 — 스코어카드 진입을 막지 않음. 마스터와 다를 때만 저장.
  persistParsToOfficial(src, edits).then(res => {
    if (res.ok) toast('✅ 공식 코스 파가 모두에게 반영됐어요');
    else if (res.ok === false) toast('⚠️ 공유 저장 실패 — 이 라운드엔 적용됨 (인터넷 확인)');
  });
}

// ── 라운드 도중 "코스 수정" (홀별 파만) · 이 라운드 + 공식맵(모두 공유)에 함께 반영 ──
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

// ── 홀파 수정 → 공식맵(마스터)에 병합 저장 → 모두 공유 ──
// 핵심: A.sc.course 는 선택한 2개 레이아웃만 가진 "클론"이라 그대로 보내면
//       나머지 나인이 삭제된다. 반드시 마스터 "전체 코스"를 찾아 해당 레이아웃의
//       holes 만 이름 매칭으로 갈아끼운 뒤 저장한다. (best-effort: 실패해도 라운드는 진행)
// edits: { 레이아웃이름: [9홀 파], ... }
// 반환: { ok:true } 저장됨 / { ok:false } 서버실패 / { unchanged } 마스터와 동일 / { skipped } 공식맵에 없음
async function persistParsToOfficial(course, edits) {
  const mi = A.official.findIndex(x => x.id === course.id || x.name === course.name);
  if (mi < 0) return { skipped: true };                       // 공식맵에 없는 코스 → 건너뜀
  const master = A.official[mi];
  const newLayouts = master.layouts.map(l => ({ ...l, holes: (l.holes || []).slice() }));
  let changed = false;
  Object.keys(edits || {}).forEach(name => {
    const np = edits[name]; if (!np || np.length !== 9) return;
    const ly = newLayouts.find(l => l.name === name); if (!ly) return;   // 이름으로 해당 나인만 갱신
    if (ly.holes.length !== 9 || ly.holes.some((p, i) => p !== np[i])) { ly.holes = np.slice(); changed = true; }
  });
  if (!changed) return { unchanged: true };                   // 마스터와 같으면 저장 안 함(불필요한 덮어쓰기 방지)
  const updated = { ...master, layouts: newLayouts };
  const r = await callAPI(() => API.saveCourse(updated, true, master.name));   // 전체 코스를 수정 저장
  if (!r.ok) return { ok: false, err: r };
  A.official[mi] = updated;                                   // 로컬 공식맵 즉시 갱신
  try {                                                       // 콜드 스타트용 캐시도 갱신
    const cache = JSON.parse(localStorage.getItem('og_cache') || 'null') || {};
    cache.official = A.official; localStorage.setItem('og_cache', JSON.stringify(cache));
  } catch (e) {}
  return { ok: true };
}

async function applyEditHoles() {
  const newPars = Array.from({ length: 18 }, (_, i) => parseInt(Q('eh-' + i).textContent));
  const c = A.sc.course;
  const before = masterParsFor(c);          // 변경 전 공식 파 (감사 로그 diff 기준 — 저장 전에 떠둔다)
  // ① 이 라운드 클론에 즉시 반영 (입력 화면은 곧바로 갱신)
  c.layouts[0].holes = newPars.slice(0, 9);
  c.layouts[1].holes = newPars.slice(9, 18);
  cm('m-edh'); renderSC(); autoSaveSC();     // 홀 파가 바뀌면 이 라운드의 박제 파도 다시 저장

  // ② 공식맵(모두 공유)에도 반영 — best-effort. 실패해도 이 라운드 입력은 계속 가능.
  const edits = { [c.layouts[0].name]: newPars.slice(0, 9), [c.layouts[1].name]: newPars.slice(9, 18) };
  const res = await persistParsToOfficial(c, edits);
  if (res.ok) toast('✅ 공식 코스 파가 모두에게 반영됐어요');
  else if (res.ok === false) toast('⚠️ 이 라운드엔 적용됐지만 공유 저장 실패 (인터넷 확인)');
  else toast('✅ 이 라운드의 홀 파가 수정됐어요');               // unchanged / skipped

  // ③ 감사 로그: 누가 무엇을 바꿨는지 관리자에게 기록 (이제 실제로 공식맵에 반영됨)
  if (!A.isAdm && before && res.ok) {
    const lname = i => (i < 9 ? c.layouts[0].name : c.layouts[1].name);   // 홀이 속한 레이아웃 이름
    const diff = [];
    newPars.forEach((p, i) => { if (p !== before[i]) diff.push(`${lname(i)} ${(i % 9) + 1}번 P${before[i]}→P${p}`); });
    if (diff.length) {
      const combo = `${c.layouts[0].name}+${c.layouts[1].name}`;          // 어느 구성(코스 조합)
      const detail = `${c.name} (${combo}) · ${diff.slice(0, 4).join(', ')}${diff.length > 4 ? ` 외 ${diff.length - 4}곳` : ''} [반영됨]`;
      callAPI(() => API.reportParChange(c.name, detail));
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
  // 골프장 이름 중복 금지 — 코스를 이름으로 찾는 곳(파 저장·삭제)이 있어서, 이름이 겹치면
  // 엉뚱한 코스의 파가 덮어써지거나 삭제될 수 있다. (수정 중 자기 자신은 제외)
  const dupCourse = A.official.find(x => x.name === name && !(eid && (x.id === eid || x.name === _editOldName)));
  if (dupCourse) {
    toast('⚠️ 같은 이름의 골프장이 이미 있어요');
    const el = Q('cs-n'); if (el) { el.focus(); el.style.borderColor = 'var(--r)'; el.addEventListener('input', () => el.style.borderColor = '', { once: true }); }
    return;
  }
  const layouts = [];
  secs.forEach(s => { const uid = s.id.replace('cs-s-', ''); const n = s.querySelector('.cs-name').value.trim() || '코스'; const hn = s.querySelector('.cs-hn').value || '9'; layouts.push({ name: n, holes: gp(uid, hn) }); });
  // 한 골프장 안에서 코스(나인) 이름 중복 금지 — 파 저장이 이름으로 나인을 찾으므로,
  // 같은 이름이 둘이면 두 번째 나인의 수정이 조용히 무시된다.
  const dupLy = layouts.map(l => l.name).find((n, i, arr) => arr.indexOf(n) !== i);
  if (dupLy) { toast(`⚠️ 코스 이름이 겹쳐요: "${dupLy}" — 서로 다르게 지어주세요`); return; }

  const c = { id: eid || ('c' + Date.now()), name, addr: Q('cs-a').value.trim(), layouts, status: 'official' };
  const btn = Q('m-cs-btn'); btn.disabled = true; btn.textContent = '저장 중...';
  const r = await callAPI(() => API.saveCourse(c, isEdit, _editOldName));
  btn.disabled = false; btn.textContent = isEdit ? '✅ 수정 저장' : '등록 후 스코어카드 시작';

  if (!r.ok) { const e = explainError(r); toast('❌ ' + e.msg); return; }

  // 로컬 목록 갱신
  if (isEdit) {
    // id 우선 매칭 — 이름으로만 찾으면(예전 `x.name === name` 조건) 개명 시 동명의 "다른 코스"를 덮어쓸 수 있었다.
    const i = A.official.findIndex(x => (c.id && x.id === c.id) || x.name === _editOldName);
    if (i >= 0) A.official[i] = { ...c }; else A.official.unshift({ ...c });
    toast('✅ 수정됐어요: ' + name); cm('m-cs'); renderCourses();
    if (A.isAdm && _admOffLoaded) renderAdmOfficial();   // 마지막으로 보던 목록(검색어·펼침 상태) 유지
  } else {
    A.official.unshift({ ...c });
    cm('m-cs'); toast('✅ 등록됐어요: ' + name);
    A.sc.course = c; openHoleMdl(c);   // 바로 스코어카드로
  }
}

async function delCourse(key) {                  // 관리자만 호출 (버튼이 관리자에게만 보임)
  const c = A.official.find(x => x.id === key || x.name === key);
  const name = c ? c.name : key;
  if (!confirm(`"${name}" 골프장을 삭제할까요? 목록에서 영구 삭제됩니다.`)) return;
  const r = await callAPI(() => API.deleteCourse(name));
  // 로컬 삭제는 id 로 정확히 한 개만 — 이름으로 지우면 동명의 다른 코스까지 함께 사라진다.
  if (r.ok) { A.official = A.official.filter(x => (c && c.id) ? x.id !== c.id : x.name !== name); renderCourses(); if (A.isAdm && _admOffLoaded) renderAdmOfficial(); toast('✅ 삭제 완료'); }   // 마지막으로 보던 목록 유지
  else { const e = explainError(r); toast('❌ ' + e.msg); }
}

// ════════════════════════════════════════
// 통계 (서버 없이 라운드 기록으로 즉시 계산)
// ════════════════════════════════════════
function statCard(n, u, l) { return `<div class="sc"><span class="sn">${n}${u ? `<span class="su">${u}</span>` : ''}</span><span class="sl">${l}</span></div>`; }

// ── 5구간(티샷 안정성·드라이버·아이언·숏게임·퍼팅) 통합 집계 ──
// 라운드 상세 · 통계 화면이 함께 쓰는 단일 소스. rounds 묶음 하나를 18홀씩 한 번만 훑어
// 아래 teeStabilityHTML/driverHTML/approachHTML/shortGameHTML/puttingHTML 이 필요로 하는 값을 전부 계산한다.
function analyze(rounds) {
  rounds = (rounds || []).filter(r => !r.isDraft);
  const n = rounds.length;
  let played = 0,
      obCount = 0, hzCount = 0, mullCount = 0, safeMissCount = 0, fwCount = 0,  // 1) 티샷 안정성(전체, 파3~5)
      roughCount = 0, bunkerCount = 0,                                // 러프/벙커 구분(v12.37+ 저장분만)
      par45 = 0, fwHit = 0, fwHitVs = 0, fwMiss = 0, fwMissVs = 0, teeLost = 0,   // 2) 드라이버(파4·5)
      girHit = 0, girHoles = 0, ironExcessSum = 0, ironPenaltySum = 0, // 3) 아이언(GIR) — ironPenaltySum: 그중 "티샷 외" 벌타(해저드·OB) 몫
      xPenHoles = 0,                                                   // 티샷 외 벌타가 한 번이라도 있었던 홀 수(표본 안내용)
      p4n = 0, p4Bad = 0, p4FwHitN = 0, p4FwHitBad = 0, p4FwMissN = 0, p4FwMissBad = 0,  // 어프로치 낭비(파4)
      missGreen = 0, scrSave = 0, missLossSum = 0,                     // 4) 숏게임(스크램블)
      puttSum = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0, girPuttSum = 0, girPuttN = 0, puttExcessSum = 0;  // 5) 퍼팅(1/2/3/4+ 분포)
  rounds.forEach(r => {
    const hh = roundPars(r);
    const sc = r.scores || [], pa = r.puttsArr || [], gi = r.girArr || [], fi = r.firArr || [], mu = r.mulliArr || [], tpa = r.tpArr || [], mi = r.missArr || [];
    const xh = r.xhzArr || [], xo = r.xobArr || [];   // 티샷 외(어프로치 등) 해저드·OB 횟수 — 최근 입력분만 있을 수 있음
    for (let i = 0; i < 18; i++) {
      const s = sc[i]; if (!s || s <= 0) continue;        // 미입력 홀 스킵
      played++;
      const par = hh[i] || 4, mull = mu[i] || 0, tpv = tpa[i] || 0, putt = pa[i] || 0, missT = mi[i] || '', d = s - par, og = s - putt;

      // ── 1) 티샷 안정성: 페널티(OB·해저드) / 멀리건 / 안전 미스(러프·벙커) 분류 (파3~5 모두) ──
      if (tpv === 2) obCount++;
      else if (tpv === 1) hzCount++;
      else if (mull) mullCount++;
      else {
        const success = par === 3 ? gi[i] : fi[i];        // 파3=온그린(GIR), 파4·5=페어웨이
        if (success) fwCount++;
        else {
          safeMissCount++;
          if (missT === 'rough') roughCount++; else if (missT === 'bunker') bunkerCount++;
        }
      }

      // ── 2) 드라이버(파4·5만): 페어웨이 지킨/놓친 홀의 오버파 평균 차이로 손실 타수 추정 ──
      if (par > 3) {
        par45++;
        if (mull || tpv) teeLost++;
        if (fi[i] && !mull && !tpv) { fwHit++; fwHitVs += d; } else { fwMiss++; fwMissVs += d; }
      }

      // ── 3) 아이언(GIR) + 어프로치 낭비(파4 기준 온그린 3타↑) ──
      girHoles++; if (gi[i]) girHit++;
      const holeExcess = Math.max(0, og - (par - 2));     // 정규타수(파−2) 초과분
      ironExcessSum += holeExcess;
      const holePenalty = (xo[i] || 0) * 2 + (xh[i] || 0);   // 티샷 외 벌타 추정 타수(OB=2타·해저드=1타)
      if (holePenalty > 0) { xPenHoles++; ironPenaltySum += Math.min(holeExcess, holePenalty); }   // 아이언 손실 중 "벌타" 몫만(초과분을 넘지 않게)
      if (par === 4) {
        p4n++; const bad = og >= 3;
        if (bad) p4Bad++;
        if (fi[i] && !mull && !tpv) { p4FwHitN++; if (bad) p4FwHitBad++; } else { p4FwMissN++; if (bad) p4FwMissBad++; }
      }

      // ── 4) 숏게임(스크램블링): 그린 놓친 홀 중 파 이하로 막은 비율 ──
      if (!gi[i]) { missGreen++; if (s <= par) scrSave++; else missLossSum += d; }

      // ── 5) 퍼팅 (1/2/3/4+ 분포) ──
      puttSum += putt;
      if (putt <= 1) p1++; else if (putt === 2) p2++; else if (putt === 3) p3++; else p4++;
      if (gi[i]) { girPuttSum += putt; girPuttN++; }
      puttExcessSum += Math.max(0, putt - 2);
    }
  });
  const f1 = (a, b) => b ? a / b : 0, pct = (a, b) => b ? Math.round(a / b * 100) : 0;

  // 1) 티샷 안정성
  const teePenaltyPct = pct(obCount + hzCount, played);
  const safeMissPct = pct(safeMissCount, played);
  const missKnownCount = roughCount + bunkerCount;

  // 2) 드라이버 — 페어웨이 놓친 홀의 오버파 평균 − 지킨 홀의 오버파 평균 = 티샷 1개당 손해 타수
  const firPct = pct(fwHit, par45);
  const fwHitVsAvg = f1(fwHitVs, fwHit), fwMissVsAvg = f1(fwMissVs, fwMiss);
  const teeCost = (fwHit && fwMiss) ? (fwMissVsAvg - fwHitVsAvg) : 0;
  const teeCostRound = teeCost > 0 ? teeCost * f1(fwMiss, n) : 0;
  const teeCostOk = fwHit >= 5 && fwMiss >= 5;            // 표본이 너무 적으면 숫자를 못 믿는다
  const teeLostPer = f1(teeLost, n);

  // 3) 아이언 + 어프로치 낭비
  const girPct = pct(girHit, girHoles);
  const ironLossRound = f1(ironExcessSum, n);
  const ironPenaltyLossRound = f1(ironPenaltySum, n);     // 아이언 손실 중 "티샷 외 벌타" 몫(입력한 홀이 있을 때만 의미 있음)
  const ironOtherLossRound = Math.max(0, ironLossRound - ironPenaltyLossRound);   // 나머지(거리감·클럽 선택 등)
  const p4BadPct = pct(p4Bad, p4n), p4FwHitBadPct = pct(p4FwHitBad, p4FwHitN), p4FwMissBadPct = pct(p4FwMissBad, p4FwMissN);

  // 4) 숏게임
  const scrPct = missGreen ? pct(scrSave, missGreen) : null;
  const shortLossRound = f1(missLossSum, n);

  // 5) 퍼팅
  const threePutt = p3 + p4;
  const puttAvg = f1(puttSum, n), puttPerHole = f1(puttSum, played), threeAvg = f1(threePutt, n);
  const threePct = pct(threePutt, played), onePuttPct = pct(p1, played);
  const girPuttAvg = girPuttN ? f1(girPuttSum, girPuttN) : null;
  const puttLossRound = f1(puttExcessSum, n);

  return { n, played,
    obCount, hzCount, mullCount, safeMissCount, safeMissPct, teePenaltyPct, roughCount, bunkerCount, missKnownCount, fwCount,
    par45, firPct, teeCostRound, teeCostOk, teeLostPer,
    girPct, ironLossRound, ironPenaltyLossRound, ironOtherLossRound, xPenHoles, p4n, p4BadPct, p4FwHitN, p4FwHitBadPct, p4FwMissN, p4FwMissBadPct,
    missGreen, scrPct, shortLossRound,
    puttAvg, puttPerHole, threeAvg, threePct, onePuttPct, girPuttAvg, puttLossRound, p1, p2, p3, p4 };
}

// ── 손실타수 한눈에 보기: 드라이버·아이언웨지·숏게임·퍼팅 손실 타수(라운드 평균)를 같은 단위로 놓고 큰 순서로 비교 ──
// (통계 화면 전용 — 여러 라운드를 모아야 드라이버 손실의 표본 조건(지킨/놓친 각 5홀↑)이 충족될 가능성이 높다)
function lossSummaryHTML(a) {
  if (!a.n) return '';
  const driverApprox = !a.teeCostOk;
  const driverV = a.teeCostOk ? a.teeCostRound : (a.obCount * 2 + a.hzCount) / a.n;   // 표본 부족하면 OB·해저드 페널티 타수로 대체 추정
  const items = [
    ['🚗 드라이버', driverV, 'var(--r)', driverApprox],
    ['🎯 아이언·웨지', a.ironLossRound, 'var(--a)', false],
    ['⛳ 숏게임', a.shortLossRound, 'var(--b)', false],
    ['🍩 퍼팅', a.puttLossRound, 'var(--p)', false],
  ].sort((x, y) => y[1] - x[1]);
  const mx = Math.max(...items.map(x => x[1]), 0.01);
  const body = items.map(([l, v, co, approx]) => `<div class="br"><div class="bl" style="width:80px;white-space:nowrap">${l}${approx ? '*' : ''}</div><div class="bt"><div class="bf" style="width:${Math.max(4, Math.round(v / mx * 100))}%;background:${co}"><span>${nf(v)}타</span></div></div></div>`).join('');
  const worst = items[0];
  return `<div class="lbl">📉 손실타수 한눈에 보기 (라운드 평균)</div><div class="cb">${body}
    <div style="font-size:10px;color:var(--t3);line-height:1.55;margin-top:8px">네 구간의 손실 타수를 같은 기준(라운드당 타수)으로 비교해 큰 순서로 나열했어요. <b style="color:var(--t2)">가장 크게 새는 곳: ${worst[0]}</b>${items.some(x => x[3]) ? ' · * 표본이 적어 OB·해저드 페널티로 추정한 값이에요' : ''}</div></div>`;
}
// ════════════════════════════════════════
// 5구간 카테고리 카드 (라운드 상세 · 통계 화면 공용 — analyze() 결과 하나로 5개를 그린다)
// ════════════════════════════════════════
function teeStabilityHTML(a) {
  if (!a.n) return '';
  const known = a.missKnownCount, unknown = Math.max(0, a.safeMissCount - known);
  const breakdown = known
    ? `러프 ${a.roughCount}개 · 벙커 ${a.bunkerCount}개${unknown ? ` · 미상 ${unknown}개(v12.37 이전 기록)` : ''}`
    : (a.safeMissCount ? '러프/벙커 구분 정보 없음(v12.37 이전 기록)' : '');
  const segs = [
    { v: a.fwCount, c: 'var(--g)', l: '페어웨이(온그린)' },
    { v: a.roughCount, c: 'var(--a)', l: '러프' },
    { v: a.bunkerCount, c: 'var(--p)', l: '벙커' },
    { v: a.hzCount, c: 'var(--b)', l: '해저드' },
    { v: a.obCount, c: 'var(--r)', l: 'OB' },
  ];
  const pieTotal = segs.reduce((s, x) => s + x.v, 0);
  const legend = segs.map(s => `<div style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--t2);margin:4px 0">
    <span style="width:10px;height:10px;border-radius:3px;background:${s.c};flex-shrink:0"></span>
    <span style="flex:1">${s.l}</span><b style="color:var(--t)">${s.v}개${pieTotal ? ` (${Math.round(s.v / pieTotal * 100)}%)` : ''}</b></div>`).join('');
  const pie = pieTotal ? `<div class="cb" style="display:flex;align-items:center;gap:16px">${donutSVG(segs, 108, 18)}<div style="flex:1">${legend}</div></div>` : '';
  return `<div class="lbl">🚩 티샷 안정성 (Off-the-Tee · 파3~5 모두)</div><div class="sgd">
    ${statCard(a.teePenaltyPct, '%', '티샷 페널티율')}
    ${statCard(a.obCount, '', 'OB')}
    ${statCard(a.hzCount, '', '해저드')}
    ${statCard(a.mullCount, '', '멀리건')}</div>
  ${pie}
  <div class="cb" style="font-size:12px;color:var(--t2);line-height:1.6;${pie ? 'margin-top:8px' : ''}">안전 미스(러프·벙커, 페널티 없음) <b style="color:var(--t)">${a.safeMissCount}개 (${a.safeMissPct}%)</b>${breakdown ? `<br><span style="font-size:11px;color:var(--t3)">${breakdown}</span>` : ''}</div>`;
}
function driverHTML(a) {
  if (!a.n || !a.par45) return '';
  const lossTxt = a.teeCostOk ? `${nf(a.teeCostRound)}타/R` : `${nf(a.teeLostPer)}홀/R`;
  return `<div class="lbl">🚗 드라이버 안정성 (Driver · 파4·5)</div><div class="sgd">
    ${statCard(a.firPct, '%', 'FIR')}
    ${statCard(lossTxt, '', '드라이버 손실')}</div>
  <div style="font-size:10px;color:var(--t3);margin:-6px 2px 4px">💡 드라이버 손실 = 페어웨이 놓친 홀과 지킨 홀의 오버파 평균 차이 × 라운드당 놓친 홀 수${a.teeCostOk ? '' : ' (표본이 적어 OB·해저드 홀 수로 대체 표시)'}.</div>`;
}
function approachHTML(a) {
  if (!a.n) return '';
  const corr = a.p4n
    ? `전체 <b style="color:var(--t)">${a.p4BadPct}%</b> · 페어웨이 지킨 홀 <b style="color:var(--t)">${a.p4FwHitBadPct}%</b> · 놓친 홀 <b style="color:var(--t)">${a.p4FwMissBadPct}%</b>`
    : '기록 없음';
  const note = (a.p4n && a.p4FwHitN >= 3 && a.p4FwHitBadPct >= 30)
    ? '페어웨이를 지켰는데도 온그린 3타↑ 비율이 높아요 — 아이언·웨지 거리감·클럽 선택 문제일 가능성이 커요.'
    : '페어웨이를 놓쳤을 때 온그린 3타↑ 비율이 눈에 띄게 높다면 드라이버가, 지켰을 때도 높다면 아이언이 원인이에요.';
  const penaltyBreak = a.xPenHoles ? `<div class="cb" style="font-size:12px;color:var(--t2);line-height:1.6"><div class="cbt" style="margin-bottom:6px">아이언 손실 ${nf(a.ironLossRound)}타, 원인별로 보면</div>
    ⚠️ 벌타(티샷 외 해저드·OB) <b style="color:var(--r)">${nf(a.ironPenaltyLossRound)}타</b> · 🎯 거리감·클럽 선택 등 <b style="color:var(--t)">${nf(a.ironOtherLossRound)}타</b>
    <div style="font-size:10px;color:var(--t3);margin-top:6px;line-height:1.5">💡 벌타 손실이 크면 안전하게 치는 클럽 선택을, 나머지가 크면 거리감·정확도 연습을 우선하세요.</div></div>` : '';
  return `<div class="lbl">🎯 아이언·웨지 정확도 (Approach)</div><div class="sgd">
    ${statCard(a.girPct, '%', 'GIR')}
    ${statCard(nf(a.ironLossRound) + '타', '', '아이언 손실')}</div>
  ${penaltyBreak}
  <div class="cb" style="font-size:12px;color:var(--t2);line-height:1.6"><div class="cbt" style="margin-bottom:6px">온그린 3타↑ 비율 (파4 기준)</div>${corr}
    <div style="font-size:10px;color:var(--t3);margin-top:6px;line-height:1.5">💡 ${note}</div></div>`;
}
function shortGameHTML(a) {
  if (!a.n) return '';
  return `<div class="lbl">⛳ 숏게임 능력 (Short Game)</div><div class="sgd">
    ${statCard(a.scrPct == null ? '-' : a.scrPct, a.scrPct == null ? '' : '%', '스크램블링')}
    ${statCard(nf(a.shortLossRound) + '타', '', '숏게임 손실')}</div>`;
}
function puttingHTML(a) {
  if (!a.n) return '';
  const pmx = Math.max(a.p1, a.p2, a.p3, a.p4) || 1;
  return `<div class="lbl">🍩 퍼팅 효율성 (Putting)</div><div class="sgd">
    ${statCard(nf(a.puttAvg), '', 'PPR(총 퍼팅)')}
    ${statCard(nf(a.puttPerHole), '', '홀당 평균')}
    ${statCard(a.girPuttAvg == null ? '-' : nf(a.girPuttAvg), '', 'GIR 시 평균 퍼트')}
    ${statCard(a.threePct, '%', '3퍼트 이상')}
    ${statCard(a.onePuttPct, '%', '1퍼트율')}
    ${statCard(nf(a.puttLossRound) + '타', '', '퍼팅 손실')}</div>
  <div class="cb"><div class="cbt">퍼팅 분포 (홀 수)</div>${[['1퍼팅', a.p1, 'var(--g)'], ['2퍼팅', a.p2, 'var(--b)'], ['3퍼팅', a.p3, 'var(--a)'], ['4+', a.p4, 'var(--r)']].map(([l, c, co]) => `<div class="br"><div class="bl">${l}</div><div class="bt"><div class="bf" style="width:${Math.round(c / pmx * 100)}%;background:${co}"><span>${c}</span></div></div></div>`).join('')}</div>`;
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

// ── 손실 타수: OB 1회=2타·해저드 1회=1타로 환산(멀리건은 벌타 없어 제외). tpArr 에서 바로 계산하므로
// 이 기능 이전에 저장된 옛 라운드도(그때부터 해저드/OB 구분이 없었다면 전부 해저드로 잡히지만) 문제없이 동작한다.
function obCountOf(r) { return (r.tpArr || []).reduce((a, t) => a + (t === 2 ? 1 : 0), 0); }
function hzCountOf(r) { return (r.tpArr || []).reduce((a, t) => a + (t === 1 ? 1 : 0), 0); }
function lossStrokesOf(r) { return obCountOf(r) * 2 + hzCountOf(r); }

// ── 발전 추세: 지표 선택 그래프(이동평균) + 추세 판정 + 구간 비교 ──
const TREND_METRICS = [
  { k: 'score', lbl: '스코어', low: true,  u: '' },
  { k: 'putts', lbl: '퍼팅',   low: true,  u: '' },
  { k: 'gir',   lbl: 'GIR',    low: false, u: '%' },
  { k: 'fir',   lbl: 'FIR',    low: false, u: '%' },
  { k: 'lossStrokes', lbl: '티샷패널티', low: true, u: '타' },   // 티샷 OB·해저드 페널티로 깎아먹은 타수
  { k: 'consist', lbl: '기복', low: true,  u: '' },   // 최근 5R 스코어 편차(작을수록 일정)
];
function setTrend(k) { _trendMetric = k; const w = Q('trend-wrap'); if (w) w.innerHTML = trendWrapHTML(); }
function trendWrapHTML() {
  const rs = roundsChrono(); const M = TREND_METRICS[_trendMetric] || TREND_METRICS[0];
  const toggle = `<div class="seg" style="margin-bottom:10px">${TREND_METRICS.map((m, i) => `<button class="sg ${i === _trendMetric ? 'on' : ''}" style="font-size:12.5px;padding:9px 2px;white-space:nowrap" onclick="setTrend(${i})">${m.lbl}</button>`).join('')}</div>`;
  // 기복(consist)은 라운드별 값이 아니라 최근 5R 스코어 편차의 흐름으로 계산, 손실타수는 tpArr 에서 직접 계산
  const vals = M.k === 'consist' ? rollingSD(rs.map(r => +(r.score || 0)), 5)
    : M.k === 'lossStrokes' ? rs.map(lossStrokesOf)
    : rs.map(r => +(r[M.k] || 0));
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


// ── 💥 블로업(트리플보기 이상) 홀의 원인 분해 ──
// 한 홀에 원인이 겹칠 수 있으므로(예: 티샷 OB + 3퍼팅) 각 원인별로 따로 셉니다.
// "블로업"은 실력 비율 카드(skillRatioHTML)와 같은 기준(트리플보기 이상)을 씁니다.
function blowupCauseHTML(rounds) {
  let big = 0, teeC = 0, puttC = 0, missC = 0;
  rounds.forEach(r => {
    const hp = roundPars(r), sc = r.scores || [], gi = r.girArr || [], pa = r.puttsArr || [], tp = r.tpArr || [];
    for (let i = 0; i < 18; i++) {
      const s = sc[i]; if (!(s > 0)) continue;
      const par = hp[i] || 4; if (s - par < 3) continue;     // 블로업(트리플보기 이상)만
      big++;
      const tee = (tp[i] || 0);                              // 티샷 사고(OB·해저드 벌타). 멀리건은 벌타가 안 들어가 제외
      if (tee) teeC++;
      if ((pa[i] || 0) >= 3) puttC++;                        // 3퍼팅 이상
      if (!gi[i] && !tee) missC++;                           // 그린 미스(티샷 사고는 위에서 집계해 중복 제외)
    }
  });
  if (!big) return `<div class="cb" style="font-size:13px;color:var(--t2);line-height:1.6">🎉 블로업(트리플보기 이상)이 없어요. 큰 점수가 안 나오는 게 최고의 강점입니다.</div>`;
  const rows = [
    ['🚗 티샷 사고', teeC, 'var(--r)'],
    ['🍩 3퍼팅↑', puttC, 'var(--a)'],
    ['🎯 그린 미스', missC, 'var(--b)'],
  ];
  const mx = Math.max(...rows.map(x => x[1]), 1);
  const body = rows.map(([l, c, co]) => `<div class="br"><div class="bl" style="width:74px;white-space:nowrap">${l}</div><div class="bt"><div class="bf" style="width:${Math.round(c / mx * 100)}%;background:${co};min-width:${c ? 18 : 0}px"><span>${c}</span></div></div></div>`).join('');
  const top = [...rows].sort((a, b) => b[1] - a[1])[0];
  return `<div class="cb"><div class="cbt">💥 블로업(트리플보기↑) ${big}개의 원인</div>${body}
    <div style="font-size:10px;color:var(--t3);line-height:1.55;margin-top:8px">한 홀에 원인이 겹칠 수 있어 합계는 ${big}개와 다를 수 있어요. <b style="color:var(--t2)">가장 잦은 범인: ${top[0]}</b> — 여기만 줄여도 큰 점수가 확 줄어요.</div></div>`;
}

// ── 파 종류별 × 구간 교차: 파3는 GIR, 파4·5는 FIR/GIR과 함께 파 대비를 본다 ──
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

// ── 추가 집계(홀 기준): 실력 비율(skillRatioHTML)의 버디율 분모로 쓰는 "기록된 홀 수" ──
function extraStats(rounds) {
  let played = 0;
  rounds.forEach(r => {
    (r.scores || []).forEach(s => { if (s > 0) played++; });
  });
  return { played };
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
// ── 자주 가는 골프장: 방문 횟수·비율·평균 스코어를 큰 순서로 — 막대그래프(코스 이름이 길어 도넛보다 가독성 좋음) ──
const COURSE_BAR_COLORS = ['var(--g)', 'var(--b)', 'var(--a)', 'var(--p)', 'var(--r)', 'var(--t2)'];
function courseFreqHTML(rounds) {
  const total = rounds.length; if (!total) return '';
  const map = new Map();
  rounds.forEach(r => {
    const nm = r.courseName || '?';
    if (!map.has(nm)) map.set(nm, { name: nm, cnt: 0, sum: 0 });
    const e = map.get(nm); e.cnt++; e.sum += r.score || 0;
  });
  const stats = [...map.values()].map(e => ({ ...e, avg: e.sum / e.cnt })).sort((a, b) => b.cnt - a.cnt);
  const mx = Math.max(...stats.map(s => s.cnt), 1);
  const rows = stats.map((s, i) => `<div class="br">
    <div class="bl" style="width:92px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${s.name}">${s.name}</div>
    <div class="bt"><div class="bf" style="width:${Math.max(4, Math.round(s.cnt / mx * 100))}%;background:${COURSE_BAR_COLORS[i % COURSE_BAR_COLORS.length]}"><span>${s.cnt}회 (${Math.round(s.cnt / total * 100)}%)</span></div></div>
    <div style="width:58px;text-align:right;flex-shrink:0;font-size:11px;color:var(--t2)">평균 ${nf(s.avg)}</div>
  </div>`).join('');
  return `<div class="lbl" style="margin-top:14px">⛳ 자주 가는 골프장</div><div class="cb">${rows}</div>`;
}

// ════════════════════════════════════════
// 📊 통계 섹션 빌더 (전체 통계 · 라운드별 분석이 함께 끌어 씀 — 단일 소스)
// 모두 rounds 배열을 받아 그 묶음 기준으로 계산하므로 [전체] / [한 라운드] 어디서나 동일 로직.
// ════════════════════════════════════════
// 핵심 지표 — includeSd: 기복(편차) 카드 포함 여부(라운드 1개면 편차가 의미 없어 끔)
function coreMetricsHTML(rounds, includeSd) {
  const n = rounds.length; if (!n) return '';
  const avg = k => rounds.reduce((a, r) => a + (r[k] || 0), 0) / n;
  const scores = rounds.map(r => r.score); const mean = scores.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const avgMulli = rounds.reduce((a, r) => a + (r.mulligan || 0), 0) / n;
  const avgOb = rounds.reduce((a, r) => a + obCountOf(r), 0) / n;
  const avgHz = rounds.reduce((a, r) => a + hzCountOf(r), 0) / n;
  return `<div class="lbl">핵심 지표</div><div class="sgd">${statCard(avg('score').toFixed(1), '', n > 1 ? '평균 스코어' : '스코어')}${statCard((avg('vs') >= 0 ? '+' : '') + avg('vs').toFixed(1), '', n > 1 ? '평균 오버파' : '오버파')}${statCard(avg('putts').toFixed(1), '', n > 1 ? '평균 퍼팅' : '퍼팅')}${statCard(avg('gir').toFixed(0), '%', 'GIR')}${statCard(avg('fir').toFixed(0), '%', 'FIR')}${includeSd ? statCard('±' + sd.toFixed(1), '', '기복(편차)') : ''}${statCard(nf(avgMulli), '', n > 1 ? '평균 멀리건' : '멀리건')}${statCard(nf(avgOb), '', n > 1 ? '평균 OB' : 'OB')}${statCard(nf(avgHz), '', n > 1 ? '평균 해저드' : '해저드')}</div>`;
}
// ── 도넛(원형) 차트: 값이 서로 겹치지 않고 합쳐서 전체가 되는 비율 데이터용 ──
// stroke-dasharray 로 원을 나눠 그리는 방식이라 별도 라이브러리 없이 SVG 하나로 끝난다.
function donutSVG(segs, size, thick) {
  size = size || 128; thick = thick || 20;
  const total = segs.reduce((a, s) => a + s.v, 0) || 1;
  const r = (size - thick) / 2, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
  let acc = 0;
  const arcs = segs.filter(s => s.v > 0).map(s => {
    const dash = s.v / total * C, offset = -acc * C; acc += s.v / total;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.c}" stroke-width="${thick}" stroke-dasharray="${dash.toFixed(1)} ${(C - dash).toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;flex-shrink:0">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg3)" stroke-width="${thick}"/>${arcs}
  </svg>`;
}
// 실력 비율(홀 기준, 파이하·보기·더블+ 은 서로 겹치지 않는 전체 분해라 원형그래프로) + 블로업 설명
function skillRatioHTML(rounds) {
  const n = rounds.length; if (!n) return '';
  const ex = extraStats(rounds);
  const allD = rounds.flatMap(r => { const hh = roundPars(r); return (r.scores || []).map((s, i) => s > 0 ? s - (hh[i] || 4) : null).filter(x => x !== null); });
  if (!allD.length) return '<div class="lbl">실력 비율 (홀 기준)</div><div class="cb" style="text-align:center;color:var(--t3);font-size:12px;padding:20px">기록된 홀이 없습니다</div>';
  const birdie = allD.filter(d => d === -1).length, trip = allD.filter(d => d >= 3).length;
  const blowup = trip / n;
  const birdieRate = ex.played ? Math.round(birdie / ex.played * 100) : null;
  const segs = [
    { v: allD.filter(d => d <= 0).length, c: 'var(--g)', l: '파 이하' },
    { v: allD.filter(d => d === 1).length, c: 'var(--a)', l: '보기' },
    { v: allD.filter(d => d >= 2).length, c: 'var(--r)', l: '더블+' },
  ];
  const legend = segs.map(s => `<div style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--t2);margin:5px 0">
    <span style="width:10px;height:10px;border-radius:3px;background:${s.c};flex-shrink:0"></span>
    <span style="flex:1">${s.l}</span><b style="color:var(--t)">${Math.round(s.v / allD.length * 100)}%</b></div>`).join('');
  return `<div class="lbl">실력 비율 (홀 기준)</div>
  <div class="cb" style="display:flex;align-items:center;gap:18px">${donutSVG(segs)}<div style="flex:1">${legend}</div></div>
  <div class="sgd" style="margin-top:10px">
    ${statCard(birdieRate == null ? '-' : birdieRate, birdieRate == null ? '' : '%', '🕊️ 버디 (파 이하 중)')}
    ${statCard(nf(blowup), '', '블로업/R')}</div>
  <div style="font-size:10px;color:var(--t3);margin:6px 2px 4px">💡 블로업 = 트리플보기 이상 홀(라운드당 ${nf(blowup)}홀). 줄이면 스코어가 크게 떨어져요.</div>`;
}
// 전반 / 후반
function frontBackHTML(rounds) {
  const f9 = [0, 0], b9 = [0, 0];
  rounds.forEach(r => {
    const sc = r.scores || []; const fr = sc.slice(0, 9), bk = sc.slice(9, 18);
    if (fr.length === 9 && fr.every(x => x > 0)) { f9[0] += fr.reduce((a, b) => a + b, 0); f9[1]++; }
    if (bk.length === 9 && bk.every(x => x > 0)) { b9[0] += bk.reduce((a, b) => a + b, 0); b9[1]++; }
  });
  const f9a = f9[1] ? f9[0] / f9[1] : null, b9a = b9[1] ? b9[0] / b9[1] : null;
  return `<div class="lbl">전반 / 후반</div><div class="sgd">
    ${statCard(f9a == null ? '-' : f9a.toFixed(1), '', '전반(1-9)')}
    ${statCard(b9a == null ? '-' : b9a.toFixed(1), '', '후반(10-18)')}
    ${statCard((f9a != null && b9a != null) ? ((b9a - f9a >= 0 ? '+' : '') + (b9a - f9a).toFixed(1)) : '-', '', '후반 차이')}</div>`;
}
// 타수 분포
function scoreDistHTML(rounds) {
  const allD = rounds.flatMap(r => { const hh = roundPars(r); return (r.scores || []).map((s, i) => s > 0 ? s - (hh[i] || 4) : null).filter(x => x !== null); });
  const eagle = allD.filter(d => d <= -2).length, birdie = allD.filter(d => d === -1).length, par2 = allD.filter(d => d === 0).length, bogey = allD.filter(d => d === 1).length, dbl2 = allD.filter(d => d === 2).length, trip = allD.filter(d => d >= 3).length;
  const mx = Math.max(eagle, birdie, par2, bogey, dbl2, trip) || 1;
  return `<div class="lbl">타수 분포</div>
  <div class="cb">${[['이글↑', eagle, 'var(--p)'], ['버디', birdie, 'var(--b)'], ['파', par2, 'var(--g)'], ['보기', bogey, 'var(--a)'], ['더블', dbl2, 'var(--r)'], ['트리플+', trip, '#7f1d1d']].map(([l, c, co]) => `<div class="br"><div class="bl">${l}</div><div class="bt"><div class="bf" style="width:${Math.round(c / mx * 100)}%;background:${co}"><span>${c}</span></div></div></div>`).join('')}</div>`;
}
// 라운드별 카드의 구간 신호 칩 (작은 점 대신 한눈에 보이는 칩) — color 는 sig() 결과(var(--g)/--a/--r/'')
function sigChip(icon, label, val, color) {
  const em = color === 'var(--g)' ? '🟢' : color === 'var(--a)' ? '🟡' : color === 'var(--r)' ? '🔴' : '';
  return `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--bg3);border:.5px solid var(--bd);border-radius:8px;padding:4px 9px;font-size:12px;color:var(--t2)">${em ? em + ' ' : ''}${icon} ${label} <b style="color:var(--t)">${val}</b></span>`;
}

// ── 신호등 기준: "내 평균 대비" ──
// excludeId: 평균에서 뺄 라운드 id — 어떤 라운드를 "내 평균과" 비교할 때 그 라운드 자신이
// 평균에 섞이면 평균이 자기 쪽으로 쏠려 비교가 왜곡된다(코스 비교 기능은 원래도 자신을 뺌).
function playerAvgs(excludeId) {
  const rs = A.rounds.filter(r => !r.isDraft && (excludeId == null || !sameId(r.id, excludeId))); const n = rs.length;
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

// 통계 [전체] 탭의 하위 카테고리: 0 스코어 · 1 구간별 · 2 추세·기록
let _statSub = 0;
const STAT_SUBS = ['스코어', '구간별', '추세·기록'];
function setStatSub(s) { _statSub = s; renderStat(0); }

function renderStat(m) {
  const el = Q('st-body'); const rounds = A.rounds.filter(r => !r.isDraft);
  let h = `<div class="sg2"><button class="${m === 0 ? 'on' : ''}" onclick="renderStat(0)">전체</button><button class="${m === 1 ? 'on' : ''}" onclick="renderStat(1)">라운드별</button></div>`;
  if (!rounds.length) { el.innerHTML = h + `<div class="empty"><div>📊</div><p>라운드를 기록하면 통계가 표시됩니다</p></div>`; return; }

  if (m === 0) {
    // 요약 대시보드용 계산(나머지 섹션은 각 섹션 빌더 함수가 자체 계산)
    const n = rounds.length, avg = k => rounds.reduce((a, r) => a + (r[k] || 0), 0) / n;
    const best = Math.min(...rounds.map(r => r.score));
    const chrono = roundsChrono(); const hcp = estHandicap(chrono);
    const segN = Math.max(1, Math.min(5, Math.round(chrono.length / 3)));
    const earlyAvg = chrono.slice(0, segN).reduce((a, r) => a + r.score, 0) / segN;
    const recentAvg = chrono.slice(-segN).reduce((a, r) => a + r.score, 0) / segN;
    const prog = recentAvg - earlyAvg;                    // 음수면 발전(타수 줄어듦)

    // ── 📋 요약 대시보드 (하위 탭 위에 항상 고정 — 어느 탭에서나 핵심 숫자가 보임) ──
    h += `<div class="lbl">📋 요약</div><div class="sgd">
      ${statCard(n, '', '총 라운드')}
      ${statCard(best, '', '베스트')}
      ${statCard(avg('score').toFixed(1), '', '평균 스코어')}
      ${statCard(hcp == null ? '-' : (hcp >= 0 ? '+' : '') + hcp.toFixed(1), '', '추정 핸디')}</div>`;
    if (chrono.length >= 4) h += `<div class="cb" style="display:flex;align-items:center;gap:12px;padding:14px">
      <span style="font-size:24px">${prog < 0 ? '📈' : prog > 0 ? '📉' : '➡️'}</span>
      <div style="font-size:13px;color:var(--t2);line-height:1.5">최근 ${segN}R 평균 <b style="color:var(--t)">${recentAvg.toFixed(1)}</b> · 초기 ${segN}R 대비 <b style="color:${prog < 0 ? 'var(--g)' : prog > 0 ? 'var(--r)' : 'var(--t)'}">${prog < 0 ? '▼' : prog > 0 ? '▲' : ''}${Math.abs(prog).toFixed(1)}타</b>${prog < 0 ? ' — 좋아지고 있어요 🎉' : prog > 0 ? '' : ' — 유지 중'}</div></div>`;
    h += `<div style="font-size:10px;color:var(--t3);margin:-4px 2px 4px">💡 추정 핸디 = 최근 20R 중 좋은 라운드의 오버파 평균(간이). 코스 난이도 미반영.</div>`;

    // ── 하위 탭 (스코어 · 구간별 · 추세·기록) ──
    h += `<div class="seg" style="margin:12px 0">${STAT_SUBS.map((l, i) => `<button class="sg ${i === _statSub ? 'on' : ''}" style="font-size:12.5px;padding:9px 2px" onclick="setStatSub(${i})">${l}</button>`).join('')}</div>`;

    if (_statSub === 0) {
      // 📊 스코어
      h += coreMetricsHTML(rounds, true);
      h += skillRatioHTML(rounds);
      h += `<div class="lbl">💥 큰 실수의 원인</div>${blowupCauseHTML(rounds)}`;
      h += frontBackHTML(rounds);
      h += scoreDistHTML(rounds);
    } else if (_statSub === 1) {
      // 🚩🚗🎯⛳🍩 구간별 — 티샷 안정성·드라이버·아이언·숏게임·퍼팅
      const a = analyze(rounds);
      h += lossSummaryHTML(a);
      h += `<div class="lbl">파 종류별</div>${parCrossHTML(rounds)}`;
      h += teeStabilityHTML(a) + driverHTML(a) + approachHTML(a) + shortGameHTML(a) + puttingHTML(a);
    } else {
      // 📈 추세 · 기록
      h += `<div class="lbl">📈 발전 추세 (과거의 나와 비교)</div><div id="trend-wrap">${trendWrapHTML()}</div>`;
      h += `<div class="lbl">🏆 개인기록</div>${recordsHTML(chrono)}`;
      h += courseFreqHTML(rounds);
    }

  } else {
    // 라운드별 — 내 평균 대비 신호등 칩(작은 점 대신 한눈에 보이는 칩). 각 라운드는 "자신을 뺀" 내 평균과 비교한다.
    if (rounds.length >= 4) h += `<div style="font-size:11px;color:var(--t3);padding:0 2px 8px">🟢 내 평균보다 좋음 · 🟡 평균 수준 · 🔴 평균보다 나쁨</div>`;
    h += `<div class="lbl">라운드별</div>`;
    rounds.forEach(r => {
      const AV = playerAvgs(r.id);
      const cP = sig(r.putts, AV.putts, true, 2, AV.n), cG = sig(r.gir, AV.gir, false, 10, AV.n), cF = sig(r.fir, AV.fir, false, 10, AV.n);
      h += `<div class="rc" onclick="openDet(${r.id})">
        <div class="rc-top"><div style="flex:1;min-width:0"><div class="rc-name">${r.courseName || '?'} <span style="font-size:12px;color:var(--t3)">${r.courseLbl || ''}</span> ${trophyBadges(r)}</div><div class="rc-sub">${r.date || ''} · ${r.weather || ''}</div></div><div class="pill ${pC(r.vs)}">${r.score} (${vsL(r.vs)})</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${sigChip('🚗', 'FIR', r.fir + '%', cF)}${sigChip('🎯', 'GIR', r.gir + '%', cG)}${sigChip('🍩', '퍼팅', r.putts, cP)}${courseAvgChip(r)}${r.mulligan ? `<span style="display:inline-flex;align-items:center;gap:3px;background:#2d0f0f;border:.5px solid #6a2020;border-radius:8px;padding:4px 9px;font-size:12px;color:var(--r)">🔄 멀리건 ${r.mulligan}</span>` : ''}</div>
      </div>`;
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
      <button onclick="delCourse('${c.id || c.name}')" style="flex:1;background:#3d1a1a;border:1px solid #6a2020;border-radius:8px;color:var(--r);font-size:12px;font-weight:600;cursor:pointer;padding:7px">🗑 삭제</button>
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
    push(['총타수', r.score, '오버파', vsL(r.vs)]);
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
  <div style="background:var(--bg3);border-left:3px solid var(--g);border-radius:8px;padding:10px 12px;margin:6px 0;font-size:13px;color:var(--t2);line-height:1.6">⚡ <b style="color:var(--t)">이번엔</b> 앱 아이콘을 새 이미지로 다시 바꿨어요.</div>

  ${S('📣 이번 업데이트')}
  ${li('🐩 <b>앱 아이콘 교체</b> — 배경이 끝까지 초록으로 꽉 찬 깨끗한 새 이미지로 바꿨어요(홈 화면에 이미 추가했다면 삭제 후 다시 추가해야 바뀐 아이콘이 보여요).')}

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

  ${S('③ 홀 파(par) 확인·변경')}
  <div style="font-size:13px;color:var(--t2);line-height:1.6">각 홀 화면 위쪽에 그 홀의 파(파3/4/5)가 이미 골라진 채로 떠요. 다르면 탭해서 바로 바꿀 수 있어요. <b style="color:var(--a)">이 라운드에 바로 적용되고, 마스터와 값이 다르면 공식 코스 데이터에도 함께 저장돼 다른 사람이 같은 골프장·코스 조합을 고를 때도 그대로 보여요</b>(저장 실패해도 이 라운드 입력엔 지장 없음). 상단 <b>⛳ 파수정</b>으로 18홀을 한 번에 고칠 수도 있어요.</div>

  ${S('④ 홀마다 입력하는 것')}
  ${btn('온그린까지', '티샷부터 그린에 공을 올릴 때까지 친 타수. ＋/－로 조정. <b>스코어는 이 값에 퍼팅 수를 더해 자동 계산</b>돼요 — 직접 두드리지 않아요.')}
  ${btn('퍼팅', '그린에서 홀에 넣기까지 친 횟수. 0(칩인)도 가능해요.')}
  ${btn('결과 배너', '위 두 값으로 계산된 스코어(파·보기·더블 등)를 실시간으로 보여줘요. 오버파도 함께 표시.')}
  ${btn('GIR', '자동 계산돼요. <b>온그린까지 타수 ≤ 파−2</b>면 ON — 따로 누를 필요 없어요.')}
  ${btn('티샷 결과', '페어웨이 / 러프 / 벙커 / 해저드 / OB / 멀리건 중 하나를 선택해요(파3은 페어웨이 대신 온그린이고, 러프·벙커는 파3도 똑같이 골라요). <b>페어웨이 = FIR 반영(파4·5)</b> · <b>온그린·러프·벙커 = FIR 미반영, 페널티 없음</b> · <b>해저드·OB = 페널티</b> · <b>멀리건 = 페널티 없음</b>. 드라이버 진단(페어웨이%·OB/해저드 홀 수)에 쓰여요.<br><b style="color:var(--a)">GIR은 이 선택과 무관하게</b> "온그린까지 타수"만으로 계산돼요(파3도 온그린 칩이 아니라 온그린까지 타수가 1 이하면 GIR).<br><b style="color:var(--a)">주의: 해저드·OB를 골라도 벌타가 스코어에 자동으로 더해지지 않아요.</b> 실제 벌타는 "온그린까지 타수"에 직접 포함해서 넣어야 해요(예: OB면 재출발 포함해 온그린까지 늘어난 타수 그대로 입력).')}
  ${btn('티샷 외 해저드·OB', '위 "티샷 결과"는 첫 샷만 기록해요. 어프로치 등 다른 샷에서 해저드·OB가 났으면 여기 +/- 로 횟수를 더해두세요. <b>스코어에는 영향 없어요</b>(이미 "온그린까지 타수"에 포함돼 있음) — 나중에 원인을 분석할 때만 쓰이는 기록용 값이에요.')}

  ${S('⑤ 이동·저장')}
  <div style="font-size:13px;color:var(--t2);line-height:1.6">맨 위 전반/후반 진행 막대를 탭하면 해당 홀로 바로 이동. 값을 바꾸면 그 즉시 자동 저장되고, <b style="color:var(--g)">저장·다음 홀 →</b>로 다음 홀로 넘어가요. 18번 홀에서는 <b style="color:var(--g)">저장·완료</b>로 마무리. 덜 쳤는데 뒤로 가면 <b style="color:var(--a)">작성중</b>으로 임시저장돼 이어서 입력 가능. 저장 후 라운드를 탭하면 🔧수정·🗑삭제·📤공유.</div>

  <div style="margin-top:14px;padding-top:10px;border-top:.5px solid var(--bd);font-size:11px;color:var(--t3)">📌 ${APP_VERSION} 기준 · 기능이 바뀌면 자동 갱신.</div>`;
}

// ── 통계 분석 지표 설명(자동 생성) : 각 지표가 무엇을 뜻하는지 ──
function guideStatsHTML() {
  const S = (t) => `<div style="font-size:14px;font-weight:800;color:var(--g);margin:14px 0 5px">${t}</div>`;
  const it = (name, desc) => `<div style="margin:6px 0"><div style="font-size:13px;font-weight:700;color:var(--t)">${name}</div><div style="font-size:12px;color:var(--t2);line-height:1.5">${desc}</div></div>`;
  return `
  <p style="color:var(--t2);font-size:13px;line-height:1.6"><b>통계</b> 탭에서 자동 계산되는 지표들의 뜻이에요.</p>
  <div style="background:var(--bg3);border-left:3px solid var(--g);border-radius:8px;padding:10px 12px;margin:8px 0;font-size:12.5px;color:var(--t2);line-height:1.6">⚡ <b style="color:var(--t)">한 줄 요약</b> — 🚩티샷 안정성·🚗드라이버·🎯아이언·⛳숏게임·🍩퍼팅 5개 구간으로 쪼개 어디서 타수가 새는지 보여줘요. 라운드 상세와 통계→구간별 탭에서 확인하세요.</div>

  ${S('📋 요약 · 발전')}
  ${it('추정 핸디', '최근 20R 중 좋은 라운드들의 오버파 평균(간이 추정). 코스 난이도는 미반영이에요.')}
  ${it('발전 한 줄 · 발전 추세', '초기 vs 최근 평균 비교로 발전 정도를 보여줘요. 추세 그래프는 지표(스코어/퍼팅/GIR/FIR/티샷패널티/<b>기복</b>)를 골라 5R 이동평균선·라운드당 변화량(개선/정체/주의)으로 표시. <b>기복</b>은 최근 5R 스코어 편차의 흐름(작아질수록 일정해짐).')}

  ${S('스코어')}
  ${it('평균 스코어·오버파·기복', '총타수 평균 / 오버파(+오버·−언더) / 점수 편차(작을수록 일정).')}
  ${it('실력 비율 · 블로업', '홀 기준 파 이하·보기·더블+ 비율. 블로업 = 라운드당 트리플보기↑ 홀.')}
  ${it('파 종류별 · 전·후반', '파3·4·5별 오버파 평균에 더해, 파3은 GIR / 파4·5는 FIR·GIR을 함께 보여줘 어느 홀 유형에서 어느 구간이 약한지 진단. / 앞뒤 9홀 평균·차이(후반 무너짐).')}
  ${it('💥 큰 실수의 원인', '블로업(트리플보기 이상) 홀이 티샷 사고·3퍼팅·그린 미스 중 무엇 때문이었는지 원인별로 분해해요(한 홀에 겹칠 수 있음).')}

  ${S('🚩 구간별 (라운드 상세 · 통계 공통)')}
  ${it('티샷 안정성 (Off-the-Tee · 파3~5)', '티샷 페널티율(OB+해저드 홀 ÷ 전체 홀) · OB·해저드·멀리건 홀 수 · 안전 미스(러프·벙커, 페널티 없음) 개수와 비율. 러프·벙커 개별 구분은 v12.37 이후 입력분만 가능해요.')}
  ${it('드라이버 안정성 (Driver · 파4·5)', 'FIR(페어웨이 적중률) · 드라이버 손실 타수(페어웨이 놓친 홀과 지킨 홀의 오버파 평균 차이 × 놓친 홀 수, 표본이 적으면 홀 수로 대체).')}
  ${it('아이언·웨지 정확도 (Approach)', 'GIR(그린 적중률) · 아이언 손실 타수(온그린까지 타수가 정규타수를 초과한 만큼) · 온그린 3타↑ 비율(파4 기준, 페어웨이 지킨/놓친 홀 각각) — 지켰는데도 높으면 아이언·웨지 문제, 놓쳤을 때만 높으면 드라이버가 원인. 스코어 입력 화면의 "티샷 외 해저드·OB" 칸을 쓴 홀이 있으면, 아이언 손실 타수를 "벌타 때문"과 "거리감·클럽 선택 등 나머지"로 나눠서도 보여줌.')}
  ${it('숏게임 능력 (Short Game)', '스크램블링(그린 놓친 홀을 파 이하로 막은 비율) · 숏게임 손실 타수(그린 놓치고 파도 못 지킨 홀의 초과 타수).')}
  ${it('퍼팅 효율성 (Putting)', 'PPR(총 퍼팅) · 홀당 평균 · GIR 시 평균 퍼트(순수 퍼팅력) · 3퍼트 이상 비율 · 1퍼트율 · 퍼팅 손실 타수(2퍼팅 기준 초과분) · 퍼팅 분포(1/2/3/4+).')}

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
  // 줄글 문단 대신 '아이콘 + 굵은 한 줄 제목 + 흐린 한 줄 설명' 카드로 — 한눈에 스캔되게.
  const card = (icon, title, desc) => `<div style="background:var(--bg2);border:.5px solid var(--bd);border-radius:12px;padding:12px 14px;margin:8px 0;display:flex;gap:11px;align-items:flex-start">
    <span style="font-size:22px;flex-shrink:0;line-height:1.3">${icon}</span>
    <div style="min-width:0"><div style="font-size:14px;font-weight:800;color:var(--g);margin-bottom:3px">${title}</div>
    <div style="font-size:12.5px;color:var(--t3);line-height:1.6">${desc}</div></div></div>`;
  return `
  <p style="font-size:14px;color:var(--t);line-height:1.7;font-weight:600">온그린은 점수를 <u>기록</u>하는 앱이 아니라, 다음 라운드에서 한 타를 줄여줄 <b style="color:var(--g)">코치</b>예요.</p>
  <p style="font-size:12.5px;color:var(--t3);line-height:1.6;margin-top:4px">모든 숫자는 하나의 질문에 답해요 — <b style="color:var(--t2)">"무엇을 연습해야 가장 빨리 줄어드나?"</b></p>

  ${card('🔍', `① 점수가 아니라 '원인'을 본다`, `🚩티샷·🚗드라이버·🎯아이언·⛳숏게임·🍩퍼팅 5구간으로 쪼개 손실 타수를 재요. "90 쳤다"가 아니라 "숏게임에서 3타 샜다"를 말해줘요.`)}
  ${card('⚖️', '② 두 개의 잣대로 본다', `<b style="color:var(--t2)">세상 기준</b>으로 내 객관적 위치를, <b style="color:var(--t2)">내 평균</b>으로 오늘의 컨디션을 봐요.`)}
  ${card('📈', '③ 과거의 나와 경쟁한다', `남과 비교 대신 <b style="color:var(--t2)">성장 서사</b>로 동기를 만들어요. 발전 추세, 100·90·80 첫 돌파, 기복 추세로요.`)}
  ${card('💎', `④ 스코어에 직결되는 지표로 잰다`, `드라이버는 페어웨이%로 티샷 정확도를(생존율로 사고를 보조), 퍼팅은 라운드 퍼팅 수와 3퍼팅 빈도로 새는 타수를 직접 봐요. (GIR홀 퍼팅은 순수 퍼팅력 참고용)`)}

  <div style="font-size:13px;font-weight:800;color:var(--g);margin:16px 0 4px">🧭 그래서 이렇게 안내해요</div>
  ${card('🚩', '구간별 손실 타수', `티샷·드라이버·아이언·숏게임·퍼팅 5구간을 라운드 상세와 통계에서 각각 숫자로 보여줘요.`)}
  ${card('💥', '큰 실수의 원인', `블로업(트리플보기↑)이 티샷·3퍼팅·그린미스 중 무엇 때문인지 분해해요.`)}
  ${card('📊', '기복 추세', `라운드를 거듭할수록 점수가 일정해지는지 봐요.`)}

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
// 시작점(pointerdown)도 배경이어야 닫는다 — 입력창에서 텍스트 전체 선택(길게 눌러 드래그)하다가
// 선택 손잡이가 시트 밖 배경까지 나가 손을 떼면 그 지점의 click.target이 배경(mo)이 되어,
// 시작은 시트 안이었는데도 모달이 닫혀버리는 버그(코스 이름 수정 중 전체 선택 시 골프장 목록으로 튕김)가 있었다.
function initModalBackdrop() {
  document.querySelectorAll('.mo').forEach(mo => {
    if (mo._bdReady) return; mo._bdReady = true;
    let downOnBackdrop = false;
    mo.addEventListener('pointerdown', e => { downOnBackdrop = (e.target === mo); });
    mo.addEventListener('click', e => { if (e.target === mo && downOnBackdrop) cm(mo.id); });   // 시트(.ms) 안쪽 클릭은 통과
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
        setUserLabels(); renderHome(); showPg('home'); goHome();
        shownFromCache = true;
      }
    } catch (e) {}
    loadAll(shownFromCache);  // 뒤에서 최신 데이터로 갱신(캐시로 떴으면 로딩창 없이)
  } else {
    showPg('login');
  }
})();

// 앱을 가리거나(홈 화면으로 나가기·화면 잠금) 닫을 때, 대기 중인 자동저장을 곧바로 서버로 보낸다.
// (기기 저장은 입력 즉시 끝나 있으므로 여기서 실패해도 기록은 남고 다음 실행에 동기화된다)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAutoSave(); });
window.addEventListener('pagehide', flushAutoSave);
