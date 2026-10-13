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

console.log(`\n${fail === 0 ? '✅' : '❌'} 통과 ${pass} · 실패 ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
