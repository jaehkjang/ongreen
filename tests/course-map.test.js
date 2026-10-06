// ============================================================
// tests/course-map.test.js — 골프장 홀맵(공식맵·마스터) 저장 안전장치 자동 테스트
//
// 홀파를 고치면 서버 공식맵에 "코스 전체"를 덮어써서 저장합니다. 그래서
//  ① 앱을 켜 둔 사이 다른 사람이 고친 내용을 낡은 목록으로 덮어쓰지 않는지
//  ② 고유번호(id)가 없는 골프장끼리 엉뚱하게 짝지어지지 않는지
// 를 실제 app.js 소스에서 함수를 뽑아와 두 기기 + 가짜 서버로 검사합니다.
//
// 실행:  node tests/course-map.test.js      (설치할 것 없음 · 프레임워크 없음)
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// ── app.js 에서 최상위 함수 하나를 이름으로 잘라온다 (중괄호 짝 맞춰서) ──
function extractFn(name) {
  let start = SRC.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`app.js 에 function ${name} 이(가) 없습니다`);
  if (SRC.slice(start - 6, start) === 'async ') start -= 6;
  let i = SRC.indexOf('{', start), depth = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) return SRC.slice(start, i + 1); }
  }
  throw new Error(`function ${name} 의 끝을 못 찾았습니다`);
}
function makeStore() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

const NAMES = ['findCourse', 'saveOfficialCache', 'refreshOfficial', 'parDiffs', 'applyParDiffs',
  'persistParsToOfficial', 'persistParsNow', 'mergeCourseForm', 'masterParsFor'];

// ── 가짜 서버: 코스 목록을 들고 있고, saveCourse 는 oldName(수정)으로 찾아 통째로 교체 ──
function makeServer(courses) {
  const srv = { courses: JSON.parse(JSON.stringify(courses)), online: true, saves: 0 };
  srv.API = {
    async getCourses() { if (!srv.online) throw new Error('net'); return { ok: true, courses: JSON.parse(JSON.stringify(srv.courses)) }; },
    async saveCourse(c, isEdit, oldName) {
      if (!srv.online) throw new Error('net');
      srv.saves++;
      const copy = JSON.parse(JSON.stringify(c)); delete copy.status;
      const i = isEdit ? srv.courses.findIndex(x => x.name === oldName) : -1;
      if (i >= 0) srv.courses[i] = copy; else srv.courses.push(copy);
      return { ok: true };
    },
  };
  return srv;
}
// ── 기기 하나: 앱을 켤 때 서버 목록을 받아 두고(A.official), 그 뒤엔 자기 메모리만 봄 ──
function makeDevice(srv) {
  const dev = {
    localStorage: makeStore(), console, JSON, Object, Array, String, Promise,
    A: { official: JSON.parse(JSON.stringify(srv.courses)).map(c => ({ ...c, status: 'official' })), isAdm: false },
    API: srv.API, _admOffLoaded: false,
    curPg: () => 'sc', renderCourses() {}, renderAdmOfficial() {},
  };
  vm.createContext(dev);
  vm.runInContext(
    `async function callAPI(f) { try { return await f(); } catch (e) { return { ok: false, __net: true }; } }\n`
    + `let _parSaveQ = Promise.resolve();\n` + NAMES.map(extractFn).join('\n'), dev);
  return dev;
}

// ── 아주 작은 테스트 러너 ──
let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tests = [];
function t(name, fn) { tests.push([name, fn]); }
function assert(cond, msg) { if (!cond) throw new Error(msg || '조건이 거짓입니다'); }

const LAKE = [4, 5, 3, 4, 4, 3, 5, 4, 4];
const PINE = [4, 3, 4, 5, 4, 4, 3, 5, 4];
const SKY  = [5, 4, 4, 3, 4, 5, 4, 4, 3];
const set = (arr, i, v) => { const a = arr.slice(); a[i] = v; return a; };
const COURSE = () => ({ id: 'c1', name: '테스트CC', addr: '경기', layouts: [
  { name: '레이크', holes: LAKE.slice() }, { name: '파인', holes: PINE.slice() }, { name: '스카이', holes: SKY.slice() } ] });
