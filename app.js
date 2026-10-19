// ============================================================
// app.js — 두뇌 방
// 로그인 판단, 점수 계산, 화면 전환 등 모든 로직.
// 통신은 api.js(API), 통계 계산·표시는 stat.js, 모양은 style.css.
// ============================================================

// ── 앱(프런트엔드) 버전 ──
// 기능이 추가될 때마다 여기 숫자를 올리고 CHANGELOG.md 에 기록을 남깁니다.
// ⚠️ 이것은 API.VERSION(서버 통신 동기화용)과 다릅니다. 서버를 안 건드리는
//    프런트 변경이면 API.VERSION 은 그대로 두고 APP_VERSION 만 올리세요.
const APP_VERSION = 'v12.67.0';

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
  sc: { course: null, li: [0, 1], ro: false, eid: null, half: 0, hIdx: 0,
        scores: Array(18).fill(0), putts: Array(18).fill(2), og: Array(18).fill(0),
        gir: Array(18).fill(false), fir: Array(18).fill(false),
        mulli: Array(18).fill(0), tp: Array(18).fill(0), teeSel: Array(18).fill(null), miss: Array(18).fill(''),
        xhz: Array(18).fill(0), xob: Array(18).fill(0), ap: Array(18).fill(''),
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
let _sid = 0, _delId = null, _editOldName = '', _editBase = null;   // _editBase: 수정 폼을 열 때 보던 코스(병합 기준)
let _trendMetric = 0;   // 발전 추세 그래프에서 보고 있는 지표(TREND_METRICS 인덱스)

// ── 작은 도우미 ──
const Q = id => document.getElementById(id);
const vsL = v => v === 0 ? 'E' : v > 0 ? '+' + v : String(v);
const pC = v => v < 0 ? 'gp' : v > 0 ? 'rp' : 'ep';
function cls(s, p) { if (!s) return 'e'; const d = s - p; return d <= -2 ? 'eag' : d === -1 ? 'bir' : d === 0 ? 'par' : d === 1 ? 'bog' : d === 2 ? 'dbl' : 'wrs'; }
// BACK_ACTIONS 에 등록된(뒤로 갈 곳이 있는) 화면에 들어갈 때 히스토리에 "보초" 항목을 하나 쌓아둔다.
// 안드로이드 하드웨어/제스처 뒤로가기가 앱을 바로 나가버리지 않고 그 보초를 먼저 소비하게 만들어서,
// popstate 핸들러(아래 initSwipeBack 근처)가 스와이프 백과 같은 동작을 그대로 실행할 수 있게 한다.
// ── 아이폰/아이패드(iOS)는 이 히스토리 연동을 쓰지 않는다 ──
// iOS엔 하드웨어 뒤로가기 버튼이 없어 보초가 필요 없고, 오히려 iOS 사파리/홈 화면 앱은 사용자 탭 없이 쌓인
// pushState 항목을 건너뛰거나 history.back() 이 popstate 를 보내지 않는 경우가 있어 화면의 "뒤로" 버튼이
// 먹통이 됐다. 그래서 iOS에선 보초를 아예 쌓지 않고 "뒤로" 버튼·스와이프가 동작을 바로 실행한다(backOut 참고).
// 안드로이드(삼성 등) 하드웨어/제스처 뒤로가기 동작은 기존 그대로 유지.
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let backGuardPushed = false;
function showPg(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on')); Q('pg-' + id).classList.add('on');
  if (!IS_IOS && BACK_ACTIONS[id] && !backGuardPushed) { history.pushState({ og: 1 }, '', location.href); backGuardPushed = true; }
}
// 현재 보이는 페이지 id(예: 'home','set','stat'). 백그라운드 데이터 갱신이 사용자가 보던 화면을 함부로 바꾸지 않도록 판단에 씀.
function curPg() { const p = document.querySelector('.page.on'); return p ? p.id.replace('pg-', '') : ''; }
// ── 모달도 안드로이드 뒤로가기로 닫히게: 열린 모달을 스택으로 추적하며 om() 마다 히스토리를 하나씩 쌓는다.
// (라운드 상세처럼 모달로 뜨는 화면은 지금까지 뒤로가기와 전혀 연동돼 있지 않아, 뒤로가기를 눌러도
//  모달은 그대로 있고 그 아래 화면의 보초만 소비돼 버튼이 "안 먹히는" 것처럼 보이는 문제가 있었다.)
let _modalStack = [];          // 열린 모달 id들(연 순서). 뒤로가기가 오면 맨 위(가장 최근 연) 것부터 닫는다.
let _modalPopFromBack = false; // 지금 닫는 게 popstate(뒤로가기)가 이미 소비한 히스토리에 대한 반응인지
let _suppressPageBack = false; // 모달을 직접(X·배경탭 등으로) 닫아 히스토리만 맞출 때, 그 아래 페이지의 뒤로 동작까지 같이 실행되지 않게 막는다
function cm(id) {
  if (id === 'm-cf' && _cfResolve) { const r = _cfResolve; _cfResolve = null; r(false); }   // 확인창은 어떻게 닫혀도(취소·배경·뒤로) "취소"
  Q(id).classList.remove('on');
  const idx = _modalStack.lastIndexOf(id); if (idx === -1) return;
  _modalStack.splice(idx, 1);
  if (IS_IOS) return;                                               // iOS는 모달 히스토리를 쌓지 않음
  if (_modalPopFromBack) { _modalPopFromBack = false; return; }   // 뒤로가기가 이미 이 모달의 히스토리를 소비함
  _suppressPageBack = true; history.back();                        // 직접 닫았으니 쌓아둔 히스토리도 소비
}
function om(id) {
  Q(id).classList.add('on');
  if (!_modalStack.includes(id)) { _modalStack.push(id); if (!IS_IOS) history.pushState({ mog: 1 }, '', location.href); }
}
// ── 앱 모양 확인창 (브라우저 기본 confirm() 대신, v12.66.0) ── await askConfirm(제목, 문구, 버튼글자) → true/false
// 문구는 textContent 로 넣으므로 이름에 특수문자가 있어도 안전하다.
let _cfResolve = null;
function askConfirm(title, msg, okLabel) {
  cfSettle(false);                                 // 혹시 열려 있던 확인창은 "취소"로 정리
  Q('cf-t').textContent = title; Q('cf-m').textContent = msg; Q('cf-ok').textContent = okLabel || '확인';
  om('m-cf');
  return new Promise(res => { _cfResolve = res; });
}
function cfSettle(ok) {                            // 확인(true)·취소(false) 버튼
  const res = _cfResolve; _cfResolve = null;
  if (_modalStack.includes('m-cf') || Q('m-cf').classList.contains('on')) cm('m-cf');
  if (res) res(ok);
}
function load(msg) { Q('ldm').textContent = msg || '불러오는 중...'; Q('ld').classList.add('on'); }
function hide() { Q('ld').classList.remove('on'); }
let _toastT = null;                               // 이전 토스트의 숨김 타이머 — 새 토스트가 뜨면 취소(앞 타이머가 새 문구를 일찍 숨기지 않게)
function toast(m, t) { const el = Q('toast'); el.textContent = m; el.classList.add('on'); clearTimeout(_toastT); _toastT = setTimeout(() => el.classList.remove('on'), t || 2600); }
// 사용자가 입력한 글자(골프장·코스 이름, 메모 등)를 innerHTML 에 넣을 때 HTML 로 해석되지 않게 바꾼다.
// 화면에 그릴 때만 쓰고, 저장하는 값에는 절대 쓰지 않는다(저장값은 원래 글자 그대로).
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
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
    `📱 아이폰: 사파리(Safari)로 열고 → 아래 공유 버튼(주소창 옆에 없으면 '•••' → 공유) → '홈 화면에 추가'를 누르면 앱처럼 쓸 수 있어요.\n` +
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
  pendSwitchUser(n);                               // 이 이름으로 보관해 둔 미동기화 기록을 되찾고, 다른 사람 것은 따로 보관
  if (r.isNew) toast('환영합니다! 가입됐어요 🎉');
  await loadAll();
}

