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

const SRC = fs.readFileSync(path.join(__dirname, '..', 'stat.js'), 'utf8');   // 통계 코드는 v12.65.0 부터 stat.js

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
function extractConst(name) {
  const start = SRC.indexOf(`const ${name} =`);
  if (start < 0) throw new Error(`stat.js 에 const ${name} 이(가) 없습니다`);
  return SRC.slice(start, SRC.indexOf('];', start) + 2);
}

const ctx = { console, Math, Array, Object };
vm.createContext(ctx);
// roundPars 는 박제된 holePars 만 쓰는 단순판으로 대체(마스터 코스 조회 불필요)
vm.runInContext(`function roundPars(r) { return r.holePars; }\n` + extractConst('BLOWUP_CATS') + '\n' + extractFn('onRegOf') + '\n' + extractFn('blowupPartsOf') + '\nthis.blowupPartsOf = blowupPartsOf;', ctx);
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
t('파4 8타 · 티샷 OB · 5온 3퍼트 → 티샷 +2 · 온그린까지 +1 · 숏게임 0 · 퍼팅 +1', () => {
  const b = blowupPartsOf(H(4, { s: 8, putt: 3, tp: 2 }), 0);
  assert(b.v.tee === 2 && b.v.iron === 1 && b.v.short === 0 && b.v.putt === 1, JSON.stringify(b.v));
  assert(b.main === 'tee');
});
// v12.77.0 새 규칙: 그린 놓친 홀 = 온그린까지 +1 · 칩 1번 넘게 친 타수 = 숏게임 · 퍼트 − 2 = 퍼팅
for (const [og, putt, iron, short, pt] of [[5, 2, 1, 0, 0], [6, 2, 1, 1, 0], [6, 3, 1, 1, 1], [7, 2, 1, 2, 0]]) {
  t(`파4 티샷 OB · ${og}온 ${putt}퍼트 → 티샷 +2 · 온그린까지 +${iron} · 숏게임 +${short} · 퍼팅 +${pt}`, () => {
    const b = blowupPartsOf(H(4, { s: og + putt, putt, tp: 2 }), 0);
    assert(b.v.tee === 2 && b.v.iron === iron && b.v.short === short && b.v.putt === pt, JSON.stringify(b.v));
    assert(b.chips === short + 1, '칩 횟수 ' + b.chips);
  });
}
t('파3 6타 · 레귤러온 후 5퍼트 → 퍼팅 +3', () => {
  const b = blowupPartsOf(H(3, { s: 6, putt: 5, gir: true }), 0);
  assert(b.v.putt === 3 && b.v.iron === 0 && b.v.short === 0, JSON.stringify(b.v));
  assert(b.main === 'putt');
});
t('파5 9타 · 세컨드 해저드 1회 · 온그린 7타 · 2퍼트', () => {
  const b = blowupPartsOf(H(5, { s: 9, putt: 2, xh: 1, fir: true }), 0);
  // 숏게임 = 7 − 3 − 1(해저드) − 1(칩) = 2 · 온그린까지 +1 · 퍼팅 0
  assert(b.v.xpen === 1 && b.v.iron === 1 && b.v.short === 2 && b.v.putt === 0, JSON.stringify(b.v));
  assert(b.main === 'short');
});
t('파4 7타 · 티샷 OB → 4온(칩 안 침) · 3퍼트 → 티샷 +2 · 온그린까지 0 · 퍼팅 +1 (칩 1타 중복 공제 없음)', () => {
  const b = blowupPartsOf(H(4, { s: 7, putt: 3, tp: 2 }), 0);
  assert(b.v.tee === 2 && b.v.iron === 0 && b.v.short === 0 && b.v.putt === 1, JSON.stringify(b.v));
});
t('파5 8타 · 티샷 OB + 티샷 외 OB 2번 → 바로 홀인: 벌타 빼면 레귤러온 안 홀인이라 퍼팅 0 · 합 = 오버파', () => {
  const b = blowupPartsOf(H(5, { s: 8, putt: 0, tp: 2, xo: 2 }), 0);   // 파5 OB 티샷 + 티샷 외 OB 2번 → 8타 만에 홀인
  assert(sumOf(b) === 3 && b.v.putt === 0, JSON.stringify(b.v));
});
t('칩인은 숏게임 −2(만회) · 퍼팅 0', () => {
  const b = blowupPartsOf(H(4, { s: 7, putt: 0 }), 0);   // 7타 만에 그린 밖에서 홀인 = 칩 5번째에 칩인
  assert(b.v.iron === 1 && b.v.short === 2 && b.v.putt === 0, JSON.stringify(b.v));   // 칩 1번 넘게 4타 − 칩인 2 = 2
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
