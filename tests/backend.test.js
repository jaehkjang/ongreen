// ============================================================
// tests/backend.test.js — 서버(backend/Apps_Script.gs) 라운드 저장 안전장치 테스트
//
// 2026-10-13 사고(여러 명이 동시에 저장하다 지난 기록 전체가 덮어써짐) 재발 방지 검사.
// 실제 Apps_Script.gs 소스를 가짜 구글 시트(tests/gas-mock.js) 위에서 돌립니다.
//
// 실행:  node tests/backend.test.js      (설치할 것 없음 · 프레임워크 없음)
// ============================================================

const { makeBackend } = require('./gas-mock');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}\n     → ${e.message}`); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || '조건이 거짓입니다'); }
const ids = rs => rs.map(r => Number(r.id)).sort((a, b) => a - b);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const R = (id, score, extra) => Object.assign({ id, score, date: '2026.10.' + String(id % 28 + 1).padStart(2, '0'), courseName: 'Dazaifu', scores: Array(18).fill(5) }, extra || {});

function setup() {
  const b = makeBackend();
  ['장재혁', '박유림', '오지훈', '관리자'].forEach(u => b.api.login(u));
  return b;
}

console.log('\n🔍 서버 라운드 저장 안전장치 테스트\n');
console.log('[절대 안 지움] 저장이 기록을 지우지 않는가');

t('빈 목록으로 저장해도 기존 기록이 하나도 안 지워진다 (10/13 사고 재현)', () => {
  const b = setup();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 90), R(2, 88), R(3, 95)] });
  b.api.post('장재혁', { action: 'saveRounds', rounds: [] });
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(4, 98)] });       // 오늘 라운드만 올림
  const got = b.api.get('장재혁', 'getRounds');
  assert(eq(ids(got.rounds), [1, 2, 3, 4]), `지난 기록이 남아야 하는데 [${ids(got.rounds)}]`);
});

t('저장은 시트를 비우지(clearContents) 않는다', () => {
  const b = setup();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 90)] });
  b.api.post('박유림', { action: 'saveRounds', rounds: [R(2, 91)] });
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 85)] });
  assert(!b.roundsSheet().clearCount, '라운드 시트를 비우면 그 순간 다른 사람의 조회가 "0개"를 받는다');
});

t('같은 골프장에서 여러 명이 번갈아 저장해도 서로의 기록이 안 사라진다', () => {
  const b = setup();
  b.api.post('오지훈', { action: 'saveRounds', rounds: [R(10, 97), R(11, 91)] });
  for (let hole = 1; hole <= 18; hole++) {                                  // 두 사람이 홀마다 자동저장
    b.api.post('장재혁', { action: 'saveRounds', rounds: [R(100, hole * 5)] });
    b.api.post('박유림', { action: 'saveRounds', rounds: [R(200, hole * 5)] });
  }
  assert(eq(ids(b.api.get('장재혁', 'getRounds').rounds), [100]), '장재혁 라운드');
  assert(eq(ids(b.api.get('박유림', 'getRounds').rounds), [200]), '박유림 라운드');
  assert(eq(ids(b.api.get('오지훈', 'getRounds').rounds), [10, 11]), '저장 안 한 오지훈 기록도 그대로');
  assert(b.api.get('장재혁', 'getRounds').rounds[0].score === 90, '마지막 홀 값이 저장돼야 함');
});

t('다른 사람이 저장 중(잠금)이면 쓰지 않고 실패로 알린다 → 앱이 기기에 보관 후 재시도', () => {
  const b = setup();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 90)] });
  b.setLockHeld(true);
  const r = b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 80)] });
  b.setLockHeld(false);
  assert(r.ok === false, '잠금을 못 잡으면 ok:false 여야 함');
  assert(b.api.get('장재혁', 'getRounds').rounds[0].score === 90, '잠금 실패 시 아무것도 바뀌면 안 됨');
});

console.log('\n[삭제] 지우기는 콕 집은 것만, 표시만 하는가');

t('dels 로 지운 라운드는 목록에서 빠지고 deleted 로 알려준다(줄은 남음)', () => {
  const b = setup();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 90), R(2, 88)] });
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 90)], dels: [2] });
  const got = b.api.get('장재혁', 'getRounds');
  assert(eq(ids(got.rounds), [1]), `2번은 목록에서 빠져야 하는데 [${ids(got.rounds)}]`);
  assert(eq(got.deleted.map(Number), [2]), '삭제 표시 id 를 알려줘야 함');
  assert(b.roundsSheet().getLastRow() === 3, '시트 줄(머리글+2)은 그대로 남아야 함');
});

t('지운 라운드를 옛 기기가 옛 목록으로 다시 보내도 되살아나지 않는다', () => {
  const b = setup();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 90, { updatedAt: 100 }), R(2, 88, { updatedAt: 100 })] });
  b.tick();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [], dels: [2] });
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 90, { updatedAt: 100 }), R(2, 88, { updatedAt: 100 })] });   // PC 의 옛 목록
  assert(eq(ids(b.api.get('장재혁', 'getRounds').rounds), [1]), '지운 2번이 되살아나면 안 됨');
});

t('삭제 뒤에 새로 고친 값(입력 중이던 라운드)은 되살린다 — 치는 도중 기록 보호', () => {
  const b = setup();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 90, { updatedAt: 100 })] });
  b.api.post('장재혁', { action: 'saveRounds', rounds: [], dels: [1] });
  const later = b.g.Date.now() + 5000;
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 70, { updatedAt: later })] });
  const got = b.api.get('장재혁', 'getRounds');
  assert(eq(ids(got.rounds), [1]) && got.rounds[0].score === 70, '삭제 뒤 고친 라운드는 살아나야 함');
});

t('다른 사람의 라운드 id 로 dels 를 보내도 남의 기록은 안 지워진다', () => {
  const b = setup();
  b.api.post('박유림', { action: 'saveRounds', rounds: [R(5, 95)] });
  b.api.post('장재혁', { action: 'saveRounds', rounds: [], dels: [5] });
  assert(eq(ids(b.api.get('박유림', 'getRounds').rounds), [5]), '박유림 기록이 남아야 함');
});

t('회원 삭제도 라운드 기록은 지우지 않고 표시만 한다', () => {
  const b = setup();
  b.api.post('오지훈', { action: 'saveRounds', rounds: [R(10, 97)] });
  b.api.post('관리자', { action: 'deleteUser', target: '오지훈' });
  const rows = b.roundsSheet().getRange(2, 1, b.roundsSheet().getLastRow() - 1, 16).getValues();
  assert(rows.some(r => r[0] === '오지훈' && r[15]), '오지훈 줄이 삭제 표시로 남아 있어야 함');
  const arch = b.main.getSheetByName('삭제된_회원');
  assert(arch && arch.getRange(2, 2).getValue() === '오지훈', '삭제한 회원 계정 줄도 따로 보관돼야 함');
});

console.log('\n[덮어쓰기 방지] 옛 기기의 옛 값이 새 값을 덮지 않는가');

t('더 오래된 수정본(updatedAt 작음)은 새 수정본을 덮지 않는다', () => {
  const b = setup();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 80, { updatedAt: 200 })] });
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 99, { updatedAt: 100 })] });
  assert(b.api.get('장재혁', 'getRounds').rounds[0].score === 80, '새 값(80)이 남아야 함');
});

t('updatedAt 없는 옛 라운드도 지금처럼 수정 저장된다', () => {
  const b = setup();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 90)] });
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 85)] });
  assert(b.api.get('장재혁', 'getRounds').rounds[0].score === 85, '수정이 반영돼야 함');
});

console.log('\n[일지·호환] 기록이 남고 옛 시트와 맞는가');

t('모든 추가·수정·삭제가 라운드_기록 시트에 쌓인다', () => {
  const b = setup();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 90)] });
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 85)] });
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 85)] });       // 바뀐 게 없으면 안 쌓임
  b.api.post('장재혁', { action: 'saveRounds', rounds: [], dels: [1] });
  const log = b.logSheet().getRange(2, 1, b.logSheet().getLastRow() - 1, 5).getValues().map(r => r[3]);
  assert(eq(log, ['추가', '수정', '삭제']), `일지가 [추가,수정,삭제] 여야 하는데 [${log}]`);
});

t('예전(15칸) 시트의 줄도 그대로 읽고, 그 자리에서 고친다', () => {
  const b = setup();
  const sh = b.g.sheet_('라운드');
  sh.data = [sh.data[0].slice(0, 15), ['장재혁', '2026.09.01', 'X', '', '', '', '', 90, 18, 72, 36, 0, 0, 0, JSON.stringify(R(1, 90))],
    ['박유림', '2026.09.02', 'Y', '', '', '', '', 91, 19, 72, 36, 0, 0, 0, JSON.stringify(R(2, 91))]];
  sh.maxCols = 15;
  assert(eq(ids(b.api.get('장재혁', 'getRounds').rounds), [1]), '옛 줄을 읽어야 함');
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 84)] });
  assert(sh.getLastRow() === 3, '새 줄이 아니라 그 자리에서 고쳐야 함');
  assert(b.api.get('장재혁', 'getRounds').rounds[0].score === 84 && eq(ids(b.api.get('박유림', 'getRounds').rounds), [2]), '값 반영 + 남의 줄 보존');
});

t('목록은 날짜 최신순으로 돌려준다', () => {
  const b = setup();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 90, { date: '2026.07.01' }), R(2, 90, { date: '2026.10.13' }), R(3, 90, { date: '2026.09.01' })] });
  assert(eq(b.api.get('장재혁', 'getRounds').rounds.map(r => r.id), [2, 3, 1]), '최신 날짜가 먼저');
});

t('인증(토큰·PIN 해시) 계산은 예전과 똑같다 — 기존 로그인이 안 풀림', () => {
  const b = setup();
  const crypto = require('crypto');
  const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
  assert(b.g.hashPin_('1234') === sha('1234' + 'test-secret'), 'PIN 해시 계산식이 바뀜');
  assert(b.g.makeToken_('장재혁', 'abc') === sha('장재혁' + 'abc' + 'test-secret'), '토큰 계산식이 바뀜');
});

console.log('\n[복구] 시트 과거 버전(xlsx)에서 라운드를 읽어 되살리는가');

// 구글 시트 xlsx 내보내기와 같은 구조(공유 문자열 + 인라인 문자열 섞음)
function fakeXlsx(rows) {
  const ss = [], cellXml = (v, ci, ri) => {
    const ref = String.fromCharCode(65 + ci) + (ri + 1);
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
    if (ci === 14) return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    ss.push(v); return `<c r="${ref}" t="s"><v>${ss.length - 1}</v></c>`;
  };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === '' ? '' : cellXml(v, ci, ri))).join('')}</row>`).join('');
  return {
    'xl/workbook.xml': '<workbook><sheets><sheet name="알림" sheetId="1" r:id="rId1"/><sheet r:id="rId2" name="라운드" sheetId="2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData/></worksheet>',
    'xl/worksheets/sheet2.xml': `<worksheet><sheetData>${body}</sheetData></worksheet>`,
    'xl/sharedStrings.xml': `<sst>${ss.map(s => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`,
  };
}
const HEAD = ['이름','날짜','골프장','코스','날씨','동반자','메모','스코어','파대비','파','퍼팅','GIR%','FIR%','멀리건','상세'];
const row = (u, r) => [u, r.date, 'Dazaifu & "CC" <A>', '', '', '', '', r.score, 0, 72, 36, 0, 0, 0, JSON.stringify(r)];

