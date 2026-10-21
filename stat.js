// ============================================================
// stat.js — 통계 방
// 라운드 기록만으로 통계·분석·추세를 계산하고 그리는 코드.
// 서버와 통신하지 않고 저장(localStorage·서버)도 하지 않습니다 — 읽어서 계산·표시만 합니다.
// 함수 본문에서 app.js 의 A·Q 등을 쓰므로, index.html 에서 app.js 보다 "먼저" 로드합니다.
// (최상위에서 바로 실행되는 코드는 상수 선언뿐이라 로드 순서에 따른 오류가 없습니다.
//  홈 화면의 기록 배지(trophyBadges)가 app.js 시작 직후에 쓰일 수 있어 먼저 로드해 둡니다.)
// ============================================================
// ════════════════════════════════════════
// 통계 (서버 없이 라운드 기록으로 즉시 계산)
// ════════════════════════════════════════
// ── "어떻게 계산하나요?" 접이식 설명 상자 — 지표 카드 바로 아래에 붙인다(탭하면 펼침) ──
function explainBox(title, html) {
  return `<details class="xpl"><summary>ℹ️ ${title}</summary><div class="xpl-b">${html}</div></details>`;
}
function statCard(n, u, l) { return `<div class="sc"><span class="sn">${n}${u ? `<span class="su">${u}</span>` : ''}</span><span class="sl">${l}</span></div>`; }

// ── 드라이버 손실: 티샷 결과(미스) 종류 · 표시 이름 · 표본 부족 시 쓰는 고정 손실값(벌타 기준) ──
const DRIVE_CATS = [['rough', '러프', 0], ['bunker', '벙커', 0], ['hazard', '해저드', 1], ['ob', 'OB', 2], ['mull', '멀리건', 0]];
const DRIVE_K = 5;   // 고정값의 무게(홀 수 환산). 본인 기록이 이만큼 쌓이면 실측값과 고정값을 반반 섞고, 더 쌓일수록 실측값 쪽으로 옮겨감
// 파4·5 티샷 결과 분류(setTee 의 저장 규칙과 같은 우선순위). 미선택 · 옛 기록의 구분 불가 미스는 null
function teeCatOf(fir, mull, tpv, missT) {
  if (mull) return 'mull';
  if (tpv === 2) return 'ob';
  if (tpv === 1) return 'hazard';
  if (fir) return 'fw';
  return (missT === 'rough' || missT === 'bunker') ? missT : null;
}