const srvCourse = (srv, name) => srv.courses.find(c => c.name === name);
const nine = (c, n) => c.layouts.find(l => l.name === n).holes;

// ════════ 문제 2: 고유번호(id) 없는 골프장 짝짓기 ════════
t('id 없는 골프장을 찾을 때 "id 없는 첫 번째 골프장"과 짝지어지지 않는다', () => {
  const dev = makeDevice(makeServer([]));
  const list = [{ name: '가CC', layouts: [] }, { name: '나CC', layouts: [] }];
  const got = dev.findCourse(list, undefined, '나CC');
  assert(got && got.name === '나CC', `나CC 를 찾아야 하는데 ${got && got.name}`);
});
t('id 가 있으면 id 로 찾고, 못 찾으면 이름으로 찾는다', () => {
  const dev = makeDevice(makeServer([]));
  const list = [{ id: 'a', name: '가CC' }, { id: 'b', name: '나CC' }, { name: '다CC' }];
  assert(dev.findCourse(list, 'b', '엉뚱한이름').name === '나CC', 'id 우선');
  assert(dev.findCourse(list, 'zzz', '다CC').name === '다CC', 'id 로 못 찾으면 이름으로');
  assert(dev.findCourse(list, undefined, '없는CC') === null, '없으면 null');
  assert(dev.findCourse(list, undefined, undefined) === null, 'id·이름 둘 다 없으면 null (아무거나 잡으면 안 됨)');
});
t('id 없는 골프장의 홀파를 고쳐도 다른 id 없는 골프장은 그대로다', async () => {
  const A = { name: '가CC', layouts: [{ name: '전반', holes: LAKE.slice() }, { name: '후반', holes: PINE.slice() }] };
  const B = { name: '나CC', layouts: [{ name: '전반', holes: SKY.slice() }, { name: '후반', holes: PINE.slice() }] };
  const srv = makeServer([A, B]); const dev = makeDevice(srv);
  const clone = { name: '나CC', layouts: [{ name: '전반', holes: SKY.slice() }, { name: '후반', holes: PINE.slice() }] };
  const res = await dev.persistParsToOfficial(clone, { '전반': set(SKY, 0, 3) }, { '전반': SKY.slice() });
  assert(res.ok, '저장돼야 함');
  assert(eq(nine(srvCourse(srv, '가CC'), '전반'), LAKE), '가CC 가 바뀌면 안 됨');
  assert(nine(srvCourse(srv, '나CC'), '전반')[0] === 3, '나CC 1번홀이 3이어야 함');
});