t('xlsx 의 라운드 탭을 그대로 읽는다(특수문자·한글·JSON 보존)', () => {
  const b = setup();
  const r1 = R(1, 90, { memo: '일본 & "여행" <1일차>' });
  const rows = b.g.xlsxSheetRows_(fakeXlsx([HEAD, row('장재혁', r1), row('박유림', R(2, 91))]), '라운드');
  assert(rows.length === 3 && rows[1][0] === '장재혁' && rows[2][0] === '박유림', '행을 읽어야 함');
  assert(rows[1][2] === 'Dazaifu & "CC" <A>', `특수문자 복원 실패: ${rows[1][2]}`);
  assert(eq(JSON.parse(rows[1][14]), r1), 'JSON 이 그대로여야 함');
});

t('여러 버전에서 모은 뒤, 지금 시트에 없는 라운드만 맨 밑에 추가한다(있는 줄은 안 건드림)', () => {
  const b = setup();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(4, 98, { date: '2026.10.13' })] });   // 사고 뒤: 오늘 것만 남음
  const col = {};
  b.g.collectRows_(col, b.g.xlsxSheetRows_(fakeXlsx([HEAD, row('장재혁', R(1, 92)), row('박유림', R(2, 91))]), '라운드'), '2026-09-01T00:00:00Z');
  b.g.collectRows_(col, b.g.xlsxSheetRows_(fakeXlsx([HEAD, row('장재혁', R(1, 90)), row('장재혁', R(3, 95)), row('박유림', R(2, 91))]), '라운드'), '2026-10-01T00:00:00Z');
  b.g.collectRows_(col, b.g.xlsxSheetRows_(fakeXlsx([HEAD, row('장재혁', R(4, 98))]), '라운드'), '2026-10-13T02:00:00Z');
  const book = b.g.recoverBook_(), shC = book.getSheetByName('수집');
  const all = Object.keys(col).map(k => col[k]);
  shC.getRange(2, 1, all.length, 5).setValues(all);
  const plan = b.g.recoverPlan_();
  const add = plan.add.map(a => a.user + ':' + a.round.id + ':' + a.round.score).sort();
  assert(eq(add, ['박유림:2:91', '장재혁:1:90', '장재혁:3:95']), `되살릴 목록이 틀림: [${add}]`);   // 1번은 더 나중 버전(90) 값
  const sh = b.roundsSheet();
  const rowsAdd = plan.add.map(a => b.g.roundRow_(a.user, a.round, ''));
  sh.getRange(sh.getLastRow() + 1, 1, rowsAdd.length, 16).setValues(rowsAdd);
  assert(eq(ids(b.api.get('장재혁', 'getRounds').rounds), [1, 3, 4]), '장재혁 1·3 복구 + 오늘 4 유지');
  assert(eq(ids(b.api.get('박유림', 'getRounds').rounds), [2]), '박유림 2 복구');
  assert(b.g.recoverPlan_().add.length === 0, '한 번 더 돌려도 중복 추가 없음');
});

