// The story: six pictures about PJM, one idea each. The full charts and the method sit behind each picture.
import { esc, nf0, pct, ymLabel, ymIndex, indexYm } from '../lib/format.js';
import { TIME } from '../lib/fuels.js';
import { Chart, GRID, table, simple, yieldFigure, dem } from '../lib/figs.js';
import { demandTrendFigure, loadShapeFigure, generationTrendFigure, capacityLinkFigure, complete } from '../lib/trendfigs.js';
import { trendFit, rolling12, RELEASE } from '../lib/stats.js';
import { loadExplorer, loadHourly, loadPlanned, loadExtra } from '../lib/data.js';
import { bars, pairs, cols, mountLine, C, homes } from '../lib/story.js';
import { pjmGeo, stateName } from '../lib/geo.js';
import { twoMaps } from '../lib/twomaps.js';
import { live, weekChart, hourChart, runChart, crossing, key, bridge, hbridge, monthLine } from '../lib/storycharts.js';

const gw = (mw, d = 1) => `${(Math.abs(mw) / 1000).toFixed(d)} GW`;
const ymAdd = (ym, k) => indexYm(ymIndex(ym) + k);
// Consulting-style chart furniture: a unit line under each headline and a short note and source under each chart
const META = {
  week: { unit: 'Hourly electricity use in PJM, GW (Eastern Standard Time)', src: 'EIA-930 hourly demand.' },
  zones: { unit: 'Change in average electricity use by utility territory, latest 12 months vs. the 12 before ChatGPT, GW', src: 'EIA-930 hourly demand by utility territory; IM3 Open Source Data Center Atlas.' },
  where: { unit: 'Growth since ChatGPT’s release, average GW, both maps on one scale', src: 'EIA-930; EIA-860M generator inventory (Sept. 2026); EIA-923; U.S. Census Bureau outlines.' },
  solar: { unit: 'Change by hour of day, latest 12 months vs. the 12 before ChatGPT, average GW', note: 'PJM’s hourly data undercount solar; the pattern holds when corrected with plant reports.', src: 'EIA-930 hourly demand and generation; EIA-923 plant reports.' },
  slack: { unit: 'Change in average power by source, latest 12 months vs. the 12 before ChatGPT, GW', note: 'Actual generation, not plant size on paper.', src: 'EIA-930 hourly generation; EIA-923.' },
  coming: { src: 'EIA-860M generator inventory (Sept. 2026); EIA-930; EIA-923 plant reports.' },
  enough: { src: 'PJM capacity auction results (news releases of July 2024, July 2025, Dec. 2025 and July 2026); PJM 2024 Annual Report.' },
};
const tidy = (t) => String(t || '').replace(/ ?Touch the (chart|line)[^.]*\./g, '').trim();
const foot = (s) => { const m = META[s.id || s.key] || {}, note = s.note || m.note, src = s.src || m.src; if (!src) return s.cap ? `<p class="step__cap">${esc(tidy(s.cap))}</p>` : ''; return `<p class="step__foot">${note ? `<span>Note: ${esc(note)}</span>` : ''}<span>Source: ${esc(src)}</span></p>`; };
const plus = (mw) => `${mw >= 0 ? '+' : '−'}${gw(mw)}`;

