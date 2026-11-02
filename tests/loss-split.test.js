// ============================================================
// tests/loss-split.test.js — 구간별 손실타수(analyze, stat.js) 자동 테스트
//
// 홀마다 (스코어 − 파)를 드라이버·아이언·숏게임·퍼팅에 겹치지 않게 나누는지 검사합니다.
//  · 네 구간 합 = 라운드 오버파
//  · 해저드·OB 드라이버 손실은 벌타 그대로(1타·2타) — 본인 기록으로 추정하지 않음
//  · 벌타 때문에만 그린을 놓친 홀은 칩 1타를 빼지 않음(아이언이 "이득"처럼 나오던 문제, v12.70.1)
//
// 실행:  node tests/loss-split.test.js      (설치할 것 없음 · 프레임워크 없음)
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'stat.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function grab(src, head, endTok) {
  const start = src.indexOf(head);
  if (start < 0) throw new Error(`${head} 를 못 찾았습니다`);
  return src.slice(start, src.indexOf(endTok, start) + endTok.length);
}
function extractFn(name) {
  const start = SRC.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`stat.js 에 function ${name} 이(가) 없습니다`);
  let i = SRC.indexOf('{', start), depth = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) return SRC.slice(start, i + 1); }
  }
  throw new Error(`function ${name} 의 끝을 못 찾았습니다`);
}