// ── 5구간(티샷 안정성·드라이버·아이언·숏게임·퍼팅) 통합 집계 ──
// 라운드 상세 · 통계 화면이 함께 쓰는 단일 소스. rounds 묶음 하나를 18홀씩 한 번만 훑어
// 아래 teeStabilityHTML/driverHTML/approachHTML/shortGameHTML/puttingHTML 이 필요로 하는 값을 전부 계산한다.
function analyze(rounds) {
  rounds = (rounds || []).filter(r => !r.isDraft);
  const n = rounds.length;
  const apB = {}; AP_OPTS.forEach(([k]) => { apB[k] = { n: 0, putt: 0, one: 0, three: 0, loss: 0 }; });   // 어프로치 거리 구간별 집계(loss: 숏게임 손실 합). 옛 m 기준 키(AP_LEGACY)는 통계에서 제외
  const mulR = { fw: 0, safe: 0, pen: 0, unk: 0 };   // 멀리건 받고 다시 친 샷의 결과: 페어웨이(파3 온그린) / 러프·벙커 / 또 페널티 / 미선택
  const holes = [];   // 홀별 타수 분해용 기록 — 드라이버 1회당 손실이 전체 집계 뒤에 정해지므로 루프 뒤에서 한 번 더 훑는다
  const dc = {}; ['fw', ...DRIVE_CATS.map(c => c[0])].forEach(k => { dc[k] = { n: 0, ex: 0 }; });   // 드라이버: 티샷 결과별 홀 수·온그린까지 초과 타수 합
  let played = 0,
      obCount = 0, hzCount = 0, mullCount = 0, safeMissCount = 0, fwCount = 0,  // 1) 티샷 안정성(전체, 파3~5 · 첫 샷 기준)
      roughCount = 0, bunkerCount = 0,                                // 러프/벙커 구분(v12.37+ 저장분만)
      par45 = 0, fwHit = 0,                                           // 2) 드라이버(파4·5) — 결과별 집계는 아래 dc
      girHit = 0, girHoles = 0,                                       // 3) 아이언(GIR) — 손실 타수는 루프 뒤 타수 분해에서 계산
      xPenHoles = 0,                                                   // 티샷 외 벌타가 한 번이라도 있었던 홀 수(표본 안내용)
      missGreen = 0, scrSave = 0,                                      // 4) 숏게임(업앤다운 — 마지막 온그린 샷 기준)
      apN = 0, xHzCnt = 0, xObCnt = 0,                                 //    어프로치 붙인 거리 기록 홀 수(v12.51+) · 티샷 외 해저드/OB 횟수 합
      puttSum = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0, girPuttSum = 0, girPuttN = 0;  // 5) 퍼팅(1/2/3/4+ 분포)
  rounds.forEach(r => {
    const hh = roundPars(r);
    const sc = r.scores || [], pa = r.puttsArr || [], gi = r.girArr || [], fi = r.firArr || [], mu = r.mulliArr || [], tpa = r.tpArr || [], mi = r.missArr || [];
    const xh = r.xhzArr || [], xo = r.xobArr || [];   // 티샷 외(어프로치 등) 해저드·OB 횟수 — 최근 입력분만 있을 수 있음
    const ap = r.apArr || [];                         // 어프로치 붙인 거리(v12.51+ 입력분만)
    for (let i = 0; i < 18; i++) {
      const s = sc[i]; if (!s || s <= 0) continue;        // 미입력 홀 스킵
      played++;
      const par = hh[i] || 4, mull = mu[i] || 0, tpv = tpa[i] || 0, putt = pa[i] || 0, missT = mi[i] || '', d = s - par, og = s - putt;

      // ── 1) 티샷 안정성(첫 샷 기준): 페널티(OB·해저드·멀리건) / 안전 미스(러프·벙커) 분류 (파3~5 모두) ──
      //    멀리건 = 첫 샷이 OB·해저드였다는 뜻 → 페널티로 세고, 다시 친 샷의 결과는 멀리건 살림 지표(mulR)로 따로 센다
      if (mull) {
        mullCount++;
        const re = tpv ? 'pen' : (par === 3 ? gi[i] : fi[i]) ? 'fw' : (missT === 'rough' || missT === 'bunker') ? 'safe' : null;
        if (re) mulR[re]++; else mulR.unk++;
      }
      else if (tpv === 2) obCount++;
      else if (tpv === 1) hzCount++;
      else {
        const success = par === 3 ? gi[i] : fi[i];        // 파3=온그린(GIR), 파4·5=페어웨이
        if (success) fwCount++;
        else {
          safeMissCount++;
          if (missT === 'rough') roughCount++; else if (missT === 'bunker') bunkerCount++;
        }
      }

      // ── 2) 드라이버(파4·5만): 티샷 결과별로 "온그린까지 타수 − 레귤러온 타수(파−2)"를 모아, 페어웨이 홀 대비 몇 타 더 걸렸는지로 손실 추정
      //    (홀 스코어가 아니라 온그린까지 타수를 써서 퍼팅 결과가 드라이버 손실에 섞이지 않게 한다)
      const cat = par > 3 ? teeCatOf(fi[i], mull, tpv, missT) : null;   // 결과 미선택(또는 옛 기록의 구분 불가 미스) 홀은 null → 드라이버 손실 계산에서 제외
      if (par > 3) {
        par45++;
        if (fi[i] && !mull && !tpv) fwHit++;
        if (cat) { dc[cat].n++; dc[cat].ex += og - (par - 2); }
      }

      // ── 3) 아이언(GIR) ──
      girHoles++; if (gi[i]) girHit++;
      const holePenalty = (xo[i] || 0) * 2 + (xh[i] || 0);   // 티샷 외 벌타 추정 타수(OB=2타·해저드=1타)
      if (holePenalty > 0) xPenHoles++;
      holes.push({ ex: og - (par - 2), putt, gir: !!gi[i], cat, ap: gi[i] ? '' : ap[i], pen: holePenalty });   // ex: 레귤러온(파−2) 대비 온그린까지 초과 타수

      // ── 4) 숏게임(업앤다운): 그린 놓친 홀 중 "마지막 온그린 샷 + 1퍼트 이하"로 마무리한 비율 ──
      //    그린에 올리기 전에 친 타수(미스샷·레이업 등)는 아이언 몫이라 보지 않는다 → 파4 4온 1퍼트도 숏게임은 성공
      if (!gi[i]) { missGreen++; if (putt <= 1) scrSave++; }
      //    어프로치 붙인 거리별: 레귤러온 실패 홀 중 거리를 기록한 홀만. 거리별 1퍼트율(칩인 포함)·평균 퍼트를 함께 모은다.
      if (!gi[i] && apB[ap[i]]) { const b = apB[ap[i]]; apN++; b.n++; b.putt += putt; if (putt <= 1) b.one++; if (putt >= 3) b.three++; }
      xHzCnt += xh[i] || 0; xObCnt += xo[i] || 0;

      // ── 5) 퍼팅 (1/2/3/4+ 분포) ──
      puttSum += putt;
      if (putt <= 1) p1++; else if (putt === 2) p2++; else if (putt === 3) p3++; else p4++;
      if (gi[i]) { girPuttSum += putt; girPuttN++; }
    }
  });
  const f1 = (a, b) => b ? a / b : 0, pct = (a, b) => b ? Math.round(a / b * 100) : 0;

  // 1) 티샷 안정성
  const teePenaltyPct = pct(obCount + hzCount + mullCount, played);   // 멀리건도 첫 샷 페널티로 셈
  const mulKnown = mulR.fw + mulR.safe + mulR.pen;
  const mulSavePct = mulKnown ? pct(mulR.fw + mulR.safe, mulKnown) : null;   // 멀리건 살림률: 다시 친 샷이 페널티 없이 살아난 비율
  const mulFwPct = mulKnown ? pct(mulR.fw, mulKnown) : null;
  const safeMissPct = pct(safeMissCount, played);
  const missKnownCount = roughCount + bunkerCount;

  // 2) 드라이버 — 결과별 "그 결과 홀의 온그린까지 초과 타수 평균 − 페어웨이 홀의 평균" = 그 티샷 1개당 손해 타수(본인 기록 기준)
  //    표본이 적을수록 고정값(OB 2·해저드 1·그 외 0) 쪽으로 당겨 섞는다(축소 추정). 실측 무게 w = 두 표본의 조화 결합(n·nFw/(n+nFw))
  const firPct = pct(fwHit, par45);
  const fwAvg = f1(dc.fw.ex, dc.fw.n);
  const driveCats = DRIVE_CATS.map(([k, l, fixed]) => {
    const c = dc[k], w = (c.n && dc.fw.n) ? c.n * dc.fw.n / (c.n + dc.fw.n) : 0;
    const measured = w ? Math.max(0, f1(c.ex, c.n) - fwAvg) : 0;   // 페어웨이보다 오히려 잘 친 결과는 0(손실 없음)
    const cost = (w * measured + DRIVE_K * fixed) / (w + DRIVE_K);
    const realPct = Math.round(w / (w + DRIVE_K) * 100);            // 1회당 손실 중 본인 기록(실측)이 차지하는 비중
    return { k, l, n: c.n, cost, realPct, approx: w < DRIVE_K, lossRound: f1(cost * c.n, n) };
  });
  const driveLossRound = driveCats.reduce((t, c) => t + c.lossRound, 0);
  const driveApprox = driveCats.some(c => c.n && c.approx);
  const driveKnown = dc.fw.n + driveCats.reduce((t, c) => t + c.n, 0);   // 티샷 결과를 선택한 파4·5 홀 수

  // ── 타수 분해: 홀마다 (스코어 − 파)를 드라이버·아이언·숏게임·퍼팅에 겹치지 않게 한 번씩만 배정한다 ──
  //   드라이버 D = 그 홀 티샷 결과의 1회당 손실(위 driveCats, 페어웨이·미선택·파3은 0)
  //   그린 적중 홀: 아이언 = 초과 타수 − D, 퍼팅 = 퍼트 − 2
  //   그린 놓친 홀: 아이언 = 초과 타수 − 1(칩 1타는 1퍼트로 만회 가능한 정상 경로) − D, 숏게임 = 퍼트 − 1(업앤다운 기준)
  //   → 홀마다 D + 아이언 + 숏게임 + 퍼팅 = 스코어 − 파. 값이 음수면 그 구간에서 번 타수(예: 1퍼트, 칩인).
  const costOf = {}; driveCats.forEach(c => { costOf[c.k] = c.cost; });
  let ironSum = 0, ironPenaltySum = 0, shortSum = 0, puttNetSum = 0, vsSum = 0;
  holes.forEach(h => {
    const D = costOf[h.cat] || 0;
    const iron = h.gir ? h.ex - D : h.ex - 1 - D;
    ironSum += iron;
    if (h.pen > 0) ironPenaltySum += Math.min(Math.max(0, iron), h.pen);   // 아이언 몫 중 "티샷 외 벌타" 부분(아이언 몫을 넘지 않게)
    if (h.gir) puttNetSum += h.putt - 2;
    else { const sh = h.putt - 1; shortSum += sh; if (apB[h.ap]) apB[h.ap].loss += sh; }
    vsSum += h.ex + h.putt - 2;                                            // = 스코어 − 파 (검산용 합계)
  });

  // 3) 아이언 + 어프로치 낭비
  const girPct = pct(girHit, girHoles);
  const ironLossRound = f1(ironSum, n);
  const ironPenaltyLossRound = f1(ironPenaltySum, n);     // 아이언 손실 중 "티샷 외 벌타" 몫(입력한 홀이 있을 때만 의미 있음)
  const ironOtherLossRound = ironLossRound - ironPenaltyLossRound;   // 나머지(거리감·클럽 선택 등)

  // 4) 숏게임
  const scrPct = missGreen ? pct(scrSave, missGreen) : null;
  const shortLossRound = f1(shortSum, n);
  // 근접률: 컨시드 + 5발자국 이내로 붙인 비율(분모 apN 은 발자국 기준으로 기록한 홀만 — 옛 m 기준 기록은 경계가 달라 제외)
  const apNearPct = apN ? pct(AP_NEAR.reduce((t, k) => t + apB[k].n, 0), apN) : null;
  const apStats = AP_OPTS.map(([k, l, m]) => { const b = apB[k];
    return { k, l: k === 'ok' ? l : `${l} (${m})`, n: b.n, pct: pct(b.n, apN), onePct: b.n ? pct(b.one, b.n) : null, puttAvg: b.n ? f1(b.putt, b.n) : null, threePct: b.n ? pct(b.three, b.n) : null, lossRound: f1(b.loss, n) }; });
  const xPenRound = f1(xHzCnt + xObCnt, n);                           // 라운드당 티샷 외 해저드·OB 횟수
  const xPenStrokesRound = f1(xHzCnt + xObCnt * 2, n);                // 라운드당 티샷 외 벌타 추정 타수(해저드 1·OB 2)

  // 5) 퍼팅
  const threePutt = p3 + p4;
  const puttAvg = f1(puttSum, n), puttPerHole = f1(puttSum, played), threeAvg = f1(threePutt, n);
  const threePct = pct(threePutt, played), onePuttPct = pct(p1, played);
  const girPuttAvg = girPuttN ? f1(girPuttSum, girPuttN) : null;
  const puttLossRound = f1(puttNetSum, n);                  // 그린 적중 홀만(순수 퍼팅), 2퍼트 기준 순손실(1퍼트는 −1)
  const vsRound = f1(vsSum, n);                            // 네 구간 합계와 같아야 하는 라운드 평균 오버파

  return { n, played,
    obCount, hzCount, mullCount, mulR, mulKnown, mulSavePct, mulFwPct, safeMissCount, safeMissPct, teePenaltyPct, roughCount, bunkerCount, missKnownCount, fwCount,
    par45, firPct, fwN: dc.fw.n, driveCats, driveLossRound, driveApprox, driveKnown,
    girPct, ironLossRound, ironPenaltyLossRound, ironOtherLossRound, xPenHoles,
    missGreen, scrPct, shortLossRound, apN, apNearPct, apStats, xPenRound, xPenStrokesRound, xHzCnt, xObCnt,
    puttAvg, puttPerHole, threeAvg, threePct, onePuttPct, girPuttAvg, puttLossRound, vsRound, p1, p2, p3, p4 };
}