async function logout() {
  // 아직 서버에 못 올린 변경이 있으면 분명히 알려주고 확인받는다 (로그아웃하면 로컬 캐시와 함께 사라짐)
  const p = pendGet(); const n = Object.keys(p.edits).length + p.dels.length;
  if (!await askConfirm('로그아웃', n ? `아직 서버에 못 올린 변경이 ${n}건 있어요.\n이 기기에 보관해 두었다가, 같은 이름으로 다시 로그인하면 자동으로 올라가요.\n로그아웃할까요?` : '로그아웃 하시겠어요?', '로그아웃')) return;
  if (!A.u) return;                                // 확인창이 떠 있는 사이 이미 로그아웃됐으면(토큰 만료 등) 아무것도 안 함
  delDrop();                                       // 되돌리기 대기 중인 삭제는 대기목록째 보관(아래 pendPark)
  pendPark(A.u);                                   // 지우지 않고 이 이름 앞으로 보관
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
let _lastSync = 0;   // 마지막으로 서버에서 기록을 받아온 시각(실시간 동기화 간격 조절용)
async function loadAll(silent) {
  _lastSync = Date.now();
  if (!silent) load('데이터 불러오는 중...');  // 캐시로 이미 화면이 떠 있으면(silent) 로딩창 없이 조용히 갱신
  const [f, cr] = await Promise.all([ fetchRounds(), callAPI(() => API.getCourses()) ]);
  const rr = f.rr;

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

  // ── 라운드: 서버가 "확실히 성공"(ok + rounds 배열)일 때만 교체(fetchRounds 가 서버 목록 + 대기분으로 반영).
  //    그 외(서버 일시오류·이상 응답)엔 절대 빈 배열로 덮지 않는다.
  const roundsOk = rr && rr.ok && Array.isArray(rr.rounds);
  if (roundsOk) {
    if (f.needSync) pushRounds();   // 미동기화분 즉시 반영 (성공하면 pushRounds 가 대기목록을 정리)
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
  // 관리자가 PIN 을 초기화했거나 다른 기기에서 PIN 을 바꿔 토큰이 풀린 경우 — 아직 못 올린 기록은 지우지 않고
  // 이 이름 앞으로 보관한다. 같은 이름으로 다시 로그인하면 되찾아 서버에 올린다(다른 사람 기록과는 안 섞임).
  delDrop();                                       // 되돌리기 대기 중인 삭제는 대기목록째 보관(아래 pendPark)
  pendPark(A.u);
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
        <div class="rc-name">${esc(r.courseName || '?')} <span style="font-size:12px;color:var(--t3)">${esc(r.courseLbl)}</span> ${trophyBadges(r)}</div>
        <div class="rc-sub">${esc(r.date)} · ${esc(r.weather)}${r.partner ? ' · ' + esc(r.partner) : ''}${r.memo ? ' · ' + esc(r.memo) : ''}</div>
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
// 오늘 날짜(YYYY-MM-DD)를 기기 시간대 기준으로. toISOString 은 UTC 라 한국 오전 9시 전엔 어제 날짜가 된다.
function todayYMD() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function newRound() { Q('nr-d').value = todayYMD(); Q('nr-p').value = ''; Q('nr-m').value = ''; om('m-nr'); }
function goSelectCourse() {
  A.sc.date = Q('nr-d').value.replaceAll('-', '.'); A.sc.wx = Q('nr-w').value;
  A.sc.partner = Q('nr-p').value; A.sc.memo = Q('nr-m').value;
  A.sc.eid = null; A.sc.ro = false; A.sc.hIdx = 0; A.sc.scores = Array(18).fill(0); A.sc.putts = Array(18).fill(2); A.sc.og = Array(18).fill(0);
  A.sc.gir = Array(18).fill(false); A.sc.fir = Array(18).fill(false); A.sc.mulli = Array(18).fill(0); A.sc.tp = Array(18).fill(0); A.sc.teeSel = Array(18).fill(null); A.sc.miss = Array(18).fill('');
  A.sc.xhz = Array(18).fill(0); A.sc.xob = Array(18).fill(0); A.sc.ap = Array(18).fill('');
  cm('m-nr'); renderCourses(); showPg('course');
}

// 총 퍼팅 = 스코어를 입력한 홀의 퍼팅만 합산. 퍼팅은 18칸 모두 기본값 2로 시작하므로
// 그냥 다 더하면 아직 안 친 홀까지 2씩 붙는다(9홀만 치고 저장하면 +18).
function puttTotal(scores, putts) { return (putts || []).reduce((a, b, i) => a + ((scores || [])[i] > 0 ? (b || 0) : 0), 0); }

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
    putts: puttTotal(A.sc.scores, A.sc.putts),
    gir: Math.round(A.sc.gir.filter(Boolean).length / 18 * 100),
    fir: Math.round(A.sc.fir.filter((f, i) => f && !A.sc.mulli[i]).length / 18 * 100),   // 멀리건 홀은 첫 샷(페널티) 기준 → FIR 아님(firArr 엔 멀리건 후 샷 결과가 남음)
    mulligan: A.sc.mulli.reduce((a, b) => a + (b ? 1 : 0), 0),
    tpCount: (A.sc.tp || []).reduce((a, b) => a + (b ? 1 : 0), 0),
    scores: [...A.sc.scores], puttsArr: [...A.sc.putts], girArr: [...A.sc.gir], firArr: [...A.sc.fir],
    mulliArr: [...A.sc.mulli], tpArr: [...(A.sc.tp || Array(18).fill(0))],
    missArr: [...(A.sc.miss || Array(18).fill(''))],   // 러프/벙커 구분(v12.37+) — 페널티 계산엔 안 쓰고 미스 유형 집계에만 씀
    xhzArr: [...(A.sc.xhz || Array(18).fill(0))], xobArr: [...(A.sc.xob || Array(18).fill(0))],   // 티샷 외(어프로치 등) 해저드·OB 횟수(v12.42+)
    apArr: [...(A.sc.ap || Array(18).fill(''))],   // 레귤러온 실패 홀의 어프로치 붙인 거리(AP_OPTS 키, v12.56+ 발자국 기준 · v12.51~55 는 AP_LEGACY 의 m 기준 키)
    holePars: [...h],   // ★ 박제: 그날 홀별 파를 라운드에 함께 저장 → 나중에 골프장이 바뀌어도 안 흔들림
    updatedAt: Date.now()   // 마지막으로 고친 시각 — 서버(v13+)는 더 오래된 수정본이 새 수정본을 덮지 못하게 이 값을 비교한다
  };
}

// ── 미동기화 변경 추적 (og_pending) ────────────────────────────────────────
// 오프라인·서버 실패로 서버에 못 올린 변경(신규/수정/삭제)을 기억해 둔다.
// 예전엔 로드할 때 "서버에 없는 id"만 보존해서, 이미 서버에 있는 라운드를 오프라인에서
// 수정하면 다음 로드에 옛 값으로 조용히 되돌아갔고, 오프라인 삭제는 되살아났다.
const PEND_KEY = 'og_pending';
const SEEN_KEY = 'og_seen';   // 이 기기가 마지막으로 서버에서 본 라운드 id 목록(다른 기기 삭제 판별용)
function sameId(a, b) { return a != null && b != null && String(a) === String(b); }   // 서버가 id를 문자열로 돌려줘도 안전하게 매칭
function pendGet() {
  try {
    const p = JSON.parse(localStorage.getItem(PEND_KEY) || 'null');
    if (p && typeof p === 'object') return { edits: (p.edits && typeof p.edits === 'object') ? p.edits : {}, dels: Array.isArray(p.dels) ? p.dels : [] };
  } catch (e) {}
  return { edits: {}, dels: [] };
}
function pendSet(p) { try { localStorage.setItem(PEND_KEY, JSON.stringify(p)); } catch (e) {} }
function pendClear() { try { localStorage.removeItem(PEND_KEY); localStorage.removeItem(SEEN_KEY); } catch (e) {} }
function markSaved(rd) {                        // 저장/임시저장한 라운드를 대기목록에 기록
  if (!rd || rd.id == null) return;
  const p = pendGet(); p.edits[rd.id] = rd; p.dels = p.dels.filter(x => !sameId(x, rd.id)); pendSet(p);
}
function markDeleted(id) {                      // 삭제한 라운드를 대기목록에 기록(되살아나지 않게)
  if (id == null) return;
  const p = pendGet(); delete p.edits[id]; if (!p.dels.some(x => sameId(x, id))) p.dels.push(id); pendSet(p);
}
function pendDrop(ids) {                        // 다른 기기에서 지워진 라운드의 옛 수정 대기표를 버린다
  if (!ids || !ids.length) return;
  const p = pendGet();
  Object.keys(p.edits).forEach(k => { if (ids.some(id => sameId(id, k))) delete p.edits[k]; });
  pendSet(p);
}
// ── 로그아웃·토큰 만료 때 미동기화 기록 보관 (절대 지우지 않음 — tests/data-safety.test.js 가 검증) ──
// og_park_<이름> 에 그 사람의 대기분(edits/dels)을 모아 두고, 같은 이름으로 로그인하면 대기목록으로 되돌린다.
const PARK_PREFIX = 'og_park_', PEND_OWNER = 'og_pend_owner';
function pendPark(user) {
  if (!user) return;                               // 주인을 모르면 아무것도 지우지 않고 그대로 둔다
  const p = pendGet();
  if (Object.keys(p.edits).length || p.dels.length) {
    let old = null; try { old = JSON.parse(localStorage.getItem(PARK_PREFIX + user) || 'null'); } catch (e) {}
    const park = { edits: Object.assign({}, (old && old.edits) || {}, p.edits), dels: ((old && old.dels) || []).slice() };
    p.dels.forEach(d => { if (!park.dels.some(x => sameId(x, d))) park.dels.push(d); });
    Object.keys(p.edits).forEach(k => { park.dels = park.dels.filter(d => !sameId(d, k)); });
    try { localStorage.setItem(PARK_PREFIX + user, JSON.stringify(park)); } catch (e) { return; }   // 보관 실패하면 대기목록을 그대로 둔다
  }
  pendClear();
  try { localStorage.removeItem(PEND_OWNER); } catch (e) {}
}
function pendSwitchUser(user) {
  let owner = null; try { owner = localStorage.getItem(PEND_OWNER); } catch (e) {}
  if (owner && owner !== user) pendPark(owner);   // 예전 사람의 대기분이 남아 있으면 그 사람 앞으로 보관
  let park = null; try { park = JSON.parse(localStorage.getItem(PARK_PREFIX + user) || 'null'); } catch (e) {}
  if (park && typeof park === 'object') {
    const p = pendGet();
    Object.keys(park.edits || {}).forEach(k => { if (!p.edits[k]) p.edits[k] = park.edits[k]; });
    (park.dels || []).forEach(d => { if (!p.dels.some(x => sameId(x, d)) && !p.edits[d]) p.dels.push(d); });
    pendSet(p);
    try { localStorage.removeItem(PARK_PREFIX + user); } catch (e) {}
  }
  try { localStorage.setItem(PEND_OWNER, user); } catch (e) {}
}
function seenGet() { try { const s = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); return Array.isArray(s) ? s : []; } catch (e) { return []; } }
function seenSet(rounds) { try { localStorage.setItem(SEEN_KEY, JSON.stringify((rounds || []).filter(r => r && r.id != null).map(r => r.id))); } catch (e) {} }

