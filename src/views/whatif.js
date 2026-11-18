// What if: a small scenario model to 2030. Demand grows at a chosen rate (or PJM's own forecast); supply changes with plants
// under construction, a share of planned gas, new solar, wind and batteries, and a share of announced closures.
// Main measure: how far short of its own reliability target PJM would be in each delivery year, starting from the shortfall
// of its 2028/29 capacity auction and adding only what changes after June 2028, each plant at PJM's own peak rating.
// Second measure: average power, as change from today (each plant at its fuel's current running rate).
import { esc, nf0, ymLabel, ymIndex } from '../lib/format.js';
import { trendFit } from '../lib/stats.js';
import { complete } from '../lib/trendfigs.js';
import { loadPlanned, loadExtra } from '../lib/data.js';

const C = { ink: '#141b2d', hot: '#2b44d8', short: '#d1453b', ok: '#2f8f5b', grey: '#b3b9c7', mute: '#6b7389' };
const YEARS = [2027, 2028, 2029, 2030];
const DY = [2028, 2029, 2030]; // delivery years, each starting in June
const dyLab = (y) => `${y}/${String(y + 1).slice(2)}`;

export async function mount(root, data) {
  const { meta, demand, capgen: cg } = data;
  const [planned, pjmr, solarCheck] = await Promise.all([loadPlanned(), loadExtra('pjm_reports'), loadExtra('solar_check')]);
  if (!planned || !pjmr?.elcc) {
    root.innerHTML = '<div class="doc"><div class="errorbox"><h2>The scenario data is not available</h2><p>This tab needs the planned-plant list and PJM’s peak ratings. Rebuild the site data and reload.</p></div></div>';
    return () => {};
  }

  // ---- inputs measured from the site's data
  const mo = demand.monthly, vals = complete(mo.avg_mw, mo.coverage);
  const f = trendFit(mo.months, vals), fHigh = trendFit(mo.months, complete(mo.peak_mw, mo.coverage));
  const pace = f?.post > 0 ? f.post : 2000;
  const peakRatio = f && fHigh && f.post > 0 && fHigh.post > 0 ? fHigh.post / f.post : 1;
  const run = cg?.windows?.[cg.windows.length - 1]?.groups || {};
  const avgRate = { gas: run.gas?.cf || 0.43, coal: run.coal?.cf || 0.48, nuclear: run.nuclear?.cf || 0.93, wind: run.wind?.cf || 0.32, hydro: run.hydro?.cf || 0.21, solar: solarCheck?.latest12?.cf_eia923 || run.solar?.cf || 0.21, storage: 0, other: 0 };
  const E = pjmr.elcc.ratings;
  const peakRate = (u) => {
    const t = String(u.tech || '');
    if (u.group === 'gas') return /Combined Cycle/i.test(t) ? E.gas_cc : u.tech ? E.gas_ct : E.gas_cc;
    if (u.group === 'wind') return /Offshore/i.test(t) ? E.offshore_wind : E.onshore_wind;
    if (u.group === 'solar') return E.solar_tracking;
    if (u.group === 'storage') return E.storage_4hr;
    if (u.group === 'coal') return E.coal;
    if (u.group === 'nuclear') return E.nuclear;
    if (u.group === 'hydro') return 0.35;
    return E.gas_ct; // oil and other small units
  };
  const startYm = demand.comparison.latest.to; // latest month of demand data
  const t0 = ymIndex(startYm);
  const yearsTo = (y) => (ymIndex(`${y}-12`) - t0) / 12;
  const P = planned.units.filter((u) => u.pjm && u.online);
  const building = new Set(['U', 'V', 'TS']);
  const uc = P.filter((u) => building.has(u.status));
  const plannedGas = P.filter((u) => !building.has(u.status) && u.group === 'gas');
  const closing = (planned.retiring || []).filter((u) => u.pjm && u.retire && ymIndex(u.retire) > t0 && ymIndex(u.retire) <= ymIndex(`${YEARS[YEARS.length - 1]}-12`));
  // recent pace of new solar, wind and batteries (nameplate GW a year since the release)
  const Wn = ymIndex(meta.window_start.slice(0, 7)), Wend = ymIndex(meta.plants.snapshot_period), span = (Wend - Wn) / 12;
  const added = (g) => data.units.filter((u) => u.state_cls === 'operating' && u.online && ymIndex(u.online) > Wn && u.group === g).reduce((x, u) => x + (u.mw || 0), 0) / span;
  const recent = { solar: added('solar'), wind: added('wind'), storage: added('storage') };
  const r1 = (v) => Math.round(v * 10) / 10;
  // PJM's track record: share of the capacity it studied since 2020 that reached a signed agreement to connect
  const q = pjmr.queue, track = q?.since_2020_processed_gw ? q.since_2020_signed_gw / q.since_2020_processed_gw : 0.35;
  const trackPct = Math.round((100 * track) / 5) * 5;
  const base = { growth: r1(pace / 1000), gas: trackPct, closures: 100, solar: r1(recent.solar / 1000), wind: r1(recent.wind / 1000), storage: r1(recent.storage / 1000), pjm: false };
  // PJM's own summer peak forecast (2026 load forecast report), by year
  const fc = pjmr.forecast?.summer_peak_mw || {};
  const fcAt = (x) => { const ks = Object.keys(fc).map(Number).sort((a, c) => a - c); if (ks.length < 2) return null; let i = ks.findIndex((k) => k >= x); if (i < 0) i = ks.length - 1; if (i === 0) i = 1; const a = ks[i - 1], c = ks[i]; return fc[a] + ((fc[c] - fc[a]) * (x - a)) / (c - a); };
  const hasFc = fcAt(2028) != null && fcAt(2030) != null;
  const PRESETS = [
    ['Today’s trends', {}],
    ...(hasFc ? [['PJM’s own forecast', { pjm: true }]] : []),
    ['Data center boom', { growth: 4 }],
    ['Slowdown', { growth: 1 }],
    ['Keep old plants open', { closures: 0 }],
    ['Build all planned gas', { gas: 100 }],
    ['Clean energy push', { solar: 8, wind: 2, storage: 4 }],
  ];
  const state = { ...base };
  // a scenario can be shared as a link: #/whatif?growth=3&gas=50 ...
  const KEYS = ['growth', 'gas', 'closures', 'solar', 'wind', 'storage'];
  try {
    const qs = new URLSearchParams((location.hash.split('?')[1]) || '');
    KEYS.forEach((k) => { if (qs.has(k) && Number.isFinite(Number(qs.get(k)))) state[k] = Number(qs.get(k)); });
    if (qs.get('pjm') === '1' && hasFc) state.pjm = true;
  } catch { /* ignore a malformed link */ }
  const shareUrl = () => { const qs = new URLSearchParams(); KEYS.forEach((k) => qs.set(k, state[k])); if (state.pjm) qs.set('pjm', '1'); return `${location.origin}${location.pathname}#/whatif?${qs}`; };

  const T28 = ymIndex(`${DY[0]}-06`), A28 = pjmr.auctions?.[pjmr.auctions.length - 1];
  const short0 = A28?.short_mw || 0;
  // demand growth at the busiest hour between two dates (fractional years); PJM's forecast is by summer
  const peakGrowth = (s, y0, y1) => (s.pjm && hasFc ? fcAt(y1) - fcAt(y0) : s.growth * 1000 * peakRatio * (y1 - y0));
  const sumIn = (list, from, to, w, rate, key = 'online') => list.filter((u) => u[key] && ymIndex(u[key]) > from && ymIndex(u[key]) <= to).reduce((x, u) => x + (u.mw || 0) * w * rate(u), 0);

  // against PJM's reliability target, per delivery year (June to May)
  function target(s) {
    return DY.map((y) => {
      const t = ymIndex(`${y}-06`);
      const ucP = sumIn(uc, T28, t, 1, peakRate), gasP = sumIn(plannedGas, T28, t, s.gas / 100, peakRate);
      const clP = sumIn(closing, T28, t, s.closures / 100, peakRate, 'retire');
      const yrs = (t - T28) / 12;
      const reP = yrs * 1000 * (s.solar * E.solar_tracking + s.wind * E.onshore_wind + s.storage * E.storage_4hr);
      const need = peakGrowth(s, DY[0], y);
      const sup = ucP + gasP + reP - clP;
      return { y, label: dyLab(y), gap: short0 + need - sup, need, sup, fixed: y === DY[0], parts: { ucP, gasP, reP, clP } };
    });
  }

  // average power, change from today to the end of each year
  function model(s) {
    return YEARS.map((y) => {
      const end = ymIndex(`${y}-12`), yrs = yearsTo(y);
      const ucA = sumIn(uc, t0, end, 1, (u) => avgRate[u.group] ?? 0), gasA = sumIn(plannedGas, t0, end, s.gas / 100, () => avgRate.gas);
      const clA = sumIn(closing, t0, end, s.closures / 100, (u) => avgRate[u.group] ?? 0, 'retire');
      const newYrs = Math.max(0, y - 2027); // new solar, wind and batteries beyond today's list start in 2028
      const reA = newYrs * 1000 * (s.solar * avgRate.solar + s.wind * avgRate.wind);
      const now = t0 / 12 + 1 / 24; // today as a fractional year
      const needA = s.pjm && hasFc ? peakGrowth(s, now - 0.5, y + 0.5) / peakRatio : s.growth * 1000 * yrs;
      const supA = ucA + gasA + reA - clA;
      return { y, label: String(y), gap: needA - supA, needA, supA, parts: { ucA, gasA, reA, clA } };
    });
  }

  // which assumption moves the last delivery year most: each lever at a low and a high setting, the rest as chosen
  const LEVERS = [
    ['growth', 'Demand growth', 1, 4, (v) => `${v} GW a year`],
    ['gas', 'Planned gas built', 0, 100, (v) => `${v}%`],
    ['closures', 'Closures that happen', 0, 100, (v) => `${v}%`],
    ['solar', 'New solar a year', 0, 8, (v) => `${v} GW`],
    ['wind', 'New wind a year', 0, 2, (v) => `${v} GW`],
    ['storage', 'New batteries a year', 0, 4, (v) => `${v} GW`],
  ];
  const lastGap = (s) => target(s)[DY.length - 1].gap;
  function swings(s) {
    return LEVERS.map(([k, name, lo, hi, f]) => {
      const st = { ...s, ...(k === 'growth' ? { pjm: false } : {}) };
      return { k, name, range: `${f(lo)} to ${f(hi)}`, a: lastGap({ ...st, [k]: lo }), b: lastGap({ ...st, [k]: hi }), loTxt: f(lo), hiTxt: f(hi) };
    }).sort((x, c) => Math.abs(c.b - c.a) - Math.abs(x.b - x.a));
  }

  const slider = (k, label, min, max, step, unit, hint) => `<div class="wi__ctl">
      <label for="wi_${k}"><span>${esc(label)}</span><output id="wo_${k}"></output></label>
      <input type="range" id="wi_${k}" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${state[k]}">
      <small>${esc(hint)}</small><i hidden>${unit}</i></div>`;

  root.innerHTML = `<div class="whatif">
    <header class="wi__head"><h2>What if?</h2>
      <p><b>Will PJM have enough power by 2030, and which lever matters most?</b> Pick a scenario or move the sliders. Every starting value comes from measured trends or PJM’s own published numbers.</p></header>
    <div class="wi__presets" role="group" aria-label="Scenarios">${PRESETS.map(([n], i) => `<button type="button" class="chip" data-preset="${i}" aria-pressed="${i === 0 && location.hash.indexOf('?') < 0}">${esc(n)}</button>`).join('')}<button type="button" class="chip wi__share" id="wiShare">Copy link to this scenario</button></div>
    <div class="wi__grid">
      <section class="wi__panel" aria-label="Assumptions">
        <h3>Demand</h3>
        ${slider('growth', 'Demand growth', 0, 6, 0.1, 'GW a year', `Today’s pace: ${r1(pace / 1000)} GW a year on an average hour; the busiest hour grows ${peakRatio.toFixed(1)} times as fast`)}
        <p class="wi__fixed" id="wiPjmNote" hidden>Using PJM’s own forecast of its summer peak (${esc(pjmr.forecast?.report || '')}). Move the slider to use your own rate.</p>
        <h3>Supply</h3>
        ${slider('gas', 'Planned gas that gets built', 0, 100, 5, '%', `${nf0.format(plannedGas.reduce((x, u) => x + (u.mw || 0), 0) / 100) / 10} GW is planned but not started. Starts at PJM’s track record: about ${nf0.format(100 * track)}% of the capacity it studied since 2020 signed an agreement to connect.`)}
        ${slider('solar', 'New solar each year from 2028', 0, 12, 0.5, 'GW', `Pace since 2022: ${r1(recent.solar / 1000)} GW a year`)}
        ${slider('wind', 'New wind each year from 2028', 0, 4, 0.1, 'GW', `Pace since 2022: ${r1(recent.wind / 1000)} GW a year`)}
        ${slider('storage', 'New batteries each year from 2028', 0, 6, 0.1, 'GW', `Pace since 2022: ${r1(recent.storage / 1000)} GW a year`)}
        ${slider('closures', 'Announced closures that happen', 0, 100, 5, '%', `${nf0.format(closing.reduce((x, u) => x + (u.mw || 0), 0) / 100) / 10} GW of plants are due to close by the end of ${YEARS[YEARS.length - 1]}`)}
        <p class="wi__fixed">Always included: ${nf0.format(uc.reduce((x, u) => x + (u.mw || 0), 0) / 100) / 10} GW of plants already under construction, on their reported dates.</p>
      </section>
      <section class="wi__out" aria-live="polite">
        <p class="wi__verdict" id="wiVerdict"></p>
        <div class="wi__charts">
          <div><h4>Against PJM’s reliability target</h4><p class="wi__sub">At the busiest hour, by delivery year (June to May)</p><div id="wiPeak"></div></div>
          <div><h4>On an average hour</h4><p class="wi__sub">Change from today, by the end of each year</p><div id="wiAvg"></div></div>
        </div>
        <div class="wi__tor"><h4>Which assumption matters most?</h4><p class="wi__sub">How far each one moves the ${dyLab(DY[DY.length - 1])} result, from a low to a high setting, with the others as chosen above</p><div id="wiTor"></div></div>
        <details class="fineprint wi__how"><summary>What goes into these numbers</summary><div id="wiTable"></div></details>
      </section>
    </div>
    <details class="fineprint wi__method"><summary>How this works</summary>
      <p>Against PJM’s reliability target: the starting point is PJM’s own ${esc(A28?.delivery_year || '')} capacity auction, which ended ${nf0.format(short0 / 100) / 10} GW short of the target (${esc(A28?.source || '')}). That result already counts PJM’s forecast demand for that year and every plant that cleared the auction, so only changes after June ${DY[0]} are added: demand growth at the busiest hour, plants due after that date, and closures after that date. One more megawatt of peak demand is counted as needing one more megawatt of rated supply; PJM also keeps a reserve on top, so this understates the gap a little. Plants due before June ${DY[0]} are assumed to be in the auction result.</p>
      <p>On an average hour: the change from ${esc(ymLabel(startYm))} to the end of each year, new demand against new supply minus closures. It has no PJM target to start from.</p>
      <p>Planned gas starts at ${trackPct}%, PJM’s track record: since 2020, ${nf0.format(q?.since_2020_signed_gw || 0)} GW of the ${nf0.format(q?.since_2020_processed_gw || 0)} GW of projects PJM studied reached a signed agreement to connect (${esc(q?.source || 'PJM')}), and not every signed project gets built. Which assumption matters most moves one setting at a time across the range shown next to it and keeps the others as chosen; demand growth is moved on your own rate, not PJM’s forecast.</p>
      <p>Demand grows by the chosen GW a year on an average hour. The busiest hour grows ${peakRatio.toFixed(1)} times as fast, the ratio measured on PJM’s data since the release. With “PJM’s own forecast”, the busiest hour follows PJM’s ${esc(pjmr.forecast?.report || 'load forecast')} (summer peak ${hasFc ? `${nf0.format(fcAt(2028) / 1000)} GW in 2028, ${nf0.format(fcAt(2030) / 1000)} GW in 2030` : ''}) and the average hour grows at that pace divided by the same ratio.</p>
      <p>Average hour: each plant counts at how hard PJM’s plants of that fuel ran over the latest 12 months (gas ${nf0.format(100 * avgRate.gas)}%, coal ${nf0.format(100 * avgRate.coal)}%, solar ${nf0.format(100 * avgRate.solar)}%, wind ${nf0.format(100 * avgRate.wind)}%; batteries store power and add none on average). Busiest hour: each plant counts at PJM’s own peak rating for the ${esc(pjmr.elcc.delivery_year)} auction (combined-cycle gas ${nf0.format(100 * E.gas_cc)}%, gas turbines ${nf0.format(100 * E.gas_ct)}%, coal ${nf0.format(100 * E.coal)}%, solar ${nf0.format(100 * E.solar_tracking)}%, onshore wind ${nf0.format(100 * E.onshore_wind)}%, offshore wind ${nf0.format(100 * E.offshore_wind)}%, 4-hour batteries ${nf0.format(100 * E.storage_4hr)}%). Oil units count at the gas turbine rating.</p>
      <p>Plants under construction and planned gas arrive on the dates owners reported to EIA; new solar, wind and batteries beyond that list start in 2028. This is a sketch for exploring trade-offs, not a forecast: it leaves out transmission limits, imports, demand response and changes in how hard existing plants run. Sources are on the Sources page.</p></details>
  </div>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const fmtGW = (v) => `${v < 0 ? '−' : ''}${(Math.abs(v) / 1000).toFixed(1)} GW`;
  const unitOf = { growth: ' GW a year', gas: '%', closures: '%', solar: ' GW', wind: ' GW', storage: ' GW' };

  // Bars share one scale across both charts (passed in as m). One-sided when every year falls the same way.
  function barsFor(rows, m) {
    const anyS = rows.some((r) => r.gap > 0), anyP = rows.some((r) => r.gap <= 0), mixed = anyS && anyP;
    const room = mixed ? 20 : 58; // percent of the track a full-length bar may use, leaving space for its label
    return `<div class="wi__bars" role="img" aria-label="${esc(rows.map((r) => `${r.label}: ${r.gap > 0 ? 'short' : 'spare'} ${fmtGW(Math.abs(r.gap))}`).join('; '))}">${rows.map((r) => {
      const v = r.gap, short = v > 0, w = (room * Math.abs(v)) / m;
      const zero = mixed ? 62 : 0;
      const pos = short || !mixed ? `left:${zero}%;width:${w}%` : `right:${100 - zero}%;width:${w}%`;
      const lab = short || !mixed ? `left:calc(${zero}% + ${w}% + 8px)` : `right:calc(${100 - zero}% + ${w}% + 8px)`;
      return `<div class="wi__row"><span class="wi__y">${r.label}${r.fixed ? '<small>auction</small>' : ''}</span><span class="wi__track${mixed ? ' is-mixed' : ''}"><i style="${pos};background:${short ? C.short : C.ok}${r.fixed ? ';opacity:.55' : ''}"></i><b style="${lab}">${short ? `${fmtGW(v)} short` : `${fmtGW(-v)} spare`}</b></span></div>`;
    }).join('')}</div>`;
  }

  // ranked bars: each lever from its low to its high setting, on one scale, with the current result marked
  function tornado(rows, cur) {
    const vals = rows.flatMap((r) => [r.a, r.b]).concat(cur), lo = Math.min(...vals, 0), hi = Math.max(...vals, 0), X = (v) => (100 * (v - lo)) / (hi - lo || 1);
    return `<div class="wi__torrows" role="img" aria-label="${esc(rows.map((r) => `${r.name}, ${r.range}: ${fmtGW(r.a)} to ${fmtGW(r.b)} short`).join('; '))}">${rows.map((r) => {
      const l = Math.min(r.a, r.b), h = Math.max(r.a, r.b);
      const lowEnd = r.a <= r.b ? r.loTxt : r.hiTxt, highEnd = r.a <= r.b ? r.hiTxt : r.loTxt;
      return `<div class="wi__trow"><span class="wi__tname">${esc(r.name)}<small>${esc(r.range)}</small></span>
        <span class="wi__ttrack"><i style="left:${X(l)}%;width:${Math.max(0.6, X(h) - X(l))}%"></i><u style="left:${X(cur)}%"></u>
          <b class="lo" style="right:calc(${100 - X(l)}% + 6px)">${fmtGW(l)}<small>${esc(lowEnd)}</small></b><b class="hi" style="left:calc(${X(h)}% + 6px)">${fmtGW(h)}<small>${esc(highEnd)}</small></b></span></div>`;
    }).join('')}<div class="wi__trow wi__taxis"><span></span><span class="wi__ttrack"><em style="left:${X(cur)}%">Your scenario: ${fmtGW(cur)} short</em>${lo < 0 ? `<em class="zero" style="left:${X(0)}%">Target met</em>` : ''}</span></div></div>`;
  }

  function draw() {
    try { history.replaceState(null, '', shareUrl()); } catch { /* not allowed in some embeds */ }
    for (const k of Object.keys(unitOf)) { const el = $(`wo_${k}`); if (el) el.textContent = k === 'growth' && state.pjm ? 'PJM forecast' : `${state[k]}${unitOf[k]}`; }
    $('wiPjmNote').hidden = !state.pjm;
    const tg = target(state), rows = model(state), last = tg[tg.length - 1];
    $('wiVerdict').innerHTML = last.gap > 0
      ? `For ${last.label}, PJM would be <b class="is-short">${fmtGW(last.gap)} short</b> of its own reliability target.<span>Its ${esc(A28?.delivery_year || '')} auction was already ${fmtGW(short0)} short.</span>`
      : `For ${last.label}, PJM would <b class="is-ok">meet its reliability target with ${fmtGW(-last.gap)} to spare</b>.<span>Its ${esc(A28?.delivery_year || '')} auction was ${fmtGW(short0)} short.</span>`;
    const m = Math.max(...tg.map((r) => Math.abs(r.gap)), ...rows.map((r) => Math.abs(r.gap)), 1000);
    $('wiPeak').innerHTML = barsFor(tg, m);
    $('wiAvg').innerHTML = barsFor(rows, m);
    $('wiTor').innerHTML = tornado(swings(state), last.gap);
    const p = last.parts, a = rows[rows.length - 1], pa = a.parts;
    $('wiTable').innerHTML = `<table><thead><tr><th scope="col"></th><th scope="col" class="num">Reliability target, ${last.label}</th><th scope="col" class="num">Average hour, end of 2030</th></tr></thead><tbody>
      <tr><td>Starting point</td><td class="num">${fmtGW(short0)} short (${esc(A28?.delivery_year || '')} auction)</td><td class="num">Today</td></tr>
      <tr><td>New demand</td><td class="num">+${fmtGW(last.need)}</td><td class="num">+${fmtGW(a.needA)}</td></tr>
      <tr><td>Plants under construction</td><td class="num">−${fmtGW(p.ucP)}</td><td class="num">−${fmtGW(pa.ucA)}</td></tr>
      <tr><td>Planned gas</td><td class="num">−${fmtGW(p.gasP)}</td><td class="num">−${fmtGW(pa.gasA)}</td></tr>
      <tr><td>New solar, wind and batteries</td><td class="num">−${fmtGW(p.reP)}</td><td class="num">−${fmtGW(pa.reA)}</td></tr>
      <tr><td>Plants closing</td><td class="num">+${fmtGW(p.clP)}</td><td class="num">+${fmtGW(pa.clA)}</td></tr>
      <tr><td><b>Short (+) or spare (−)</b></td><td class="num"><b>${fmtGW(last.gap)}</b></td><td class="num"><b>${fmtGW(a.gap)}</b></td></tr></tbody></table>
      <p>Supply counts only after June ${DY[0]} in the first column (earlier plants are in the auction result) and after ${esc(ymLabel(startYm))} in the second.</p>`;
  }

  root.addEventListener('input', (e) => {
    const k = e.target.dataset?.k; if (!k) return;
    state[k] = Number(e.target.value);
    if (k === 'growth') state.pjm = false;
    root.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    draw();
  });
  root.addEventListener('click', async (e) => {
    if (e.target.closest('#wiShare')) {
      const btn = e.target.closest('#wiShare'), url = shareUrl();
      try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; } catch { window.prompt('Copy this link', url); }
      setTimeout(() => { btn.textContent = 'Copy link to this scenario'; }, 2000);
      return;
    }
    const b = e.target.closest('[data-preset]'); if (!b) return;
    Object.assign(state, base, PRESETS[Number(b.dataset.preset)][1]);
    root.querySelectorAll('[data-k]').forEach((inp) => { inp.value = state[inp.dataset.k]; });
    root.querySelectorAll('[data-preset]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  draw();
  return () => {};
}
