// ============================================================
// tests/data-safety.test.js — 라운드 데이터 안전장치 자동 테스트
//
// 이 앱은 "기록(라운드 데이터)"이 가장 중요합니다. 서버 저장이 전체 덮어쓰기라,
// 병합·대기(미동기화) 로직이 틀리면 스코어가 조용히 사라지거나 되살아납니다.
// 그 로직만 골라 실제 app.js 소스에서 뽑아와 검사합니다.
//
// 실행:  node tests/data-safety.test.js      (설치할 것 없음 · 프레임워크 없음)
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// ── app.js 에서 최상위 함수 하나를 이름으로 잘라온다 (중괄호 짝 맞춰서) ──
function extractFn(name) {
  const start = SRC.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`app.js 에 function ${name} 이(가) 없습니다`);
  let i = SRC.indexOf('{', start), depth = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) return SRC.slice(start, i + 1); }
  }
  throw new Error(`function ${name} 의 끝을 못 찾았습니다`);
}

// ── localStorage 흉내 (브라우저 없이 돌리기 위함) ──
function makeStore() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _dump: () => Object.fromEntries(m),
  };
}

// 검사 대상 함수들을 실제 소스에서 뽑아 샌드박스에 올린다
const NAMES = ['sameId', 'pendGet', 'pendSet', 'pendClear', 'markSaved', 'markDeleted', 'pendResolve', 'mergeRounds', 'healRoundLabels'];
const ctx = { localStorage: makeStore(), console, JSON, Object, Array, String, A: { rounds: [], official: [] } };
vm.createContext(ctx);
vm.runInContext(`const PEND_KEY = 'og_pending';\n` + NAMES.map(extractFn).join('\n'), ctx);
const { pendGet, pendClear, markSaved, markDeleted, pendResolve, mergeRounds, sameId, healRoundLabels } = ctx;

