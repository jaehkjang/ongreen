// ============================================================
// tests/gas-mock.js — backend/Apps_Script.gs 를 Node 에서 돌리기 위한 가짜 구글 서비스
//
// 스프레드시트(2차원 배열)·스크립트 속성·잠금·해시·응답 출력만 흉내 냅니다.
// 실제 Apps_Script.gs 소스를 그대로 vm 에 올려 saveRounds_/getRounds_ 등을 검사합니다.
// ============================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const GAS_SRC = fs.readFileSync(path.join(__dirname, '..', 'backend', 'Apps_Script.gs'), 'utf8');

function makeSheet(name) {
  const sh = { name, data: [], maxCols: 26, frozen: 0 };
  const width = () => sh.data.reduce((m, r) => Math.max(m, r.length), 0);
  const cell = (r, c) => { const row = sh.data[r]; const v = row ? row[c] : undefined; return v === undefined || v === null ? '' : v; };
  const ensure = (r, c) => { while (sh.data.length <= r) sh.data.push([]); const row = sh.data[r]; while (row.length <= c) row.push(''); };
  const lastRow = () => { for (let i = sh.data.length - 1; i >= 0; i--) if (sh.data[i].some(v => v !== '' && v != null)) return i + 1; return 0; };
  const lastCol = () => { let m = 0; sh.data.forEach(r => r.forEach((v, i) => { if (v !== '' && v != null) m = Math.max(m, i + 1); })); return m; };
  const range = (r, c, nr, nc) => {
    nr = nr || 1; nc = nc || 1;
    if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error(`잘못된 범위 ${r},${c},${nr},${nc}`);
    if (c + nc - 1 > sh.maxCols) throw new Error(`범위가 시트 칸 수(${sh.maxCols})를 벗어남`);
    return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r - 1 + i, c - 1 + j))),
      getValue: () => cell(r - 1, c - 1),
      setValues: vals => {
        if (vals.length !== nr || vals.some(v => v.length !== nc)) throw new Error('setValues 크기 불일치');
        vals.forEach((row, i) => row.forEach((v, j) => { ensure(r - 1 + i, c - 1 + j); sh.data[r - 1 + i][c - 1 + j] = v; }));
      },
      setValue: v => { ensure(r - 1, c - 1); sh.data[r - 1][c - 1] = v; },
      clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (sh.data[r - 1 + i]) sh.data[r - 1 + i][c - 1 + j] = ''; },
      setBackground() {}, setFontColor() {}, setFontWeight() {},
    };
  };
  Object.assign(sh, {
    getName: () => sh.name,
    setName: n => { sh.name = n; return sh; },
    getLastRow: lastRow, getLastColumn: lastCol, getMaxColumns: () => sh.maxCols,
    insertColumnsAfter: (after, n) => { sh.maxCols += n; },
    getRange: range,
    appendRow: row => { const r = lastRow(); ensure(r, row.length - 1); row.forEach((v, j) => { sh.data[r][j] = v; }); },
    clearContents: () => { sh.data = []; sh.clearCount = (sh.clearCount || 0) + 1; },
    deleteRow: r => { sh.data.splice(r - 1, 1); },
    setFrozenRows: n => { sh.frozen = n; },
    _width: width,
  });
  return sh;
}

function makeSpreadsheet(id) {
  const sheets = [];
  return {
    sheets,
    getId: () => id,
    getUrl: () => 'https://example/' + id,
    getSheetByName: n => sheets.find(s => s.name === n) || null,
    insertSheet: n => { const s = makeSheet(n); sheets.push(s); return s; },
    getSheets: () => sheets.slice(),
    deleteSheet: s => { const i = sheets.indexOf(s); if (i >= 0) sheets.splice(i, 1); },
  };
}

// 백엔드 한 벌(가짜 시트 포함)을 만든다. 반환값의 g 가 Apps_Script.gs 의 전역들.
function makeBackend() {
  const files = {};
  const main = makeSpreadsheet('MAIN'); files.MAIN = main;
  const props = { SSID: 'MAIN', AUTH_SECRET: 'test-secret', ADMINS: '관리자,관리자1,관리자2' };
  let lockHeld = false, clock = 1_800_000_000_000;
  const g = {
    console, JSON, Object, Array, String, Number, Math, Date: class extends Date {
      constructor(...a) { if (a.length) super(...a); else super(clock); }
      static now() { return clock; }
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) },
    SpreadsheetApp: {
      openById: id => files[id],
      create: n => { const id = 'S' + Object.keys(files).length; const s = makeSpreadsheet(id); s.insertSheet('Sheet1'); files[id] = s; return s; },
    },
    LockService: { getScriptLock: () => ({
      tryLock: () => { if (lockHeld) return false; lockHeld = true; return true; },
      releaseLock: () => { lockHeld = false; } }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, str) => Array.from(crypto.createHash('sha256').update(str, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      formatDate: () => '2026-10-13 12:00',
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => ({ body: JSON.parse(s) }) }) },
    Logger: { log: () => {} },
  };
  vm.createContext(g);
  vm.runInContext(GAS_SRC, g);
  // 앱이 하는 요청 그대로 흉내 (doGet/doPost 경유 → 인증·잠금까지 같이 검사)
  const token = u => g.makeToken_(u, g.hashPin_('1234'));
  const raw = {
    login: (u, pin) => g.doPost({ postData: { contents: JSON.stringify({ action: 'login', username: u, pin }) } }).body,
    get: (u, tok, action) => g.doGet({ parameter: { action, u, token: tok } }).body,
    post: (u, tok, d) => g.doPost({ postData: { contents: JSON.stringify(Object.assign({ u, token: tok }, d)) } }).body,
  };
  const api = {
    login: u => g.doPost({ postData: { contents: JSON.stringify({ action: 'login', username: u, pin: '1234' }) } }).body,
    get: (u, action) => g.doGet({ parameter: { action, u, token: token(u) } }).body,
    post: (u, d) => g.doPost({ postData: { contents: JSON.stringify(Object.assign({ u, token: token(u) }, d)) } }).body,
  };
  return {
    g, main, props, api, raw,
    tick: ms => { clock += ms || 1000; },
    setLockHeld: v => { lockHeld = v; },
    roundsSheet: () => main.getSheetByName('라운드'),
    logSheet: () => main.getSheetByName('라운드_기록'),
  };
}

module.exports = { makeBackend, makeSheet, GAS_SRC };