const ctx = { console, Math, Array, Object };
vm.createContext(ctx);
vm.runInContext([
  'function roundPars(r) { return r.holePars; }',
  grab(APP, 'const AP_OPTS =', '];'), grab(APP, 'const AP_NEAR =', '];'),
  grab(SRC, 'const MULL_HZ =', ';'), grab(SRC, 'const DRIVE_CATS =', '];'), grab(SRC, 'const DRIVE_K =', ';'),
  extractFn('onRegOf'), extractFn('teeCatOf'), extractFn('analyze'),
  'this.analyze = analyze;',
].join('\n'), ctx);
const { analyze } = ctx;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}\n     → ${e.message}`); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || '조건이 거짓입니다'); }
const near = (a, b) => Math.abs(a - b) < 1e-9;
const sum4 = a => a.driveLossRound + a.ironLossRound + a.shortLossRound + a.puttLossRound;

// 18홀 모두 파4 · 페어웨이 · 레귤러온 · 2퍼트 파인 라운드에서 0번 홀만 바꾼다
function R(h) {
  const r = { holePars: Array(18).fill(4), scores: Array(18).fill(4), puttsArr: Array(18).fill(2), girArr: Array(18).fill(1),
    firArr: Array(18).fill(1), tpArr: Array(18).fill(0), mulliArr: Array(18).fill(0), missArr: Array(18).fill(''),
    xhzArr: Array(18).fill(0), xobArr: Array(18).fill(0), apArr: [] };
  Object.entries(h).forEach(([k, v]) => { r[k][0] = v; });
  return r;
}

console.log('\n구간별 손실타수 (analyze)');
t('전부 파 → 네 구간 모두 0', () => {
  const a = analyze([R({})]);
  assert(near(sum4(a), 0) && near(a.ironLossRound, 0), JSON.stringify([a.driveLossRound, a.ironLossRound]));
});
t('파4 티샷 해저드 → 3온 2퍼트 보기 → 드라이버 +1 · 아이언 0 · 숏게임 0 · 퍼팅 0', () => {
  const a = analyze([R({ scores: 5, girArr: 0, firArr: 0, tpArr: 1 })]);
  assert(near(a.driveLossRound, 1) && near(a.ironLossRound, 0) && near(a.shortLossRound, 0) && near(a.puttLossRound, 0),
    JSON.stringify([a.driveLossRound, a.ironLossRound, a.shortLossRound, a.puttLossRound]));
});
t('파4 티샷 OB → 4온 3퍼트 트리플 → 드라이버 +2 · 아이언 0 · 퍼팅 +1', () => {
  const a = analyze([R({ scores: 7, puttsArr: 3, girArr: 0, firArr: 0, tpArr: 2 })]);
  assert(near(a.driveLossRound, 2) && near(a.ironLossRound, 0) && near(a.puttLossRound, 1) && near(a.shortLossRound, 0),
    JSON.stringify([a.driveLossRound, a.ironLossRound, a.shortLossRound, a.puttLossRound]));
});
t('파4 티샷 해저드 → 4온(칩 온) 1퍼트 보기 → 드라이버 +1 · 아이언 0 · 숏게임 0', () => {
  const a = analyze([R({ scores: 5, puttsArr: 1, girArr: 0, firArr: 0, tpArr: 1 })]);
  assert(near(a.driveLossRound, 1) && near(a.ironLossRound, 0) && near(a.shortLossRound, 0),
    JSON.stringify([a.driveLossRound, a.ironLossRound, a.shortLossRound]));
});
t('해저드·OB 1회당 손실은 기록과 상관없이 1타·2타 고정', () => {
  const a = analyze([R({ scores: 9, puttsArr: 2, girArr: 0, firArr: 0, tpArr: 1 })]);
  const hz = a.driveCats.find(c => c.k === 'hazard');
  assert(hz.cost === 1 && hz.exact && !hz.approx, JSON.stringify(hz));
  assert(near(a.driveLossRound, 1) && near(a.ironLossRound, 3), JSON.stringify([a.driveLossRound, a.ironLossRound]));
});
t('멀리건 뒤 다시 친 샷 OB → 4온 2퍼트 → 일반 OB 와 같게 드라이버 +2 · 아이언 0', () => {
  for (const m of [1, 2, 3]) {   // 첫 샷 종류(모름·해저드·OB)와 상관없이
    const a = analyze([R({ scores: 6, girArr: 0, firArr: 0, tpArr: 2, mulliArr: m })]);
    assert(near(a.driveLossRound, 2) && near(a.ironLossRound, 0), JSON.stringify([m, a.driveLossRound, a.ironLossRound]));
  }
});
t('멀리건 첫 샷 종류 집계(모름·해저드·OB)', () => {
  const r = R({ mulliArr: 3 }); r.mulliArr[1] = 2; r.mulliArr[2] = 1; r.mulliArr[3] = 3;
  const a = analyze([r]);
  assert(a.mullCount === 4 && a.mulFirst.ob === 2 && a.mulFirst.hz === 1 && a.mulFirst.unk === 1, JSON.stringify(a.mulFirst));
});
t('② 파3 티샷 해저드 → 아이언에 남고, 아이언 벌타 분해에 잡힘', () => {
  const r = R({ scores: 5, girArr: 0, tpArr: 1 }); r.holePars[0] = 3;   // 파3 해저드 → 3온 2퍼트
  const a = analyze([r]);
  assert(near(a.driveLossRound, 0) && near(a.ironLossRound, 1) && near(a.ironPenaltyLossRound, 1) && a.ironPenHoles === 1,
    JSON.stringify([a.driveLossRound, a.ironLossRound, a.ironPenaltyLossRound, a.ironPenHoles]));
});
t('④ 벌타 때문에만 늦은 홀(파4 해저드 → 3온 1퍼트 파)은 업앤다운·거리별 표에서 빠짐', () => {
  const a = analyze([R({ scores: 4, puttsArr: 1, girArr: 0, firArr: 0, tpArr: 1, apArr: 's5' })]);
  assert(a.missGreen === 0 && a.scrPct === null && a.apN === 0, JSON.stringify([a.missGreen, a.scrPct, a.apN]));
});
t('④ 칩을 친 홀(페어웨이 → 3온 1퍼트)은 업앤다운에 그대로', () => {
  const a = analyze([R({ scores: 4, puttsArr: 1, girArr: 0 })]);
  assert(a.missGreen === 1 && a.scrPct === 100, JSON.stringify([a.missGreen, a.scrPct]));
});
t('⑤ 파4 세컨샷 홀인(이글) → 아이언 −2 · 퍼팅 0', () => {
  const a = analyze([R({ scores: 2, puttsArr: 0 })]);
  assert(near(a.ironLossRound, -2) && near(a.puttLossRound, 0), JSON.stringify([a.ironLossRound, a.puttLossRound]));
});
t('⑤ 파3 홀인원 → 아이언 −2', () => {
  const r = R({ scores: 1, puttsArr: 0 }); r.holePars[0] = 3;
  const a = analyze([r]);
  assert(near(a.ironLossRound, -2) && near(a.puttLossRound, 0), JSON.stringify([a.ironLossRound, a.puttLossRound]));
});
t('⑤ 1온 1퍼트 이글은 그대로(아이언 −1 · 퍼팅 −1)', () => {
  const a = analyze([R({ scores: 2, puttsArr: 1 })]);
  assert(near(a.ironLossRound, -1) && near(a.puttLossRound, -1), JSON.stringify([a.ironLossRound, a.puttLossRound]));
});
t('⑥ 옛 기록(missArr 없음)의 티샷 미스는 러프로 드라이버 계산에 들어감', () => {
  const r = R({ scores: 5, girArr: 0, firArr: 0 }); delete r.missArr;
  const a = analyze([r]);
  const rough = a.driveCats.find(c => c.k === 'rough');
  assert(rough.n === 1 && a.driveKnown === 18, JSON.stringify([rough.n, a.driveKnown]));
  assert(a.roughCount === 0, '티샷 안정성의 러프 개수는 그대로(구분 불가)');
});
t('⑥ 새 기록에서 결과를 안 고른 티샷은 그대로 제외', () => {
  const a = analyze([R({ scores: 5, girArr: 0, firArr: 0 })]);
  assert(a.driveCats.find(c => c.k === 'rough').n === 0 && a.driveKnown === 17);
});
t('그린 미스 후 칩 온 2퍼트(페어웨이) → 아이언 0 · 숏게임 +1 (기존 규칙 유지)', () => {
  const a = analyze([R({ scores: 5, girArr: 0 })]);
  assert(near(a.ironLossRound, 0) && near(a.shortLossRound, 1), JSON.stringify([a.ironLossRound, a.shortLossRound]));
});
t('여러 조합에서 네 구간 합 = 라운드 오버파', () => {
  let n = 0;
  for (const par of [3, 4, 5]) for (let s = 2; s <= par + 5; s++) for (let putt = 0; putt <= 4 && putt < s; putt++)
    for (const tp of [0, 1, 2]) for (const xo of [0, 1]) for (const xh of [0, 1]) for (const miss of ['', 'rough']) {
      const og = s - putt, gir = og <= par - 2 ? 1 : 0;
      const r = R({ scores: s, puttsArr: putt, girArr: gir, firArr: miss ? 0 : 1, missArr: miss, tpArr: tp, xobArr: xo, xhzArr: xh });
      r.holePars[0] = par;
      const a = analyze([r]);
      if (!near(sum4(a), s - par)) throw new Error(`par${par} s${s} putt${putt} tp${tp} xo${xo} xh${xh} ${miss}: 합 ${sum4(a)} ≠ ${s - par}`);
      n++;
    }
  assert(n > 300);
});

console.log(`\n결과: ${pass}개 통과 · ${fail}개 실패`);
process.exit(fail ? 1 : 0);