t('지금 시트에서 삭제 표시된 라운드나 없는 계정의 라운드는 되살리지 않는다', () => {
  const b = setup();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 90)] });
  b.api.post('장재혁', { action: 'saveRounds', rounds: [], dels: [1] });
  const col = {};
  b.g.collectRows_(col, b.g.xlsxSheetRows_(fakeXlsx([HEAD, row('장재혁', R(1, 90)), row('탈퇴자', R(9, 99))]), '라운드'), '2026-09-01T00:00:00Z');
  const shC = b.g.recoverBook_().getSheetByName('수집');
  const all = Object.keys(col).map(k => col[k]);
  shC.getRange(2, 1, all.length, 5).setValues(all);
  const plan = b.g.recoverPlan_();
  assert(plan.add.length === 0, `되살리면 안 되는데 ${plan.add.length}건`);
  assert(plan.skippedUser['탈퇴자'] === 1, '없는 계정은 건너뛴 개수로 알려줘야 함');
});

console.log('\n[골프장] 관리자·사용자가 동시에 같은 골프장을 고쳐도 서로의 수정이 안 사라지는가');

const COURSE = () => ({ id: 'c1', name: '테스트CC', addr: '서울', layouts: [
  { name: 'A', holes: [4,4,4,4,4,4,4,4,4] }, { name: 'B', holes: [4,4,4,4,4,4,4,4,4] } ] });