// ════════ 문제 1: 낡은 목록으로 남의 수정 덮어쓰기 ════════
t('두 사람이 다른 나인을 고치면 둘 다 남는다 (스코어 입력 중 파 수정)', async () => {
  const srv = makeServer([COURSE()]);
  const phone = makeDevice(srv), pc = makeDevice(srv);       // 둘 다 같은 시점에 앱을 켬
  await pc.persistParsToOfficial({ id: 'c1', name: '테스트CC' }, { '레이크': set(LAKE, 0, 3) }, { '레이크': LAKE.slice() });
  // 폰은 아직 예전 목록(레이크 1번=4)을 들고 있음 — 파인을 고친다
  await phone.persistParsToOfficial({ id: 'c1', name: '테스트CC' }, { '파인': set(PINE, 1, 5) }, { '파인': PINE.slice() });
  const c = srvCourse(srv, '테스트CC');
  assert(nine(c, '레이크')[0] === 3, `PC 가 고친 레이크 1번이 사라짐: ${nine(c, '레이크')[0]}`);
  assert(nine(c, '파인')[1] === 5, '폰이 고친 파인 2번이 반영돼야 함');
  assert(eq(nine(c, '스카이'), SKY), '아무도 안 고친 나인은 그대로');
});
t('같은 나인의 다른 홀을 고쳐도 둘 다 남는다', async () => {
  const srv = makeServer([COURSE()]);
  const phone = makeDevice(srv), pc = makeDevice(srv);
  await pc.persistParsToOfficial({ id: 'c1', name: '테스트CC' }, { '레이크': set(LAKE, 0, 3) }, { '레이크': LAKE.slice() });
  await phone.persistParsToOfficial({ id: 'c1', name: '테스트CC' }, { '레이크': set(LAKE, 8, 5) }, { '레이크': LAKE.slice() });
  const h = nine(srvCourse(srv, '테스트CC'), '레이크');
  assert(h[0] === 3 && h[8] === 5, `레이크 = ${h}`);
});
t('골프장 선택 화면에서 안 만진 나인은 낡은 값으로 저장되지 않는다', async () => {
  const srv = makeServer([COURSE()]);
  const phone = makeDevice(srv), pc = makeDevice(srv);
  await pc.persistParsToOfficial({ id: 'c1', name: '테스트CC' }, { '레이크': set(LAKE, 0, 3) }, { '레이크': LAKE.slice() });
  // 폰: 피커에서 레이크+파인 조합으로 시작, 파인만 고침. 화면엔 낡은 레이크(1번=4)가 보이고 그대로 edits 에 들어감
  const src = phone.A.official[0];
  const bases = {}; src.layouts.forEach(l => { bases[l.name] = l.holes.slice(0, 9); });
  await phone.persistParsToOfficial(src, { '레이크': LAKE.slice(), '파인': set(PINE, 2, 3) }, bases);
  const c = srvCourse(srv, '테스트CC');
  assert(nine(c, '레이크')[0] === 3, 'PC 의 레이크 수정이 낡은 값으로 되돌려지면 안 됨');
  assert(nine(c, '파인')[2] === 3, '폰의 파인 수정은 반영돼야 함');
});
t('아무것도 안 바꾸면 서버에 저장하지 않는다', async () => {
  const srv = makeServer([COURSE()]); const dev = makeDevice(srv);
  const res = await dev.persistParsToOfficial({ id: 'c1', name: '테스트CC' }, { '레이크': LAKE.slice() }, { '레이크': LAKE.slice() });
  assert(res.unchanged && srv.saves === 0, '저장 호출이 없어야 함');
});
t('최신 목록을 못 받으면(오프라인) 저장하지 않는다', async () => {
  const srv = makeServer([COURSE()]); const dev = makeDevice(srv); srv.online = false;
  const res = await dev.persistParsToOfficial({ id: 'c1', name: '테스트CC' }, { '레이크': set(LAKE, 0, 3) }, { '레이크': LAKE.slice() });
  assert(res.ok === false && srv.saves === 0, '낡은 값으로 저장하면 안 됨');
});
t('그사이 삭제된 골프장은 되살리지 않는다', async () => {
  const srv = makeServer([COURSE()]); const dev = makeDevice(srv);
  srv.courses = [];                                              // 관리자가 삭제
  srv.courses.push({ id: 'z', name: '다른CC', layouts: [{ name: 'A', holes: LAKE.slice() }] });
  const res = await dev.persistParsToOfficial({ id: 'c1', name: '테스트CC' }, { '레이크': set(LAKE, 0, 3) }, { '레이크': LAKE.slice() });
  assert(res.skipped && !srvCourse(srv, '테스트CC'), '삭제된 골프장이 되살아나면 안 됨');
});
t('연달아 빠르게 고쳐도 앞의 수정이 사라지지 않는다', async () => {
  const srv = makeServer([COURSE()]); const dev = makeDevice(srv);
  const p1 = dev.persistParsToOfficial({ id: 'c1', name: '테스트CC' }, { '레이크': set(LAKE, 0, 3) }, { '레이크': LAKE.slice() });
  const p2 = dev.persistParsToOfficial({ id: 'c1', name: '테스트CC' }, { '레이크': set(set(LAKE, 0, 3), 1, 4) }, { '레이크': set(LAKE, 0, 3) });
  await Promise.all([p1, p2]);
  const h = nine(srvCourse(srv, '테스트CC'), '레이크');
  assert(h[0] === 3 && h[1] === 4, `레이크 = ${h}`);
});
t('18홀짜리 나인 정보를 9홀로 잘라먹지 않는다', async () => {
  const srv = makeServer([{ id: 'c9', name: '18CC', layouts: [{ name: '전체', holes: [...LAKE, ...PINE] }] }]); const dev = makeDevice(srv);
  await dev.persistParsToOfficial({ id: 'c9', name: '18CC' }, { '전체': set(LAKE, 0, 3) }, { '전체': LAKE.slice() });
  const h = nine(srvCourse(srv, '18CC'), '전체');
  assert(h.length === 18 && h[0] === 3 && eq(h.slice(9), PINE), `전체 = ${h}`);
});