// ── 아주 작은 테스트 러너 ──
let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function t(name, fn) {
  ctx.localStorage = makeStore();            // 테스트마다 저장소 초기화
  vm.runInContext('', ctx);
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}\n     → ${e.message}`); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || '조건이 거짓입니다'); }

// 라운드 한 건 만들기 (스코어·퍼팅·GIR·FIR·멀리건·TP 포함)
const R = (id, score, extra) => Object.assign({
  id, score, isDraft: false, courseName: '베르힐영종', courseLbl: '레이크+오션',
  layoutNames: ['레이크', '오션'], holePars: Array(18).fill(4),
  scores: Array(18).fill(5), puttsArr: Array(18).fill(2),
  girArr: Array(18).fill(false), firArr: Array(18).fill(true),
  mulliArr: Array(18).fill(0), tpArr: Array(18).fill(0),
}, extra || {});

console.log('\n🔍 라운드 데이터 안전장치 테스트\n');

console.log('[병합] 오프라인 변경이 서버 값에 덮이지 않는가');

t('오프라인 수정이 다음 로드에서 옛 값으로 되돌아가지 않는다', () => {
  const edited = R(1, 85);                       // 오프라인에서 90 → 85 로 고침
  markSaved(edited);
  const server = [R(1, 90)];                     // 서버엔 아직 옛 값(90)
  const { rounds } = mergeRounds(server, [edited], pendGet());
  assert(rounds.length === 1, `라운드 수가 1이어야 하는데 ${rounds.length}`);
  assert(rounds[0].score === 85, `수정한 85 가 남아야 하는데 ${rounds[0].score} 로 되돌아감`);
});

t('오프라인 삭제한 라운드가 되살아나지 않는다', () => {
  markDeleted(1);
  const server = [R(1, 90), R(2, 88)];           // 서버엔 아직 지운 라운드가 남아있음
  const { rounds } = mergeRounds(server, [R(2, 88)], pendGet());
  assert(rounds.length === 1, `1건만 남아야 하는데 ${rounds.length}건`);
  assert(sameId(rounds[0].id, 2), '지우지 않은 라운드만 남아야 함');
});

t('오프라인 신규 라운드가 유실되지 않는다', () => {
  const fresh = R(99, 92);
  markSaved(fresh);
  const { rounds } = mergeRounds([R(1, 90)], [fresh, R(1, 90)], pendGet());
  assert(rounds.some(r => sameId(r.id, 99)), '오프라인 신규 라운드가 사라짐');
  assert(rounds.some(r => sameId(r.id, 1)), '서버 라운드도 함께 있어야 함');
});

t('대기분이 없으면 서버 값을 그대로 따른다 (정상 동기화)', () => {
  const server = [R(1, 90), R(2, 88)];
  const { rounds, needSync } = mergeRounds(server, [R(1, 90)], pendGet());
  assert(rounds.length === 2, `서버의 2건이 그대로 와야 하는데 ${rounds.length}`);
  assert(needSync === false, '대기분이 없으면 재동기화가 필요 없어야 함');
});

t('서버가 id 를 문자열로 돌려줘도 중복 축적되지 않는다', () => {
  const edited = R(1, 85);
  markSaved(edited);
  const server = [{ ...R(1, 90), id: '1' }];      // 문자열 id
  const { rounds } = mergeRounds(server, [edited], pendGet());
  assert(rounds.length === 1, `중복 없이 1건이어야 하는데 ${rounds.length}건 (id 타입 불일치)`);
  assert(rounds[0].score === 85, '로컬 수정이 반영돼야 함');
});

t('삭제 후 다시 저장하면 삭제가 취소된다', () => {
  markDeleted(1);
  markSaved(R(1, 77));                            // 같은 id 를 다시 저장
  const { rounds } = mergeRounds([R(1, 90)], [], pendGet());
  assert(rounds.length === 1 && rounds[0].score === 77, '다시 저장한 값이 살아있어야 함');
});

console.log('\n[병합] 스코어·퍼팅·GIR·FIR·멀리건·TP 가 보존되는가');

t('병합해도 입력값이 하나도 바뀌지 않는다', () => {
  const mine = R(1, 85, {
    scores: [4,5,3,6,4,4,5,4,3, 5,4,4,6,3,5,4,4,5],
    puttsArr: [2,1,2,3,2,2,1,2,2, 2,2,3,2,1,2,2,2,2],
    girArr: Array(18).fill(true), firArr: Array(18).fill(false),
    mulliArr: [1,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,1],
    tpArr: [0,0,1,0,0,0,0,0,0, 0,0,0,1,0,0,0,0,0],
  });
  markSaved(mine);
  const { rounds } = mergeRounds([R(1, 90)], [mine], pendGet());
  const got = rounds[0];
  ['scores', 'puttsArr', 'girArr', 'firArr', 'mulliArr', 'tpArr', 'holePars'].forEach(k => {
    assert(eq(got[k], mine[k]), `${k} 가 바뀌었습니다`);
  });
  assert(got.score === 85 && got.courseLbl === '레이크+오션', '점수·코스 라벨이 유지돼야 함');
});

console.log('\n[대기목록] 저장이 겹칠 때 변경이 유실되지 않는가');

t('먼저 보낸 저장이 성공해도, 그 뒤 새 변경의 대기표는 남는다', () => {
  const first = R(1, 85);
  markSaved(first);
  const snap = pendGet();                         // 1번 요청이 실어 보낸 대기분
  markSaved(R(2, 91));                            // 요청이 날아간 뒤 생긴 새 변경
  pendResolve(snap);                              // 1번 요청 성공 처리
  const p = pendGet();
  assert(p.edits['2'], '나중에 생긴 변경의 대기표가 지워지면 안 됨');
  assert(!p.edits['1'], '서버에 반영된 변경의 대기표는 지워져야 함');
});

t('보낸 뒤 같은 라운드를 또 고치면 대기표가 유지된다', () => {
  markSaved(R(1, 85));
  const snap = pendGet();
  markSaved(R(1, 80));                            // 전송 후 같은 라운드를 또 수정
  pendResolve(snap);
  const p = pendGet();
  assert(p.edits['1'] && p.edits['1'].score === 80, '최신 수정(80)의 대기표가 남아야 함');
});

t('서버 반영이 확인되면 대기목록이 비워진다', () => {
  markSaved(R(1, 85)); markDeleted(2);
  pendResolve(pendGet());
  const p = pendGet();
  assert(Object.keys(p.edits).length === 0 && p.dels.length === 0, '반영 확인 후엔 대기목록이 비어야 함');
});

console.log('\n[방어] 이상한 입력에도 안 깨지는가');

t('서버 응답에 빈 값·id 없는 항목이 섞여도 걸러낸다', () => {
  const { rounds } = mergeRounds([null, { score: 5 }, R(1, 90)], [], pendGet());
  assert(rounds.length === 1 && sameId(rounds[0].id, 1), '쓰레기 항목이 걸러져야 함');
});

t('대기목록이 깨져 있어도 서버 값으로 정상 동작한다', () => {
  ctx.localStorage.setItem('og_pending', '{잘못된 JSON');
  const { rounds } = mergeRounds([R(1, 90)], [], pendGet());
  assert(rounds.length === 1, '깨진 대기목록 때문에 기록이 사라지면 안 됨');
});

console.log('\n[라벨복구] 뒤바뀐 코스 조합이 스코어를 건드리지 않고 고쳐지는가');

// 베르힐영종: 나인마다 파 구성이 다름 (레이크/오션/스카이)
const LAKE  = [4,5,3,4,4,3,5,4,4];
const OCEAN = [4,3,4,5,4,4,3,5,4];
const SKY   = [5,4,4,3,4,5,4,4,3];
const BERHIL = { id: 'c1', name: '베르힐영종', layouts: [
  { name: '스카이', holes: SKY }, { name: '레이크', holes: LAKE }, { name: '오션', holes: OCEAN } ] };

t('뒤바뀐 라벨(스카이)이 실제 파 구성대로 레이크+오션으로 복구된다', () => {
  const r = R(1, 85, { courseId: 'c1', courseLbl: '스카이+레이크', holePars: [...LAKE, ...OCEAN] });
  delete r.layoutNames;                            // 옛 라운드엔 layoutNames 가 없음
  ctx.A.rounds = [r]; ctx.A.official = [BERHIL];
  const changed = healRoundLabels();
  assert(changed === true, '복구가 일어나야 함');
  assert(r.courseLbl === '레이크+오션', `레이크+오션 이어야 하는데 "${r.courseLbl}"`);
  assert(eq(r.layoutNames, ['레이크', '오션']), 'layoutNames 도 채워져야 함');
});

t('복구해도 스코어·퍼팅·GIR·FIR·멀리건·TP·파는 그대로다', () => {
  const r = R(1, 85, { courseId: 'c1', courseLbl: '스카이+레이크', holePars: [...LAKE, ...OCEAN],
    mulliArr: [1,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,1], tpArr: [0,0,1,0,0,0,0,0,0, 0,0,0,1,0,0,0,0,0] });
  const before = JSON.parse(JSON.stringify(r));
  ctx.A.rounds = [r]; ctx.A.official = [BERHIL];
  healRoundLabels();
  ['score', 'scores', 'puttsArr', 'girArr', 'firArr', 'mulliArr', 'tpArr', 'holePars'].forEach(k => {
    assert(eq(r[k], before[k]), `${k} 가 바뀌었습니다 — 입력값은 절대 건드리면 안 됨`);
  });
});

t('두 나인의 파가 똑같아 구분이 안 되면 건드리지 않는다', () => {
  const SAME = { id: 'c2', name: '같은파CC', layouts: [
    { name: 'A', holes: [4,4,4,4,4,4,4,4,4] }, { name: 'B', holes: [4,4,4,4,4,4,4,4,4] } ] };
  const r = R(1, 85, { courseId: 'c2', courseLbl: 'A+B', holePars: Array(18).fill(4) });
  ctx.A.rounds = [r]; ctx.A.official = [SAME];
  assert(healRoundLabels() === false, '애매하면 추측하지 말고 그대로 둬야 함');
  assert(r.courseLbl === 'A+B', '라벨이 임의로 바뀌면 안 됨');
});

t('이미 올바른 라벨은 그대로 두고 불필요한 저장을 만들지 않는다', () => {
  const r = R(1, 85, { courseId: 'c1', courseLbl: '레이크+오션', layoutNames: ['레이크', '오션'], holePars: [...LAKE, ...OCEAN] });
  ctx.A.rounds = [r]; ctx.A.official = [BERHIL];
  assert(healRoundLabels() === false, '바꿀 게 없으면 false 여야 함(불필요한 서버 저장 방지)');
});

t('공식 목록에 없는 골프장의 라운드는 건드리지 않는다', () => {
  const r = R(1, 85, { courseId: 'zzz', courseName: '없는CC', courseLbl: '어딘가+어딘가' });
  ctx.A.rounds = [r]; ctx.A.official = [BERHIL];
  assert(healRoundLabels() === false, '모르는 코스는 그대로 둬야 함');
});

console.log(`\n${fail === 0 ? '✅' : '❌'} 통과 ${pass} · 실패 ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