function courseSetup() {
  const b = setup(); ['관리자1', '관리자2'].forEach(u => b.api.login(u));
  b.api.post('관리자1', { action: 'saveCourse', course: COURSE(), isEdit: false });
  return b;
}
const getCourse = b => b.api.get('관리자1', 'getCourses').courses.find(c => c.id === 'c1');
const edit = (c, f) => { const x = JSON.parse(JSON.stringify(c)); f(x); return x; };

t('같은 값을 보고 관리자1은 A-1번, 관리자2는 A-5번을 고치면 둘 다 남는다', () => {
  const b = courseSetup();
  const base = getCourse(b);                                          // 둘이 같은 순간 받은 값
  b.api.post('관리자1', { action: 'saveCourse', course: edit(base, c => { c.layouts[0].holes[0] = 5; }), isEdit: true, oldName: base.name, base });
  b.api.post('관리자2', { action: 'saveCourse', course: edit(base, c => { c.layouts[0].holes[4] = 3; }), isEdit: true, oldName: base.name, base });
  const got = getCourse(b).layouts[0].holes;
  assert(got[0] === 5 && got[4] === 3, `두 수정이 모두 남아야 하는데 [${got}]`);
});

t('사용자가 나인을 추가하는 사이 관리자가 주소를 고쳐도 둘 다 남는다', () => {
  const b = courseSetup();
  const base = getCourse(b);
  b.api.post('장재혁', { action: 'saveCourse', course: edit(base, c => { c.layouts.push({ name: 'C', holes: [3,3,3,3,3,3,3,3,3] }); }), isEdit: true, oldName: base.name, base });
  b.api.post('관리자1', { action: 'saveCourse', course: edit(base, c => { c.addr = '경기'; }), isEdit: true, oldName: base.name, base });
  const got = getCourse(b);
  assert(got.addr === '경기', '관리자의 주소 수정');
  assert(got.layouts.map(l => l.name).join() === 'A,B,C', `사용자가 추가한 C 나인이 남아야 하는데 [${got.layouts.map(l => l.name)}]`);
});