// ════════ 수정 폼 병합 (mergeCourseForm) ════════
t('수정 폼: 내가 고친 홀만 반영되고 남이 고친 홀은 유지된다', () => {
  const dev = makeDevice(makeServer([]));
  const base = COURSE();
  const fresh = COURSE(); fresh.layouts[0].holes[0] = 3;          // 남이 레이크 1번 수정
  const form = { ...COURSE(), status: 'official' }; form.layouts[1].holes[1] = 5;   // 나는 파인 2번 수정
  const m = dev.mergeCourseForm(base, fresh, form);
  assert(nine(m, '레이크')[0] === 3, '남의 수정 유지');
  assert(nine(m, '파인')[1] === 5, '내 수정 반영');
  assert(m.layouts.length === 3, '나인 수 유지');
});
t('수정 폼: 이름·주소는 내가 바꿨을 때만 내 값', () => {
  const dev = makeDevice(makeServer([]));
  const base = COURSE(); const fresh = { ...COURSE(), addr: '경기 용인' };
  const m1 = dev.mergeCourseForm(base, fresh, { ...COURSE() });
  assert(m1.addr === '경기 용인' && m1.name === '테스트CC', '안 바꿨으면 최신 값');
  const m2 = dev.mergeCourseForm(base, fresh, { ...COURSE(), name: '새이름CC', addr: '서울' });
  assert(m2.addr === '서울' && m2.name === '새이름CC', '바꿨으면 내 값');
});
t('수정 폼: 내가 지운 나인은 지워지고, 남이 새로 추가한 나인은 남는다', () => {
  const dev = makeDevice(makeServer([]));
  const base = COURSE();
  const fresh = COURSE(); fresh.layouts.push({ name: '밸리', holes: PINE.slice() });
  const form = COURSE(); form.layouts = form.layouts.filter(l => l.name !== '스카이');
  const m = dev.mergeCourseForm(base, fresh, form);
  assert(eq(m.layouts.map(l => l.name), ['레이크', '파인', '밸리']), `나인 = ${m.layouts.map(l => l.name)}`);
});
t('수정 폼: 남이 지운 나인을 내가 안 만졌으면 되살리지 않는다', () => {
  const dev = makeDevice(makeServer([]));
  const base = COURSE();
  const fresh = COURSE(); fresh.layouts = fresh.layouts.filter(l => l.name !== '스카이');
  const m = dev.mergeCourseForm(base, fresh, COURSE());
  assert(eq(m.layouts.map(l => l.name), ['레이크', '파인']), `나인 = ${m.layouts.map(l => l.name)}`);
});
t('수정 폼: 홀 수를 바꾼 나인은 폼 그대로 저장된다', () => {
  const dev = makeDevice(makeServer([]));
  const base = COURSE(); const fresh = COURSE();
  const form = COURSE(); form.layouts[0].holes = [...LAKE, ...PINE];
  const m = dev.mergeCourseForm(base, fresh, form);
  assert(nine(m, '레이크').length === 18, '18홀로 저장');
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ✅ ${name}`); pass++; }
    catch (e) { console.log(`  ❌ ${name}\n     → ${e.message}`); fail++; }
  }
  console.log(`\n${fail ? '❌' : '✅'} 통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