export async function mount(root, data) {
  const { meta, demand, capgen: cg } = data;
  const parts = [];
  const ex = await loadExplorer('pjm');
  const b = demand.comparison.baseline, l = demand.comparison.latest;
  const mo = demand.monthly, valsD = complete(mo.avg_mw, mo.coverage);
  const f = trendFit(mo.months, valsD), fLow = trendFit(mo.months, complete(mo.min_mw, mo.coverage)), fHigh = trendFit(mo.months, complete(mo.peak_mw, mo.coverage));
  // Weather: heating and cooling degree days (EIA Short-Term Energy Outlook, by census division), each division weighted by
  // the share of PJM demand in the zones that sit in it over the 12 months before the release.
  const [weather, solarCheck] = await Promise.all([loadExtra('weather'), loadExtra('solar_check')]);
  let fW = null;
  if (weather?.series) {
    const DIV = { AE: 'MAC', AEP: 'ENC', AP: 'SAC', ATSI: 'ENC', BC: 'SAC', CE: 'ENC', DAY: 'ENC', DEOK: 'ENC', DOM: 'SAC', DPL: 'SAC', DUQ: 'MAC', EKPC: 'ESC', JC: 'MAC', ME: 'MAC', PE: 'MAC', PEP: 'SAC', PL: 'MAC', PN: 'MAC', PS: 'MAC', RECO: 'MAC' };
    const wt = {};
    Object.entries(demand.comparison.zones || {}).forEach(([z, v]) => { if (DIV[z]) wt[DIV[z]] = (wt[DIV[z]] || 0) + v.baseline.avg_mw; });
    const tw = Object.values(wt).reduce((a, x) => a + x, 0);
    const dd = (kind) => mo.months.map((m) => { let v = 0; for (const [k, x] of Object.entries(wt)) { const s2 = weather.series[`ZW${kind}D_${k}`]; if (!s2 || s2[m] == null) return null; v += (x / tw) * s2[m]; } return v; });
    if (tw > 0) fW = trendFit(mo.months, valsD, { extra: [dd('H'), dd('C')] });
  }
  const up = dem(b.avg_mw, l.avg_mw);
  const sped = f && f.significant && f.dSlope > 0;
  const steps = []; // { h, g, cap, proof?, link? }
  const sum = {}; // headline numbers for the summary at the top

  // 2. round the clock: real weeks, then and now. Every Monday-to-Sunday week in the 12 months before the release is
  // paired with the same weekdays 208 weeks (about four years) later (EIA-930 hourly demand, Eastern Standard Time).
  // The page opens on the middle week (the median change) and the reader can pick any other, so no week is hand-picked.
  let wk = null;
  try {
    const yrs = []; for (let y = Number(b.from.slice(0, 4)); y <= Number(l.to.slice(0, 4)) + 1; y++) yrs.push(y);
    const files = (await Promise.all(yrs.map((y) => loadHourly('pjm', y).catch(() => null)))).filter(Boolean);
    const at = new Map();
    files.forEach((h) => { const t0 = Date.parse(`${h.start_utc}:00:00Z`); h.demand_mw.forEach((d, i) => { if (d != null && d > 20000) at.set(t0 + i * 36e5, d); }); });
    const H = 36e5, DAYMS = 24 * H, OFF = 208 * 7 * DAYMS;
    const week = (t) => { const v = []; for (let i = 0; i < 168; i++) { const d = at.get(t + i * H); if (d == null) return null; v.push(d); } return v; };
    let t = Date.UTC(Number(b.from.slice(0, 4)), Number(b.from.slice(5, 7)) - 1, 1, 5);
    while (new Date(t - 5 * H).getUTCDay() !== 1) t += DAYMS;
    const stop = Date.UTC(Number(b.to.slice(0, 4)), Number(b.to.slice(5, 7)), 1, 5);
    const pairs = [];
    const fmtD = (ms) => { const d = new Date(ms - 5 * H); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
    for (; t < stop; t += 7 * DAYMS) {
      const before = week(t), after = week(t + OFF);
      if (!before || !after) continue;
      const avg = (v) => v.reduce((a, x) => a + x, 0) / 168, q = after.indexOf(Math.min(...after));
      pairs.push({ before, after, q, change: avg(after) - avg(before), quiet: Math.min(...after) - Math.min(...before), bDate: fmtD(t), aDate: fmtD(t + OFF), bYear: new Date(t - 5 * H).getUTCFullYear(), aYear: new Date(t + OFF - 5 * H).getUTCFullYear(), mon: new Date(t - 5 * H).getUTCMonth() });
    }
    if (pairs.length >= 40) {
      const order = pairs.map((p, i) => i).sort((x, c) => pairs[x].change - pairs[c].change);
      wk = { pairs, mid: order[Math.floor(order.length / 2)], up: pairs.filter((p) => p.change > 0).length, upQ: pairs.filter((p) => p.quiet > 0).length };
    }
  } catch { wk = null; }
  if (wk) {
    const P = wk.pairs, n = P.length;
    const yrsApart = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'][P[wk.mid].aYear - P[wk.mid].bYear] || String(P[wk.mid].aYear - P[wk.mid].bYear);
    const M = P[wk.mid], qh = M.q % 24, qDay = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][Math.floor(M.q / 24)];
    const qWhen = `${qh === 0 ? 'midnight' : qh < 12 ? `${qh} a.m.` : qh === 12 ? 'noon' : `${qh - 12} p.m.`} on ${qDay}`;
    const range = (d) => d.replace(/, \d{4}$/, '');
    steps.push({ id: 'week', h: 'Even the quietest hours now need more power.',
      draw: (host) => {
        host.innerHTML = `<p class="wkhead"><span><i style="background:${C.hot}"></i>Week of ${esc(range(M.aDate))}, ${M.aYear}</span><span><i style="background:${C.grey}"></i>Same week, ${M.bYear}</span></p><div class="wkchart"></div>`;
        return live(host.querySelector('.wkchart'), (w) => weekChart(w, { ...M, aName: '', aShort: String(M.aYear), bShort: String(M.bYear) }));
      },
      g: `<div hidden data-csv="${esc(JSON.stringify(P.map((p) => [`Week of ${p.bDate} vs week of ${p.aDate}`, 'Change in average demand', p.change, 'MW'])))}"></div>`,
      say: `At ${qWhen}, the quietest hour of this week, PJM needed ${gw(M.after[M.q] - M.before[M.q])} more than ${yrsApart} years earlier.`,
      note: `This is the middle week of the year, not the best one: in ${wk.upQ} of ${n} weeks, the quietest hour was higher than ${yrsApart} years before.`,
      cap: `Each Monday-to-Sunday week from ${ymLabel(b.from)} to ${ymLabel(b.to)} is paired with the same weekdays ${yrsApart} years later, hour by hour. The chart shows the pair with the median change in average demand. ${n} weeks had complete data in both years; in ${wk.up} of them the whole week ran higher on average.`,
      proof: (host) => [loadShapeFigure(host, { demand, scope: 'PJM', series: 'respondent PJM' })] });
  } else if (f && fLow && fLow.significant && fLow.post > 0) {
    steps.push({ id: 'week', h: 'The new demand never switches off.',
      g: bars([{ label: 'Quietest hour of the month', value: fLow.post, text: `${plus(fLow.post)} a year`, color: C.hot }, { label: 'Average hour', value: f.post, text: `${plus(f.post)} a year`, color: C.grey }, ...(fHigh ? [{ label: 'Busiest hour of the month', value: fHigh.post, text: `${plus(fHigh.post)} a year`, color: C.grey }] : [])]),
      say: `Even in the middle of the night, PJM now needs ${gw(fLow.post)} more power every year.`,
      cap: 'Heat waves and cold snaps raise the busiest hours, then pass. This growth is there at 3 a.m. too, which is how equipment that runs 24 hours a day uses power. So the grid needs new supply that also runs at night.',
      proof: (host) => [loadShapeFigure(host, { demand, scope: 'PJM', series: 'respondent PJM' })] });
  }

  // 3. one zone
  const zs = Object.entries(demand.comparison.zones || {}).map(([z, v]) => ({ z, name: demand.zones[z]?.name || z, short: (demand.zones[z]?.name || z).replace(/ zone$/i, ''), base: v.baseline.avg_mw, last: v.latest.avg_mw, ch: dem(v.baseline.avg_mw, v.latest.avg_mw), d: v.latest.avg_mw - v.baseline.avg_mw })).sort((a, c) => c.d - a.d);
  const tz = zs.reduce((a, r) => a + r.d, 0);
  if (zs.length > 4 && tz > 0) {
    const two = zs.slice(0, 2), rest = tz - two[0].d - two[1].d, share2 = (100 * (two[0].d + two[1].d)) / tz;
    sum.share2 = share2;
    const restBase = zs.slice(2).reduce((a, r) => a + r.base, 0);
    const PLACE = { DOM: 'Dominion (Virginia)', AEP: 'AEP (Ohio and its neighbors)' };
    const nm = (r) => PLACE[r.z] || r.short;
    const known = two[0].z === 'DOM' && two[1].z === 'AEP';
    // how much of each state's data center floor space sits in its main cluster (IM3 building footprints by county)
    const bld = data.dcs.filter((d) => d.type === 'building');
    const shareIn = (st, counties) => { const t = bld.filter((d) => d.state_abb === st).reduce((a, d) => a + (d.sqft || 0), 0); return t ? (100 * bld.filter((d) => d.state_abb === st && counties.includes(d.county)).reduce((a, d) => a + (d.sqft || 0), 0)) / t : null; };
    const col = shareIn('OH', ['Licking County', 'Franklin County', 'Union County', 'Fairfield County', 'Delaware County', 'Madison County', 'Pickaway County']);
    const nova = shareIn('VA', ['Loudoun County', 'Prince William County', 'Fairfax County']);
    steps.push({ id: 'zones', h: known ? `${nf0.format(share2)}% of the growth is in two places: Virginia and Ohio.` : `${nf0.format(share2)}% of the growth is in two utility territories.`,
      g: bars([...two.map((r, i) => ({ label: nm(r), value: r.d, text: `${plus(r.d)}  (up ${nf0.format(r.ch)}%)`, color: i === 0 ? C.hot : C.hotSoft })), { label: `The other ${zs.length - 2} utility territories together`, value: rest, text: `${plus(rest)}  (up ${nf0.format((100 * rest) / restBase)}%)`, color: C.grey }]),
      say: known ? 'The growth is not spread across the grid. It is where the data centers are.' : '',
      cap: known && col != null && nova != null ? `Dominion serves northern Virginia, where ${nf0.format(nova)}% of Virginia’s mapped data center building footprint sits in three counties. AEP serves the Columbus area, where ${nf0.format(col)}% of Ohio’s sits.${(100 * rest) / restBase < 3 ? ' Everywhere else, electricity use barely moved.' : ''}` : 'Growth in average electricity use across the areas PJM reports, the latest 12 months against the 12 before the release.',
      proof: (host) => [zoneFigure(host, zs, b, l)] });
  }

  // 6. where demand grew against where new power was built. Demand growth by PJM utility territory (EIA-930), each territory
  // placed in the state holding most of its load; new power is the average output of plants that opened since the release
  // (size times the latest running rate of PJM's fleet of that fuel; solar from plant reports), by state (EIA-860M).
  const geo = pjmGeo(data);
  let mapsHtml = null;
  {
    const ZST = { DOM: 'VA', AEP: 'OH', ATSI: 'OH', DAY: 'OH', DEOK: 'OH', CE: 'IL', PE: 'PA', PL: 'PA', PN: 'PA', ME: 'PA', DUQ: 'PA', PS: 'NJ', JC: 'NJ', AE: 'NJ', RECO: 'NJ', BC: 'MD', PEP: 'MD', DPL: 'DE', AP: 'WV', EKPC: 'KY' };
    const dem = {};
    zs.forEach((r) => { const st = ZST[r.z]; if (st) dem[st] = (dem[st] || 0) + r.d; });
    const runNow = cg?.windows?.[cg.windows.length - 1]?.groups || {};
    const rate = (g) => (g === 'solar' && solarCheck?.latest12?.cf_eia923 ? solarCheck.latest12.cf_eia923 : runNow[g]?.cf || 0);
    const Wn = ymIndex(meta.window_start.slice(0, 7)), made = {};
    data.units.filter((u) => u.state_cls === 'operating' && u.online && ymIndex(u.online) > Wn).forEach((u) => { made[u.state] = (made[u.state] || 0) + (u.mw || 0) * rate(u.group); });
    const posD = Object.values(dem).filter((v) => v > 0).reduce((x, v) => x + v, 0), totM = Object.values(made).reduce((x, v) => x + v, 0);
    const shD = (100 * Math.max(dem.VA || 0, 0)) / posD, shM = (100 * (made.VA || 0)) / totM;
    if (posD > 0 && totM > 0) {
      try { mapsHtml = await twoMaps(dem, made); } catch { mapsHtml = null; }
      const csvRows = [...new Set([...Object.keys(dem), ...Object.keys(made)])].flatMap((st) => [[st, 'Growth in electricity use', dem[st] || 0, 'MW'], [st, 'Average output of new power plants', made[st] || 0, 'MW']]);
      if (mapsHtml) {
        const share = (x) => (x > 45 && x < 55 ? 'Half' : x > 30 && x < 37 ? 'A third' : `${nf0.format(x)}%`);
        const tenth = (x) => (x > 8 && x < 13 ? 'a tenth' : x > 3 && x < 8 ? 'a twentieth' : `${nf0.format(x)}%`);
        steps.push({ key: 'where', h: 'The new demand is concentrated. The new power is spread out.',
          g: `<div id="twomapsHost">${mapsHtml}</div><div hidden data-csv="${esc(JSON.stringify(csvRows))}"></div>`,
          say: `${share(shD)} of PJM’s new demand is in Virginia. Only ${tenth(shM)} of its new power is.`,
          cap: `Each utility territory is drawn in the state that holds most of its load, so Ohio’s circle includes some of AEP’s growth in neighboring states. New power is what plants opened since December 2022 deliver on an average hour.${geo ? ' Loudoun County, with the most data center floor space in PJM, has had no new power plants since the release.' : ''} Method on the Sources page.`,
          links: [...(geo ? [[`#/maps?county=${encodeURIComponent(`${geo.hub.name},${geo.hub.st}`)}`, `See ${geo.hub.name.replace(/ County$/, '')} County on the map`]] : []), ['#/maps?state=OH', 'See Ohio on the map'], ['#/data?show=county', 'Compare every county']] });
      }
    }
  }

  // capacity of PJM generators that began operating after the release month (nameplate, or net summer with 'msum')
  const WIN = ymIndex(meta.window_start.slice(0, 7));
  const winMw = (group, col = 'mw') => data.units.filter((u) => u.state_cls === 'operating' && u.online && ymIndex(u.online) > WIN && (!group || u.group === group)).reduce((a, u) => a + (u[col] || 0), 0);
  // Hour-by-hour picture (EIA-930 hourly): the 12 months before the release against the latest 12, for the average hour,
  // the 100 busiest hours and the 100 quietest hours of each period. Only hours with demand and every fuel reported count.
  let hrs = null, noon = null, h24 = null;
  try {
    const span = (w) => [Date.UTC(Number(w.from.slice(0, 4)), Number(w.from.slice(5, 7)) - 1, 1, 5), Date.UTC(Number(w.to.slice(0, 4)), Number(w.to.slice(5, 7)), 1, 5)];
    const years = [...new Set([b, l].flatMap((w) => [Number(w.from.slice(0, 4)), Number(w.to.slice(0, 4)), Number(w.to.slice(0, 4)) + (w.to.slice(5, 7) === '12' ? 1 : 0)]))];
    const files = (await Promise.all(years.map((y) => loadHourly('pjm', y).catch(() => null)))).filter(Boolean);
    const keys = meta.groups.map((g) => g.key).filter((k) => files.every((h) => h.gen_mw?.[k]));
    const rowsIn = (w) => { const [from, to] = span(w), out = []; files.forEach((h) => { const t0 = Date.parse(`${h.start_utc}:00:00Z`); for (let i = 0; i < h.n; i++) { const t = t0 + i * 36e5; if (t < from || t >= to) continue; const d = h.demand_mw[i]; if (d == null) continue; const g = keys.map((k) => h.gen_mw[k][i]); if (g.some((v) => v == null)) continue; out.push({ t, d, g }); } }); return out; };
    const mean = (rows) => ({ d: rows.reduce((a, r) => a + r.d, 0) / rows.length, g: Object.fromEntries(keys.map((k, j) => [k, rows.reduce((a, r) => a + r.g[j], 0) / rows.length])) });
    const RB = rowsIn(b), RL = rowsIn(l);
    if (RB.length > 8000 && RL.length > 8000 && keys.includes('solar')) {
      const cut = (rows, n, dir) => rows.slice().sort((x, y) => dir * (y.d - x.d)).slice(0, n);
      const diff = (x, y) => ({ d: y.d - x.d, g: Object.fromEntries(keys.map((k) => [k, y.g[k] - x.g[k]])), gen: keys.reduce((a, k) => a + y.g[k] - x.g[k], 0) });
      hrs = { avg: diff(mean(RB), mean(RL)), top: diff(mean(cut(RB, 100, 1)), mean(cut(RL, 100, 1))), low: diff(mean(cut(RB, 100, -1)), mean(cut(RL, 100, -1))) };
      const j = keys.indexOf('solar'), sm = new Array(24).fill(0), ct = new Array(24).fill(0);
      RL.forEach((r) => { const hr = (new Date(r.t).getUTCHours() + 19) % 24; sm[hr] += r.g[j]; ct[hr]++; });
      noon = Math.max(...sm.map((v, i) => v / Math.max(1, ct[i])));
      // growth in average use and in solar output at each hour of the day (Eastern Standard Time)
      const byHour = (rows) => { const d = new Array(24).fill(0), so = new Array(24).fill(0), c = new Array(24).fill(0); rows.forEach((r) => { const hr = (new Date(r.t).getUTCHours() + 19) % 24; d[hr] += r.d; so[hr] += r.g[j]; c[hr]++; }); return { d: d.map((v, i) => v / c[i]), s: so.map((v, i) => v / c[i]) }; };
      const hb = byHour(RB), hl = byHour(RL);
      h24 = { d: hl.d.map((v, i) => v - hb.d[i]), s: hl.s.map((v, i) => v - hb.s[i]) };
    }
  } catch { /* pictures 5 and 6 fall back to the yearly figures */ }
  const frac = (x) => (x > 0.3 && x < 0.37 ? 'a third' : x > 0.22 && x < 0.28 ? 'a quarter' : x > 0.45 && x < 0.55 ? 'half' : `${nf0.format(100 * x)}%`);

  // 5 and 6. what was built against what it delivers, and what filled the gap
  const st = cg?.steps?.baseline_to_latest;
  if (st && cg.baseline) {
    const gl = Object.fromEntries(meta.groups.map((g) => [g.key, g.label.toLowerCase()]));
    const grown = Object.entries(st).filter(([, v]) => v.implied_cf != null).sort((a, c) => c[1].d_cap_mw - a[1].d_cap_mw)[0];
    const proofLink = (host) => [capacityLinkFigure(host, { meta, cg, demand, scope: 'PJM' }), yieldFigure(host, { meta, cg, scope: 'PJM' })];
    const need = l.avg_mw - b.avg_mw;
    if (grown) {
      const nm = gl[grown[0]], v = grown[1], sun = grown[0] === 'solar';
      const shareBuilt = geo ? (100 * winMw(grown[0])) / winMw(null) : null;
      const pair = (dmw, smw, extra = []) => bars([{ label: 'Growth in electricity use', value: Math.max(dmw, 0), text: plus(dmw), color: C.hot }, { label: `Extra power from ${nm}`, value: Math.max(smw, 0), text: plus(smw), color: sun ? C.solar : C.ink }, ...extra], { max: hrs ? Math.max(hrs.top.d, v.d_cap_mw) : null });
      const onPaper = { label: `New ${nm}, size on paper`, value: v.d_cap_mw, text: gw(v.d_cap_mw), color: sun ? C.solarSoft : C.grey };
      if (sun && hrs) {
        const hourRows = [
          { name: 'Busiest 100 hours', d: hrs.top.d, sv: hrs.top.g.solar },
          { name: 'Average hour', d: hrs.avg.d, sv: hrs.avg.g.solar },
          { name: 'Quietest 100 hours', d: hrs.low.d, sv: hrs.low.g.solar },
        ];
        const solarTxt = (x) => (x < 50 ? 'none' : x < 300 ? `${nf0.format(x)} MW` : plus(x));
        const sc = solarCheck?.first12 && solarCheck?.latest12;
        const thr = h24 ? 0.05 * Math.max(...h24.s) : 0, night = h24 ? h24.d.filter((x, i) => h24.s[i] < thr) : [];
        const nLo = Math.round(Math.min(...night) / 1000), nHi = Math.round(Math.max(...night) / 1000);
        const hourCsv = hourRows.flatMap((r) => [[r.name, 'Growth in electricity use', r.d, 'MW'], [r.name, 'Extra power from solar', r.sv, 'MW']]);
        steps.push({ id: 'solar', h: h24 && night.length ? 'Solar covers the new demand at midday. At night it covers none of it.' : 'Solar helps on the busiest afternoons. It does almost nothing overnight.',
          ...(h24 && night.length ? {
            draw: (host) => live(host, (w) => hourChart(w, h24)),
            g: `<div hidden data-csv="${esc(JSON.stringify([...h24.d.map((x, i) => [`${i}:00`, 'Growth in electricity use', x, 'MW']), ...h24.s.map((x, i) => [`${i}:00`, 'Extra power from solar', x, 'MW']), ...hourCsv]))}"></div>`,
            say: `New solar meets the extra demand around midday. From sunset to sunrise, ${nLo === nHi ? `about ${nLo}` : `${nLo} to ${nHi}`} GW of extra demand has to come from something else.` }
            : { g: pairs(hourRows.map((r) => ({ name: r.name, a: Math.max(r.d, 0), b: Math.max(r.sv, 0), aText: plus(r.d), bText: solarTxt(r.sv) })), { aLabel: 'Growth in electricity use', bLabel: 'Extra power from solar', aColor: C.hot, bColor: C.solar }),
              say: `On the busiest afternoons, new solar covers ${frac(hrs.top.g.solar / hrs.top.d)} of the growth. Overnight, when demand is still up ${gw(hrs.low.d)}, it covers ${hrs.low.g.solar < 300 ? 'almost none' : frac(hrs.low.g.solar / hrs.low.d)}.` }),
          cap: `How much average electricity use and solar output grew at each hour of the day (Eastern Standard Time), the latest 12 months against the 12 before the release. On the 100 busiest hours, new solar covered ${frac(hrs.top.g.solar / hrs.top.d)} of the growth; on the 100 quietest, ${hrs.low.g.solar < 300 ? 'almost none' : frac(hrs.low.g.solar / hrs.low.d)}. PJM added ${gw(v.d_cap_mw)} of solar on paper, ${nf0.format(shareBuilt)}% of all new power plant capacity${noon != null ? `; its solar now peaks near ${gw(noon)} around midday` : ''}.${sc ? ` PJM’s hourly figures undercount solar (they captured about ${nf0.format(100 * solarCheck.first12.share_captured)}% of plant-reported solar output in ${solarCheck.first12.from.slice(0, 4)} and ${nf0.format(100 * solarCheck.latest12.share_captured)}% recently), but the changes shown here hold when that is corrected.` : ''}${h24 ? ' Touch the chart to read any hour.' : ''}`,
          proof: proofLink });
      } else {
        steps.push({ id: 'solar', h: `PJM built ${gw(v.d_cap_mw)} of ${nm}. On an average hour it delivers ${gw(v.d_gen_mw)}.`,
          g: bars([{ label: 'Growth in electricity use', value: need, text: gw(need), color: C.hot }, onPaper, { label: 'What it delivers, averaged over day and night', value: v.d_gen_mw, text: gw(v.d_gen_mw), color: sun ? C.solar : C.ink }]),
          cap: `A plant’s size is the most it can make. Averaged over the year, new ${nm} delivered ${nf0.format((100 * v.d_gen_mw) / v.d_cap_mw)}% of that.`,
          proof: proofLink });
      }
    }
    const r = Object.entries(st).map(([g2, v]) => { const cf0 = cg.baseline.groups[g2]?.cf; return cf0 == null ? null : { g: g2, use: v.d_gen_mw - v.d_cap_mw * cf0, cap: v.d_cap_mw * cf0, cf0, cf1: cg.windows[cg.windows.length - 1].groups[g2]?.cf }; }).filter(Boolean).sort((a, c) => c.use - a.use)[0];
    if (r && r.use > 0) {
      const nm = gl[r.g], coal = st.coal?.d_cap_mw, isGas = r.g === 'gas';
      const opened = winMw(r.g, 'msum'), closed = (data.retired || []).filter((x) => x.pjm && x.group === r.g).reduce((a, x) => a + (x.mw || 0), 0);
      const where = geo && geo.gasTop.length === 2 && isGas ? `, nearly all of the new ones in ${stateName(geo.gasTop[0].s)} and ${stateName(geo.gasTop[1].s)}` : '';
      if (hrs && isGas) {
        const d = hrs.avg, lab = { gas: 'Natural gas', solar: 'Solar', wind: 'Wind', nuclear: 'Nuclear', hydro: 'Hydro', coal: 'Coal', other: 'Other sources' };
        const less = d.d - d.gen; // demand grew more than generation: PJM sold less to its neighbors
        const ups = [...Object.entries(d.g).filter(([, x]) => x >= 50).map(([k, x]) => ({ k, x, label: lab[k] || k })), ...(less >= 50 ? [{ k: 'less', x: less, label: 'Sold less to neighboring grids' }] : [])].sort((a, c) => c.x - a.x);
        const downs = [...Object.entries(d.g).filter(([, x]) => x <= -50).map(([k, x]) => ({ k, x, label: lab[k] || k })), ...(less <= -50 ? [{ k: 'less', x: less, label: 'Sold more to neighboring grids' }] : [])].sort((a, c) => a.x - c.x);
        const gap = d.d - downs.reduce((a, r) => a + r.x, 0);
        const col = (k) => ({ gas: C.gas, solar: C.solar }[k] || C.grey);
        // split gas into existing plants running harder and new plants, then lay out the gap and what filled it
        const oldGas = Math.max(0, Math.min(r.use, d.g.gas || 0)), newGas = Math.max(0, (d.g.gas || 0) - oldGas);
        const fills = [...ups.filter((u) => u.k !== 'gas'), { k: 'gasOld', x: oldGas, label: 'Old gas plants, running harder' }, { k: 'gasNew', x: newGas, label: 'New gas plants' }]
          .filter((u) => u.x >= 50).sort((a, c) => c.x - a.x);
        const fillLab = { less: 'Selling less to neighboring grids', other: 'Other sources' };
        const rowsB = [{ label: 'New demand', v: d.d, kind: 'add' }, ...downs.map((x) => ({ label: `Less power from ${x.label.toLowerCase()}`, v: -x.x, kind: 'add' })), { label: 'Gap to fill', v: gap, kind: 'total' },
          ...fills.map((u) => ({ label: fillLab[u.k] || u.label, v: u.x, kind: 'fill', hl: u.k === 'gasOld' }))];
        const oldTop = fills[0]?.k === 'gasOld';
        sum.oldTop = oldTop;
        steps.push({ key: 'slack', h: oldTop ? 'Old gas plants, running harder, filled more of the gap than anything else.' : `What is picking up the slack? ${ups.slice(0, 2).map((x) => (x.k === 'gas' ? 'Gas' : x.label)).join(' first, then ')}.`,
          draw: (host) => live(host, (w) => hbridge(w, rowsB)),
          g: `<div hidden data-csv="${esc(JSON.stringify(rowsB.map((x) => ['Latest 12 months vs. the 12 before the release', x.label, x.kind === 'fill' ? -x.v : x.v, 'MW'])))}"></div>`,
          say: `PJM had to find ${gw(gap)}: ${gw(d.d)} of new demand${downs.length ? ` plus ${gw(-downs[0].x)} that ${downs[0].label.toLowerCase()} no longer supplies` : ''}. Gas plants built years ago supplied ${gw(oldGas)} of it by running harder: from ${nf0.format(100 * r.cf0)}% to ${nf0.format(100 * r.cf1)}% of their limit.`,
          note: 'Actual generation, not plant size on paper.',
          cap: `Change in average power, the latest 12 months against the 12 before the release. Of the extra gas, ${gw(r.use)} came from existing plants running more (${nf0.format(100 * r.cf0)}% of their limit before, ${nf0.format(100 * r.cf1)}% now) and ${gw(r.cap)} from the fleet growing: PJM opened ${gw(opened)} of gas plants and closed ${gw(closed)}${where}.${d.g.other >= 50 ? ' “Other sources” is what PJM reports to EIA as “other” plus oil. The data does not say what is in it; it has risen steadily since 2024, not in one step.' : ''}`,
          proof: (host) => [generationTrendFigure(host, { meta, ex, scope: 'PJM' }), ...(grown ? [] : proofLink(host))] });
      } else {
      steps.push({ key: 'slack', h: `What is picking up the slack? Old ${isGas ? 'gas' : nm} plants, running harder.`,
        g: bars([{ label: `From ${isGas ? 'gas' : nm} plants that already existed, running more`, value: r.use, text: `${plus(r.use)}`, color: C.gas }, { label: `From new ${isGas ? 'gas' : nm} plants, after subtracting closed ones`, value: r.cap, text: `${plus(r.cap)}`, color: C.grey }]),
        say: opened > 0 && closed > 0 ? `PJM is barely building new ${isGas ? 'gas' : nm} plants. The gap is filled by burning more ${isGas ? 'gas' : nm} in plants built years ago.` : `The gap is being filled by burning more ${isGas ? 'gas' : nm} in plants built years ago.`,
        cap: `Both bars are extra power actually delivered on an average hour, not plant size. Since the release PJM opened ${gw(opened)} of ${isGas ? 'gas' : nm} plants (size on paper) and closed ${gw(closed)}${where}, so the fleet barely grew, and a ${isGas ? 'gas' : nm} plant delivers about ${nf0.format(100 * r.cf0)}% of its size on average. Meanwhile the existing fleet went from running at ${nf0.format(100 * r.cf0)}% of its limit to ${nf0.format(100 * r.cf1)}%.${coal < 0 ? ` Over the same time, ${gw(coal)} of coal plants closed.` : ''}`,
        proof: (host) => [generationTrendFigure(host, { meta, ex, scope: 'PJM' }), ...(grown ? [] : proofLink(host))] });
      }
    }
  }

  // 7. what is planned (EIA-860M Planned tab, units EIA lists under PJM)
  const planned = await loadPlanned();
  if (planned) {
    const P = planned.units.filter((u) => u.pjm), building = new Set(['U', 'V', 'TS']);
    const tot = (g, on) => P.filter((u) => u.group === g && building.has(u.status) === on).reduce((a, u) => a + (u.mw || 0), 0);
    const lab = { gas: 'Natural gas', solar: 'Solar', wind: 'Wind', storage: 'Batteries', nuclear: 'Nuclear', coal: 'Coal', hydro: 'Hydro', other: 'Other' };
    const rows = Object.keys(lab).map((g) => ({ g, name: lab[g], a: tot(g, true), b: tot(g, false) })).filter((r) => r.a + r.b >= 500).sort((x, y) => (y.g === 'gas') - (x.g === 'gas') || y.a + y.b - (x.a + x.b));
    const gas = rows.find((r) => r.g === 'gas'), all = P.reduce((a, u) => a + (u.mw || 0), 0);
    const yrs = P.map((u) => u.online).filter(Boolean).sort(), gasYrs = P.filter((u) => u.group === 'gas' && u.online && (u.mw || 0) >= 100).map((u) => u.online).sort();
    if (rows.length && gas) {
      const gwP = (v) => (v < 50 ? `${nf0.format(v)} MW` : gw(v));
      // one scale for both views, so switching shows how much smaller delivered power is than size on paper
      const scaleMax = Math.max(...rows.flatMap((r) => [r.a, r.b]), f?.post || 0);
      const onPaper = (extra = []) => pairs([...rows.map((r) => ({ name: r.name, a: r.a, b: r.b, aText: gwP(r.a), bText: gwP(r.b) })), ...extra], { aLabel: 'Under construction', bLabel: 'Planned, construction not started', aColor: C.ink, bColor: C.grey, max: scaleMax });
      // when the plants under construction are due, and the largest of them
      const UC = P.filter((u) => building.has(u.status) && u.online);
      const byYear = {};
      UC.forEach((u) => { const y = u.online.slice(0, 4); byYear[y] = (byYear[y] || 0) + (u.mw || 0); });
      const yrsUC = Object.keys(byYear).sort(), soon = yrsUC.slice(0, 2), ucTot = UC.reduce((x, u) => x + (u.mw || 0), 0);
      const soonMw = soon.reduce((x, y) => x + byYear[y], 0);
      const byPlant = {};
      UC.forEach((u) => { const k = u.plant; (byPlant[k] ??= { name: u.name, st: u.state, g: u.group, mw: 0 }).mw += u.mw || 0; });
      const big = Object.values(byPlant).sort((x, y) => y.mw - x.mw)[0];
      const bigName = big ? big.name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+(Commercial\s+)?Project$/i, '').trim() : '';
      const soonTxt = soon.length && ucTot > 0 && soonMw / ucTot > 0.8 ? `, nearly all of it by the end of ${soon[soon.length - 1]}` : '';
      const when = soon.length && ucTot > 0 && soonMw / ucTot > 0.8 ? ` Nearly all of that is due by the end of ${soon[soon.length - 1]}${big && big.mw >= 1000 ? `, led by ${bigName} (${gw(big.mw)})` : ''}; after that, almost nothing is being built yet.` : '';
      const head = gas.a < 0.05 * gas.b ? `What is coming? ${gw(gas.a + gas.b)} of gas is planned. Almost none is being built yet.` : `What is coming? ${gw(gas.a + gas.b)} of gas is planned, ${gw(gas.a)} of it under construction.`;
      const sayPaper = `New gas is on paper, not on the ground: ${gwP(gas.a)} under construction${gasYrs.length ? `, and the large plants are not due before ${ymLabel(gasYrs[0]).split(' ').pop()}` : ''}. What is actually being built is solar and wind.`;
      const capBase = `Power plants that owners have reported to the government as planned in PJM: ${gw(all)} in total, due between ${ymLabel(yrs[0])} and ${ymLabel(yrs[yrs.length - 1])}. Planned projects are often delayed or cancelled.`;
      // expected delivery: planned size times how hard PJM's existing plants of that fuel ran over the latest 12 months
      const cfNow = cg?.windows?.[cg.windows.length - 1]?.groups || {};
      // solar: PJM's hourly data undercounts solar, so its running rate comes from the plant-level cross-check when available
      const cfOf = (g) => (g === 'solar' && solarCheck?.latest12?.cf_eia923 ? solarCheck.latest12.cf_eia923 : cfNow[g]?.cf);
      const exp = rows.filter((r) => cfOf(r.g) > 0).map((r) => ({ ...r, cf: cfOf(r.g), ea: r.a * cfOf(r.g), eb: r.b * cfOf(r.g) }));
      const pace = f && f.post > 0 ? f.post : null;
      // announced closures (EIA-860M Operating tab, planned retirement date) from now to the end of 2030, at the same running rates
      const nowYm = meta.plants?.snapshot_period || l.to, horizon = '2030-12';
      const closing = (planned.retiring || []).filter((u) => u.pjm && u.retire && u.retire > nowYm && u.retire <= horizon);
      const closeMw = closing.reduce((x, u) => x + (u.mw || 0), 0);
      const closeDel = closing.reduce((x, u) => x + (u.mw || 0) * (cfOf(u.group) || 0), 0);
      const closeCoal = closing.filter((u) => u.group === 'coal').reduce((x, u) => x + (u.mw || 0), 0);
      if (exp.length >= 2 && pace) {
        const ea = exp.reduce((x, r) => x + r.ea, 0), eb = exp.reduce((x, r) => x + r.eb, 0);
        const span = (mw) => { const mo = (12 * mw) / pace; return mo < 18 ? `${nf0.format(mo)} months` : `${(mo / 12).toFixed(1)} years`; };
        const left = rows.filter((r) => !exp.some((x) => x.g === r.g)).map((r) => r.name.toLowerCase());
        // running totals by month from the latest month to the end of the horizon, in average power
        const months = []; for (let m = l.to; m <= horizon; m = ymAdd(m, 1)) months.push(m);
        const run = { months,
          demand: months.map((m, i) => (pace * i) / 12),
          build: months.map((m) => UC.filter((u) => u.online <= m).reduce((x, u) => x + (u.mw || 0) * (cfOf(u.group) || 0), 0)),
          close: months.map((m) => closing.filter((u) => u.retire <= m).reduce((x, u) => x + (u.mw || 0) * (cfOf(u.group) || 0), 0)) };
        const n = months.length - 1, cx = crossing(months, run.build, run.close);
        const runCsv = months.filter((m, i) => m.endsWith('-12') || i === 0).flatMap((m) => { const i = months.indexOf(m); return [[m, 'Demand growth from today', run.demand[i], 'MW'], [m, 'Plants being built, running total', run.build[i], 'MW'], [m, 'Plants closing, running total', run.close[i], 'MW']]; });
        const gap = run.demand[n] - run.build[n] + run.close[n];
        sum.cross = cx.txt;
        // plant size on paper (capacity) next to what those plants actually produce on an average hour
        const buildCap = UC.filter((u) => u.online <= horizon).reduce((x, u) => x + (u.mw || 0), 0);
        const closeCap = closing.reduce((x, u) => x + (u.mw || 0), 0);
        const g1 = (mw) => `${(mw / 1000).toFixed(1)} GW`;
        const items = [
          { label: ['Demand growth', 'average use'], v: run.demand[n], kind: 'add' },
          { label: ['New plants', `${g1(buildCap)} capacity`], v: run.build[n], kind: 'cut' },
          { label: ['Plants closing', `${g1(closeCap)} capacity`], v: run.close[n], kind: 'add' },
          { label: [`Gap by ${horizon.slice(0, 4)}`, 'average output'], v: gap, kind: 'total' },
        ];
        steps.push({ id: 'coming', h: `By ${horizon.slice(0, 4)}, demand growth and closures outrun new plants by about ${Math.round(gap / 1000)} GW.`,
          unit: `Actual output on an average hour, not plant size: change from ${ymLabel(l.to)} to the end of ${horizon.slice(0, 4)}, GW`,
          draw: (host) => live(host, (w) => bridge(w, items)),
          g: `<div hidden data-csv="${esc(JSON.stringify([...items.map((it) => [`By end of ${horizon.slice(0, 4)}`, it.label.join(' ').trim(), it.v, 'MW']), ...runCsv]))}"></div>`,
          say: `New plants arrive by the end of 2027, then the pipeline goes quiet.${cx.txt ? ` From ${cx.txt.toLowerCase()}, closures take away more power than new plants add.` : ''}`,
          note: `Bars show what plants actually produce, not their size. Plants under construction total ${g1(buildCap)} of capacity but would produce about ${g1(run.build[n])} on an average hour; closing plants total ${g1(closeCap)} of capacity and produce about ${g1(run.close[n])} today. Each plant counts at how hard its fuel ran over the latest 12 months. Planned plants not yet under construction are left out.`,
          cap: `Running totals from ${ymLabel(l.to)}, in average power: plants under construction by their due dates, plants due to close by their retirement dates, and demand growth at its pace since the release (${gw(pace)} a year). ${capBase} Each plant counts at how hard PJM’s existing plants of its fuel ran over the latest 12 months (${exp.map((r) => `${r.name.toLowerCase()} ${nf0.format(100 * r.cf)}%`).join(', ')}${closeCoal > 0 && cfOf('coal') ? `, coal ${nf0.format(100 * cfOf('coal'))}%` : ''}${solarCheck?.latest12?.cf_eia923 ? '; the solar rate is from plant reports, since PJM’s hourly figures undercount solar' : ''}). ${when.trim() ? `${when.trim().replace(/^Nearly all of that is/, 'Nearly all of what is under construction is')} ` : ''}${closeMw > 0 ? `${gw(closeMw)} of plants are due to close by the end of ${horizon.slice(0, 4)}, ${gw(closeCoal)} of it coal. ` : ''}Closure dates often slip, and PJM can ask plants to stay open for reliability. Plants near retirement may run less than the average${left.length ? `; ${left.join(' and ')} ${left.length > 1 || left[0].endsWith('s') ? 'are' : 'is'} left out because ${left.includes('batteries') ? 'batteries store power and do not make it' : 'there is no running rate to apply'}` : ''}. The chart below shows the same totals month by month.`,
          proof: (host) => { host.innerHTML = `${key([[C.hot, 'Demand growth'], [C.gas, 'Plants closing'], [C.ink, 'Plants being built']])}<div></div>`; host.querySelector('.schart__key').style.display = 'flex'; return [live(host.querySelector('div:last-child'), (w) => runChart(w, run))]; } });
      } else {
        steps.push({ id: 'coming', h: head, g: onPaper(), say: sayPaper, cap: `${capBase} Sizes are on paper.` });
      }
    }
  }

  // 8. will it be enough: PJM's own capacity auctions, load forecast and interconnection queue (hand-entered from PJM's
  // publications, with sources, in pjm_reports.json)
  const pjmr = await loadExtra('pjm_reports');
  if (pjmr?.auctions?.length >= 2) {
    const A = pjmr.auctions, last = A[A.length - 1], fc = pjmr.forecast, q = pjmr.queue?.in_study;
    const mwTxt = (v) => (v >= 1000 ? gw(v) : `${nf0.format(v)} MW`);
    steps.push({ key: 'enough', h: `PJM’s own auction came up ${gw(last.short_mw)} short of its reliability target for ${last.delivery_year.replace('/', '–').replace(/–20/, '–')}.`,
      g: `${pjmr.prices?.rows?.length ? `<h4 class="step__sub">What PJM paid for power plant capacity, $ per megawatt per day</h4>${cols(pjmr.prices.rows.map((r) => ({ label: r.delivery_year.replace('/', '–').replace(/–20/, '–').replace(/^20/, '’'), value: r.price, text: `$${nf0.format(r.price)}`, color: r.at_cap ? C.hot : C.grey, note: r.at_cap ? 'cap' : '' })), { unit: '$/MW-day' })}<h4 class="step__sub">What each auction secured</h4>` : ''}${pairs(A.map((a) => ({ name: `For ${a.delivery_year.replace('/', '–').replace(/–20/, '–')}`, a: a.new_gen_mw, b: a.short_mw, aText: mwTxt(a.new_gen_mw), bText: a.short_mw ? mwTxt(a.short_mw) : 'none' })), { aLabel: 'New power plants secured', bLabel: 'Short of PJM’s reliability target', aColor: C.ink, bColor: C.hot })}`,
      say: `${pjmr.prices?.rows?.length >= 5 ? `The price PJM pays for power plant capacity jumped about ninefold in one auction and has hit the cap ever since. ` : ''}Even so, each auction is securing less new power, and PJM has fallen short of its own reliability target two years running.`,
      cap: `PJM buys power plant capacity about three years ahead in auctions; the price is per megawatt per day, and from 2026–27 a regulator-approved cap applies. Figures are as PJM credits plants for reliability at peak times, which is less than their size on paper. ${fc ? `PJM expects peak demand to grow ${fc.summer_peak_growth_10yr_pct}% a year for the next decade; in 2021 it expected ${fc.summer_peak_growth_10yr_pct_2021_report}%. ` : ''}${A[1]?.forecast_increase_data_centers_mw ? `PJM said ${nf0.format(A[1].forecast_increase_data_centers_mw)} MW of the ${nf0.format(A[1].forecast_increase_mw)} MW rise in its forecast for the ${A[1].delivery_year} auction came from data centers. ` : ''}${q ? `More is in line: ${nf0.format(q.gw)} GW of projects entered PJM’s study process in ${ymLabel(q.date.slice(0, 7))}, led by gas (${nf0.format(q.by_fuel_gw.gas)} GW)${pjmr.queue.since_2020_processed_gw ? `, but since 2020 only about ${frac(pjmr.queue.since_2020_signed_gw / pjmr.queue.since_2020_processed_gw)} of the capacity PJM studied reached a signed agreement to connect` : ''}. ` : ''}Sources: PJM news releases and reports, listed on the Sources page.`,
      links: [['#/whatif', 'Try your own scenario to 2030']] });
  }

  // order of the argument: demand (1-3), then supply: what was built, what filled the gap, where it was built, what is coming
  { const w = steps.findIndex((x) => x.key === 'where'), k = steps.findIndex((x) => x.key === 'slack'); if (w >= 0 && k > w) steps.splice(k, 0, steps.splice(w, 1)[0]); }

  // 9. day-to-day power prices against the price of gas (EIA wholesale data, republished from ICE; EIA Henry Hub)
  const ws = await loadExtra('wholesale_pjm').catch(() => null);
  if (ws?.power?.monthly?.length >= 48 && ws?.gas?.monthly?.length >= 48) {
    const pm = new Map(ws.power.monthly.map(([m, v]) => [m, v])), gm = new Map(ws.gas.monthly.map(([m, v]) => [m, v]));
    const months = [...pm.keys()].filter((m) => gm.has(m)).sort();
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const ml = (m) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
    const pts = [];
    for (let i = 11; i < months.length; i++) {
      const win = months.slice(i - 11, i + 1);
      if (ymIndex(win[11]) - ymIndex(win[0]) !== 11) continue; // twelve consecutive months only
      const pw = win.reduce((a, m) => a + pm.get(m), 0) / 12, gs = win.reduce((a, m) => a + gm.get(m), 0) / 12;
      pts.push({ m: months[i], v: pw / gs, pw, gs, html: `<b>12 months to ${ml(months[i])}</b>Power: $${pw.toFixed(0)}/MWh<br>Gas: $${gs.toFixed(2)}/MMBtu<br>Ratio: ${(pw / gs).toFixed(1)}×` });
    }
    const pre = pts.filter((p) => p.m <= '2021-12');
    if (pts.length >= 24 && pre.length >= 12) {
      const base = pre.reduce((a, p) => a + p.v, 0) / pre.length, lastP = pts[pts.length - 1];
      // the same comparison leaving out winter months, when the regional gas price can run far above Henry Hub
      const noWinter = (a, b) => { const ks = months.filter((m) => m >= a && m <= b && ![12, 1, 2].includes(Number(m.slice(5, 7)))); const pw = ks.reduce((x, m) => x + pm.get(m), 0) / ks.length, gs = ks.reduce((x, m) => x + gm.get(m), 0) / ks.length; return pw / gs; };
      const nwBase = noWinter('2017-01', '2021-12'), nwLast = noWinter(ymAdd(lastP.m, -11), lastP.m);
      const fx = (v) => `${Math.round(v)}×`;
      steps.push({ id: 'energy', h: lastP.v / base >= 1.8 ? `Power prices have pulled away from gas: ${fx(lastP.v)} the gas price, about double the old ${fx(base)}.` : `Power now sells for ${fx(lastP.v)} the gas price, up from ${fx(base)}.`,
        unit: 'PJM wholesale power price divided by the natural gas price, 12-month average',
        draw: (host) => live(host, (w) => monthLine(w, { pts, base, baseLab: `2017–2021: about ${fx(base)}`, fmt: fx, release: RELEASE })),
        g: `<div hidden data-csv="${esc(JSON.stringify(pts.map((p) => [`12 months to ${p.m}`, 'Power price ÷ gas price', p.v, 'ratio'])))}"></div>`,
        say: `For years, a unit of PJM power sold for about ${fx(base)} the price of the gas that fuels most plants. In the latest 12 months it sold for ${fx(lastP.v)}: power is pricier than its fuel alone explains, a sign of tight supply.`,
        note: `On-peak hours at PJM’s main trading hub, against the national (Henry Hub) gas price. Leaving out winter months, when the regional gas price can run far above it, the multiple still went from ${fx(nwBase)} to ${fx(nwLast)}.`,
        src: 'EIA Wholesale Electricity and Natural Gas Market Data (Intercontinental Exchange data, republished with permission), PJM West hub; EIA Henry Hub natural gas spot price.',
        cap: `Average on-peak price at the PJM West hub: $${pre.length ? (pre.reduce((a, p) => a + p.pw, 0) / pre.length).toFixed(0) : ''}/MWh over 2017–2021 (12-month averages), $${lastP.pw.toFixed(0)}/MWh in the 12 months to ${ml(lastP.m)}. Gas (Henry Hub): $${(pre.reduce((a, p) => a + p.gs, 0) / pre.length).toFixed(2)} and $${lastP.gs.toFixed(2)}/MMBtu. A gas plant’s fuel cost rises and falls with the gas price, so for years power prices moved with gas; when power sells well above that multiple, supply is tight, transmission bottlenecks are biting, or both. PJM’s independent market monitor found the same direction for 2025: its real-time average price rose 50.4%, from $33.74 to $50.73/MWh, and 58.5% of that rise came from fuel costs, with much of the rest from transmission constraints (Monitoring Analytics, 2025 State of the Market Report). Most retail customers pay averaged rates and do not see these daily prices.` });
    }
  }

  // The short version: the answer first, in three parts, each jumping to its pictures
  const lastA = pjmr?.auctions?.[pjmr.auctions.length - 1];
  const idxOf = (k) => steps.findIndex((x) => (x.id || x.key) === k) + 2;
  function execSummary() {
    const cards = [
      ['Demand', `Use is up ${Math.abs(up).toFixed(0)}% (${gw(l.avg_mw - b.avg_mw)}) since ChatGPT, it runs around the clock${sum.share2 ? `, and ${nf0.format(sum.share2)}% of the growth is in Virginia and Ohio` : ''}.`, 1, idxOf('zones') || 3],
      ['Response', `${sum.oldTop ? 'Old gas plants running harder did the most to keep up.' : 'Gas did the most to keep up.'} Solar helps only at midday, and new plants are being built far from the new demand.`, idxOf('solar') || 4, idxOf('where') || 6],
      ['Outlook', `${sum.cross ? `From ${sum.cross.toLowerCase()}, plant closures outpace new plants.` : 'Plant closures outpace new plants.'}${lastA?.short_mw ? ` PJM’s own auction for ${lastA.delivery_year.replace('/', '–').replace(/–20/, '–')} is already ${gw(lastA.short_mw)} short of its reliability target.` : ''}`, idxOf('coming') || 7, idxOf('enough') || 8],
    ];
    return `<section class="exec" aria-label="The short version"><h2 class="exec__h">The short version</h2><div class="exec__grid">${cards.map(([t, x, a, z]) => `<button type="button" class="exec__card" data-goto="${a}"><b>${esc(t)}</b><span class="exec__txt">${esc(x)}</span><span class="exec__go">Pictures ${a}–${z}</span></button>`).join('')}</div></section>`;
  }

  root.innerHTML = `<article class="story">
    <header class="hero">
      <h2>${sped ? 'Electricity use was flat for years. Then it started climbing.' : `Electricity use is ${Math.abs(up).toFixed(0)}% ${up >= 0 ? 'higher' : 'lower'} than before ChatGPT.`}</h2>
      <p>PJM runs the power grid for 13 states and Washington, D.C. Since ChatGPT came out in November 2022, electricity use there is <strong>${up >= 0 ? 'up' : 'down'} ${Math.abs(up).toFixed(0)}%</strong>.</p>
      ${execSummary()}
      <p class="hero__gw"><b>1 GW</b> (gigawatt) is a measure of power: about what ${homes(1000)} average American homes use at once, or one large nuclear reactor. The growth since ChatGPT’s release is ${gw(l.avg_mw - b.avg_mw)}, about ${homes(l.avg_mw - b.avg_mw)} homes’ worth.</p>
    </header>
    <section class="step step--hero" data-n="1">
      <span class="step__n" aria-hidden="true">1</span>
      <h3>${sped ? `Electricity use is climbing ${pct((100 * f.post) / b.avg_mw).replace('+', '')} a year, after years of no growth.` : 'Electricity use before and after ChatGPT.'}</h3>
      <p class="step__unit">Average electricity use in PJM, 12-month average, GW</p>
      <div id="heroLine"></div>
      ${f ? `<p class="step__say">${fW ? `Weather doesn’t explain it: with hot summers and cold winters taken out, use is still climbing ${pct((100 * fW.post) / b.avg_mw).replace('+', '')} a year.` : `Before ChatGPT: ${pct((100 * f.pre) / b.avg_mw)} a year. Since: ${pct((100 * f.post) / b.avg_mw)} a year.`}</p>` : ''}
      <p class="step__foot"><span>Note: Dashed lines are the trend before and after ChatGPT’s release; the dotted line is where the earlier trend was heading.${fW ? ` Weather adjustment uses heating and cooling degree days (${pct((100 * fW.post) / b.avg_mw)} a year, give or take ${((100 * 1.96 * fW.sePost) / b.avg_mw).toFixed(1)}%, 95% range).` : ''}</span><span>Source: EIA-930 hourly demand; EIA Short-Term Energy Outlook (degree days).</span></p>
      <details class="proof" data-proof="0"><summary>Method and full data</summary><div></div></details>
    </section>
    ${steps.map((s, i) => `<section class="step" data-n="${i + 2}">
      <span class="step__n" aria-hidden="true">${i + 2}</span>
      <h3>${esc(s.h)}</h3>
      ${(s.unit || META[s.id || s.key]?.unit) ? `<p class="step__unit">${esc(s.unit || META[s.id || s.key].unit)}</p>` : ''}
      ${s.views ? `<div class="seg views" role="group" aria-label="Which hours">${s.views.map((v, j) => `<button type="button" data-view="${j}" aria-pressed="${j === 0}">${esc(v.label)}</button>`).join('')}</div>
      ${s.views.map((v, j) => `<div class="view" data-pane="${j}"${j ? ' hidden' : ''}>${v.g}<p class="step__say">${esc(v.say)}</p></div>`).join('')}` : `${s.draw ? `<div data-draw="${i}"></div>` : ''}${s.g}
      ${s.say ? `<p class="step__say">${esc(s.say)}</p>` : ''}`}
      ${foot(s)}
      ${s.cap || s.proof ? `<details class="proof" data-proof="${i + 1}"><summary>Method and full data</summary>${s.cap ? `<p class="proof__cap">${esc(tidy(s.cap))}</p>` : ''}<div></div></details>` : ''}
      ${s.links ? `<div class="step__links">${s.links.map(([h, t], i) => `<a class="go${i === s.links.length - 1 ? ' go--light' : ''}" href="${h}">${esc(t)}</a>`).join('')}</div>` : ''}
    </section>`).join('')}
    <section class="step step--end">
      <h3>Go further</h3>
      <div class="end__links"><a class="go" href="#/whatif">Try a what-if scenario</a><a class="go go--quiet" href="#/maps">Open the map</a><a class="go go--quiet" href="#/data">Explore all the data</a>${meta.has_us ? '<a class="go go--quiet" href="#/us">Compare with the whole U.S.</a>' : ''}<a class="go go--quiet" href="#/sources">Sources and method</a><button type="button" class="go go--quiet" id="storyCsv">Download the numbers (CSV)</button></div>
      <p class="end__src">Data: U.S. Energy Information Administration (EIA) and the IM3 Data Center Atlas. Latest month: ${esc(ymLabel(l.to))}.</p>
    </section>
  </article>`;

  // hero line
  const roll = rolling12(mo.months, valsD);
  const i0 = roll.findIndex((v) => v != null);
  const ms = mo.months.slice(i0), r2 = roll.slice(i0), ri = ms.indexOf(RELEASE);
  const ghost = f ? rolling12(mo.months, mo.months.map((m) => f.fitAt(m, true))).slice(i0).map((v, i) => (i >= ri ? v : null)) : null;
  // keep only months up to the last complete one, so the line does not trail off
  const end = r2.reduce((a, v, i) => (v != null ? i : a), -1) + 1;
  parts.push(mountLine(root.querySelector('#heroLine'), {
    months: ms.slice(0, end), vals: r2.slice(0, end), ghost: sped ? ghost.slice(0, end) : null, split: ri,
    trend: f ? rolling12(mo.months, mo.months.map((m) => f.fitAt(m))).slice(i0, i0 + end) : null,
    preLabel: f ? `Trend before: ${Math.abs((100 * f.pre) / b.avg_mw) < 0.3 ? 'flat ' : ''}(${pct((100 * f.pre) / b.avg_mw)} a year)`.replace(': (', ': ').replace(/\)$/, (m) => (Math.abs((100 * f.pre) / b.avg_mw) < 0.3 ? m : '')) : '', postLabel: f ? `Trend after: ${pct((100 * f.post) / b.avg_mw)} a year` : '',
    fmt: (v, d = 0) => `${(v / 1000).toFixed(d)} GW`, label: (v) => `${(v / 1000).toFixed(0)} GW`,
    splitLabel: 'ChatGPT released', ghostLabel: 'Earlier trend',
    aria: `Average electricity use in PJM over 12 months: about ${nf0.format(b.avg_mw / 1000)} gigawatts before the release of ChatGPT and ${nf0.format(l.avg_mw / 1000)} gigawatts now`,
  }));

  steps.forEach((s, i) => { if (s.draw) { const host = root.querySelector(`[data-draw="${i}"]`); if (host) parts.push(s.draw(host)); } });

  root.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) { root.querySelector(`.step[data-n="${go.dataset.goto}"]`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); return; }
    if (e.target.closest('#storyCsv')) {
      // every bar on the page, as drawn: picture, headline, view, row, measure, value
      const out = [['picture', 'headline', 'view', 'row', 'measure', 'value', 'unit'].join(',')];
      const q = (v) => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : `"${String(v).replace(/"/g, '""')}"`);
      root.querySelectorAll('.step').forEach((sec) => {
        const n = sec.querySelector('.step__n')?.textContent || '', h = sec.querySelector('h3')?.textContent || '';
        sec.querySelectorAll('[data-csv]').forEach((el) => {
          const pane = el.closest('[data-pane]'), view = pane ? sec.querySelector(`[data-view="${pane.dataset.pane}"]`)?.textContent || '' : '';
          const d = JSON.parse(el.dataset.csv), list = Array.isArray(d[0]) ? d : [d];
          list.forEach(([row, measure, value, unit]) => out.push([q(n), q(h), q(view), q(row), q(measure), q(value), q(unit || '')].join(',')));
        });
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv' })); a.download = 'pjm_story_numbers.csv';
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    const btn = e.target.closest('[data-view]'); if (!btn) return;
    const sec = btn.closest('.step');
    sec.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
    sec.querySelectorAll('[data-pane]').forEach((x) => { x.hidden = x.dataset.pane !== btn.dataset.view; });
  });

  // the evidence, built only when someone opens it
  const proofs = [(host) => [demandTrendFigure(host, { demand, scope: 'PJM', series: 'respondent PJM' })], ...steps.map((s) => s.proof)];
  root.addEventListener('toggle', (e) => {
    const d = e.target.closest?.('details.proof');
    if (!d || !d.open || d.dataset.done) return;
    d.dataset.done = '1';
    (proofs[Number(d.dataset.proof)]?.(d.querySelector('div')) || []).forEach((x) => x && parts.push(x));
  }, true);

  return () => parts.forEach((p) => p.destroy());
}