t('내가 지운 나인만 빠지고, 남이 지운 나인은 내가 안 고쳤으면 되살아나지 않는다', () => {
  const b = courseSetup();
  const base = getCourse(b);
  b.api.post('관리자1', { action: 'saveCourse', course: edit(base, c => { c.layouts = c.layouts.filter(l => l.name !== 'B'); }), isEdit: true, oldName: base.name, base });
  b.api.post('관리자2', { action: 'saveCourse', course: edit(base, c => { c.layouts[0].holes[8] = 5; }), isEdit: true, oldName: base.name, base });
  const got = getCourse(b);
  assert(got.layouts.map(l => l.name).join() === 'A', `B 는 지워진 채여야 하는데 [${got.layouts.map(l => l.name)}]`);
  assert(got.layouts[0].holes[8] === 5, '관리자2 의 A-9번 수정은 남아야 함');
});

t('base 를 안 보내는 옛 앱은 예전처럼 통째 저장(호환)', () => {
  const b = courseSetup();
  b.api.post('관리자1', { action: 'saveCourse', course: edit(getCourse(b), c => { c.layouts[1].holes[0] = 5; }), isEdit: true, oldName: '테스트CC' });
  assert(getCourse(b).layouts[1].holes[0] === 5, '옛 방식 저장도 반영');
});

