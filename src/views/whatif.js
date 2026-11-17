// What if: a small scenario model to 2030. Demand grows at a chosen rate; supply changes with plants under construction,
// a share of planned gas, new solar, wind and batteries, and a share of announced closures. The gap is shown two ways:
// average power (each plant at its fuel's current running rate) and the busiest hour (each plant at PJM's own peak rating).
import { esc, nf0, ymLabel, ymIndex } from '../lib/format.js';
import { trendFit } from '../lib/stats.js';
import { complete } from '../lib/trendfigs.js';
import { loadPlanned, loadExtra } from '../lib/data.js';

const C = { ink: '#141b2d', hot: '#2b44d8', short: '#d1453b', ok: '#2f8f5b', grey: '#b3b9c7', mute: '#6b7389' };
const YEARS = [2027, 2028, 2029, 2030];

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
  const base = { growth: r1(pace / 1000), gas: 50, closures: 100, solar: r1(recent.solar / 1000), wind: r1(recent.wind / 1000), storage: r1(recent.storage / 1000) };
  const PRESETS = [
    ['Today’s trends', {}],
    ['Data center boom', { growth: 4 }],
    ['Slowdown', { growth: 1 }],
    ['Keep old plants open', { closures: 0 }],
    ['Build all planned gas', { gas: 100 }],
    ['Clean energy push', { solar: 8, wind: 2, storage: 4 }],
  ];
  const state = { ...base };

  function model(s) {
    return YEARS.map((y) => {
      const end = `${y}-12`, yrs = yearsTo(y);
      const due = (u, ym) => ym && ymIndex(ym) <= ymIndex(end);
      const sum = (list, w, rate) => list.filter((u) => due(u, u.online || u.retire)).reduce((x, u) => x + (u.mw || 0) * w * rate(u), 0);
      const ucA = sum(uc, 1, (u) => avgRate[u.group] ?? 0), ucP = sum(uc, 1, peakRate);
      const gasA = sum(plannedGas, s.gas / 100, () => avgRate.gas), gasP = sum(plannedGas, s.gas / 100, peakRate);
      const clA = closing.filter((u) => ymIndex(u.retire) <= ymIndex(end)).reduce((x, u) => x + (u.mw || 0) * (s.closures / 100) * (avgRate[u.group] ?? 0), 0);
      const clP = closing.filter((u) => ymIndex(u.retire) <= ymIndex(end)).reduce((x, u) => x + (u.mw || 0) * (s.closures / 100) * peakRate(u), 0);
      const newYrs = Math.max(0, y - 2027); // new solar, wind and batteries beyond today's list start in 2028
      const reA = newYrs * 1000 * (s.solar * avgRate.solar + s.wind * avgRate.wind);
      const reP = newYrs * 1000 * (s.solar * E.solar_tracking + s.wind * E.onshore_wind + s.storage * E.storage_4hr);
      const needA = s.growth * 1000 * yrs, needP = needA * peakRatio;
      const supA = ucA + gasA + reA - clA, supP = ucP + gasP + reP - clP;
      return { y, needA, needP, supA, supP, gapA: needA - supA, gapP: needP - supP, parts: { ucA, ucP, gasA, gasP, reA, reP, clA, clP } };
    });
  }

  const slider = (k, label, min, max, step, unit, hint) => `<div class="wi__ctl">
      <label for="wi_${k}"><span>${esc(label)}</span><output id="wo_${k}"></output></label>
      <input type="range" id="wi_${k}" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${state[k]}">
      <small>${esc(hint)}</small><i hidden>${unit}</i></div>`;

  root.innerHTML = `<div class="whatif">
    <header class="wi__head"><h2>What if?</h2>
      <p>Move the sliders to see whether PJM would have enough power by 2030. It starts from today’s measured trends and the plants owners have reported to the government.</p></header>
    <div class="wi__presets" role="group" aria-label="Scenarios">${PRESETS.map(([n], i) => `<button type="button" class="chip" data-preset="${i}" aria-pressed="${i === 0}">${esc(n)}</button>`).join('')}</div>
    <div class="wi__grid">
      <section class="wi__panel" aria-label="Assumptions">
        <h3>Demand</h3>
        ${slider('growth', 'Demand growth', 0, 6, 0.1, 'GW a year', `Today’s pace: ${r1(pace / 1000)} GW a year`)}
        <h3>Supply</h3>
        ${slider('gas', 'Planned gas that gets built', 0, 100, 5, '%', `${nf0.format(plannedGas.reduce((x, u) => x + (u.mw || 0), 0) / 100) / 10} GW of gas is planned but not started`)}
        ${slider('solar', 'New solar each year from 2028', 0, 12, 0.5, 'GW', `Pace since 2022: ${r1(recent.solar / 1000)} GW a year`)}
        ${slider('wind', 'New wind each year from 2028', 0, 4, 0.1, 'GW', `Pace since 2022: ${r1(recent.wind / 1000)} GW a year`)}
        ${slider('storage', 'New batteries each year from 2028', 0, 6, 0.1, 'GW', `Pace since 2022: ${r1(recent.storage / 1000)} GW a year`)}
        ${slider('closures', 'Announced closures that happen', 0, 100, 5, '%', `${nf0.format(closing.reduce((x, u) => x + (u.mw || 0), 0) / 100) / 10} GW of plants are due to close by the end of ${YEARS[YEARS.length - 1]}`)}
        <p class="wi__fixed">Always included: ${nf0.format(uc.reduce((x, u) => x + (u.mw || 0), 0) / 100) / 10} GW of plants already under construction, on their reported dates.</p>
      </section>
      <section class="wi__out" aria-live="polite">
        <p class="wi__verdict" id="wiVerdict"></p>
        <div class="wi__charts">
          <div><h4>At the busiest hour</h4><div id="wiPeak"></div></div>
          <div><h4>On an average hour</h4><div id="wiAvg"></div></div>
        </div>
        <details class="fineprint wi__how"><summary>What goes into the 2030 numbers</summary><div id="wiTable"></div></details>
      </section>
    </div>
    <details class="fineprint wi__method"><summary>How this works</summary>
      <p>Starting point: ${esc(ymLabel(startYm))}. Each year’s figure is the change from today to the end of that year: new demand against new supply minus closures. It does not include today’s situation; PJM’s ${esc(pjmr.auctions?.[pjmr.auctions.length - 1]?.delivery_year || '')} auction was already ${nf0.format((pjmr.auctions?.[pjmr.auctions.length - 1]?.short_mw || 0) / 100) / 10} GW short of PJM’s reliability target.</p>
      <p>Demand grows by the chosen GW a year. The busiest hour grows ${peakRatio.toFixed(1)} times as fast, the ratio measured on PJM’s data since the release.</p>
      <p>Average hour: each plant counts at how hard PJM’s plants of that fuel ran over the latest 12 months (gas ${nf0.format(100 * avgRate.gas)}%, coal ${nf0.format(100 * avgRate.coal)}%, solar ${nf0.format(100 * avgRate.solar)}%, wind ${nf0.format(100 * avgRate.wind)}%; batteries store power and add none on average). Busiest hour: each plant counts at PJM’s own peak rating for the ${esc(pjmr.elcc.delivery_year)} auction (combined-cycle gas ${nf0.format(100 * E.gas_cc)}%, gas turbines ${nf0.format(100 * E.gas_ct)}%, coal ${nf0.format(100 * E.coal)}%, solar ${nf0.format(100 * E.solar_tracking)}%, onshore wind ${nf0.format(100 * E.onshore_wind)}%, offshore wind ${nf0.format(100 * E.offshore_wind)}%, 4-hour batteries ${nf0.format(100 * E.storage_4hr)}%). Oil units count at the gas turbine rating.</p>
      <p>Plants under construction and planned gas arrive on the dates owners reported to EIA; new solar, wind and batteries beyond that list start in 2028. This is a sketch for exploring trade-offs, not a forecast: it leaves out transmission limits, imports, demand response and changes in how hard existing plants run. Sources are on the Sources page.</p></details>
  </div>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const fmtGW = (v) => `${v < 0 ? '−' : ''}${(Math.abs(v) / 1000).toFixed(1)} GW`;
  const unitOf = { growth: ' GW a year', gas: '%', closures: '%', solar: ' GW', wind: ' GW', storage: ' GW' };

  // Bars share one scale across both charts (passed in as m). One-sided when every year falls the same way.
  function barsFor(rows, key, m) {
    const anyS = rows.some((r) => r[key] > 0), anyP = rows.some((r) => r[key] <= 0), mixed = anyS && anyP;
    const room = mixed ? 20 : 58; // percent of the track a full-length bar may use, leaving space for its label
    return `<div class="wi__bars" role="img" aria-label="${esc(rows.map((r) => `${r.y}: ${r[key] > 0 ? 'short' : 'spare'} ${fmtGW(Math.abs(r[key]))}`).join('; '))}">${rows.map((r) => {
      const v = r[key], short = v > 0, w = (room * Math.abs(v)) / m;
      const zero = mixed ? 62 : 0;
      const pos = short || !mixed ? `left:${zero}%;width:${w}%` : `right:${100 - zero}%;width:${w}%`;
      const lab = short || !mixed ? `left:calc(${zero}% + ${w}% + 8px)` : `right:calc(${100 - zero}% + ${w}% + 8px)`;
      return `<div class="wi__row"><span class="wi__y">${r.y}</span><span class="wi__track${mixed ? ' is-mixed' : ''}"><i style="${pos};background:${short ? C.short : C.ok}"></i><b style="${lab}">${short ? `${fmtGW(v)} short` : `${fmtGW(-v)} spare`}</b></span></div>`;
    }).join('')}</div>`;
  }

  function draw() {
    for (const k of Object.keys(unitOf)) { const el = $(`wo_${k}`); if (el) el.textContent = `${state[k]}${unitOf[k]}`; }
    const rows = model(state), last = rows[rows.length - 1];
    $('wiVerdict').innerHTML = last.gapP > 0
      ? `By 2030, PJM would be <b class="is-short">${fmtGW(last.gapP)} short</b> at its busiest hour, on top of today’s position.`
      : `By 2030, PJM would have <b class="is-ok">${fmtGW(-last.gapP)} to spare</b> at its busiest hour, compared with today.`;
    const m = Math.max(...rows.flatMap((r) => [Math.abs(r.gapP), Math.abs(r.gapA)]), 1000);
    $('wiPeak').innerHTML = barsFor(rows, 'gapP', m);
    $('wiAvg').innerHTML = barsFor(rows, 'gapA', m);
    const p = last.parts;
    $('wiTable').innerHTML = `<table><thead><tr><th scope="col">By the end of 2030</th><th scope="col" class="num">Busiest hour</th><th scope="col" class="num">Average hour</th></tr></thead><tbody>
      <tr><td>New demand</td><td class="num">${fmtGW(last.needP)}</td><td class="num">${fmtGW(last.needA)}</td></tr>
      <tr><td>Plants under construction</td><td class="num">+${fmtGW(p.ucP)}</td><td class="num">+${fmtGW(p.ucA)}</td></tr>
      <tr><td>Planned gas</td><td class="num">+${fmtGW(p.gasP)}</td><td class="num">+${fmtGW(p.gasA)}</td></tr>
      <tr><td>New solar, wind and batteries</td><td class="num">+${fmtGW(p.reP)}</td><td class="num">+${fmtGW(p.reA)}</td></tr>
      <tr><td>Plants closing</td><td class="num">−${fmtGW(p.clP)}</td><td class="num">−${fmtGW(p.clA)}</td></tr>
      <tr><td><b>Short (+) or spare (−)</b></td><td class="num"><b>${fmtGW(last.gapP)}</b></td><td class="num"><b>${fmtGW(last.gapA)}</b></td></tr></tbody></table>`;
  }

  root.addEventListener('input', (e) => {
    const k = e.target.dataset?.k; if (!k) return;
    state[k] = Number(e.target.value);
    root.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    draw();
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]'); if (!b) return;
    Object.assign(state, base, PRESETS[Number(b.dataset.preset)][1]);
    root.querySelectorAll('[data-k]').forEach((inp) => { inp.value = state[inp.dataset.k]; });
    root.querySelectorAll('[data-preset]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  draw();
  return () => {};
}