// ── 손실타수 한눈에 보기: 드라이버·아이언웨지·숏게임·퍼팅 손실 타수(라운드 평균)를 같은 단위로 놓고 큰 순서로 비교 ──
// (통계 화면 전용 — 여러 라운드를 모아야 드라이버 손실이 고정값보다 본인 기록 쪽으로 수렴한다)
function lossSummaryHTML(a) {
  if (!a.n) return '';
  // [이름, 값(라운드당 타수), 색, 고정값 추정 여부, 무엇을 센 타수인지]
  const items = [
    ['🚗 드라이버', a.driveLossRound, 'var(--r)', a.driveApprox, '티샷이 러프·벙커·해저드·OB로 가서 잃은 타수'],   // 드라이버 카드와 같은 값(analyze 단일 소스)
    ['🎯 아이언·웨지', a.ironLossRound, 'var(--a)', false, '그린에 올리기까지 더 친 타수'],
    ['⛳ 숏게임', a.shortLossRound, 'var(--b)', false, '그린을 놓친 뒤 칩+1퍼트로 못 막아 잃은 타수'],
    ['🍩 퍼팅', a.puttLossRound, 'var(--p)', false, '레귤러온한 홀에서 2퍼트보다 더 친 타수'],
  ].sort((x, y) => y[1] - x[1]);
  const mx = Math.max(...items.map(x => x[1]), 0.01);
  const body = items.map(([l, v, co, approx, desc]) => `<div style="padding:7px 0;border-bottom:1px solid var(--bg3)">
    <div style="display:flex;align-items:baseline;gap:8px;white-space:nowrap"><span style="font-size:13.5px;color:var(--t)">${l}${approx ? '*' : ''}</span>
      <span style="flex:1"></span><b style="font-size:15px;color:${v > 0 ? co : 'var(--g)'}">${nfs(v)}타</b><span style="font-size:10px;color:var(--t3)">/라운드</span></div>
    <div style="font-size:10.5px;color:var(--t3);margin:2px 0 5px">${desc}</div>
    <div style="height:5px;border-radius:3px;background:var(--bg3)"><div style="height:100%;border-radius:3px;width:${Math.round(Math.max(0, v) / mx * 100)}%;background:${co}"></div></div></div>`).join('');
  const worst = items[0];
  const total = items.reduce((t, x) => t + x[1], 0);
  return `<div class="lbl">📉 손실타수 한눈에 보기</div><div class="cb">
    <div style="font-size:12px;color:var(--t2);line-height:1.55;margin-bottom:4px">숫자는 모두 <b style="color:var(--t)">타수</b>예요 — 한 라운드에 그 구간 때문에 파보다 <b style="color:var(--t)">평균 몇 타를 더 쳤는지</b>를 뜻해요. (예: +3타 = 라운드마다 3타를 잃음, −1타 = 1타를 번 것)</div>
    ${body}
    <div style="font-size:10.5px;color:var(--t3);line-height:1.6;margin-top:8px">한 타는 한 구간에만 세서 겹치지 않아요 → 네 구간 합계 <b style="color:var(--t2)">${nfs(total)}타</b> = 내 라운드 평균 오버파 <b style="color:var(--t2)">${nfs(a.vsRound)}타</b>.<br><b style="color:var(--t2)">가장 크게 새는 곳: ${worst[0]}</b>${items.some(x => x[3]) ? '<br>* 드라이버는 기록이 적어 고정값(OB 2타·해저드 1타·그 외 0타) 비중이 커요' : ''}</div></div>`;
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
    { v: a.mullCount, c: '#ffcc80', l: '멀리건(첫 샷 페널티)' },
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
  ${a.mullCount ? `<div class="cb" style="font-size:12px;color:var(--t2);line-height:1.6;margin-top:8px"><div class="cbt" style="margin-bottom:6px">🔄 멀리건 받고 다시 친 샷 (${a.mullCount}회)</div>
    ${a.mulSavePct == null ? '' : `<div style="display:flex;gap:16px;margin-bottom:6px"><div>멀리건 살림률 <b style="font-size:16px;color:${a.mulSavePct >= 70 ? 'var(--g)' : a.mulSavePct >= 40 ? 'var(--a)' : 'var(--r)'}">${a.mulSavePct}%</b></div><div>페어웨이(온그린) <b style="font-size:16px;color:var(--t)">${a.mulFwPct}%</b></div></div>`}
    페어웨이(온그린) <b style="color:var(--t)">${a.mulR.fw}</b> · 러프·벙커 <b style="color:var(--t)">${a.mulR.safe}</b> · 또 페널티 <b style="color:var(--r)">${a.mulR.pen}</b>${a.mulR.unk ? ` · 결과 미선택 ${a.mulR.unk}` : ''}
    <div class="tx-note">멀리건 = 첫 티샷이 OB·해저드였다는 뜻이라 위 페널티율·FIR은 첫 샷 기준으로 세요. 살림률 = 다시 친 샷이 페널티 없이 살아난 비율(결과를 고른 ${a.mulKnown}회 기준).</div></div>` : ''}
  <div class="cb" style="font-size:12px;color:var(--t2);line-height:1.6;${pie ? 'margin-top:8px' : ''}">안전 미스(러프·벙커, 페널티 없음) <b style="color:var(--t)">${a.safeMissCount}개 (${a.safeMissPct}%)</b>${breakdown ? `<br><span style="font-size:11px;color:var(--t3)">${breakdown}</span>` : ''}</div>`;
}
function driverHTML(a) {
  if (!a.n || !a.par45) return '';
  const used = a.driveCats.filter(c => c.n);
  // 결과마다 한 줄: 이름 · (횟수 × 1회당 손실 · 내 기록 반영 %) · 라운드당 손실
  const rows = used.map(c => `<div style="display:flex;align-items:baseline;gap:8px;padding:5px 0;border-bottom:1px solid var(--bg3);font-size:13px;white-space:nowrap">
    <span style="color:var(--t);min-width:52px">${c.l}${c.approx ? '*' : ''}</span>
    <span style="flex:1;font-size:10.5px;color:var(--t3);overflow:hidden;text-overflow:ellipsis">${c.n}회 × 1회당 ${nf(c.cost)}타 · 내 기록 ${c.realPct}%</span>
    <b style="color:${c.lossRound > 0 ? 'var(--r)' : 'var(--t2)'}">${nf(c.lossRound)}타</b></div>`).join('');
  const breakdown = used.length ? `<div class="cb"><div class="cbt" style="margin-bottom:6px">어떤 미스가 몇 타를 먹었나 (라운드 평균)</div>${rows}
    ${a.driveApprox ? `<div style="font-size:10px;color:var(--t3);line-height:1.5;margin-top:4px">* 아직 기록이 적어 1회당 손실의 절반 이상을 고정값(OB 2타·해저드 1타·러프/벙커/멀리건 0타)으로 채웠어요. 라운드가 쌓일수록 내 기록 비중이 커져요.</div>` : ''}</div>` : '';
  return `<div class="lbl">🚗 드라이버 안정성 (Driver · 파4·5)</div><div class="sgd">
    ${statCard(a.firPct, '%', 'FIR')}
    ${statCard(nf(a.driveLossRound) + '타' + (a.driveApprox ? '*' : ''), '', '드라이버 손실/R')}</div>
  ${breakdown}
  ${explainBox('드라이버 손실 타수는 어떻게 계산하나요?', `<b>기준</b> — 티샷이 페어웨이에 떨어진 홀들의 "온그린까지 평균 타수"를 0타 손실 기준으로 삼아요.<br>
    <b>계산</b> — 러프·벙커·해저드·OB·멀리건 등 결과별로 "그 결과의 온그린까지 평균 타수 − 페어웨이 평균 타수" = 1회당 손실(0보다 작으면 0). 이걸 그 결과가 나온 횟수만큼 곱해 다 더하고 라운드 수로 나눠요. 퍼팅은 빼고 보기 때문에 3퍼트 같은 실수는 안 섞여요.<br>
    예) 페어웨이 홀은 평균 2.2타 만에 온그린, 러프 홀은 2.6타 → 러프 1회당 <b>0.4타 손실</b>. 한 라운드에 러프 4번이면 <b>1.6타</b>.<br>
    기록이 적을 땐 숫자가 튀지 않도록 고정값(OB 2타·해저드 1타·그 외 0타)과 섞고, 기록이 쌓일수록 내 기록 비중을 키워요("내 기록 반영 %").<br>
    기준이 <b>본인 기록</b>이라 프로 통계의 Strokes Gained(거리·라이 기준표 사용)와는 다른 간이 추정치예요. 온그린까지의 아이언·어프로치 샷도 포함되므로 아이언 손실과 일부 겹쳐요.<br>
    티샷 결과를 선택하지 않은 홀은 계산에서 빠져요(현재 ${a.driveKnown}/${a.par45}홀 반영).`)}`;
}
function approachHTML(a) {
  if (!a.n) return '';
  const penaltyBreak = a.xPenHoles ? `<div class="cb" style="font-size:12px;color:var(--t2);line-height:1.6"><div class="cbt" style="margin-bottom:6px">아이언 손실 ${nfs(a.ironLossRound)}타, 원인별로 보면</div>
    ⚠️ 벌타(티샷 외 해저드·OB) <b style="color:var(--r)">${nf(a.ironPenaltyLossRound)}타</b> · 🎯 거리감·클럽 선택 등 <b style="color:var(--t)">${nfs(a.ironOtherLossRound)}타</b>
    <div class="tx-note">💡 벌타 손실이 크면 안전하게 치는 클럽 선택을, 나머지가 크면 거리감·정확도 연습을 우선하세요.</div></div>` : '';
  return `<div class="lbl">🎯 아이언·웨지 정확도 (Approach)</div><div class="sgd">
    ${statCard(a.girPct, '%', 'GIR')}
    ${statCard(nfs(a.ironLossRound) + '타', '', '아이언 손실')}</div>
  ${explainBox('아이언 손실 타수는 어떻게 계산하나요?', `<b>기준</b> — 레귤러온 타수(파 − 2: 파3은 1타, 파4는 2타, 파5는 3타 만에 온그린) 안에 들어오는 것. 그린을 놓쳐도 칩 1타 + 1퍼트면 파라서, 그 칩 1타는 손실로 안 보고 숏게임이 만회할 몫으로 따로 빼줘요.<br>
    <b>계산</b> — 홀마다 <b>온그린까지 친 타수 − 레귤러온 타수</b>에서 ① 드라이버 몫(그 홀 티샷 결과의 1회당 손실)을 빼고 ② 그린을 놓친 홀이면 칩 1타를 더 빼요.<br>
    예) 파4 페어웨이 → 온그린까지 3타(그린 미스 후 칩 온) → 3 − 2 − 1 = <b>0타</b> · 칩을 두 번 해서 4타 → <b>1타 손실</b> · 파5에서 2타 만에 온그린 → <b>−1타(이득)</b>.<br>
    파3 티샷은 아이언 샷이라 여기에 들어가요. 티샷 결과를 고르지 않은 파4·5 홀은 드라이버 몫을 뺄 수 없어 티샷 손실도 여기에 잡혀요. 그린 주변 뒤땅처럼 칩을 여러 번 친 경우도 입력만으로는 구분이 안 돼 아이언으로 잡혀요.`)}
  ${penaltyBreak}`;
}
function shortGameHTML(a, stepLegend) {
  if (!a.n) return '';
  const cols = { ok: 'var(--g)', s5: 'var(--b)', s10: 'var(--a)', s20: 'var(--p)', sfar: 'var(--r)' };
  // 붙인 거리 분포 + 거리별 1퍼트율·평균 퍼트 (거리 기록이 있을 때만)
  const apBox = a.apN ? `<div class="cb"><div class="cbt">어프로치 붙인 거리 (레귤러온 실패 ${a.apN}홀)</div>
    ${a.apStats.map(x => `<div class="br"><div class="bl" style="white-space:nowrap;width:118px;font-size:11.5px">${x.l}</div><div class="bt"><div class="bf" style="width:${x.pct}%;background:${cols[x.k]}"><span>${x.n}</span></div></div></div>`).join('')}
    <div style="margin-top:12px;display:grid;grid-template-columns:1.25fr repeat(4,1fr);gap:6px 4px;font-size:12.5px;color:var(--t);text-align:center;align-items:baseline">
      ${['붙인 거리', '1퍼트', '평균 퍼트', '3퍼트↑', '손실/R'].map((h, k) => `<div style="font-size:10px;color:var(--t3);${k ? '' : 'text-align:left'}">${h}</div>`).join('')}
      ${a.apStats.filter(x => x.n).map(x => `<div style="text-align:left;color:var(--t2);white-space:nowrap">${x.l}</div><div>${x.onePct}%</div><div>${nf(x.puttAvg)}</div><div style="color:${x.threePct ? 'var(--r)' : 'var(--t3)'}">${x.threePct}%</div><div style="font-weight:700;color:${x.lossRound > 0 ? 'var(--r)' : 'var(--g)'}">${nfs(x.lossRound)}타</div>`).join('')}
    </div>
    <div style="font-size:10px;color:var(--t3);margin-top:8px;line-height:1.55">1퍼트 = 그 거리로 붙인 뒤 1퍼트 이하(칩인 포함)로 마무리한 비율 · 손실/R = 칩+1퍼트 기준으로 라운드마다 잃은 타수</div>
    ${stepLegend ? `<div style="margin-top:10px;padding:9px 11px;background:var(--bg3);border-radius:10px;font-size:11px;color:var(--t2);line-height:1.65"><b style="color:var(--t)">${AP_STEP_NOTE}</b><br>${AP_OPTS.filter(([k]) => k !== 'ok').map(([, l, m]) => `<span style="white-space:nowrap">${l} ≈ ${m}</span>`).join(' · ')}</div>` : ''}
    <div class="tx-note">💡 근접률이 낮으면 어프로치 거리감(웨지) 연습을, 가깝게 붙였는데도 1퍼트가 낮으면 짧은 퍼트 연습을 우선하세요.</div></div>`
    : `<div style="font-size:10px;color:var(--t3);margin:-6px 2px 8px;line-height:1.5">💡 스코어 입력 때 레귤러온을 놓친 홀에서 "숏게임(100m 이내)을 얼마나 붙였나요?"를 고르면 근접률·거리별 1퍼트율이 여기 나와요.</div>`;
  return `<div class="lbl">⛳ 숏게임 능력 (Short Game)</div><div class="sgd">
    ${statCard(a.scrPct == null ? '-' : a.scrPct, a.scrPct == null ? '' : '%', '업앤다운')}
    ${statCard(nfs(a.shortLossRound) + '타', '', '숏게임 손실')}
    ${statCard(a.apNearPct == null ? '-' : a.apNearPct, a.apNearPct == null ? '' : '%', '근접률(🦶🏻5↓)')}</div>
  ${explainBox('숏게임 지표는 어떻게 계산하나요?', `<b>기준</b> — 그린을 놓친 홀에서는 <b>업앤다운(칩 1타 + 1퍼트 = 파)</b>을 정상으로 봐요.<br>
    <b>계산</b> — 그린 놓친 홀마다 <b>퍼트 수 − 1</b>을 구해 다 더하고, 라운드 수로 나눠요. 칩을 멀리 붙여 늘어난 퍼트가 그대로 숏게임 손실이 돼요.<br>
    예) 그린 미스 → 칩 온 → 2퍼트 = <b>1타 손실</b> · 칩 온 → 1퍼트 = <b>0타</b>(기준) · 칩인 = <b>−1타(이득)</b>.<br>
    그린에 올라가기까지 칩을 여러 번 친 타수는 아이언 쪽에 잡혀서, 네 구간이 서로 겹치지 않아요. 붙인 거리를 기록한 홀은 아래에서 거리별 손실도 보여줘요.<br>
    <b>업앤다운</b> — 그린 놓친 홀 중 <b>마지막 온그린 샷 뒤 1퍼트 이하</b>로 마무리한 비율(칩인 포함). 그린에 올리기 전 미스샷·레이업 타수는 아이언 몫이라 안 봐요. 예) 파4 4온 1퍼트 = 성공 · 4온 2퍼트 = 실패.<br>
    <b>근접률(🦶🏻5↓)</b> — 붙인 거리를 기록한 레귤러온 실패 홀 중 컨시드·🦶🏻5(약 4m) 이내로 붙인 비율. 🦶🏻는 발자국 수이고 한 걸음 약 0.8m로 계산해요. v12.55 이전의 m 기준(10m 이내 등) 기록은 구간 경계가 달라 근접률·붙인 거리 통계에서 빠져요.`)}
  ${apBox}`;
}
// ── ⚠️ 티샷 외 해저드·OB — 숏게임과 따로, 첫 샷이 아닌 샷(세컨·어프로치 등)에서 난 벌타만 모아 보여준다 ──
function xPenaltyHTML(a) {
  if (!a.n) return '';
  const per = v => nf(v / a.n);
  return `<div class="lbl">⚠️ 티샷 외 해저드·OB</div><div class="sgd">
    ${statCard(a.n > 1 ? per(a.xHzCnt) : a.xHzCnt, '', a.n > 1 ? '해저드/R' : '해저드')}
    ${statCard(a.n > 1 ? per(a.xObCnt) : a.xObCnt, '', a.n > 1 ? 'OB/R' : 'OB')}
    ${statCard(nf(a.xPenStrokesRound) + '타', '', a.n > 1 ? '벌타 추정/R' : '벌타 추정')}</div>
  ${explainBox('티샷 외 해저드·OB는 무엇인가요?', `티샷(첫 샷)이 아닌 세컨·어프로치 등에서 난 해저드·OB 횟수예요. 스코어 입력 때 레귤러온을 놓친 홀의 숏게임 창에서 +/−로 기록해요.<br>
    <b>벌타 추정</b> = 해저드 1회 1타 + OB 1회 2타로 환산한 값(라운드 평균).<br>
    티샷에서 난 해저드·OB는 여기가 아니라 "티샷 안정성"에서 따로 세요.`)}`;
}
// ref: 비교할 "내 평균"(다른 라운드들의 analyze 결과). 주면 각 네모에 🟢🟡🔴 신호등과 평균값을 붙인다(라운드 상세용).
function puttingHTML(a, ref) {
  if (!a.n) return '';
  const pmx = Math.max(a.p1, a.p2, a.p3, a.p4) || 1;
  const rn = ref ? ref.n : 0;
  // [값, 단위, 라벨, 평균값, 작을수록 좋은지, 노랑 구간 폭, 평균 표시 형식]
  const card = (v, u, l, av, low, margin, fmt) => {
    const c = (v == null || av == null) ? '' : sig(v, av, low, margin, rn);
    const avg = (rn && av != null) ? `<span style="display:block;font-size:10px;color:var(--t3);margin-top:3px">평균 ${fmt(av)}</span>` : '';
    return `<div class="sc"><span class="sn">${dot(c)}${v == null ? '-' : fmt(v)}${u ? `<span class="su">${u}</span>` : ''}</span><span class="sl">${l}</span>${avg}</div>`;
  };
  const R = ref || {};
  const pc = x => Math.round(x) + '%';
  // 3퍼트 이상: 한 라운드면 "x홀 (xx%)", 여러 라운드면 "라운드당 x홀 (xx%)" — 신호등은 비율(%)로 비교
  const threeTxt = (cnt, p, many) => `${many ? '<span style="font-size:12px;font-weight:400;color:var(--t2)">라운드당 </span>' : ''}${nf(cnt)}<span class="su">홀 (${p}%)</span>`;
  const threeAvgTxt = (rn && R.threePct != null) ? `<span style="display:block;font-size:10px;color:var(--t3);margin-top:3px">평균 ${nf(R.threeAvg)}홀 (${R.threePct}%)</span>` : '';
  const threeCard = `<div class="sc"><span class="sn">${dot(sig(a.threePct, R.threePct, true, 5, rn))}${threeTxt(a.n > 1 ? a.threeAvg : a.p3 + a.p4, a.threePct, a.n > 1)}</span><span class="sl">3퍼트 이상</span>${threeAvgTxt}</div>`;
  const legend = rn >= 3 ? `<div style="font-size:10px;color:var(--t3);margin:-4px 2px 8px">🟢 내 평균보다 좋음 · 🟡 평균 수준 · 🔴 평균보다 나쁨</div>` : '';
  return `<div class="lbl">🍩 퍼팅 효율성 (Putting)</div><div class="sgd">
    ${card(a.puttAvg, '', 'PPR(총 퍼팅)', R.puttAvg, true, 2, nf)}
    ${card(a.puttPerHole, '', '홀당 평균', R.puttPerHole, true, 0.1, x => (+x).toFixed(2))}
    ${card(a.girPuttAvg, '', 'GIR 시 평균 퍼트', R.girPuttAvg, true, 0.15, x => (+x).toFixed(2))}
    ${threeCard}
    ${card(a.onePuttPct, '', '1퍼트율', R.onePuttPct, false, 5, pc)}
    ${card(a.puttLossRound, '', '퍼팅 손실(GIR 홀)', R.puttLossRound, true, 1, x => nfs(x) + '타')}</div>${legend}
  ${explainBox('퍼팅 손실 타수는 어떻게 계산하나요?', `<b>기준</b> — 그린에 레귤러온한 홀에서는 <b>2퍼트</b>를 정상으로 봐요.<br>
    <b>계산</b> — 레귤러온 성공 홀마다 <b>퍼트 수 − 2</b>를 구해 다 더하고, 라운드 수로 나눠요.<br>
    예) 2퍼트 = <b>0타</b>(기준) · 1퍼트(버디 퍼트 성공 등) = <b>−1타(이득)</b> · 3퍼트 = <b>+1타(손실)</b>.<br>
    그린을 놓친 홀의 퍼트는 칩을 얼마나 붙였는지에 좌우되므로 숏게임 손실 쪽에서 따로 세요(그린 놓친 홀은 1퍼트가 기준). 그래서 이 값은 긴 퍼트 거리감·짧은 퍼트 성공률 같은 <b>순수 퍼팅력</b>을 보여줘요.<br>
    위 PPR·홀당 평균·3퍼트 비율·분포는 레귤러온 여부와 상관없이 모든 홀 기준 그대로예요.`)}
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
// ── 블로업(트리플보기 이상) 홀 수 — blowupCauseHTML과 같은 기준 ──
function blowupCountOf(r) {
  const hp = roundPars(r), sc = r.scores || []; let c = 0;
  for (let i = 0; i < 18; i++) { const s = sc[i]; if (s > 0 && s - (hp[i] || 4) >= 3) c++; }
  return c;
}
// ── 전반(1-9)/후반(10-18) 합계 — 18홀 모두 기록된 라운드만 값이 있고, 아니면 null ──
function frontNineOf(r) { const fr = (r.scores || []).slice(0, 9); return fr.length === 9 && fr.every(x => x > 0) ? fr.reduce((a, b) => a + b, 0) : null; }
function backNineOf(r) { const bk = (r.scores || []).slice(9, 18); return bk.length === 9 && bk.every(x => x > 0) ? bk.reduce((a, b) => a + b, 0) : null; }

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
  // 값 그대로 — 값이 크면 위, 작으면 아래(스코어·퍼팅도 축을 뒤집지 않음). 좋아지는지는 선 색(lc: 개선 초록·악화 빨강)으로 본다
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
      <span>최저 ${nf(mn)}${u}</span><span style="color:${lc}">━ 5R 이동평균 (${n}R) · ${M.low ? '낮을수록' : '높을수록'} 좋음</span><span>최고 ${nf(mx)}${u}</span></div></div>`;
}


// ── 💥 블로업(트리플보기 이상) 홀의 원인 분해 ──
// 블로업 홀마다 (스코어 − 파)를 원인별로 "겹치지 않게" 한 타씩 한 곳에만 나눈다 → 원인별 타수 합 = 그 홀 오버파.
//   🚗 티샷 벌타     : 티샷 OB 2타 · 해저드 1타(손실타수 카드와 같은 환산). 멀리건은 벌타가 없어 0
//   ⚠️ 티샷 외 벌타 : 세컨드 이후 OB 2타 · 해저드 1타(홀 입력의 "티샷 외 해저드·OB" 카운터)
//   🎯 온그린까지   : 온그린까지 친 타수 − 레귤러온 타수(파−2) − 위 벌타 − (그린 놓친 홀이면 칩 1타)
//   ⛳ 숏게임       : 그린 놓친 홀의 퍼트 − 1 (칩 + 1퍼트 = 업앤다운 기준)
//   🍩 퍼팅         : 그린 적중 홀의 퍼트 − 2
// "블로업"은 실력 비율 카드(skillRatioHTML)·blowupCountOf 와 같은 기준(트리플보기 이상)을 쓴다.
// 구간별 손실타수(analyze)와 달리 드라이버 몫을 본인 기록으로 추정하지 않고 벌타만 고정값으로 떼어,
// 한 홀만 봐도 바로 이해되는 분해를 쓴다.
const BLOWUP_CATS = [
  ['tee', '🚗 티샷 벌타', 'var(--r)'],
  ['xpen', '⚠️ 티샷 외 벌타', 'var(--p)'],
  ['iron', '🎯 온그린까지', 'var(--a)'],
  ['short', '⛳ 숏게임', 'var(--b)'],
  ['putt', '🍩 퍼팅', 'var(--g)'],
];
const BLOWUP_TIPS = {
  tee: '위험한 홀에선 드라이버 대신 페어웨이에 남길 수 있는 클럽으로 티샷해 보세요.',
  xpen: '트러블에서 무리하게 그린을 노리기보다 안전한 곳으로 레이업하는 선택이 큰 점수를 막아요.',
  iron: '그린까지 가는 길에서 타수가 샜어요 — 트러블 탈출·레이업 판단과 아이언 정확도를 점검하세요.',
  short: '그린 주변에서 무너졌어요 — 칩을 핀 가까이 붙이는 어프로치 거리감 연습이 효과적이에요.',
  putt: '온그린 후 3퍼트 이상이 원인이에요 — 첫 퍼트 거리감(롱퍼트) 연습을 우선하세요.',
};
// 라운드 r 의 i번 홀(0부터)이 블로업이면 원인별 타수 분해를, 아니면 null
function blowupPartsOf(r, i) {
  const s = (r.scores || [])[i]; if (!(s > 0)) return null;
  const par = roundPars(r)[i] || 4, d = s - par; if (d < 3) return null;
  const putt = (r.puttsArr || [])[i] || 0, gir = !!(r.girArr || [])[i], tpv = (r.tpArr || [])[i] || 0;
  const xo = (r.xobArr || [])[i] || 0, xh = (r.xhzArr || [])[i] || 0;
  const tee = tpv === 2 ? 2 : tpv === 1 ? 1 : 0, xpen = xo * 2 + xh;
  const og = s - putt;                                             // 온그린까지 친 타수(벌타 포함)
  const iron = og - (par - 2) - (gir ? 0 : 1) - tee - xpen;
  const v = { tee, xpen, iron, short: gir ? 0 : putt - 1, putt: gir ? putt - 2 : 0 };   // 합 = d
  // 주원인: 가장 많이 잃은 원인(같으면 BLOWUP_CATS 순서 — 벌타를 먼저)
  const main = BLOWUP_CATS.reduce((m, [k]) => v[k] > v[m] ? k : m, BLOWUP_CATS[0][0]);
  const teeMiss = (r.mulliArr || [])[i] ? '멀리건' : tpv === 2 ? 'OB' : tpv === 1 ? '해저드' : par === 3 ? '' : (r.firArr || [])[i] ? '페어웨이' : ((r.missArr || [])[i] === 'rough' ? '러프' : (r.missArr || [])[i] === 'bunker' ? '벙커' : '');
  return { i, par, s, d, putt, gir, og, xo, xh, teeMiss, v, main };
}
// 원인 칩에 붙일 짧은 설명(무슨 일이 있었는지)
function blowupNote(b, k) {
  if (k === 'tee') return b.v.tee === 2 ? 'OB' : '해저드';
  if (k === 'xpen') return [b.xo ? 'OB ' + b.xo : '', b.xh ? '해저드 ' + b.xh : ''].filter(Boolean).join('·');
  if (k === 'iron') return `온그린까지 ${b.og}타`;
  if (k === 'short') return b.putt ? `칩 후 ${b.putt}퍼트` : '칩인';
  return `${b.putt}퍼트`;
}
// ── 라운드 상세: 블로업 홀을 홀 번호 순으로 — 몇 번 홀에서 무엇 때문에 몇 타를 잃었는지 ──
function blowupHolesHTML(r) {
  const list = []; for (let i = 0; i < 18; i++) { const b = blowupPartsOf(r, i); if (b) list.push(b); }
  if (!list.length) return `<div class="cb tx-help">🎉 이 라운드엔 블로업(트리플보기 이상)이 없어요. 큰 점수가 안 나오는 게 최고의 강점입니다.</div>`;
  const lbl = {}, col = {}; BLOWUP_CATS.forEach(([k, l, c]) => { lbl[k] = l; col[k] = c; });
  const lost = list.reduce((t, b) => t + b.d, 0);
  const rows = list.map(b => {
    const chips = BLOWUP_CATS.filter(([k]) => b.v[k] !== 0).map(([k]) => {
      const x = b.v[k], neg = x < 0;
      return `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--bg3);border:.5px solid ${k === b.main && !neg ? col[k] : 'var(--bd)'};border-radius:8px;padding:3px 8px;font-size:11.5px;color:var(--t2);white-space:nowrap">${lbl[k]} <span style="color:var(--t3)">${blowupNote(b, k)}</span> <b style="color:${neg ? 'var(--g)' : col[k]}">${nfs(x)}</b></span>`;
    }).join('');
    // 눈에 띄는 사고 표시: 티샷 패널티(OB·해저드) · 티샷 외 OB·해저드 · 3퍼트 이상 — 원인 분해와 별개로 "무슨 일이 있었는지"를 바로 보여준다
    const flag = (t, c) => `<span style="display:inline-block;border:1px solid ${c};color:${c};border-radius:6px;padding:1px 6px;font-size:11px;font-weight:700;white-space:nowrap">${t}</span>`;
    const flags = [
      b.v.tee ? flag(`🚨 티샷 ${b.v.tee === 2 ? 'OB' : '해저드'}`, 'var(--r)') : '',
      b.xo ? flag(`⚠️ 티샷 외 OB${b.xo > 1 ? ' ×' + b.xo : ''}`, 'var(--p)') : '',
      b.xh ? flag(`⚠️ 티샷 외 해저드${b.xh > 1 ? ' ×' + b.xh : ''}`, 'var(--p)') : '',
      b.putt >= 3 ? flag(`🍩 ${b.putt}퍼트`, 'var(--a)') : '',
    ].filter(Boolean).join('');
    return `<div onclick="holeDetail(${r.id},${b.i})" style="padding:10px 0;border-bottom:.5px solid var(--bd);cursor:pointer">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:30px;height:30px;border-radius:8px;background:var(--r);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0">${b.s}</div>
        <div style="flex:1;min-width:0"><div class="tx-h">${b.i + 1}번 홀 <span style="font-size:12px;color:var(--t2);font-weight:400">· 파${b.par} · <b style="color:var(--r)">${nfs(b.d)}타</b>${b.teeMiss && !b.v.tee ? ` · 티샷 ${b.teeMiss}` : ''}</span></div>
          ${flags ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${flags}</div>` : ''}
          <div style="font-size:11.5px;color:var(--t3);margin-top:3px">주원인 <b style="color:${col[b.main]}">${lbl[b.main]}</b> ${nfs(b.v[b.main])}타</div></div>
        <span style="color:var(--t3);font-size:16px">›</span></div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;padding-left:40px">${chips}</div></div>`;
  }).join('');
  return `<div class="cb"><div class="cbt">💥 블로업 ${list.length}홀 — 파보다 ${lost}타 더 침 <span style="font-size:11px;color:var(--t3);font-weight:400">· 누르면 홀 상세</span></div>${rows}
    ${blowupExplain()}</div>`;
}
function blowupExplain() {
  return explainBox('블로업 원인은 어떻게 나누나요?', `<b>블로업</b> = 파보다 3타 이상 더 친 홀(트리플보기 이상). 예) 파4에서 7타 이상.<br>
    그 홀에서 파보다 더 친 타수를 아래 원인에 <b>한 타씩 한 곳에만</b> 나눠요. 그래서 원인별 타수를 더하면 그 홀 오버파와 정확히 같아요.<br>
    · <b>🚗 티샷 벌타</b> — 티샷 OB 2타 · 해저드 1타(멀리건은 벌타가 없어 0)<br>
    · <b>⚠️ 티샷 외 벌타</b> — 세컨드 이후 OB 2타 · 해저드 1타(홀 입력의 "티샷 외 해저드·OB")<br>
    · <b>🎯 온그린까지</b> — 그린에 올리기까지 레귤러온(파−2타)보다 더 친 타수에서 벌타를 빼고, 그린을 놓친 홀이면 칩 1타도 빼요(칩 + 1퍼트면 파라서 정상 경로로 봄)<br>
    · <b>⛳ 숏게임</b> — 그린 놓친 홀에서 칩 뒤 퍼트 − 1(칩 후 2퍼트 = +1, 칩인 = −1)<br>
    · <b>🍩 퍼팅</b> — 그린에 레귤러온한 홀에서 퍼트 − 2(3퍼트 = +1)<br>
    예) 파4 8타 = 티샷 OB → 벌타 포함 5타 만에 칩으로 온그린 → 3퍼트 : 티샷 벌타 <b>+2</b> · 온그린까지 5 − 2(레귤러온) − 1(칩) − 2(벌타) = <b>+0</b> · 숏게임 칩 후 3퍼트 = <b>+2</b> → 합계 +4.<br>
    −(초록)은 그 원인에서 오히려 만회한 타수예요. 벌타는 고정값이라 구간별 탭의 손실타수(본인 기록 기준 추정)와는 숫자가 다를 수 있어요.`);
}
// ── 통계: 모든 라운드의 블로업을 모아 "전체적으로 무엇 때문에 큰 점수가 나는지" 원인별 타수로 합산 ──
function blowupCauseHTML(rounds) {
  const sum = {}, mainN = {}; BLOWUP_CATS.forEach(([k]) => { sum[k] = 0; mainN[k] = 0; });
  const byPar = { 3: 0, 4: 0, 5: 0 }, parN = { 3: 0, 4: 0, 5: 0 };
  let big = 0, lost = 0;
  rounds.forEach(r => {
    const hp = roundPars(r);
    for (let i = 0; i < 18; i++) {
      if ((r.scores || [])[i] > 0 && parN[hp[i] || 4] !== undefined) parN[hp[i] || 4]++;
      const b = blowupPartsOf(r, i); if (!b) continue;
      big++; lost += b.d; mainN[b.main]++;
      if (byPar[b.par] !== undefined) byPar[b.par]++;
      BLOWUP_CATS.forEach(([k]) => { sum[k] += b.v[k]; });
    }
  });
  if (!big) return `<div class="cb tx-help">🎉 블로업(트리플보기 이상)이 없어요. 큰 점수가 안 나오는 게 최고의 강점입니다.</div>`;
  const n = rounds.length || 1;
  const rows = BLOWUP_CATS.map(([k, l, c]) => ({ k, l, c, v: sum[k], m: mainN[k] })).sort((a, b) => b.v - a.v);
  const mx = Math.max(...rows.map(x => x.v), 0.01);
  const body = rows.map(x => `<div style="padding:7px 0;border-bottom:1px solid var(--bg3)">
    <div style="display:flex;align-items:baseline;gap:8px;white-space:nowrap"><span style="font-size:13.5px;color:var(--t)">${x.l}</span>
      <span style="flex:1;font-size:10.5px;color:var(--t3);overflow:hidden;text-overflow:ellipsis">주원인 ${x.m}홀</span>
      <b style="font-size:15px;color:${x.v > 0 ? x.c : 'var(--t3)'}">${nfs(x.v)}타</b><span style="font-size:10px;color:var(--t3);min-width:30px;text-align:right">${lost > 0 && x.v > 0 ? Math.round(x.v / lost * 100) + '%' : ''}</span></div>
    <div style="height:5px;border-radius:3px;background:var(--bg3);margin-top:5px"><div style="height:100%;border-radius:3px;width:${Math.round(Math.max(0, x.v) / mx * 100)}%;background:${x.c}"></div></div></div>`).join('');
  const top = rows[0];
  const parLine = [3, 4, 5].filter(p => parN[p]).map(p => `파${p} <b style="color:var(--t)">${byPar[p]}</b>/${parN[p]}홀 (${Math.round(byPar[p] / parN[p] * 100)}%)`).join(' · ');
  return `<div class="cb"><div class="cbt">💥 블로업 ${big}홀 — 파보다 총 ${lost}타 더 침</div>
    <div style="font-size:12px;color:var(--t2);line-height:1.55;margin-bottom:4px">라운드당 <b style="color:var(--t)">${nf(big / n)}홀</b>에서 <b style="color:var(--r)">${nf(lost / n)}타</b>를 잃어요. 그 타수가 어디서 나왔는지 원인별로 나누면:</div>
    ${body}
    <div style="font-size:11px;color:var(--t2);line-height:1.6;margin-top:8px">블로업 비율: ${parLine}</div>
    <div style="font-size:12px;color:var(--t2);line-height:1.6;margin-top:8px;padding:10px 12px;background:var(--bg3);border-radius:10px"><b style="color:${top.c}">가장 큰 원인: ${top.l}</b> (${nfs(top.v)}타)<br>${BLOWUP_TIPS[top.k]}</div>
    <div style="font-size:10px;color:var(--t3);line-height:1.55;margin-top:8px">원인별 타수를 더하면 ${lost}타와 같아요(한 타는 한 원인에만). 주원인 = 그 홀에서 가장 많이 잃은 원인. 홀별 내역은 라운드 상세에서 볼 수 있어요.</div>
    ${blowupExplain()}</div>`;
}