console.log('\n[관리자 작업] PIN 초기화·회원삭제·일지 실패가 기록을 지우지 않는가');

t('관리자가 PIN 을 초기화하거나 사용자가 PIN 을 바꿔도 라운드는 그대로', () => {
  const b = setup();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 90), R(2, 88)] });
  b.api.post('관리자', { action: 'resetUserPin', target: '장재혁', pin: '1234' });
  b.api.post('장재혁', { action: 'updatePin', pin: '1234' });
  assert(eq(ids(b.api.get('장재혁', 'getRounds').rounds), [1, 2]), 'PIN 작업 후에도 라운드가 남아야 함');
});

t('라운드_기록(일지) 쓰기가 실패해도 라운드 저장은 성공한다', () => {
  const b = setup();
  b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 90)] });
  const log = b.logSheet(); log.getRange = () => { throw new Error('시트 용량 초과'); };
  const r = b.api.post('장재혁', { action: 'saveRounds', rounds: [R(1, 80)] });
  assert(r.ok === true, '일지 실패로 저장이 실패하면 안 됨');
  assert(b.api.get('장재혁', 'getRounds').rounds[0].score === 80, '값은 저장돼야 함');
});

console.log('\n[무작위 스트레스] 관리자 2명 + 사용자 3명이 뒤섞여 5,000번 작업해도 아무것도 안 사라지는가');

t('라운드: 저장·부분저장·빈 목록·삭제·옛 값 재전송·PIN 변경·잠금 실패가 섞여도 기대값과 정확히 일치', () => {
  let seed = 20261013; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const b = setup(); ['관리자1', '관리자2', '김선호'].forEach(u => b.api.login(u));
  const users = ['관리자1', '관리자2', '장재혁', '박유림', '김선호'];
  const model = {}; users.forEach(u => { model[u] = {}; });       // 기대값: id → 마지막으로 저장된 라운드
  const dead = {}; users.forEach(u => { dead[u] = {}; });         // 직접 지운 id
  const history = {}; users.forEach(u => { history[u] = []; });   // 그 사람이 예전에 보낸 옛 값들
  let nextId = 1, busy = 0;
  for (let step = 0; step < 5000; step++) {
    const u = users[rnd(users.length)], op = rnd(10);
    b.tick(1000);
    const now = b.g.Date.now();
    if (rnd(25) === 0) { b.setLockHeld(true); busy++; }           // 가끔 다른 요청이 잠금을 쥐고 있음 → 실패해야 하고 아무것도 안 바뀌어야
    const locked = (() => { const l = b.g.LockService.getScriptLock(); const ok = l.tryLock(); if (ok) l.releaseLock(); return !ok; })();
    let r;
    if (op <= 3) {                                                // 새 라운드 또는 수정 (일부만 보냄)
      const live = Object.keys(model[u]);
      const id = (op === 0 || !live.length) ? nextId++ : Number(live[rnd(live.length)]);
      const rd = R(id, 70 + rnd(40), { updatedAt: now });
      r = b.api.post(u, { action: 'saveRounds', rounds: [rd] });
      if (!locked) { if (!dead[u][id] || now > 0) { model[u][id] = rd; delete dead[u][id]; } history[u].push(rd); }
    } else if (op === 4) {                                        // 빈 목록 저장(사고 상황)
      r = b.api.post(u, { action: 'saveRounds', rounds: [] });
    } else if (op === 5) {                                        // 직접 삭제
      const live = Object.keys(model[u]); if (!live.length) { b.setLockHeld(false); continue; }
      const id = Number(live[rnd(live.length)]);
      r = b.api.post(u, { action: 'saveRounds', rounds: [], dels: [id] });
      if (!locked) { delete model[u][id]; dead[u][id] = now; }
    } else if (op === 6) {                                        // 켜 둔 옛 기기가 옛 값들을 다시 보냄
      const old = history[u].slice(0, Math.max(1, history[u].length - rnd(5)));
      r = b.api.post(u, { action: 'saveRounds', rounds: old.map(x => Object.assign({}, x, { updatedAt: x.updatedAt })) });
    } else if (op === 7) {                                        // 다른 사람 라운드 id 로 삭제 시도
      const other = users[rnd(users.length)]; const live = Object.keys(model[other]);
      if (live.length && other !== u) r = b.api.post(u, { action: 'saveRounds', rounds: [], dels: [Number(live[0])] });
    } else if (op === 8 && u.indexOf('관리자') === 0) {            // 관리자가 아무나 PIN 초기화(같은 PIN 으로 — 토큰 유지)
      r = b.api.post(u, { action: 'resetUserPin', target: users[rnd(users.length)], pin: '1234' });
    } else {                                                      // 목록 조회(읽기는 잠금 없이 항상 됨)
      r = b.api.get(u, 'getRounds'); r = null;
    }
    if (locked && r && r.ok !== false) throw new Error(`step ${step}: 잠금 중인데 쓰기가 성공으로 처리됨`);
    b.setLockHeld(false);
    for (const x of users) {
      const got = b.api.get(x, 'getRounds').rounds;
      const want = Object.keys(model[x]).map(Number).sort((a, c) => a - c);
      if (!eq(ids(got), want)) throw new Error(`step ${step}(${u}, op${op}) 뒤 ${x} 의 라운드가 [${ids(got)}] — 기대 [${want}]`);
      got.forEach(g0 => { if (g0.score !== model[x][g0.id].score) throw new Error(`step ${step}: ${x} 라운드 ${g0.id} 점수 ${g0.score} ≠ 기대 ${model[x][g0.id].score}`); });
    }
  }
  assert(busy > 50, '잠금 실패 상황도 충분히 섞였어야 함');
  assert(!b.roundsSheet().clearCount, '라운드 시트는 한 번도 비워지지 않아야 함');
});