// ── 서버 목록 + 미동기화 대기분 합치기 (순수 함수 — tests/data-safety.test.js 가 검증) ──
// 서버가 원본이고, 이 기기의 대기분(edits/dels)만 그 위에 다시 얹는다.
//  · 서버에도 대기목록에도 없는 라운드는 "다른 기기에서 지운 것"이라 되살리지 않는다.
//    (예전엔 옛 캐시에만 있는 라운드를 서버에 다시 올려서, 폰에서 지운 기록이 PC 때문에 되살아났다.)
//  · seen(이 기기가 서버에서 본 적 있는 id)에 있는데 지금 서버에 없는 라운드의 수정 대기분도
//    "다른 기기에서 지운 것"이라 되살리지 않고 stale 로 돌려준다(호출한 쪽이 대기목록에서 버림).
//    서버에 한 번도 안 올라간 신규 라운드는 seen 에 없으므로 그대로 살린다.
//  · srvDel(서버 v13+ 가 알려주는 "삭제 표시된 id")에 있는 라운드의 수정 대기분도 같은 이유로 stale.
function mergeRounds(server, p, seen, srvDel) {
  const pend = { edits: (p && p.edits) || {}, dels: (p && p.dels) || [] };
  const srv = (server || []).filter(s => s && s.id != null);
  const known = (seen || []).concat(srvDel || []);
  // ① 이 기기에서 지운 라운드는 서버 목록에서도 뺀다 (동기화 실패로 되살아나지 않게)
  const merged = srv.filter(s => !pend.dels.some(d => sameId(d, s.id)));
  // ② 이 기기의 수정/신규분을 서버 값 위에 다시 얹는다 (오프라인 수정이 옛 값으로 안 되돌아가게)
  const stale = [];
  Object.keys(pend.edits).forEach(k => {
    const er = pend.edits[k]; if (!er || er.id == null) return;
    const i = merged.findIndex(m => sameId(m.id, er.id));
    if (i >= 0) merged[i] = er;
    else if (known.some(x => sameId(x, er.id))) stale.push(er.id);
    else merged.unshift(er);
  });
  const edits = Object.keys(pend.edits).length - stale.length;
  return { rounds: merged, stale, needSync: !!(edits || pend.dels.length) };
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

function saveRoundsCache() {
  try { const c = JSON.parse(localStorage.getItem('og_cache') || 'null') || {}; c.rounds = A.rounds; localStorage.setItem('og_cache', JSON.stringify(c)); } catch (e) {}
}
// 서버에서 받은 목록을 이 기기 대기분과 합쳐 A.rounds 로 삼는다. 지금 이 기기에서 입력 중인 라운드는
// 다른 기기의 삭제보다 우선한다(치는 도중에 기록이 사라지지 않게).
function applyServerRounds(server, srvDel) {
  const notMine = id => !sameId(id, A.sc.eid);
  const del = Array.isArray(srvDel) ? srvDel.filter(notMine) : null;
  const seen0 = seenGet().filter(notMine);
  // 서버 목록에서 라운드가 "설명 없이" 사라졌으면 다른 기기 삭제로 믿지 않고, 이 기기에 있던 값을 지켜 서버에 다시 올린다.
  const rescue = lostRounds(server, seen0, pendGet(), del, A.rounds);
  rescue.forEach(r => markSaved(r));               // 대기목록에 올려 두면 앱이 꺼져도 남고, 다음 저장 때 서버로 다시 올라간다
  const seen = seen0.filter(id => !rescue.some(r => sameId(r.id, id)));
  const m = mergeRounds(server, pendGet(), seen, del);
  pendDrop(m.stale);
  seenSet(server);
  const changed = JSON.stringify(A.rounds) !== JSON.stringify(m.rounds);
  A.rounds = m.rounds; saveRoundsCache();
  return { needSync: m.needSync, changed, rescued: rescue.length };
}
// ── 서버가 기록을 잃어버린 것처럼 보일 때 이 기기의 값을 지킨다 (순수 함수 — tests/data-safety.test.js 가 검증) ──
// 2026-10-13 사고: 옛 서버가 저장 도중 잠깐 "기록 0개"를 돌려줬고, 앱이 그걸 믿고 오늘 라운드만 올려 모든 기록이 덮였다.
// "이 기기가 서버에서 본 적 있는(seen) 라운드"가 지금 서버 목록에 없는데, 이 기기에서 지운 것도(p.dels) 아니고
// 서버가 삭제 표시한 것도(srvDel) 아니면 → 잃어버린 것으로 보고 local(이 기기 목록)에 있던 값을 돌려준다.
//  · 서버 v13+ 는 삭제를 항상 srvDel 로 알려주므로, 설명 없이 사라진 건 한 건이라도 지킨다.
//  · 옛 서버(srvDel 없음)는 다른 기기 삭제도 "목록에서 빠짐"으로만 보이므로, 목록이 텅 비었거나 2건 이상 한꺼번에 사라졌을 때만 지킨다.
function lostRounds(server, seen, p, srvDel, local) {
  const srv = (server || []).filter(s => s && s.id != null);
  const dels = (p && p.dels) || [], sd = srvDel || [];
  const missing = (seen || []).filter(id => !srv.some(s => sameId(s.id, id)) && !dels.some(d => sameId(d, id)) && !sd.some(d => sameId(d, id)));
  if (!missing.length) return [];
  if (!Array.isArray(srvDel) && !(srv.length === 0 || missing.length >= 2)) return [];
  return (local || []).filter(r => r && r.id != null && missing.some(id => sameId(id, r.id)));
}
// 서버 통신(목록 받기·저장)을 한 줄로 세운다. 서버 saveRounds_ 는 전체 덮어쓰기라 요청이 겹치면
// 늦게 도착한 옛 목록이 최신 저장을 되돌리거나, 방금 저장한 라운드가 화면에서 잠깐 사라질 수 있다.
let _syncChain = Promise.resolve();
function queueSync(fn) { const run = _syncChain.then(fn, fn); _syncChain = run.then(() => {}, () => {}); return run; }
function fetchRounds() {
  return queueSync(async () => {
    const rr = await callAPI(() => API.getRounds());
    if (!(rr && rr.ok && Array.isArray(rr.rounds))) return { rr };
    return Object.assign({ rr }, applyServerRounds(rr.rounds, rr.deleted));
  });
}
// 저장: 이 기기가 들고 있던 목록을 그대로 올리면, 그새 다른 기기(폰↔PC)에서 지운 라운드는 되살아나고
// 새로 만든 라운드는 지워진다. 그래서 보내기 직전에 서버 최신 목록을 받아 이 기기의 대기분만 얹어 보낸다.
// 서버 목록을 못 받으면 덮어쓰지 않는다(대기분은 기기에 남아 다음에 자동 재시도).
// 서버 v13+ 는 보낸 목록을 "고치거나 붙이기"만 하고, 삭제는 dels 로 콕 집은 것만 표시한다(목록 전체는 옛 서버 호환용).
async function pushRounds() {
  saveRoundsCache();
  return queueSync(async () => {
    const rr = await callAPI(() => API.getRounds());
    if (!(rr && rr.ok && Array.isArray(rr.rounds))) return { ok: false, __unsafe: true };
    const a = applyServerRounds(rr.rounds, rr.deleted);
    if (a.changed && curPg() === 'home') renderHome();   // 다른 기기에서 바뀐 내용이 홈에 바로 보이게
    if (!a.needSync) return { ok: true };               // 보낼 변경이 없으면 서버를 건드리지 않음
    const snap = pendGet(), sent = A.rounds.slice();   // 이번 요청이 실어 보내는 대기분·목록
    snap.dels = snap.dels.filter(d => !delHeld(d));    // 되돌리기 대기 중인 삭제는 아직 안 보낸다(대기목록엔 그대로 남음)
    if (!Object.keys(snap.edits).length && !snap.dels.length) return { ok: true };   // 보낼 게 그것뿐이면 서버를 건드리지 않음
    const r = await callAPI(() => API.saveRounds(sent, snap.dels));
    if (r && r.ok) { pendResolve(snap); seenSet(sent); }
    return r;
  });
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

// ── 골프장 찾기: 고유번호(id)로 먼저, 없거나 못 찾으면 이름으로 ──
// 예전 `x.id === id || x.name === name` 은 찾는 쪽·목록 쪽 모두 id 가 없으면 undefined === undefined 가 참이 되어
// "id 없는 첫 번째 골프장"과 엉뚱하게 짝지어졌다(그 골프장의 파가 바뀔 수 있음). id 는 값이 있을 때만 비교한다.
function findCourse(list, id, name) {
  const arr = list || [];
  if (id) { const byId = arr.find(x => x && x.id && String(x.id) === String(id)); if (byId) return byId; }
  return (name && arr.find(x => x && x.name === name)) || null;
}

function roundPars(r) {                          // 박제된 파 우선, 없으면 옛 라운드 호환용으로 마스터 참조
  if (r.holePars && r.holePars.length === 18) return r.holePars;
  const c = findCourse(A.allCourses(), r.courseId, r.courseName);
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
    const master = findCourse(A.official, r.courseId, r.courseName);
    if (!master || !(master.layouts || []).length) return;
    const uniq = nine => { const m = master.layouts.filter(l => eqNine(l.holes, nine)); return m.length === 1 ? m[0].name : null; };
    const n0 = uniq(r.holePars.slice(0, 9)), n1 = uniq(r.holePars.slice(9, 18));
    if (!n0 || !n1 || n0 === n1) return;      // 유일하게 못 가리면(애매/수정된 파) 그대로 둠
    const lbl = `${n0}+${n1}`;
    if (r.courseLbl !== lbl || !r.layoutNames || r.layoutNames[0] !== n0 || r.layoutNames[1] !== n1) {
      r.courseLbl = lbl; r.layoutNames = [n0, n1]; changed = true;   // 라벨/이름만 교정
      markSaved(r);   // 저장은 "서버 최신 + 대기분"을 올리므로, 대기목록에 넣어야 교정이 서버에 반영된다
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
  const cS = sig(r.score, AV.score, true, 3, AV.n), cV = sig(r.vs, AV.vs, true, 3, AV.n);
  const cM = sig(r.mulligan || 0, AV.mulligan, true, 1, AV.n), cB = sig(blowupCountOf(r), AV.blowup, true, 1, AV.n);
  const cL = sig(lossStrokesOf(r), AV.loss, true, 2, AV.n);
  const a = analyze([r]);
  const avgTag = t => (AV.n && t != null) ? `<span style="display:block;font-size:10px;color:var(--t3);margin-top:3px">평균 ${t}</span>` : '';
  Q('det-t').textContent = `${r.courseName} ${r.date}`;
  const trs = roundTrophies(r);
  Q('det-body').innerHTML = `
    ${trs.length ? `<div style="text-align:center;margin-bottom:10px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap">${trs.map(x => `<span style="background:var(--bg3);border:.5px solid var(--bd);border-radius:20px;padding:4px 12px;font-size:12px;color:var(--t)">${x.i} ${x.l}</span>`).join('')}</div>` : ''}
    <div class="sgd" style="margin-bottom:12px">
      <div class="sc"><span class="sn">${dot(cS)}${r.score}</span><span class="sl">총 스코어</span>${avgTag(nf(AV.score))}</div>
      <div class="sc"><span class="sn" style="color:${r.vs > 0 ? 'var(--r)' : 'var(--g)'}">${dot(cV)}${vsL(r.vs)}</span><span class="sl">오버파</span>${avgTag(nfs(AV.vs))}</div>
      <div class="sc"><span class="sn">${dot(cF)}${r.fir}<span class="su">%</span></span><span class="sl">FIR</span>${avgTag(nf(AV.fir) + '%')}</div>
      <div class="sc"><span class="sn">${dot(cG)}${r.gir}<span class="su">%</span></span><span class="sl">GIR</span>${avgTag(nf(AV.gir) + '%')}</div>
      <div class="sc"><span class="sn">${dot(cP)}${r.putts}</span><span class="sl">퍼팅</span>${avgTag(nf(AV.putts))}</div>
      <div class="sc"><span class="sn">${dot(cM)}${r.mulligan || 0}</span><span class="sl">멀리건 (페널티 없음)</span>${avgTag(nf(AV.mulligan))}</div>
      <div class="sc"><span class="sn">${dot(cB)}${blowupCountOf(r)}</span><span class="sl">블로업 (트리플+)</span>${avgTag(nf(AV.blowup))}</div>
      <div class="sc" style="grid-column:1/-1"><span class="sn" style="color:${lossStrokesOf(r) > 0 ? 'var(--r)' : 'var(--g)'}">${dot(cL)}${lossStrokesOf(r)}<span style="font-size:14px;color:var(--t2)">타</span></span><span class="sl">티샷 패널티 (OB ${obCountOf(r)}회 · 해저드 ${hzCountOf(r)}회)</span>${avgTag(AV.n ? nf(AV.loss) + '타' : null)}</div>
    </div>
    ${courseAvgChip(r) ? `<div style="text-align:center;margin-bottom:10px">${courseAvgChip(r)}</div>` : ''}
    ${AV.n >= 3 ? `<div style="font-size:11px;color:var(--t3);text-align:center;margin-bottom:10px">🟢 내 평균보다 좋음 · 🟡 평균 수준 · 🔴 평균보다 나쁨</div>` : ''}
    ${skillRatioHTML([r])}
    <div class="lbl">💥 블로업 홀별 원인</div>${blowupHolesHTML(r)}
    <div class="lbl">파 종류별</div>${parCrossHTML([r])}
    ${teeStabilityHTML(a)}
    ${driverHTML(a)}
    ${approachHTML(a)}
    ${shortGameHTML(a, true)}
    ${xPenaltyHTML(a)}
    ${puttingHTML(a, analyze(A.rounds.filter(x => !sameId(x.id, r.id))))}
    ${frontBackHTML([r], AV)}
    <div class="cb"><div class="cbt">홀별 스코어 <span style="font-size:11px;color:var(--t3);font-weight:400">· 홀을 누르면 상세 기록</span></div>
      ${[[0, 9], [9, 18]].map(([from, to]) => `<div style="display:flex;gap:5px;margin-top:${from ? 5 : 0}px">${Array.from({ length: to - from }, (_, j) => { const i = from + j; const s = (r.scores || [])[i]; const d = s > 0 ? s - hh[i] : null; const co = d === null ? '#2c2c2e' : d <= -2 ? 'var(--p)' : d === -1 ? 'var(--b)' : d === 0 ? 'var(--g)' : d === 1 ? 'var(--a)' : d === 2 ? 'var(--r)' : '#7f1d1d'; return `<div onclick="holeDetail(${id},${i})" style="width:32px;height:32px;border-radius:8px;background:${co};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;cursor:pointer">${s > 0 ? s : '-'}</div>`; }).join('')}</div>`).join('')}
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
  const master = findCourse(A.allCourses(), r.courseId, r.courseName) || A.official[0];
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
  A.sc.ap = [...(r.apArr || Array(18).fill(''))];   // 어프로치 붙인 거리(없는 옛 기록은 빈 값)
  // 온그린 타수는 저장하지 않으므로(스코어=온그린+퍼팅) 기존 기록에서 역산해 복원한다.
  A.sc.og = pars.map((p, i) => { const s = A.sc.scores[i] || 0, pt = A.sc.putts[i] || 0; return s > 0 ? Math.max(0, s - pt) : Math.max(1, p - 2); });
  A.sc.teeSel = deriveTeeSel();   // 티샷 선택 칩 상태도 fir/mulli/tp 로부터 추정 복원(러프/미선택은 구분 불가 → 미선택으로)
  const par = pars.reduce((a, b) => a + b, 0);
  Q('sc-t').textContent = c.name; Q('sc-s').textContent = `${r.date} · ${n0}+${n1} · 파${par}`;
  Q('sc-seg').innerHTML = halfSegHTML(n0, n1);
  const eb = Q('sc-edit-holes'); if (eb) eb.style.display = ro ? 'none' : 'block';
  clearTimeout(_asTimer); _asTimer = null; setSaveHint('');   // 다른 라운드를 열었으니 자동저장 상태 초기화
  { const box = Q('sc-body'); if (box) box.scrollTop = 0; }   // 새로 연 라운드는 첫 홀부터
  if (ro) {
    Q('sc-bnr').innerHTML = `<div class="bnr-wrap"><div class="bnr ro"><span style="font-size:13px;color:var(--t2)">🔒 읽기 전용</span><button style="background:var(--a);border:none;border-radius:10px;padding:9px 18px;color:#000;font-size:14px;font-weight:700;cursor:pointer" onclick="enableEdit()">🔧 수정</button></div></div>`;
    const b = Q('sv'); b.disabled = true; b.textContent = '저장됨'; b.className = 'sv';
  } else {
    Q('sc-bnr').innerHTML = `<div class="bnr-wrap"><div class="bnr ed"><span style="font-size:13px;color:#ff8a80">수정 중</span><button style="background:var(--r);border:none;border-radius:10px;padding:9px 18px;color:#fff;font-size:14px;font-weight:700;cursor:pointer" onclick="askDel(${id})">🗑 삭제</button></div></div>`;
    const b = Q('sv'); b.disabled = false; b.textContent = '저장'; b.className = 'sv';
  }
  renderSC(); showPg('sc');
}
function enableEdit() {
  A.sc.ro = false;
  Q('sc-bnr').innerHTML = `<div class="bnr-wrap"><div class="bnr ed"><span style="font-size:13px;color:#ff8a80">수정 중</span><button style="background:var(--r);border:none;border-radius:10px;padding:9px 18px;color:#fff;font-size:14px;font-weight:700;cursor:pointer" onclick="askDel(${A.sc.eid})">🗑 삭제</button></div></div>`;
  const b = Q('sv'); b.disabled = false; b.textContent = '수정 저장'; b.className = 'sv';
  const eb = Q('sc-edit-holes'); if (eb) eb.style.display = 'block';
  renderSC();
}

function askDel(id) { _delId = id; om('m-del'); }
async function confirmDel() {
  cm('m-del'); if (!_delId) return;
  const id = _delId; _delId = null;
  clearTimeout(_asTimer); _asTimer = null;         // 대기 중인 자동저장이 삭제 뒤에 라운드를 되살리지 않게 취소
  delRelease();                                    // 앞서 지운 라운드가 아직 되돌리기 대기 중이면 먼저 확정(서버로 보냄)
  const held = delHoldStart(id);                   // 화면·기기에선 바로 지우고, 서버엔 5초 뒤에 보낸다
  A.sc.course = null; A.sc.eid = null; A.sc.ro = false;
  goHome();                                        // 서버 응답을 기다리지 않고 바로 홈으로(삭제가 즉시 보이게)
  if (held) { _delHold.timer = setTimeout(() => delRelease(), UNDO_MS); showUndoBar(); return; }
  const r = await pushRounds();                    // 되돌릴 원본이 없으면(목록에 없던 id) 예전처럼 바로 보낸다
  toast(r.ok ? '삭제됐어요' : (r.__unsafe ? '기기에서 삭제됨 · 연결 후 동기화' : '⚠️ 삭제됐지만 동기화 실패'));
}

// ── 라운드 삭제 되돌리기 (v12.66.0 — tests/data-safety.test.js 가 검증) ──
// 삭제하면 화면·기기(대기목록 og_pending 의 dels)에서는 바로 지우지만, 서버에는 UNDO_MS 뒤에 보낸다.
// 그 사이 [되돌리기]를 누르면 서버는 삭제를 전혀 모른 채로 끝난다. "서버에서 지웠다가 다시 올리기"는
// 서버가 휴대폰 시계(updatedAt)와 서버 시계(삭제시각)를 비교해 되살리므로, 휴대폰 시계가 늦으면 조용히 실패할 수 있어서 쓰지 않는다.
//  · 기다리는 동안 앱이 꺼져도 삭제 표시는 대기목록에 남아 있다가 다음 동기화 때 서버로 간다(삭제가 그대로 진행됨).
//  · 기다리는 동안에도 다른 저장(새 라운드·수정)은 평소처럼 서버로 가고, 이 삭제(dels)만 pushRounds 가 빼고 보낸다.
//  · 되돌리면 지우기 직전의 대기목록 상태(아직 못 올린 수정본 포함)를 그대로 되돌린다.
const UNDO_MS = 5000;
let _delHold = null;   // { id, round, idx, prevEdit, timer } — 아직 서버에 안 보낸(되돌릴 수 있는) 삭제 하나
function delHeld(id) { return !!_delHold && sameId(_delHold.id, id); }
function delHoldStart(id) {                        // 지우고 되돌리기용 원본을 잡아 둔다. 원본이 없으면 null(바로 확정)
  const idx = A.rounds.findIndex(r => sameId(r.id, id));
  const round = idx >= 0 ? A.rounds[idx] : null;
  const prevEdit = pendGet().edits[id];            // 지우기 전 아직 못 올린 수정본(없으면 undefined)
  A.rounds = A.rounds.filter(r => !sameId(r.id, id));
  markDeleted(id);                                 // 동기화 실패·앱 종료에도 다음 로드에서 안 되살아나게 기록
  saveRoundsCache();
  _delHold = round ? { id, round, idx, prevEdit, timer: null } : null;
  return !!_delHold;
}
function delUndo() {                               // 되돌리기: 대기목록·목록·캐시를 지우기 직전으로. 이미 확정됐으면 false
  const h = _delHold; if (!h) return false;
  clearTimeout(h.timer); _delHold = null;
  const p = pendGet();
  p.dels = p.dels.filter(d => !sameId(d, h.id));
  if (h.prevEdit !== undefined) p.edits[h.id] = h.prevEdit;
  pendSet(p);
  if (!A.rounds.some(r => sameId(r.id, h.id))) A.rounds.splice(Math.min(h.idx, A.rounds.length), 0, h.round);
  saveRoundsCache();
  return true;
}
function delRelease() {                            // 되돌리기 기회를 닫고 삭제를 서버로 보낸다(대기 중인 게 없으면 아무것도 안 함)
  if (!_delHold) return;
  clearTimeout(_delHold.timer); _delHold = null; hideUndoBar();
  pushRounds().then(r => { if (!(r && r.ok)) toast(r && r.__unsafe ? '기기에서 삭제됨 · 연결 후 동기화' : '⚠️ 삭제됐지만 동기화 실패'); });
}
function delDrop() {                               // 로그아웃 때: 서버로 보내지 않고 대기만 끝낸다(삭제 표시는 대기목록과 함께 보관됨)
  if (_delHold) clearTimeout(_delHold.timer);
  _delHold = null; hideUndoBar();
}
function undoDel() {                               // [되돌리기] 버튼
  hideUndoBar();
  if (!delUndo()) { toast('이미 삭제가 반영됐어요'); return; }
  if (curPg() === 'home') renderHome();
  toast('되돌렸어요');
  pushRounds();                                    // 되살린 수정본이 있으면 마저 올린다(보낼 게 없으면 서버를 건드리지 않음)
}
function showUndoBar() { const el = Q('undo-bar'); if (el) el.classList.add('on'); }
function hideUndoBar() { const el = Q('undo-bar'); if (el) el.classList.remove('on'); }

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
const SM = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>';
const SP = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>';
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
    const firCell = par === 3 ? '<span class="htg" style="opacity:.3;cursor:default">·</span>' : `<span class="htg ${ff && !mm ? 'of' : ''}">FIR</span>`;
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
// v12.64: 멀리건은 결과 칩과 따로 켜고 끄는 토글이다(A.sc.mulli). 멀리건 = 첫 샷이 OB·해저드였다는 뜻이고,
//   teeSel·fir/tp/miss 에는 "멀리건 받고 다시 친 샷"의 결과가 들어간다. FIR·티샷 안정성은 첫 샷 기준이라
//   멀리건 홀은 페어웨이에 들어가도 FIR 이 아니고(통계에서 mulli 로 거름), 다시 친 샷은 멀리건 살림 지표로 따로 센다.
function teeState(i) { return (A.sc.teeSel && A.sc.teeSel[i]) || null; }
function deriveTeeSel() {                          // 저장된 라운드를 다시 열 때 fir/mulli/tp(+miss)로부터 복원
  const h = getH();
  return Array.from({ length: 18 }, (_, i) => {
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
  if (key === 'mull') { A.sc.mulli[i] = A.sc.mulli[i] ? 0 : 1; renderSC(); autoSaveSC(); return; }   // 멀리건은 결과 칩과 별개로 켜고 끔
  if (key === 'fw' && getH()[i] === 3) return;   // 파3엔 페어웨이 개념 없음(직접 그린을 노림) — 러프는 파3도 놓친 결과라 허용
  if (key === 'green' && getH()[i] !== 3) return;                     // 온그린 칩은 파3 전용(파4·5는 온그린까지 숫자로 입력)
  if (!A.sc.teeSel) A.sc.teeSel = Array(18).fill(null);
  if (!A.sc.miss) A.sc.miss = Array(18).fill('');
  const next = A.sc.teeSel[i] === key ? null : key;                   // 같은 걸 다시 누르면 선택 해제
  A.sc.teeSel[i] = next;
  A.sc.fir[i] = next === 'fw';
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
// ── 어프로치 붙인 거리(레귤러온 실패 홀만 입력) — 같은 걸 다시 누르면 해제. 스코어 계산엔 관여 안 함 ──
// 발자국 기준(한 걸음 ≈ 0.8m 가정) — [키, 이름, 대략 거리]
const AP_OPTS = [['ok', '컨시드', 'OK'], ['s5', '🦶🏻5 이내', '~4m'], ['s10', '🦶🏻6~10', '4.8~8m'], ['s20', '🦶🏻11~20', '8.8~16m'], ['sfar', '🦶🏻21 이상', '16.8m~']];
const AP_STEP_NOTE = '🦶🏻 = 발자국 수 (한 걸음 약 0.8m로 계산)';
// v12.51~v12.55 에 m 기준으로 저장된 옛 키 — 새 구간과 경계가 달라 바꿔 담지 않고 이름만 붙여 그대로 보여준다(입력 버튼엔 없음)
const AP_LEGACY = [['10', '10m 이내(옛 기록)', ''], ['20', '10~20m(옛 기록)', ''], ['far', '20m 이상(옛 기록)', '']];
const AP_NEAR = ['ok', 's5'];   // 근접률: 컨시드 + 5발자국(약 4m) 이내
function setAp(i, key) {
  if (A.sc.ro) return;
  if (!A.sc.ap) A.sc.ap = Array(18).fill('');
  A.sc.ap[i] = A.sc.ap[i] === key ? '' : key;
  renderSC(); autoSaveSC();
}
// 스코어 입력 화면에서 이 홀의 파를 바로 바꾼다 — "⛳ 파수정"과 동일하게 공식 코스 데이터에도 반영(마스터와 다를 때만, best-effort).
async function setHolePar(i, p) {
  if (A.sc.ro) return;
  const c = A.sc.course; if (!c || c.layouts[i < 9 ? 0 : 1].holes[i < 9 ? i : i - 9] === p) return;
  const li = i < 9 ? 0 : 1, hi = i < 9 ? i : i - 9;
  const before = masterParsFor(c);
  const bases = { [c.layouts[li].name]: c.layouts[li].holes.slice() };   // 고치기 전 값 — 공식맵엔 이 홀만 반영
  c.layouts[li].holes[hi] = p;
  if (c.layouts[0].name === c.layouts[1].name) {   // 같은 코스 2번 반복 — 같은 홀이라 다른 바퀴 파도 함께 바꾼다
    const oi = i < 9 ? i + 9 : i - 9; c.layouts[1 - li].holes[hi] = p; recalcHole(oi);
  }
  recalcHole(i); renderSC(); autoSaveSC();
  const res = await persistParsToOfficial(c, { [c.layouts[li].name]: c.layouts[li].holes.slice() }, bases);
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
  // 레귤러온 실패(온그린까지 타수 > 파−2)일 때만 숏게임 창을 띄운다: 어프로치 붙인 거리 + 티샷 외 해저드·OB.
  // (이미 티샷 외 해저드·OB 값이 들어 있는 홀은 숨겨서 값이 안 보이게 되는 일이 없도록 함께 보여줌)
  const regMiss = og > Math.max(1, par - 2);
  const apv = (A.sc.ap && A.sc.ap[i]) || '';
  const apChip = ([k, l, m]) => `<button class="lb ${apv === k ? 'on' : ''}" style="min-width:0;padding:8px 2px;font-size:12.5px;white-space:nowrap;line-height:1.3" onclick="setAp(${i},'${k}')">${l}<span style="display:block;font-size:10px;opacity:.65;font-weight:400">${k === 'ok' ? m : '(' + m + ')'}</span></button>`;
  const apOld = AP_LEGACY.find(([k]) => k === apv);   // 옛 m 기준 값이면 안내만(새 버튼을 누르면 바뀜)
  const shortPanel = (regMiss || xhz || xob) ? `<div style="background:var(--bg2);border:1px solid var(--a);border-radius:14px;padding:12px 10px;margin-bottom:14px">
      ${regMiss ? `<div style="font-size:12px;color:var(--a);font-weight:700;margin-bottom:8px">🏌️ 레귤러온 실패 — 숏게임(100m 이내)을 얼마나 붙였나요?</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:${apOld ? 6 : 12}px">${AP_OPTS.map(apChip).join('')}</div>
      ${apOld ? `<div style="font-size:11px;color:var(--t3);margin-bottom:12px">현재 저장값: ${apOld[1]} — 새 기준으로 다시 고를 수 있어요</div>` : ''}` : ''}
      <div style="display:flex;gap:10px;margin-bottom:10px">
        <div style="flex:1;text-align:center;background:var(--bg3);border-radius:12px;padding:10px 8px">
          <div style="font-size:11px;color:var(--t2);margin-bottom:6px">🌊 티샷 외 해저드</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:8px">
            <button class="hb" onclick="xhzAdj(${i},-1)" aria-label="하나 줄이기">${SM}</button>
            <div style="width:26px;font-size:17px;font-weight:700;text-align:center;color:var(--t)">${xhz}</div>
            <button class="hb" onclick="xhzAdj(${i},1)" aria-label="하나 늘리기">${SP}</button>
          </div>
        </div>
        <div style="flex:1;text-align:center;background:var(--bg3);border-radius:12px;padding:10px 8px">
          <div style="font-size:11px;color:var(--t2);margin-bottom:6px">🚫 티샷 외 OB</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:8px">
            <button class="hb" onclick="xobAdj(${i},-1)" aria-label="하나 줄이기">${SM}</button>
            <div style="width:26px;font-size:17px;font-weight:700;text-align:center;color:var(--t)">${xob}</div>
            <button class="hb" onclick="xobAdj(${i},1)" aria-label="하나 늘리기">${SP}</button>
          </div>
        </div>
      </div>
      <div style="font-size:10px;color:var(--t3);line-height:1.5">💡 붙인 거리·티샷 외 해저드/OB는 스코어에 영향이 없어요(이미 "온그린까지 타수"에 포함) — 숏게임 원인 분석용 기록입니다. 티샷 외 해저드/OB는 첫 샷이 아닌 샷에서 났을 때만 더하세요.</div>
    </div>` : '';
  const chip = (key, lbl) => `<button class="lb ${ts === key ? 'on' : ''}" style="flex:1;min-width:64px;padding:10px 4px;font-size:13px" onclick="setTee(${i},'${key}')">${lbl}</button>`;
  const chips = (par === 3 ? [chip('green', '온그린'), chip('rough', '러프'), chip('bunker', '벙커')] : [chip('fw', '페어웨이'), chip('rough', '러프'), chip('bunker', '벙커')]).concat([chip('hazard', '해저드'), chip('ob', 'OB')]);
  const mullOn = !!A.sc.mulli[i];   // 멀리건은 결과 칩과 함께 켤 수 있는 별도 토글
  const mullChip = `<button class="lb ${mullOn ? 'on' : ''}" style="flex:1;min-width:64px;padding:10px 4px;font-size:13px" onclick="setTee(${i},'mull')">🔄 멀리건${mullOn ? ' 받음' : ''}</button>`;
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
        <div style="font-size:12px;color:var(--t3);margin-top:2px">${esc(A.sc.course.layouts[i < 9 ? 0 : 1].name)}</div>
      </div>
      <div class="seg" style="margin-bottom:14px">${parTab(3)}${parTab(4)}${parTab(5)}</div>
      <div style="font-size:12px;color:var(--t2);margin-bottom:6px">⛳ 티샷 결과</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">${mullChip}</div>
      ${mullOn ? `<div style="font-size:11px;color:#ffcc80;margin-bottom:6px;line-height:1.5">첫 티샷은 페널티(OB·해저드)로 기록돼요. 아래에서 <b>멀리건 받고 다시 친 샷</b>의 결과를 골라 주세요.</div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">${chips.join('')}</div>
      <div style="display:flex;gap:10px;margin-bottom:14px">
        <div style="flex:1;text-align:center;background:var(--bg2);border-radius:14px;padding:14px 8px">
          <div style="font-size:12px;color:var(--t2);margin-bottom:8px">온그린까지</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:10px">
            <button class="hb" onclick="ogAdj(${i},-1)" aria-label="하나 줄이기">${SM}</button>
            <div style="width:34px;font-size:22px;font-weight:700;text-align:center;color:var(--t)">${og}</div>
            <button class="hb" onclick="ogAdj(${i},1)" aria-label="하나 늘리기">${SP}</button>
          </div>
          <div style="font-size:11px;color:var(--t3);margin-top:6px">타수</div>
        </div>
        <div style="flex:1;text-align:center;background:var(--bg2);border-radius:14px;padding:14px 8px">
          <div style="font-size:12px;color:var(--t2);margin-bottom:8px">퍼팅</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:10px">
            <button class="hb" onclick="puttAdjW(${i},-1)" aria-label="하나 줄이기">${SM}</button>
            <div style="width:34px;font-size:22px;font-weight:700;text-align:center;color:var(--t)">${putt}</div>
            <button class="hb" onclick="puttAdjW(${i},1)" aria-label="하나 늘리기">${SP}</button>
          </div>
          <div style="font-size:11px;color:var(--t3);margin-top:6px">수</div>
        </div>
      </div>
      ${shortPanel}
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
// 전반/후반 탭 — 나인 이름과 홀 범위를 한 줄로(줄바꿈 없이). 이름이 길면 말줄임.
function halfSegHTML(n0, n1) {
  const b = (n, name, rng, on) => `<button class="sg sg-half ${on ? 'on' : ''}" onclick="swHalf(${n},this)"><span class="sg-nm">${name}</span><span class="sg-rg">${rng}</span></button>`;
  return b(0, n0, '1-9', true) + b(1, n1, '10-18', false);
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
  Q('f-g').textContent = A.sc.gir.filter(Boolean).length; Q('f-p').textContent = puttTotal(A.sc.scores, A.sc.putts);
  const mc = A.sc.mulli.reduce((a, b) => a + (b ? 1 : 0), 0), tc = (A.sc.tp || []).reduce((a, b) => a + (b ? 1 : 0), 0);
  Q('f-m').textContent = (mc || tc) ? `${mc}/${tc}` : '-';
}
// ── 홀 상세: 라운드의 한 홀에 내가 기록한 값(점수·FIR·GIR·어프로치 붙인 거리·퍼팅·티샷 사고)을 보여준다 ──
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
    : row('🚗 티샷 (FIR)', ff && !mm ? '<b style="color:#ffd060">페어웨이 ⭕</b>' : `<span style="color:var(--t2)">놓침 ❌${mm ? ' (첫 샷 멀리건)' : ''}</span>`);
  const girRow = row('🎯 그린 (GIR)', gg ? '<b style="color:#7dd4ff">온그린 ⭕</b>' : '<span style="color:var(--t2)">놓침 ❌</span>');
  const puttRow = row('🍩 퍼팅 수', `<b>${pp}</b>퍼팅${pp >= 3 ? ' <span style="color:var(--a)">(3퍼팅↑)</span>' : ''}`);
  const reTxt = tpv === 2 ? 'OB' : tpv ? '해저드' : ff ? '페어웨이' : (r.missArr || [])[i] === 'rough' ? '러프' : (r.missArr || [])[i] === 'bunker' ? '벙커' : (par === 3 && gg) ? '온그린' : '';
  const teeTxt = mm ? `<b style="color:#ffcc80">멀리건${reTxt ? ` → ${reTxt}` : ''}</b> <span style="color:var(--t3)">(첫 샷 페널티 · 다시 친 결과)</span>`
    : tpv === 2 ? '<b style="color:#ff8a80">OB (스코어에 벌타 포함됨)</b>'
    : tpv ? '<b style="color:#ff8a80">해저드 (스코어에 벌타 포함됨)</b>'
    : (par !== 3 && !ff) ? '<span style="color:var(--t3)">러프/벙커 (사고 없음)</span>' : '<span style="color:var(--t3)">사고 없음</span>';
  const teeRow = row('⛳ 티샷 사고', teeTxt);
  // 어프로치 붙인 거리 — 레귤러온 실패(GIR 놓침) 홀에만 입력하므로 그 홀에서만 보여준다(값이 남아 있으면 GIR 여부와 무관하게 표시).
  const apv = (r.apArr || [])[i] || '', apOpt = [...AP_OPTS, ...AP_LEGACY].find(([k]) => k === apv);
  const apRow = (!gg || apOpt) ? row('🏌️ 어프로치 붙인 거리', apOpt ? `<b style="color:var(--a)">${apOpt[1]}</b>${apOpt[2] && apOpt[0] !== 'ok' ? ` <span style="color:var(--t3);font-size:12px">(${apOpt[2]})</span>` : ''}` : '<span style="color:var(--t3)">기록 없음</span>') : '';
  const xh = (r.xhzArr || [])[i] || 0, xo = (r.xobArr || [])[i] || 0;
  const xRow = (xh || xo) ? row('⚠️ 티샷 외 해저드·OB', `<b style="color:#ff8a80">${[xh ? `해저드 ${xh}회` : '', xo ? `OB ${xo}회` : ''].filter(Boolean).join(' · ')}</b>`) : '';
  Q('hd-t').textContent = `${i + 1}번 홀 · 파${par}`;
  Q('hd-body').innerHTML = `
    <div style="text-align:center;margin-bottom:16px">
      <div class="hv ${sc ? cls(sc, par) : 'e'}" style="margin:0 auto 8px">${sc || '-'}</div>
      <div style="font-size:15px;font-weight:700;color:var(--t)">${name}${sc ? ` · 오버파 ${vsL(d)}` : ''}</div>
    </div>
    <div class="hd-card">${firRow}${girRow}${apRow}${puttRow}${teeRow}${xRow}</div>
    ${apOpt && AP_OPTS.some(([k]) => k === apOpt[0] && k !== 'ok') ? `<div style="font-size:11px;color:var(--t3);text-align:center;margin-top:8px">${AP_STEP_NOTE}</div>` : ''}`;
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
// 골프장 검색 — 영문 대소문자 구별 없이 이름·주소에서 찾는다(예: 'skyhill' → 'SkyHill')
function courseMatch(c, q) { const k = String(q).toLowerCase(); return String(c.name || '').toLowerCase().includes(k) || String(c.addr || '').toLowerCase().includes(k); }
function renderCourses() {
  initCourseSwipe(); _ccOpen = null;          // 슬라이드-삭제 핸들러 준비 + 열린 카드 상태 초기화
  const q = (Q('cs-q')?.value || '').trim();
  const all = A.allCourses();
  const list = q ? all.filter(c => courseMatch(c, q)) : all;
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
    ${A.isAdm ? `<div class="cc-del"><button data-k="${esc(c.id || c.name)}" onclick="delCourse(this.dataset.k)">🗑 삭제</button></div>` : ''}
    <div class="cc">
      <div class="cc-info" data-k="${esc(c.id || c.name)}" onclick="selCourse(this.dataset.k)">
        <div class="cc-name">${esc(c.name)}</div>
        <div class="cc-sub">${esc(c.addr)} · ${esc((c.layouts || []).map(l => l.name).join('/'))} · 파${(c.layouts || []).flatMap(l => l.holes || []).reduce((a, b) => a + b, 0) * ((c.layouts || []).length === 1 ? 2 : 1)}${(c.layouts || []).length === 1 ? ' (9홀×2)' : ''}</div>
      </div>
      <button data-k="${esc(c.id || c.name)}" onclick="openEditCourse(this.dataset.k)" title="코스 수정" style="flex-shrink:0;background:var(--bg3);border:1.5px solid #6a6a6e;border-radius:8px;color:var(--t);font-size:13px;font-weight:600;cursor:pointer;padding:6px 12px;white-space:nowrap">수정</button>
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
  A.sc.course = c; A.sc.li = [0, c.layouts.length > 1 ? 1 : 0];
  A.sc.holeEdits = {};          // 코스 새로 고를 때 홀파 수정값 초기화 (레이아웃이름 → 9홀 파 배열)
  openHoleMdl(c);
}

// 코스 선택(조합) 모달을 열 때 홀파 수정값을 항상 초기화한다.
// selCourse 말고 "새 골프장 등록 직후"(submitCourseForm)에서도 열리는데, 그 경로엔 초기화가 없어서
// 직전 코스에서 만진 holeEdits 가 남아 있다가 이름이 같은 나인이 있으면 새 코스에 잘못 반영될 수 있었다.
function openHoleMdl(c) { A.sc.holeEdits = {}; Q('m-hl-t').textContent = c.name; renderHolePkr(c, 0, c.layouts.length > 1 ? 1 : 0); om('m-hl'); }
function renderHolePkr(c, l0, l1) {
  A.sc.li = [l0, l1];
  const combos = []; for (let a = 0; a < c.layouts.length; a++) for (let b = 0; b < c.layouts.length; b++) if (a !== b || c.layouts.length === 1) combos.push([a, b]);
  Q('hl-pkr').innerHTML = `<div style="font-size:13px;font-weight:600;color:var(--t2);margin-bottom:8px">코스 조합</div><div style="display:flex;flex-wrap:wrap;gap:8px">${combos.map(([a, b]) => `<button class="lb ${a === l0 && b === l1 ? 'on' : ''}" onclick="renderHolePkr(A.sc.course,${a},${b})">${esc(c.layouts[a].name)}+${esc(c.layouts[b].name)}</button>`).join('')}</div>`;
  // 코스(레이아웃)별 수정값이 있으면 마스터 대신 그걸 표시 → 조합 바꿔도 수정 유지
  const ed = A.sc.holeEdits || {};
  const h0 = ed[c.layouts[l0].name] || c.layouts[l0].holes;
  const h1 = ed[c.layouts[l1].name] || c.layouts[l1].holes;
  const all = [...h0, ...h1];
  const nm = [...Array(9).fill(c.layouts[l0].name), ...Array(9).fill(c.layouts[l1].name)];
  Q('hl-lbl').textContent = `${c.layouts[l0].name}+${c.layouts[l1].name} 홀 구성`;
  Q('hl-grid').innerHTML = all.map((p, i) => `<div class="pe-cell"><div class="pe-lbl">${esc(nm[i])} ${(i % 9) + 1}H</div><div class="pe-row"><button onclick="adjHP(${i},-1)" aria-label="파 줄이기" class="pe-btn">-</button><span id="hp-${i}" class="pe-val">${p}</span><button onclick="adjHP(${i},1)" aria-label="파 늘리기" class="pe-btn">+</button></div></div>`).join('');
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
  if (l0 === l1) { const o = Q('hp-' + (i < 9 ? i + 9 : i - 9)); if (o) o.textContent = v; }   // 같은 코스 2번 반복 — 같은 홀이니 다른 바퀴도 함께
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
  A.sc.xhz = Array(18).fill(0); A.sc.xob = Array(18).fill(0); A.sc.ap = Array(18).fill('');
  A.sc.eid = null; A.sc.ro = false; A.sc.half = 0; A.sc.hIdx = 0;
  const c = A.sc.course; const [l0, l1] = A.sc.li; const par = getH().reduce((a, b) => a + b, 0);
  Q('sc-t').textContent = c.name; Q('sc-s').textContent = `${A.sc.date} · ${c.layouts[l0].name}+${c.layouts[l1].name} · 파${par}`;
  Q('sc-seg').innerHTML = halfSegHTML(c.layouts[l0].name, c.layouts[l1].name);
  Q('sc-bnr').innerHTML = '';
  const eb = Q('sc-edit-holes'); if (eb) eb.style.display = 'block';
  clearTimeout(_asTimer); _asTimer = null; setSaveHint('');   // 새 라운드 시작 — 자동저장 상태 초기화
  { const box = Q('sc-body'); if (box) box.scrollTop = 0; }   // 새 라운드는 첫 홀부터
  cm('m-hl'); renderSC(); showPg('sc');

  // 공식맵(모두 공유) 반영은 백그라운드로 — 스코어카드 진입을 막지 않음. 마스터와 다를 때만 저장.
  // 기준값 = 골프장을 고를 때 보이던 원래 파(src 는 마스터 객체 그대로, 피커 수정은 holeEdits 에만 있음).
  // 안 만진 나인은 기준과 같아 저장되지 않으므로, 이 기기 목록이 낡았어도 남의 수정을 되돌리지 않는다.
  const bases = {};
  (src.layouts || []).forEach(l => { if (!bases[l.name]) bases[l.name] = (l.holes || []).slice(0, 9); });
  persistParsToOfficial(src, edits, bases).then(res => {
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
  Q('eh-grid').innerHTML = _ehTmp.map((p, i) => `<div class="pe-cell"><div class="pe-lbl">${esc(nm[i])} ${(i % 9) + 1}H</div><div class="pe-row"><button onclick="adjEH(${i},-1)" aria-label="파 줄이기" class="pe-btn">-</button><span id="eh-${i}" class="pe-val">${p}</span><button onclick="adjEH(${i},1)" aria-label="파 늘리기" class="pe-btn">+</button></div></div>`).join('');
  om('m-edh');
}
function adjEH(i, d) { const el = Q('eh-' + i); if (!el) return; let v = parseInt(el.textContent) + d; if (v < 3) v = 3; if (v > 5) v = 5; el.textContent = v;
  const c = A.sc.course; if (c && c.layouts[0].name === c.layouts[1].name) { const o = Q('eh-' + (i < 9 ? i + 9 : i - 9)); if (o) o.textContent = v; } }   // 같은 코스 2번 반복이면 다른 바퀴도 함께
function masterParsFor(course) {                 // 마스터 공식 파 18개 (이름 매칭). 없으면 null
  const m = findCourse(A.official, course.id, course.name); if (!m) return null;
  const f = (m.layouts.find(l => l.name === course.layouts[0].name) || {}).holes;
  const s = (m.layouts.find(l => l.name === course.layouts[1].name) || {}).holes;
  if (!f || !s) return null;
  return [...f, ...s];
}

// ── 공식맵(마스터) 저장 공통 도우미 ──
// 앱은 켤 때만 코스 목록을 받으므로, 켜 둔 사이 다른 사람이 고친 내용이 이 기기엔 없다.
// 그 낡은 목록으로 "코스 전체"를 저장하면 남의 수정을 덮어쓴다. 그래서 저장 직전엔 항상 최신 목록을 다시 받고,
// 그 위에 "이번에 사용자가 실제로 바꾼 부분"만 얹어서 저장한다.
function saveOfficialCache() {                   // 콜드 스타트용 캐시의 코스 목록만 갱신
  try {
    const cache = JSON.parse(localStorage.getItem('og_cache') || 'null') || {};
    cache.official = A.official; localStorage.setItem('og_cache', JSON.stringify(cache));
  } catch (e) {}
}
async function refreshOfficial() {               // 서버 최신 코스 목록으로 교체. 성공 true / 실패 false(기존 목록 유지)
  const r = await callAPI(() => API.getCourses());
  if (!r || !Array.isArray(r.courses) || !r.courses.length) return false;   // 실패·빈 응답으로 목록을 비우지 않음
  A.official = r.courses.map(c => ({ ...c, status: 'official' }));
  saveOfficialCache();
  if (curPg() === 'course') renderCourses();     // 보고 있는 골프장 목록도 최신으로
  if (A.isAdm && _admOffLoaded) renderAdmOfficial();
  return true;
}
// 이번 동작에서 바뀐 홀만 추린다. edits/bases: { 레이아웃이름: [9홀 파] } (bases = 사용자가 고치기 전에 보던 값)
// 반환: { 레이아웃이름: { np: [9홀 파], idx: [바뀐 홀 번호...] } }  — 기준값이 없으면 9홀 전체를 바뀐 것으로 본다.
function parDiffs(edits, bases) {
  const out = {};
  Object.keys(edits || {}).forEach(name => {
    const np = edits[name]; if (!Array.isArray(np) || np.length !== 9) return;
    const b = bases && bases[name];
    const idx = (Array.isArray(b) && b.length >= 9) ? np.map((p, i) => i).filter(i => np[i] !== b[i]) : np.map((p, i) => i);
    if (idx.length) out[name] = { np: np.slice(), idx };
  });
  return out;
}
// 최신 마스터에 바뀐 홀만 얹는다(다른 홀·다른 나인은 최신 값 그대로). 반환 { layouts, changed }
function applyParDiffs(master, diffs) {
  const layouts = (master.layouts || []).map(l => ({ ...l, holes: (l.holes || []).slice() }));
  let changed = false;
  Object.keys(diffs || {}).forEach(name => {
    const ly = layouts.find(l => l.name === name); if (!ly) return;   // 그사이 없어진 나인은 건너뜀
    const { np, idx } = diffs[name];
    if (ly.holes.length < 9) { ly.holes = np.slice(); changed = true; return; }   // 홀 정보가 깨진 나인은 통째로
    idx.forEach(i => { if (ly.holes[i] !== np[i]) { ly.holes[i] = np[i]; changed = true; } });
  });
  return { layouts, changed };
}

// ── 홀파 수정 → 공식맵(마스터)에 병합 저장 → 모두 공유 ──
// 핵심: A.sc.course 는 선택한 2개 레이아웃만 가진 "클론"이라 그대로 보내면
//       나머지 나인이 삭제된다. 반드시 마스터 "전체 코스"를 찾아 해당 홀만 갈아끼운 뒤 저장한다.
//       또 저장 직전에 서버 최신 목록을 다시 받아, 사용자가 이번에 바꾼 홀만 얹는다(남의 수정 보존).
//       (best-effort: 실패해도 라운드는 진행)
// edits: { 레이아웃이름: [9홀 파] }  bases: { 레이아웃이름: [고치기 전 9홀 파] }
// 반환: { ok:true } 저장됨 / { ok:false } 서버실패 / { unchanged } 바뀐 것 없음 / { skipped } 공식맵에 없음
let _parSaveQ = Promise.resolve();               // 연달아 고쳐도 한 번에 하나씩 저장(앞 저장을 뒤 저장이 덮지 않게)
function persistParsToOfficial(course, edits, bases) {
  const job = _parSaveQ.then(() => persistParsNow(course, edits, bases));
  _parSaveQ = job.catch(() => {});
  return job.catch(() => ({ ok: false }));
}
async function persistParsNow(course, edits, bases) {
  const diffs = parDiffs(edits, bases);
  if (!Object.keys(diffs).length) return { unchanged: true };   // 사용자가 바꾼 홀이 없음 → 저장 안 함
  if (!(await refreshOfficial())) return { ok: false };          // 최신 목록을 못 받으면 낡은 값으로 덮지 않고 저장 포기
  const master = findCourse(A.official, course.id, course.name);
  if (!master) return { skipped: true };                         // 공식맵에 없는(또는 그사이 삭제된) 코스 → 건너뜀
  const { layouts, changed } = applyParDiffs(master, diffs);
  if (!changed) return { unchanged: true };                      // 이미 같은 값 → 불필요한 덮어쓰기 방지
  const updated = { ...master, layouts };
  const r = await callAPI(() => API.saveCourse(updated, true, master.name, master));   // 전체 코스 + 기준값(서버 v14+ 가 그사이 남의 수정을 지키며 병합)
  if (!r || !r.ok) return { ok: false, err: r };
  const mi = A.official.indexOf(master);
  if (mi >= 0) A.official[mi] = updated;                         // 로컬 공식맵 즉시 갱신
  saveOfficialCache();
  return { ok: true };
}

async function applyEditHoles() {
  const newPars = Array.from({ length: 18 }, (_, i) => parseInt(Q('eh-' + i).textContent));
  const c = A.sc.course;
  const before = masterParsFor(c);          // 변경 전 공식 파 (감사 로그 diff 기준 — 저장 전에 떠둔다)
  // 고치기 전 이 라운드의 파 — 공식맵엔 이것과 달라진 홀만 반영한다(같은 나인 2바퀴면 이름이 같아 한 칸으로 합쳐짐)
  const bases = { [c.layouts[0].name]: c.layouts[0].holes.slice(), [c.layouts[1].name]: c.layouts[1].holes.slice() };
  // ① 이 라운드 클론에 즉시 반영 (입력 화면은 곧바로 갱신)
  c.layouts[0].holes = newPars.slice(0, 9);
  c.layouts[1].holes = newPars.slice(9, 18);
  cm('m-edh'); renderSC(); autoSaveSC();     // 홀 파가 바뀌면 이 라운드의 박제 파도 다시 저장

  // ② 공식맵(모두 공유)에도 반영 — best-effort. 실패해도 이 라운드 입력은 계속 가능.
  const edits = { [c.layouts[0].name]: newPars.slice(0, 9), [c.layouts[1].name]: newPars.slice(9, 18) };
  const res = await persistParsToOfficial(c, edits, bases);
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
  for (let i = 0; i < parseInt(cnt); i++) { const p = (ex && ex[i]) || 4; h += `<div class="pe-cell" style="background:#2a2a2c"><div class="pe-lbl">${i + 1}홀</div><div class="pe-row"><button onclick="ap(${uid},${i},-1)" aria-label="파 줄이기" class="pe-btn">-</button><span id="sp-${uid}-${i}" class="pe-val">${p}</span><button onclick="ap(${uid},${i},1)" aria-label="파 늘리기" class="pe-btn">+</button></div></div>`; }
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
      <div class="mf" style="margin:0"><label>코스 이름</label><input class="cs-name si" value="${esc(name)}" placeholder="레이크..."></div>
      <div class="mf" style="margin:0"><label>홀 수</label><select class="cs-hn si" onchange="updPG(${uid})" style="-webkit-appearance:none"><option value="9">9홀</option><option value="18">18홀</option></select></div>
    </div>
    <div class="mf" style="margin:0"><label>홀별 파 (개별 수정)</label><div class="pgrid">${pGrid(uid, (ex && ex.length === 18) ? 18 : 9, ex)}</div></div>`;
  Q('cs-secs').appendChild(d);
  if (ex && ex.length === 18) d.querySelector('.cs-hn').value = '18';
}
async function delSec(uid) {
  if (document.querySelectorAll('.css').length <= 1) { toast('최소 1개 코스 필요 (9홀 골프장은 코스 1개만 등록)'); return; }
  if (!await askConfirm('코스 삭제', '이 코스를 삭제할까요?\n(골프장 저장을 눌러야 실제로 반영돼요)', '삭제하기')) return;
  Q('cs-s-' + uid)?.remove();
}

function openAddCourse() {
  _sid = 0; _editOldName = ''; _editBase = null; Q('cs-secs').innerHTML = ''; Q('cs-n').value = ''; Q('cs-a').value = '';
  Q('cs-eid').value = '';
  Q('m-cs-t').textContent = '새 골프장 등록'; Q('m-cs-btn').textContent = '등록 후 스코어카드 시작';
  addSec('전반'); addSec('후반'); om('m-cs');
}
function openEditCourse(key) {
  const c = A.allCourses().find(x => x.id === key || x.name === key); if (!c) { toast('코스 없음'); return; }
  _editBase = JSON.parse(JSON.stringify({ id: c.id, name: c.name, addr: c.addr || '', layouts: c.layouts || [] }));   // 저장 때 "무엇을 바꿨는지" 비교용
  _sid = 0; _editOldName = c.name; Q('cs-secs').innerHTML = ''; Q('cs-n').value = c.name || ''; Q('cs-a').value = c.addr || '';
  Q('cs-eid').value = c.id || c.name;
  Q('m-cs-t').textContent = '골프장 수정'; Q('m-cs-btn').textContent = '✅ 수정 저장';
  (c.layouts || []).forEach(l => addSec(l.name, l.holes)); om('m-cs');
}

// ── 수정 폼 병합: 서버 최신본(fresh) 위에, 폼을 열 때(base)와 비교해 "사용자가 바꾼 것"만 얹는다 ──
// · 이름·주소: 바꿨으면 폼 값, 안 바꿨으면 최신 값
// · 나인(이름으로 짝지음): 홀마다 바꿨으면 폼 값, 안 바꿨으면 최신 값. 새로 만들었거나 홀 수를 바꾼 나인은 폼 그대로
// · 폼에서 지운 나인은 지움. 안 만졌는데 그사이 다른 사람이 지운 나인은 되살리지 않음
// · 그사이 다른 사람이 새로 추가한 나인은 지우지 않고 뒤에 붙임
function mergeCourseForm(base, fresh, form) {
  if (!base || !fresh) return form;
  const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
  const bl = n => (base.layouts || []).find(l => l.name === n);
  const fl = n => (fresh.layouts || []).find(l => l.name === n);
  let layouts = form.layouts.map(l => {
    const b = bl(l.name), f = fl(l.name);
    if (b && !f) return same(l.holes, b.holes) ? null : l;     // 남이 지운 나인: 안 만졌으면 그대로 지운 채로, 고쳤으면 내 값 유지
    if (!b || !f || b.holes.length !== l.holes.length || f.holes.length !== l.holes.length) return l;
    return { ...l, holes: l.holes.map((p, i) => (p === b.holes[i] ? f.holes[i] : p)) };
  }).filter(Boolean);
  (fresh.layouts || []).forEach(f => {
    if (!bl(f.name) && !layouts.some(l => l.name === f.name)) layouts.push({ ...f, holes: (f.holes || []).slice() });
  });
  if (!layouts.length) layouts = form.layouts;                  // 안전장치: 나인이 하나도 안 남으면 폼 그대로
  return {
    ...form,
    name: form.name === base.name ? fresh.name : form.name,
    addr: form.addr === (base.addr || '') ? (fresh.addr || '') : form.addr,
    layouts,
  };
}

async function submitCourseForm() {
  const name = Q('cs-n').value.trim(), eid = Q('cs-eid').value, isEdit = !!eid;
  // 왜 안 눌리는지(저장이 안 되는지) 분명히 알려준다 — 빈 칸이면 그 칸으로 안내.
  if (!name) {
    toast('⚠️ 골프장 이름을 입력하세요');
    const el = Q('cs-n'); if (el) { el.focus(); el.style.borderColor = 'var(--r)'; el.addEventListener('input', () => el.style.borderColor = '', { once: true }); }
    return;
  }
  const secs = document.querySelectorAll('.css'); if (secs.length < 1) { toast('⚠️ 코스를 1개 이상 만들어주세요 (9홀 골프장은 1개)'); return; }
  const emptySec = [...secs].find(s => !s.querySelector('.cs-name').value.trim());
  if (emptySec) {
    toast('⚠️ 각 코스의 이름을 입력하세요 (예: 레이크)');
    const el = emptySec.querySelector('.cs-name'); if (el) { el.focus(); el.style.borderColor = 'var(--r)'; el.addEventListener('input', () => el.style.borderColor = '', { once: true }); }
    return;
  }
  const layouts = [];
  secs.forEach(s => { const uid = s.id.replace('cs-s-', ''); const n = s.querySelector('.cs-name').value.trim() || '코스'; const hn = s.querySelector('.cs-hn').value || '9'; layouts.push({ name: n, holes: gp(uid, hn) }); });
  // 한 골프장 안에서 코스(나인) 이름 중복 금지 — 파 저장이 이름으로 나인을 찾으므로,
  // 같은 이름이 둘이면 두 번째 나인의 수정이 조용히 무시된다.
  const dupLy = layouts.map(l => l.name).find((n, i, arr) => arr.indexOf(n) !== i);
  if (dupLy) { toast(`⚠️ 코스 이름이 겹쳐요: "${dupLy}" — 서로 다르게 지어주세요`); return; }

  const btn = Q('m-cs-btn'); const btnLabel = isEdit ? '✅ 수정 저장' : '등록 후 스코어카드 시작';
  if (btn.disabled) return;                         // 저장 중 두 번 눌림 방지
  btn.disabled = true; btn.textContent = '저장 중...';
  const done = () => { btn.disabled = false; btn.textContent = btnLabel; };

  // 저장 직전에 서버 최신 목록을 다시 받는다 — 앱을 켜 둔 사이 다른 사람이 고친 내용을 덮어쓰지 않기 위해.
  // 못 받으면 낡은 목록으로 저장하지 않고 멈춘다(폼 내용은 그대로 남아 있어 다시 누르면 됨).
  if (!(await refreshOfficial())) { done(); toast('❌ 최신 골프장 정보를 못 받았어요 — 인터넷 확인 후 다시 저장해주세요'); return; }

  let fresh = null;                                 // 수정 중인 골프장의 서버 최신본
  if (isEdit) {
    fresh = findCourse(A.official, _editBase && _editBase.id, (_editBase && _editBase.name) || _editOldName);
    if (!fresh) { done(); toast('⚠️ 그사이 이 골프장이 삭제됐어요 — 새로 등록해주세요'); return; }
  }
  // 골프장 이름 중복 금지(최신 목록 기준) — 코스를 이름으로 찾는 곳(파 저장·삭제)이 있어서, 이름이 겹치면
  // 엉뚱한 코스의 파가 덮어써지거나 삭제될 수 있다. (수정 중 자기 자신은 제외)
  const dupCourse = A.official.find(x => x.name === name && x !== fresh);
  if (dupCourse) {
    done(); toast('⚠️ 같은 이름의 골프장이 이미 있어요');
    const el = Q('cs-n'); if (el) { el.focus(); el.style.borderColor = 'var(--r)'; el.addEventListener('input', () => el.style.borderColor = '', { once: true }); }
    return;
  }

  const form = { id: (fresh && fresh.id) || eid || ('c' + Date.now()), name, addr: Q('cs-a').value.trim(), layouts, status: 'official' };
  // 수정이면: 최신본 위에 "이번에 폼에서 실제로 바꾼 것"만 얹는다(안 만진 홀·나인은 남이 고친 최신 값 유지)
  const c = isEdit ? mergeCourseForm(_editBase, fresh, form) : form;
  const oldName = isEdit ? fresh.name : '';         // 서버가 찾을 이름 = 지금 서버에 있는 이름(그사이 개명됐어도 정확)
  const r = await callAPI(() => API.saveCourse(c, isEdit, oldName, isEdit ? fresh : null));   // 기준값 = 방금 받은 최신본
  done();

  if (!r.ok) { const e = explainError(r); toast('❌ ' + e.msg); return; }

  // 로컬 목록 갱신
  if (isEdit) {
    const i = A.official.indexOf(fresh);            // 방금 받은 최신본 자리를 정확히 교체(동명·id 없는 코스 혼동 없음)
    if (i >= 0) A.official[i] = { ...c }; else A.official.unshift({ ...c });
    saveOfficialCache();
    toast('✅ 수정됐어요: ' + c.name); cm('m-cs'); renderCourses();
    if (A.isAdm && _admOffLoaded) renderAdmOfficial();   // 마지막으로 보던 목록(검색어·펼침 상태) 유지
  } else {
    A.official.unshift({ ...c });
    saveOfficialCache();
    renderCourses();   // 목록을 다시 그려야 함 — 안 그리면 등록된 골프장이 목록에 안 보이는데 이름 중복 검사엔 걸린다
    if (A.isAdm && _admOffLoaded) renderAdmOfficial();
    cm('m-cs'); toast('✅ 등록됐어요: ' + name);
    A.sc.course = c; openHoleMdl(c);   // 바로 스코어카드로
  }
}

async function delCourse(key) {                  // 관리자만 호출 (버튼이 관리자에게만 보임)
  const c = A.official.find(x => x.id === key || x.name === key);
  const name = c ? c.name : key;
  if (!await askConfirm('골프장 삭제', `"${name}" 골프장을 삭제할까요?\n목록에서 영구 삭제됩니다.`, '삭제하기')) return;
  const r = await callAPI(() => API.deleteCourse(name));
  // 로컬 삭제는 id 로 정확히 한 개만 — 이름으로 지우면 동명의 다른 코스까지 함께 사라진다.
  if (r.ok) { A.official = A.official.filter(x => (c && c.id) ? x.id !== c.id : x.name !== name); renderCourses(); if (A.isAdm && _admOffLoaded) renderAdmOfficial(); toast('✅ 삭제 완료'); }   // 마지막으로 보던 목록 유지
  else { const e = explainError(r); toast('❌ ' + e.msg); }
}

// 통계(분석·추세·블로업 등)는 stat.js(통계 방)로 옮겼습니다 — index.html 에서 app.js 보다 먼저 로드됩니다.
// ════════════════════════════════════════
// 관리자 패널
// ════════════════════════════════════════
async function admLoadNotes() {
  const el = Q('adm-notes'); el.innerHTML = '<div style="color:var(--t2);font-size:13px">불러오는 중...</div>';
  await refreshNotes();
  if (!A.notes.length) { el.innerHTML = '<div style="color:var(--t2);font-size:13px">새 변경 없음 ✅</div>'; return; }
  el.innerHTML = A.notes.map(nt => `<div class="pi">
    <div class="tx-h">🗺️ ${esc(nt.course)}</div>
    <div style="font-size:12px;color:var(--t2);margin-top:3px">${esc(nt.user)} 님이 <b style="color:${nt.action === '추가' ? 'var(--g)' : 'var(--a)'}">${esc(nt.action)}</b> · ${esc(nt.at)}</div>
    ${nt.detail ? `<div style="font-size:12px;color:var(--t);margin-top:5px;padding:6px 8px;background:var(--bg3);border-radius:8px;line-height:1.5">✏️ ${esc(nt.detail)}</div>` : ''}
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
  if (q) list = all.filter(c => courseMatch(c, q));
  else if (_admOffOpen) list = all;
  else { listEl.innerHTML = `<div style="color:var(--t3);font-size:12px;padding:8px 2px">검색하거나 "전체 ${all.length}"를 눌러 펼치세요</div>`; return; }
  // 결과 총 개수 표시 — 검색 시 "검색 결과 N개", 전체 펼침 시 "전체 N개"
  const cnt = `<div style="color:var(--t2);font-size:12px;font-weight:600;padding:4px 2px 8px">${q ? '🔍 검색 결과' : '전체'} ${list.length}개</div>`;
  if (!list.length) { listEl.innerHTML = cnt + `<div style="color:var(--t2);font-size:13px;padding:8px 2px">검색 결과 없음</div>`; return; }
  listEl.innerHTML = cnt + (list.map(c => `<div style="padding:12px 0;border-bottom:.5px solid var(--bd)">
    <div style="font-size:14px;font-weight:700;color:var(--t);margin-bottom:4px">🗺️ ${esc(c.name)}</div>
    <div style="font-size:11px;color:var(--t2);margin-bottom:8px">${esc(c.addr)} · ${esc((c.layouts || []).map(l => l.name).join('/'))}</div>
    <div style="display:flex;gap:6px">
      <button data-k="${esc(c.name)}" onclick="openEditCourse(this.dataset.k)" style="flex:1;background:#1a2e5a;border:1px solid var(--b);border-radius:8px;color:#7dd4ff;font-size:12px;font-weight:600;cursor:pointer;padding:7px">✏️ 수정</button>
      <button data-k="${esc(c.id || c.name)}" onclick="delCourse(this.dataset.k)" style="flex:1;background:#3d1a1a;border:1px solid #6a2020;border-radius:8px;color:var(--r);font-size:12px;font-weight:600;cursor:pointer;padding:7px">🗑 삭제</button>
    </div></div>`).join(''));
}

async function admLoadUsers() {
  const el = Q('adm-usr'); el.innerHTML = '<div style="color:var(--t2);font-size:13px">불러오는 중...</div>';
  const r = await callAPI(() => API.getUsers());
  if (!r.users || !r.users.length) { el.innerHTML = '<div style="color:var(--t2);font-size:13px">없음</div>'; return; }
  el.innerHTML = r.users.map(u => `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:.5px solid var(--bd)">
    <div><div style="font-size:14px;font-weight:600;color:var(--t)">👤 ${esc(u.username)}</div><div style="font-size:11px;color:var(--t2)">🕒 마지막 접속 ${esc(u.at || '기록 없음')} · ${esc(u.rounds)}라운드</div></div>
    ${u.username === A.u ? '<span style="color:var(--a);font-size:11px">👑 나</span>' : `<div style="display:flex;gap:6px">
      <button data-k="${esc(u.username)}" onclick="admResetPin(this.dataset.k)" style="background:#1a3a28;border:1px solid var(--g);border-radius:8px;color:var(--g);font-size:11px;font-weight:600;cursor:pointer;padding:5px 10px">🔑 PIN</button>
      <button data-k="${esc(u.username)}" onclick="admDelUser(this.dataset.k)" style="background:#3d1a1a;border:1px solid #6a2020;border-radius:8px;color:var(--r);font-size:11px;font-weight:600;cursor:pointer;padding:5px 10px">삭제</button>
    </div>`}</div>`).join('');
}
async function admResetPin(u) {
  const n = prompt(u + ' 님의 새 비밀번호 (숫자 4자리):', ''); if (!n || !/^\d{4}$/.test(n)) { toast('⚠️ 숫자 4자리가 필요해요'); return; }
  const r = await callAPI(() => API.resetUserPin(u, n));
  toast(r.ok ? '✅ ' + u + ' 비밀번호 변경' : '❌ 실패');
}
async function admDelUser(u) {
  if (!await askConfirm('회원 삭제', `"${u}" 님을 삭제할까요?\n라운드 기록도 함께 삭제됩니다.`, '삭제하기')) return;
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
  const today = todayYMD();

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
  <div style="background:var(--bg3);border-left:3px solid var(--g);border-radius:8px;padding:10px 12px;margin:6px 0;font-size:13px;color:var(--t2);line-height:1.6">🛡️ <b style="color:var(--t)">이번엔</b> 어떤 경우에도 라운드 기록이 지워지지 않도록 저장 방식을 바꿨어요.</div>

  ${S('📣 이번 업데이트')}
  ${li('🛡️ <b>기록이 사라지던 문제 수정</b> — 여러 명이 같은 시간에 저장하면 서로의 기록을 덮어써 지난 기록이 사라질 수 있었어요. 이제 저장은 한 번에 하나씩 처리되고, 서버는 기록을 고치거나 추가만 해요. 보낸 목록에 없다고 지우지 않아요.')}
  ${li('🗑️ <b>삭제도 안전하게</b> — 직접 지운 라운드도 서버에서는 "삭제 표시"만 하고 내용은 보관해요. 매일 데이터 파일 전체를 백업하고, 모든 변경 기록도 따로 쌓아 둬요.')}
  ${li('🔒 <b>이 기기가 지켜요</b> — 서버 목록에서 기록이 이유 없이 사라진 것처럼 보이면, 앱이 이 기기에 있던 기록을 서버에 다시 올려 지켜요.')}
  ${li('👥 같은 골프장에서 여러 명이 동시에 스코어를 입력해도 서로 영향을 주지 않아요.')}
  ${li('🗺️ <b>골프장 홀맵 동시 수정</b> — 관리자·사용자 여러 명이 같은 골프장을 동시에 고쳐도, 각자 바꾼 홀만 반영돼 서로의 수정이 지워지지 않아요.')}
  ${li('🔑 <b>로그아웃·PIN 초기화에도 안전</b> — 인터넷이 끊겨 아직 못 올린 기록이 있을 때 로그아웃되거나 관리자가 PIN 을 초기화해도 기록이 지워지지 않아요. 같은 이름으로 다시 로그인하면 자동으로 올라가요.')}

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
  <div class="tx-help">홈 <b style="color:var(--t)">[＋ 추가]</b> → 날짜·날씨·동반자·메모 → <b style="color:var(--t)">[골프장 선택]</b>.</div>

  ${S('② 골프장 고르기')}
  <div class="tx-help"><b style="color:var(--a)">리스트는 아직 채우는 중</b>(현재 ${courseCnt}곳)이라, 없으면 <b style="color:var(--t)">[＋ 추가]</b>로 직접 등록해 바로 쓰면 돼요. 등록한 곳은 목록에 남습니다.</div>

  ${S('③ 홀 파(par) 확인·변경')}
  <div class="tx-help">각 홀 화면 위쪽에 그 홀의 파(파3/4/5)가 이미 골라진 채로 떠요. 다르면 탭해서 바로 바꿀 수 있어요. <b style="color:var(--a)">이 라운드에 바로 적용되고, 마스터와 값이 다르면 공식 코스 데이터에도 함께 저장돼 다른 사람이 같은 골프장·코스 조합을 고를 때도 그대로 보여요</b>(저장 실패해도 이 라운드 입력엔 지장 없음). 상단 <b>⛳ 파수정</b>으로 18홀을 한 번에 고칠 수도 있어요.</div>

  ${S('④ 홀마다 입력하는 것')}
  ${btn('온그린까지', '티샷부터 그린에 공을 올릴 때까지 친 타수. ＋/－로 조정. <b>스코어는 이 값에 퍼팅 수를 더해 자동 계산</b>돼요 — 직접 두드리지 않아요.')}
  ${btn('퍼팅', '그린에서 홀에 넣기까지 친 횟수. 0(칩인)도 가능해요.')}
  ${btn('결과 배너', '위 두 값으로 계산된 스코어(파·보기·더블 등)를 실시간으로 보여줘요. 오버파도 함께 표시.')}
  ${btn('GIR', '자동 계산돼요. <b>온그린까지 타수 ≤ 파−2</b>면 ON — 따로 누를 필요 없어요.')}
  ${btn('티샷 결과', '페어웨이 / 러프 / 벙커 / 해저드 / OB 중 하나를 선택해요(파3은 페어웨이 대신 온그린이고, 러프·벙커는 파3도 똑같이 골라요). <b>페어웨이 = FIR 반영(파4·5)</b> · <b>온그린·러프·벙커 = FIR 미반영, 페널티 없음</b> · <b>해저드·OB = 페널티</b>.<br><b>🔄 멀리건</b>은 결과와 따로 켜는 버튼이에요 — 멀리건을 받았으면 켜고, 결과 칩에는 <b>다시 친 샷</b>의 결과를 골라요(예: 멀리건 + 페어웨이 = 멀리건 받고 친 샷이 페어웨이). 멀리건은 첫 샷이 OB·해저드였다는 뜻이라 FIR·티샷 페널티율은 <b>첫 샷 기준(페널티)</b>으로 세고, 다시 친 샷은 "멀리건 살림률"로 따로 집계해요(스코어에 벌타는 안 붙어요). 드라이버 진단(페어웨이%·OB/해저드 홀 수)에 쓰여요.<br><b style="color:var(--a)">GIR은 이 선택과 무관하게</b> "온그린까지 타수"만으로 계산돼요(파3도 온그린 칩이 아니라 온그린까지 타수가 1 이하면 GIR).<br><b style="color:var(--a)">주의: 해저드·OB를 골라도 벌타가 스코어에 자동으로 더해지지 않아요.</b> 실제 벌타는 "온그린까지 타수"에 직접 포함해서 넣어야 해요(예: OB면 재출발 포함해 온그린까지 늘어난 타수 그대로 입력).')}
  ${btn('레귤러온 실패 시 숏게임 창', '"온그린까지" 타수가 정규타수(파−2)보다 많아지면 아래에 숏게임 창이 새로 떠요. <b>숏게임(100m 이내)을 얼마나 붙였나요?</b>에서 컨시드 / 🦶🏻5 이내 / 🦶🏻6~10 / 🦶🏻11~20 / 🦶🏻21 이상 중 하나를 고르고(🦶🏻 = 발자국 수, 한 걸음 약 0.8m)(다시 누르면 해제), 필요하면 <b>티샷 외 해저드·OB</b> 횟수도 같이 더하세요. 티샷 결과는 첫 샷만 기록하므로, 어프로치 등 다른 샷에서 난 해저드·OB는 여기에 기록해요. <b>스코어에는 영향 없어요</b>(이미 "온그린까지 타수"에 포함) — 통계의 숏게임 근접률·거리별 1퍼트율 분석에 쓰여요.')}

  ${S('⑤ 이동·저장')}
  <div class="tx-help">맨 위 전반/후반 진행 막대를 탭하면 해당 홀로 바로 이동. 값을 바꾸면 그 즉시 자동 저장되고, <b style="color:var(--g)">저장·다음 홀 →</b>로 다음 홀로 넘어가요. 18번 홀에서는 <b style="color:var(--g)">저장·완료</b>로 마무리. 덜 쳤는데 뒤로 가면 <b style="color:var(--a)">작성중</b>으로 임시저장돼 이어서 입력 가능. 저장 후 라운드를 탭하면 🔧수정·🗑삭제·📤공유.</div>

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
  ${it('발전 한 줄 · 발전 추세', '초기 vs 최근 평균 비교로 발전 정도를 보여줘요. 추세 그래프는 지표(스코어/퍼팅/GIR/FIR/티샷패널티/<b>기복</b>)를 골라 5R 이동평균선·라운드당 변화량(개선/정체/주의)으로 표시. 그래프는 모든 지표가 <b>위로 갈수록 좋음</b>이에요(예: 스코어가 줄면 선이 올라감). 숫자는 실제 값의 변화 그대로예요(스코어가 줄면 −). <b>기복</b>은 최근 5R 스코어 편차의 흐름(작아질수록 일정해짐).')}

  ${S('스코어')}
  ${it('평균 스코어·오버파·기복', '총타수 평균 / 오버파(+오버·−언더) / 점수 편차(작을수록 일정).')}
  ${it('실력 비율 · 블로업', '홀 기준 파 이하·보기·더블+ 비율. 블로업 = 라운드당 트리플보기↑ 홀.')}
  ${it('파 종류별 · 전·후반', '파3·4·5별 오버파 평균에 더해, 파3은 GIR / 파4·5는 FIR·GIR을 함께 보여줘 어느 홀 유형에서 어느 구간이 약한지 진단. / 앞뒤 9홀 평균·차이(후반 무너짐).')}
  ${it('💥 큰 실수의 원인', '블로업(트리플보기 이상, 파보다 3타↑) 홀이 무엇 때문이었는지 원인별로 세요(한 홀에 겹칠 수 있음). 티샷 사고 = 티샷 결과가 해저드·OB · 3퍼팅↑ = 퍼팅 3 이상 · 그린 미스 = GIR 실패이면서 티샷 사고가 아닌 홀.')}

  ${S('🚩 구간별 (라운드 상세 · 통계 공통)')}
  ${it('티샷 안정성 (Off-the-Tee · 파3~5)', '<b>첫 샷 기준</b> 티샷 페널티율((OB+해저드+멀리건) 홀 ÷ 전체 홀) · OB·해저드·멀리건 홀 수 · 멀리건 받고 다시 친 샷의 결과(멀리건 살림률 = 다시 친 샷이 페널티 없이 살아난 비율) · 안전 미스(러프·벙커, 페널티 없음) 개수와 비율. 러프·벙커 개별 구분은 v12.37 이후 입력분만 가능해요.')}
  ${it('드라이버 안정성 (Driver · 파4·5)', '<b>기준</b> = 페어웨이에 떨어진 홀들의 온그린까지 평균 타수. 러프·벙커·해저드·OB·멀리건 등 결과별로 이 기준보다 온그린까지 평균 몇 타 더 걸렸는지가 "1회당 손실"이고, 라운드에 나온 횟수만큼 곱해 더한 값이 <b>드라이버 손실 타수</b>예요(퍼팅 제외). 예) 러프 1회당 0.4타 손실 × 4번 = 1.6타. 기록이 적으면 고정값(OB 2타·해저드 1타·그 외 0타)과 섞어 추정해요. FIR = 페어웨이 적중률. 티샷 결과를 선택하지 않은 홀은 제외.')}
  ${it('아이언·웨지 정확도 (Approach)', '<b>기준</b> = 레귤러온 타수(파−2)까지 온그린, 그린을 놓쳐도 칩 1타+1퍼트면 파(정상). 홀마다 "온그린까지 타수 − 레귤러온 타수"에서 드라이버 몫과(그린 미스 홀이면) 칩 1타를 빼서 더한 라운드 평균이 <b>아이언 손실 타수</b>예요. 예) 파4 페어웨이→칩 두 번 만에 온그린(4타) = 1타 손실. GIR(그린 적중률)도 함께 표시. "티샷 외 해저드·OB"를 입력한 홀이 있으면 아이언 손실을 "벌타 때문"과 "거리감·클럽 선택 등 나머지"로 나눠서도 보여줌.')}
  ${it('숏게임 능력 (Short Game)', '<b>기준</b> = 그린 놓친 홀에서 업앤다운(칩 1타+1퍼트=파). "퍼트 수 − 1"을 더해 라운드 평균 낸 값이 <b>숏게임 손실 타수</b>예요. 예) 칩 온 후 2퍼트 = 1타 손실, 칩 온 후 1퍼트 = 0타, 칩인 = −1타. 업앤다운(그린 놓친 홀에서 마지막 온그린 샷 뒤 1퍼트 이하로 마무리한 비율 — 그린 올리기 전 미스샷·레이업 타수는 안 봄) · 근접률(어프로치를 컨시드·🦶🏻5 이내로 붙인 비율) · 붙인 거리별(컨시드/🦶🏻5 이내/🦶🏻6~10/🦶🏻11~20/🦶🏻21 이상, 🦶🏻 = 발자국 수·한 걸음 약 0.8m) 1퍼트율(칩인 포함)·평균 퍼트·3퍼트율·손실 타수. 붙인 거리는 v12.51 이후 입력분만 집계돼요.')}
  ${it('⚠️ 티샷 외 해저드·OB', '티샷(첫 샷)이 아닌 샷에서 난 해저드·OB 횟수(라운드당)와 벌타 추정 타수(해저드 1타·OB 2타). 숏게임과 따로 보여줘요.')}
  ${it('퍼팅 효율성 (Putting)', '<b>기준</b> = 레귤러온 성공 홀은 2퍼트(정상). "퍼트 수 − 2"를 더해 라운드 평균 낸 값이 <b>퍼팅 손실 타수</b>예요(그린 적중 홀만). 예) 2퍼트 = 0타, 1퍼트 = −1타(이득), 3퍼트 = +1타(손실). 그 외 PPR(총 퍼팅) · 홀당 평균 · GIR 시 평균 퍼트(순수 퍼팅력) · 3퍼트 이상 비율 · 1퍼트율 · 퍼팅 분포(1/2/3/4+)도 함께 봐요. 드라이버·아이언·숏게임·퍼팅 손실은 한 타를 한 구간에만 배정해 합계가 평균 오버파와 같아요. 라운드 상세에서는 각 값에 내 평균 대비 🟢🟡🔴 신호등과 평균값이 붙어요(3R↑).')}

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
// 화면의 "뒤로" 버튼 · 스와이프 백이 공통으로 부르는 통로.
// showPg() 가 쌓아둔 히스토리 보초가 있으면 history.back() 으로 소비해 안드로이드 뒤로가기와 동기화하고,
// (드물게) 보초가 없으면 동작을 바로 실행한다.
function backOut() {
  const action = BACK_ACTIONS[curPg()];
  if (!action) return;
  if (IS_IOS) { action(); return; }                               // iOS: 히스토리 거치지 않고 바로 실행
  if (backGuardPushed) history.back(); else action();
}
// 안드로이드 하드웨어/제스처 뒤로가기: 위 보초 항목이 팝되면서 오는 이벤트.
// 열린 모달이 있으면 맨 위 모달부터 닫고(페이지는 그대로 둠), 없으면 스와이프 백과 똑같이
// 현재 화면에 등록된 동작을 실행해 "이전 메뉴로" 돌아가게 한다.
window.addEventListener('popstate', () => {
  if (IS_IOS) return;                                             // iOS는 보초를 안 쌓으므로 반응할 것이 없음
  // 모달을 직접(닫기 버튼·배경탭) 닫으며 그 모달의 히스토리만 소비한 것 — 아래 모달·페이지는 그대로.
  // (이 확인을 모달 스택보다 먼저 해야 한다: 라운드 상세 위의 홀 상세를 "닫기"로 닫으면 스택에 라운드 상세가
  //  남아 있어서, 순서가 반대면 라운드 상세까지 같이 닫혀버렸다)
  if (_suppressPageBack) { _suppressPageBack = false; return; }
  if (_modalStack.length) { _modalPopFromBack = true; cm(_modalStack[_modalStack.length - 1]); return; }
  backGuardPushed = false;                                        // 페이지 보초는 실제 소비 여부와 무관하게 항상 초기화(안 그러면 다음 진입 때 다시 안 쌓여 뒤로가기가 먹통이 된다)
  const action = BACK_ACTIONS[curPg()];
  if (action) action();
});
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
      setTimeout(() => { backOut(); el.style.transition = el.style.transform = el.style.opacity = ''; }, 180);
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
    pendSwitchUser(s.u);                           // (예전 버전에서 넘어온 기기) 대기목록 주인을 표시
    let shownFromCache = false;
    try {
      const cache = JSON.parse(localStorage.getItem('og_cache') || 'null');  // 지난번 받아둔 데이터로 즉시 화면 표시
      if (cache && cache.rounds) {
        A.rounds = mergeRounds(cache.rounds, pendGet()).rounds;   // 캐시 위에 아직 못 올린 변경도 얹어서 표시
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
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { flushAutoSave(); delRelease(); } else syncRounds(); });
window.addEventListener('pagehide', () => { flushAutoSave(); delRelease(); });   // 되돌리기 대기 중인 삭제도 곧바로 서버로

// ── 실시간 동기화: 다른 기기(폰↔PC)에서 바꾼 기록이 새로고침 없이 보이도록 ──
// 앱·탭·창으로 돌아올 때, 그리고 화면이 켜져 있는 동안 20초마다 서버 기록을 다시 받는다(10초에 한 번까지).
async function syncRounds() {
  if (!A.u || !API.token || Date.now() - _lastSync < 10000) return;
  _lastSync = Date.now();
  checkAppUpdate();
  const f = await fetchRounds();
  if (f.rr && f.rr.err === '인증실패') { logoutSilent(); return; }
  if (f.changed && curPg() === 'home') renderHome();
  if (f.needSync) pushRounds();
}
window.addEventListener('focus', syncRounds);
setInterval(() => { if (document.visibilityState === 'visible') syncRounds(); }, 20000);

// ── 새 버전이 배포되면 기기마다 자동으로 새 코드로 바꾼다 ──
// 옛 버전을 띄워둔 기기(예: 켜둔 PC 크롬 탭)가 남아 있으면 기기마다 동작이 달라지므로,
// index.html 이 가리키는 app.js 버전이 지금과 다르면 새로고침한다. 스코어 입력 중이거나 창이 열려 있으면 미룬다.
let _lastUpdCheck = 0;
async function checkAppUpdate() {
  if (Date.now() - _lastUpdCheck < 5 * 60 * 1000) return;
  _lastUpdCheck = Date.now();
  try {
    const html = await (await fetch('index.html?_=' + Date.now(), { cache: 'no-store' })).text();
    const m = html.match(/app\.js\?v=([\d.]+)/);
    if (!m || m[1] === APP_VERSION.replace(/^v/, '')) return;
    if (sessionStorage.getItem('og_upd') === m[1]) return;   // 같은 버전으로 이미 한 번 새로고침했으면 반복하지 않음
    if (!['home', 'stat', 'login'].includes(curPg()) || _modalStack.length) { _lastUpdCheck = 0; return; }
    sessionStorage.setItem('og_upd', m[1]);
    location.reload();
  } catch (e) {}
}