function zoneFigure(host, zs, b, l) {
  const top = zs[0], totUp = zs.reduce((a, r) => a + r.d, 0);
  return simple(host, {
    title: `Where in PJM: ${top.name} added ${nf0.format(top.d)} MW of average demand, ${nf0.format((100 * top.d) / totUp)}% of the net change across zones`,
    note: 'Change in average hourly demand by PJM zone, latest 12 months against the 12 months before the release, in megawatts. Blue bars grew, grey bars shrank.',
    foot: 'Source: EIA Form EIA-930 subregion demand (route <code>electricity/rto/region-sub-ba-data</code>, parent PJM). Zones are those PJM reports to EIA. Zone totals can differ slightly from the PJM-wide series.',
    tableHtml: table(['Zone', `Avg MW ${ymLabel(b.from)}–${ymLabel(b.to)}`, `Avg MW ${ymLabel(l.from)}–${ymLabel(l.to)}`, 'Change (MW)', 'Change (%)'], zs.map((r) => [`${r.name} (${r.z})`, nf0.format(r.base), nf0.format(r.last), `${r.d >= 0 ? '+' : '−'}${nf0.format(Math.abs(r.d))}`, pct(r.ch)])),
    height: Math.max(260, zs.length * 26 + 70),
    draw: (cv) => new Chart(cv, { type: 'bar', data: { labels: zs.map((r) => r.z), datasets: [{ data: zs.map((r) => r.d), backgroundColor: zs.map((r) => (r.d >= 0 ? TIME.warm : TIME.cool)), borderRadius: 4, barThickness: 14 }] },
      options: { indexAxis: 'y', maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => { const r = zs[it[0].dataIndex]; return `${r.name} (${r.z})`; }, label: (c) => { const r = zs[c.dataIndex]; return [`Change: ${r.d >= 0 ? '+' : '−'}${nf0.format(Math.abs(r.d))} MW (${pct(r.ch)})`, `${nf0.format(r.base)} MW to ${nf0.format(r.last)} MW`]; } } } },
        scales: { x: { grid: { color: GRID }, title: { display: true, text: 'Change in average hourly demand (MW)' }, ticks: { callback: (v) => nf0.format(v) } }, y: { grid: { display: false } } } } }),
  });
}