t('골프장: 관리자·사용자 4명이 옛 값(base)을 들고 1,000번 번갈아 고쳐도 각자 바꾼 홀이 정확히 남는다', () => {
  let seed = 777; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const b = courseSetup(); b.api.login('김선호');
  const who = ['관리자1', '관리자2', '장재혁', '김선호'];
  const snaps = [getCourse(b)];                                    // 사람들이 예전에 받아 둔 값들
  const model = JSON.parse(JSON.stringify(getCourse(b)));
  for (let step = 0; step < 1000; step++) {
    const u = who[rnd(who.length)];
    const base = snaps[Math.max(0, snaps.length - 1 - rnd(4))];   // 최대 3번 전의 낡은 값
    const inc = JSON.parse(JSON.stringify(base));
    const li = rnd(2), hi = rnd(9), v = 3 + rnd(3);
    inc.layouts[li].holes[hi] = v;
    const changed = base.layouts[li].holes[hi] !== v;
    const r = b.api.post(u, { action: 'saveCourse', course: inc, isEdit: true, oldName: base.name, base });
    assert(r.ok, `step ${step}: 저장 실패 ${JSON.stringify(r)}`);
    if (changed) model.layouts[li].holes[hi] = v;                 // 바꾼 홀만 반영, 나머지는 서버 최신 유지
    const got = getCourse(b);
    if (!eq(got.layouts.map(l => l.holes), model.layouts.map(l => l.holes)))
      throw new Error(`step ${step}(${u}): ${JSON.stringify(got.layouts.map(l => l.holes))} ≠ 기대 ${JSON.stringify(model.layouts.map(l => l.holes))}`);
    snaps.push(got);
  }
});

console.log(`\n${fail === 0 ? '✅' : '❌'} 통과 ${pass} · 실패 ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