// ── 파 종류별 × 구간 교차: 파3는 GIR, 파4·5는 FIR/GIR과 함께 파 대비를 본다 ──
function parCrossHTML(rounds) {
  const T = { 3: { n: 0, vs: 0, gir: 0, fir: 0, firN: 0, putt: 0, puttN: 0 }, 4: { n: 0, vs: 0, gir: 0, fir: 0, firN: 0, putt: 0, puttN: 0 }, 5: { n: 0, vs: 0, gir: 0, fir: 0, firN: 0, putt: 0, puttN: 0 } };
  rounds.forEach(r => {
    const hp = roundPars(r), sc = r.scores || [], gi = r.girArr || [], fi = r.firArr || [], pa = r.puttsArr || [], mu = r.mulliArr || [];
    for (let i = 0; i < 18; i++) {
      const s = sc[i]; if (!(s > 0)) continue;
      const p = hp[i] || 4; const t = T[p]; if (!t) continue;
      t.n++; t.vs += s - p; if (gi[i]) t.gir++;
      const pt = pa[i] || 0; if (pt > 0) { t.putt += pt; t.puttN++; }
      if (p > 3) { t.firN++; if (fi[i] && !mu[i]) t.fir++; }   // 멀리건 홀은 첫 샷 기준 FIR 아님
    }
  });
  const pct = (a, b) => b ? Math.round(a / b * 100) : null;
  const card = (lbl, t, showFir) => {
    if (!t.n) return `<div class="cb" style="margin-bottom:10px;padding:12px 14px"><div style="display:flex;justify-content:space-between"><span class="tx-h">${lbl}</span><span style="font-size:13px;color:var(--t3)">기록 없음</span></div></div>`;
    const vsA = t.vs / t.n;
    const vc = vsA > 0.05 ? 'var(--r)' : vsA < -0.05 ? 'var(--g)' : 'var(--t)';
    const firTxt = pct(t.fir, t.firN);
    const puttTxt = t.puttN ? (t.putt / t.puttN).toFixed(2) : null;
    return `<div class="cb" style="margin-bottom:10px;padding:12px 14px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><span class="tx-h">${lbl}</span><span style="font-size:16px;font-weight:800;color:${vc}">${vsA >= 0 ? '+' : ''}${vsA.toFixed(2)} <span style="font-size:11px;color:var(--t3);font-weight:600">타/홀</span></span></div>
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
    ${row('🏆', '베스트 스코어', best.score, `${esc(best.courseName)} · ${esc(best.date)}`)}
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
    <div class="bl" style="width:92px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(s.name)}">${esc(s.name)}</div>
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
  const vol = includeSd ? volatilityOf(rounds) : null;
  return `<div class="lbl">핵심 지표</div><div class="sgd">${statCard(avg('score').toFixed(1), '', n > 1 ? '평균 스코어' : '스코어')}${statCard((avg('vs') >= 0 ? '+' : '') + avg('vs').toFixed(1), '', n > 1 ? '평균 오버파' : '오버파')}${statCard(avg('putts').toFixed(1), '', n > 1 ? '평균 퍼팅' : '퍼팅')}${statCard(avg('gir').toFixed(0), '%', 'GIR')}${statCard(avg('fir').toFixed(0), '%', 'FIR')}${includeSd ? statCard('±' + sd.toFixed(1), '', '기복(편차)') : ''}${statCard(nf(avgMulli), '', n > 1 ? '평균 멀리건' : '멀리건')}${statCard(nf(avgOb), '', n > 1 ? '평균 OB' : 'OB')}${statCard(nf(avgHz), '', n > 1 ? '평균 해저드' : '해저드')}</div>${vol ? volatilityHTML(vol) : ''}`;
}
// ── 기복 지수 = (최악 라운드 스코어 − 최고 라운드 스코어) ÷ 평균 타수 × 100 ──
// 9홀만 친(또는 덜 채운) 라운드가 섞이면 차이가 터무니없이 커지므로 18홀을 다 채운 라운드만 쓴다(2개 이상일 때만).
const VOL_GRADES = [
  [10, '매우 뛰어난 일관성', 'var(--g)', '최악과 최고의 차이가 평균 타수의 10% 이내예요.'],
  [15, '양호한 안정성', 'var(--b)', '주말 골퍼 기준 상당히 일정하게 유지되는 편이에요.'],
  [20, '보통 수준의 기복', 'var(--a)', '드라이버 컨디션이나 숏게임감에 따라 스코어 변화가 느껴지는 편이에요.'],
  [Infinity, '기복이 매우 큼', 'var(--r)', '컨디션이 안 좋을 때 타수가 크게 무너지는 스타일이에요.'],
];
function volatilityOf(rounds) {
  const sc = rounds.filter(r => (r.scores || []).length === 18 && r.scores.every(x => x > 0)).map(r => r.score);
  if (sc.length < 2) return null;
  const best = Math.min(...sc), worst = Math.max(...sc), mean = sc.reduce((a, b) => a + b, 0) / sc.length;
  const pct = (worst - best) / mean * 100;
  const g = VOL_GRADES.find(x => pct <= x[0]);
  return { n: sc.length, best, worst, mean, pct, label: g[1], color: g[2], desc: g[3] };
}
function volatilityHTML(v) {
  return `<div class="cb" style="display:flex;align-items:center;gap:14px;padding:14px">
    <div style="text-align:center;flex-shrink:0;min-width:70px"><div style="font-size:24px;font-weight:800;color:${v.color}">${v.pct.toFixed(1)}<span style="font-size:13px">%</span></div><div style="font-size:10.5px;color:var(--t3)">기복 지수</div></div>
    <div style="flex:1;font-size:12px;color:var(--t2);line-height:1.55"><b style="color:${v.color};font-size:13.5px">${v.label}</b><br>${v.desc}<br>
      <span style="font-size:10.5px;color:var(--t3)">(최악 ${v.worst} − 최고 ${v.best}) ÷ 평균 ${v.mean.toFixed(1)} × 100 · 18홀 ${v.n}R 기준</span></div></div>
  ${explainBox('기복 지수 기준', VOL_GRADES.map(([t, l, c], k) => `<b style="color:${c}">${k ? (t === Infinity ? '20% 초과' : `${VOL_GRADES[k - 1][0]}~${t}%`) : '10% 이하'}</b> — ${l}`).join('<br>') + '<br>예) 평균 85타에서 최악과 최고 차이가 8타 이내면 10% 이하예요.')}`;
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
// avgRef: playerAvgs() 결과(f9/n)를 넘기면 전반/후반 네모 안에 "평균 X"를 작게 함께 보여준다(라운드 상세 전용).
function frontBackHTML(rounds, avgRef) {
  const f9 = [0, 0], b9 = [0, 0];
  rounds.forEach(r => {
    const sc = r.scores || []; const fr = sc.slice(0, 9), bk = sc.slice(9, 18);
    if (fr.length === 9 && fr.every(x => x > 0)) { f9[0] += fr.reduce((a, b) => a + b, 0); f9[1]++; }
    if (bk.length === 9 && bk.every(x => x > 0)) { b9[0] += bk.reduce((a, b) => a + b, 0); b9[1]++; }
  });
  const f9a = f9[1] ? f9[0] / f9[1] : null, b9a = b9[1] ? b9[0] / b9[1] : null;
  const avgTag = v => (avgRef && avgRef.n && v != null) ? `<span style="display:block;font-size:10px;color:var(--t3);margin-top:3px">평균 ${v.toFixed(1)}</span>` : '';
  const cF9 = f9a != null ? sig(f9a, avgRef && avgRef.f9, true, 2, avgRef && avgRef.n) : '';
  const cB9 = b9a != null ? sig(b9a, avgRef && avgRef.b9, true, 2, avgRef && avgRef.n) : '';
  return `<div class="lbl">전반 / 후반</div><div class="sgd">
    <div class="sc"><span class="sn">${dot(cF9)}${f9a == null ? '-' : f9a.toFixed(1)}</span><span class="sl">전반(1-9)</span>${avgTag(avgRef && avgRef.f9)}</div>
    <div class="sc"><span class="sn">${dot(cB9)}${b9a == null ? '-' : b9a.toFixed(1)}</span><span class="sl">후반(10-18)</span>${avgTag(avgRef && avgRef.b9)}</div>
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
  const mf = f => rs.reduce((a, r) => a + f(r), 0) / n;
  const f9s = rs.map(frontNineOf).filter(x => x != null), b9s = rs.map(backNineOf).filter(x => x != null);
  return {
    n, score: m('score'), putts: m('putts'), gir: m('gir'), fir: m('fir'), vs: m('vs'), mulligan: m('mulligan'),
    loss: mf(lossStrokesOf), blowup: mf(blowupCountOf),
    f9: f9s.length ? f9s.reduce((a, b) => a + b, 0) / f9s.length : null,
    b9: b9s.length ? b9s.reduce((a, b) => a + b, 0) / b9s.length : null,
  };
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
      h += teeStabilityHTML(a) + driverHTML(a) + approachHTML(a) + shortGameHTML(a) + xPenaltyHTML(a) + puttingHTML(a);
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
        <div class="rc-top"><div style="flex:1;min-width:0"><div class="rc-name">${esc(r.courseName || '?')} <span style="font-size:12px;color:var(--t3)">${esc(r.courseLbl)}</span> ${trophyBadges(r)}</div><div class="rc-sub">${esc(r.date)} · ${esc(r.weather)}</div></div><div class="pill ${pC(r.vs)}">${r.score} (${vsL(r.vs)})</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${sigChip('🚗', 'FIR', r.fir + '%', cF)}${sigChip('🎯', 'GIR', r.gir + '%', cG)}${sigChip('🍩', '퍼팅', r.putts, cP)}${courseAvgChip(r)}${r.mulligan ? `<span style="display:inline-flex;align-items:center;gap:3px;background:#2d0f0f;border:.5px solid #6a2020;border-radius:8px;padding:4px 9px;font-size:12px;color:var(--r)">🔄 멀리건 ${r.mulligan}</span>` : ''}</div>
      </div>`;
    });
  }
  el.innerHTML = h;
}
