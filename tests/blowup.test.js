// ============================================================
// tests/blowup.test.js — 블로업(트리플보기 이상) 원인 분해 자동 테스트
//
// blowupPartsOf 가 홀마다 (스코어 − 파)를 원인별로 "겹치지 않게" 나누는지,
// 즉 원인별 타수 합이 그 홀 오버파와 정확히 같은지 확인합니다.
//
// 실행:  node tests/blowup.test.js      (설치할 것 없음 · 프레임워크 없음)
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

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
function extractConst(name) {
  const start = SRC.indexOf(`const ${name} =`);
  if (start < 0) throw new Error(`app.js 에 const ${name} 이(가) 없습니다`);
  return SRC.slice(start, SRC.indexOf('];', start) + 2);
}

const ctx = { console, Math, Array, Object };
vm.createContext(ctx);
// roundPars 는 박제된 holePars 만 쓰는 단순판으로 대체(마스터 코스 조회 불필요)
vm.runInContext(`function roundPars(r) { return r.holePars; }\n` + extractConst('BLOWUP_CATS') + '\n' + extractFn('blowupPartsOf') + '\nthis.blowupPartsOf = blowupPartsOf;', ctx);
const { blowupPartsOf } = ctx;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); pass++; }
  catch (e) { console.log(`  ❌ ${name}\n     → ${e.message}`); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || '조건이 거짓입니다'); }

// 한 홀짜리 라운드(0번 홀만 입력) 만들기
const H = (par, h) => ({
  holePars: [par, ...Array(17).fill(4)],
  scores: [h.s, ...Array(17).fill(0)], puttsArr: [h.putt], girArr: [h.gir ? 1 : 0],
  tpArr: [h.tp || 0], xobArr: [h.xo || 0], xhzArr: [h.xh || 0], firArr: [h.fir ? 1 : 0],
  mulliArr: [h.mull || 0], missArr: [h.miss || ''],
});
const sumOf = b => Object.values(b.v).reduce((a, x) => a + x, 0);

console.log('\n블로업 원인 분해');
t('트리플 미만(더블보기)은 블로업이 아님', () => {
  assert(blowupPartsOf(H(4, { s: 6, putt: 2 }), 0) === null);
});
t('미입력 홀은 null', () => {
  assert(blowupPartsOf(H(4, { s: 0, putt: 0 }), 0) === null);
});
t('파4 8타 · 티샷 OB · 칩 후 3퍼트 → 티샷 +2 · 온그린까지 0 · 숏게임 +2', () => {
  const b = blowupPartsOf(H(4, { s: 8, putt: 3, tp: 2 }), 0);
  assert(b.v.tee === 2 && b.v.iron === 0 && b.v.short === 2 && b.v.putt === 0, JSON.stringify(b.v));
  assert(b.main === 'tee' || b.main === 'short');
  assert(b.main === 'tee', '동률이면 벌타가 주원인');
});
t('파3 6타 · 레귤러온 후 5퍼트 → 퍼팅 +3', () => {
  const b = blowupPartsOf(H(3, { s: 6, putt: 5, gir: true }), 0);
  assert(b.v.putt === 3 && b.v.iron === 0 && b.v.short === 0, JSON.stringify(b.v));
  assert(b.main === 'putt');
});
t('파5 9타 · 세컨드 해저드 1회 · 온그린 7타 · 2퍼트', () => {
  const b = blowupPartsOf(H(5, { s: 9, putt: 2, xh: 1, fir: true }), 0);
  // 7 − 3 − 1(칩) − 1(해저드) = 2
  assert(b.v.xpen === 1 && b.v.iron === 2 && b.v.short === 1, JSON.stringify(b.v));
  assert(b.main === 'iron');
});
t('칩인은 숏게임 −1(만회)', () => {
  const b = blowupPartsOf(H(4, { s: 7, putt: 0 }), 0);
  assert(b.v.short === -1 && b.v.iron === 4, JSON.stringify(b.v));
});
t('모든 조합에서 원인별 합 = 오버파', () => {
  let n = 0;
  for (const par of [3, 4, 5]) for (let s = par + 3; s <= par + 8; s++) for (let putt = 0; putt <= 5 && putt < s; putt++)
    for (const tp of [0, 1, 2]) for (const xo of [0, 1]) for (const xh of [0, 1]) {
      const og = s - putt, gir = og <= Math.max(1, par - 2);
      const b = blowupPartsOf(H(par, { s, putt, gir, tp, xo, xh }), 0);
      if (sumOf(b) !== s - par) throw new Error(`par${par} s${s} putt${putt} tp${tp} xo${xo} xh${xh}: 합 ${sumOf(b)} ≠ ${s - par}`);
      n++;
    }
  assert(n > 100);
});

console.log(`\n결과: ${pass}개 통과 · ${fail}개 실패`);
process.exit(fail ? 1 : 0);
