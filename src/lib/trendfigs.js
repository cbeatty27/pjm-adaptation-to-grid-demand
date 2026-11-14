// Figures for the Findings tab: fitted trends before and after the release, and the link from capacity to output.
import { Chart, GRID, INK, figure, table, yearTicks, releaseMarker, barEndLabels, sgn } from './figs.js';
import { FUEL_COLOR, TIME } from './fuels.js';
import { esc, nf0, nf1, ymLabel } from './format.js';
import { trendFit, rolling12, RELEASE } from './stats.js';

const sg0 = (v) => `${v >= 0 ? '+' : '−'}${nf0.format(Math.abs(v))}`;
const sgp = (v, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}%`;
const pTxt = (p) => (p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(p < 0.01 ? 3 : 2)}`);
export const complete = (vals, cov, min = 0.95) => vals.map((v, i) => (v != null && (cov?.[i] ?? 1) >= min ? v : null));

// One sentence, in plain words, on what a fit shows. `base` is the level used for percentages.
export function trendSentence(f, base, what) {
  if (!f) return `There are too few complete months of ${what} on one side of the release to fit a trend.`;
  const pre = `${sg0(f.pre)} MW a year (${sgp((100 * f.pre) / base)})`, post = `${sg0(f.post)} MW a year (${sgp((100 * f.post) / base)})`;
  const flat = (sig) => (sig ? '' : ', which is not distinguishable from no trend');
  return `Before the release ${what} was changing by ${pre}${flat(f.preSignificant)}; after it, by ${post}${flat(f.postSignificant)}. `
    + (f.significant ? `The change in slope, ${sg0(f.dSlope)} MW a year, is statistically distinguishable from zero (${pTxt(f.p)}).` : `The change in slope, ${sg0(f.dSlope)} MW a year, is <b>not</b> statistically distinguishable from zero (${pTxt(f.p)}), so these data do not show a change in trend.`);
}

function trendDatasets(months, vals, f, color) {
  const roll = rolling12(months, vals);
  const fitted = f ? rolling12(months, months.map((m) => f.fitAt(m))) : [];
  const cf = f ? rolling12(months, months.map((m) => f.fitAt(m, true))) : [];
  const ri = months.indexOf(RELEASE);
  return { roll, ds: [
    { label: 'Observed, 12-month average', data: roll, borderColor: color, borderWidth: 2.4, pointRadius: 0, pointHoverRadius: 4, tension: 0, segment: { borderColor: (c) => (ri >= 0 && c.p1DataIndex > ri ? TIME.warm : color) } },
    ...(f ? [
      { label: 'Fitted trend', data: fitted, borderColor: INK, borderWidth: 1.6, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 0, tension: 0 },
      { label: 'Earlier trend continued', data: cf.map((v, i) => (i >= ri + 0 && ri >= 0 ? v : null)), borderColor: '#8d9aa2', borderWidth: 1.4, borderDash: [2, 3], pointRadius: 0, pointHoverRadius: 0, tension: 0 },
    ] : []),
  ] };
}
const trendLegend = (color, f) => `<span><i class="line" style="background:${color}"></i>Before the release</span><span><i class="line" style="background:${TIME.warm}"></i>After</span>${f ? `<span><i class="line" style="background:${INK}"></i>Fitted trend (dashed)</span><span><i class="line" style="background:#8d9aa2"></i>Earlier trend continued (dotted)</span>` : ''}`;
const lineOpts = (months, ytitle) => ({
  maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
  scales: { x: { grid: { display: false }, ticks: yearTicks(months) }, y: { title: { display: true, text: ytitle }, grid: { color: GRID }, grace: '5%', ticks: { callback: (v) => nf0.format(v) } } },
  plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => `12 months to ${ymLabel(months[it[0].dataIndex])}`, label: (c) => `${c.dataset.label}: ${nf0.format(c.parsed.y)} MW` } } },
});
const METHOD = 'Method: least squares on the monthly averages with a term for each calendar month (the seasonal shape), a straight-line trend, and a change in slope after November 2022; standard errors are Newey-West with 12 lags. Weather is not controlled for, and the months before the release include 2020.';

// ---- demand ---------------------------------------------------------------------------------------------------
export function demandTrendFigure(host, { demand, scope, series }) {
  const mo = demand.monthly, months = mo.months, vals = complete(mo.avg_mw, mo.coverage);
  const f = trendFit(months, vals);
  const base = demand.comparison.baseline.avg_mw, l = demand.comparison.latest, b = demand.comparison.baseline;
  const { ds } = trendDatasets(months, vals, f, TIME.cool);
  const peakFit = trendFit(months, complete(mo.peak_mw, mo.coverage));
  const title = f
    ? (f.significant && f.dSlope > 0 ? `${scope} demand growth sped up after the release: ${sgp((100 * f.pre) / base)} a year before, ${sgp((100 * f.post) / base)} a year after`
      : f.significant ? `${scope} demand growth slowed after the release: ${sgp((100 * f.pre) / base)} a year before, ${sgp((100 * f.post) / base)} a year after`
        : `${scope} demand: the trend after the release is not distinguishable from the trend before it`)
    : `${scope} demand`;
  const rows = [['Average hourly demand', f], ['Highest hour of each month', peakFit]].filter((r) => r[1]).map(([k, x]) => [k, `${sg0(x.pre)} ± ${nf0.format(1.96 * x.sePre)}`, `${sg0(x.post)} ± ${nf0.format(1.96 * x.sePost)}`, `${sg0(x.dSlope)} ± ${nf0.format(1.96 * x.seD)}`, pTxt(x.p), x.significant ? 'Yes' : 'No', `${x.n}`]);
  return figure(host, {
    title,
    callout: `<b>What the trend lines say.</b> ${trendSentence(f, base, 'average demand')} Average demand was ${nf0.format(b.avg_mw)} MW in the 12 months before the release and ${nf0.format(l.avg_mw)} MW in the latest 12, ${sgp((100 * (l.avg_mw - b.avg_mw)) / b.avg_mw)}.`,
    views: [
      { id: 'trend', label: 'Trend', legend: trendLegend(TIME.cool, f), note: 'Average hourly demand over the 12 months ending in each month, which removes the seasons. The dashed line is the fitted trend; the dotted line is the earlier trend carried forward, so the gap between it and the observed line is how far demand is from where the earlier trend pointed.',
        draw: (cv) => new Chart(cv, { type: 'line', data: { labels: months, datasets: ds }, options: lineOpts(months, 'Average hourly demand (MW)'), plugins: [releaseMarker(months, RELEASE, 'bottom')] }) },
      { id: 'month', label: 'Every month', legend: `<span><i class="line" style="background:${TIME.cool}"></i>Before the release</span><span><i class="line" style="background:${TIME.warm}"></i>After</span>`, note: 'Average hourly demand in each month, unsmoothed. The seasons dominate, which is why the trend is fitted with a term for each calendar month.',
        draw: (cv) => { const ri = months.indexOf(RELEASE); const o = lineOpts(months, 'Average hourly demand (MW)'); o.plugins.tooltip.callbacks.title = (it) => ymLabel(months[it[0].dataIndex]);
          return new Chart(cv, { type: 'line', data: { labels: months, datasets: [{ label: 'Monthly average', data: vals, borderColor: TIME.cool, borderWidth: 1.6, pointRadius: 0, pointHoverRadius: 4, tension: 0, segment: { borderColor: (c) => (ri >= 0 && c.p1DataIndex > ri ? TIME.warm : TIME.cool) } }] }, options: o, plugins: [releaseMarker(months, RELEASE, 'bottom')] }); } },
      { id: 'table', label: 'The numbers', note: 'Slopes in MW a year with 95% intervals. "Distinguishable" means the change in slope differs from zero at the 95% level.', table: table(['Series', 'Before (MW/yr)', 'After (MW/yr)', 'Change (MW/yr)', 'Test', 'Distinguishable', 'Months'], rows) },
    ],
    foot: `Source: EIA Form EIA-930 hourly demand, ${esc(series)}; months with at least 95% of hours. ${METHOD}`,
  });
}

// ---- generation -----------------------------------------------------------------------------------------------
export function generationTrendFigure(host, { meta, ex, scope }) {
  const mm = ex?.monthly;
  if (!mm?.gen) return null;
  const label = Object.fromEntries(meta.groups.map((g) => [g.key, g.label]));
  const months = mm.months, cov = mm.gen.coverage;
  const keys = ex.groups.filter((k) => (mm.gen.avg_mw[k] || []).some((v) => v != null));
  const by = Object.fromEntries(keys.map((k) => [k, complete(mm.gen.avg_mw[k], cov)]));
  const total = months.map((_, i) => { let s = 0, any = false; for (const k of keys) { if (by[k][i] != null) { s += by[k][i]; any = true; } } return any ? s : null; });
  const i0 = total.findIndex((v) => v != null);
  const M = months.slice(i0), T = total.slice(i0);
  const fT = trendFit(M, T);
  const lvl = (arr) => { const v = arr.filter((x, i) => x != null && M[i] > '2021-10' && M[i] <= '2022-10'); return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null; };
  const baseT = lvl(T);
  const fits = keys.filter((k) => k !== 'storage').map((k) => { const v = by[k].slice(i0); return { k, v, f: trendFit(M, v), base: lvl(v) }; });
  const { ds } = trendDatasets(M, T, fT, '#4f7f95');
  const up = fits.filter((x) => x.f?.significant && x.f.dSlope > 0).map((x) => label[x.k]), down = fits.filter((x) => x.f?.significant && x.f.dSlope < 0).map((x) => label[x.k]);
  const rows = [['All fuels', fT, baseT], ...fits.map((x) => [label[x.k], x.f, x.base])].filter((r) => r[1]).map(([k, x, b]) => [k, `${sg0(x.pre)} ± ${nf0.format(1.96 * x.sePre)}`, `${sg0(x.post)} ± ${nf0.format(1.96 * x.sePost)}`, `${sg0(x.dSlope)} ± ${nf0.format(1.96 * x.seD)}`, b ? sgp((100 * x.post) / b) : 'n/a', pTxt(x.p), x.significant ? 'Yes' : 'No']);
  const fuelDs = [];
  fits.forEach((x) => {
    fuelDs.push({ label: label[x.k], data: rolling12(M, x.v), borderColor: FUEL_COLOR[x.k], borderWidth: 2.2, pointRadius: 0, pointHoverRadius: 4, tension: 0 });
    if (x.f) fuelDs.push({ label: `${label[x.k]} trend`, data: rolling12(M, M.map((m) => x.f.fitAt(m))), borderColor: FUEL_COLOR[x.k], borderWidth: 1.2, borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 0, tension: 0 });
  });
  const fo = lineOpts(M, 'Average net generation (MW)');
  fo.plugins.tooltip.filter = (it) => !String(it.dataset.label).endsWith('trend');
  fo.plugins.tooltip.itemSort = (a, c) => c.parsed.y - a.parsed.y;
  return figure(host, {
    title: `${scope} generation: ${fT ? (fT.significant ? `the trend changed after the release, ${sg0(fT.pre)} MW a year before and ${sg0(fT.post)} MW a year after` : 'no distinguishable change in the total trend after the release') : 'trend by fuel'}`,
    callout: `<b>What the trend lines say.</b> ${trendSentence(fT, baseT || 1, 'average net generation')}`
      + (up.length || down.length ? ` By fuel, the slope rose by a distinguishable amount for ${up.length ? esc(up.join(', ')) : 'none'} and fell for ${down.length ? esc(down.join(', ')) : 'none'}; the rest show no distinguishable change.` : ''),
    views: [
      { id: 'total', label: 'All fuels', legend: trendLegend('#4f7f95', fT), note: 'Average net generation from all fuels over the 12 months ending in each month, with the fitted trend (dashed) and the earlier trend carried forward (dotted).',
        draw: (cv) => new Chart(cv, { type: 'line', data: { labels: M, datasets: ds }, options: lineOpts(M, 'Average net generation (MW)'), plugins: [releaseMarker(M, RELEASE, 'bottom')] }) },
      { id: 'fuel', label: 'By fuel', legend: fits.map((x) => `<span><i style="background:${FUEL_COLOR[x.k]}"></i>${esc(label[x.k])}</span>`).join('') + '<span>Dashed: fitted trend</span>', note: 'The same 12-month average for each fuel, each with its own fitted trend.', height: 420,
        draw: (cv) => new Chart(cv, { type: 'line', data: { labels: M, datasets: fuelDs }, options: fo, plugins: [releaseMarker(M, RELEASE, 'bottom')] }) },
      { id: 'table', label: 'The numbers', note: 'Slopes in MW of average output a year with 95% intervals; "After, % a year" is relative to the fuel\'s average in the 12 months before the release.', table: table(['Fuel', 'Before (MW/yr)', 'After (MW/yr)', 'Change (MW/yr)', 'After, % a year', 'Test', 'Distinguishable'], rows) },
    ],
    foot: `Source: EIA Form EIA-930 hourly net generation by fuel (begins July 2018), months with at least 95% of hours. ${scope === 'PJM' ? 'PJM reports no storage codes to EIA-930. ' : 'Storage is left out of the by-fuel fits because it nets to about zero. '}${METHOD} The period before the release is short here (from mid-2018), so the earlier slope is less certain than for demand.`,
  });
}

// ---- capacity -> contribution ---------------------------------------------------------------------------------
export function capacityLinkFigure(host, { meta, cg, demand, scope }) {
  const st = cg?.steps?.baseline_to_latest, base = cg?.baseline, latest = cg?.windows?.[cg.windows.length - 1];
  if (!st || !base || !latest) return null;
  const label = Object.fromEntries(meta.groups.map((g) => [g.key, g.label]));
  const H = 8760;
  const rows = cg.groups.filter((g) => st[g] && base.groups[g] && latest.groups[g]).map((g) => {
    const s = st[g], cf0 = base.groups[g].cf, cf1 = latest.groups[g].cf;
    const fromCap = s.d_cap_mw * cf0, fromUse = s.d_gen_mw - fromCap;       // MW of average output
    return { g, dCap: s.d_cap_mw, dGen: s.d_gen_mw, cf0, cf1, fromCap, fromUse, twhCap: (fromCap * H) / 1e6, twhUse: (fromUse * H) / 1e6, twh: s.d_twh };
  }).sort((a, c) => c.dCap - a.dCap);
  if (!rows.length) return null;
  const tot = (k) => rows.reduce((a, r) => a + r[k], 0);
  const dDem = demand.comparison.latest.avg_mw - demand.comparison.baseline.avg_mw;
  const grew = rows.filter((r) => r.dCap > 0), top = grew[0];
  const gw = (v) => `${v >= 0 ? '+' : '−'}${nf1.format(Math.abs(v) / 1000)} GW`;
  const per = top ? top.dGen / top.dCap : null;
  const useUp = rows.filter((r) => r.fromUse > 0.25 * Math.abs(tot('dGen')) ).sort((a, c) => c.fromUse - a.fromUse)[0];
  const callout = `<b>Capacity is what was built; average output is what it delivered.</b> Between the 12 months before the release and the latest 12, capacity in service changed by ${gw(tot('dCap'))} across these fuels and their average output by ${gw(tot('dGen'))}${scope === 'PJM' ? `, while average demand rose ${gw(dDem)}` : ''}.`
    + (top ? ` <b>${esc(label[top.g])}</b> had the largest increase in capacity, ${gw(top.dCap)}, and its average output rose ${gw(top.dGen)}: each megawatt added went with ${nf0.format(1000 * per)} kilowatts of average output.` : '')
    + (useUp ? ` The largest increase in output that did not come from new capacity was <b>${esc(label[useUp.g])}</b>: ${sgn(useUp.twhUse)} TWh a year from the same kind of fleet running more (capacity factor ${(100 * useUp.cf0).toFixed(1)}% to ${(100 * useUp.cf1).toFixed(1)}%), against ${sgn(useUp.twhCap)} TWh from its change in capacity.` : '');
  const labels = rows.map((r) => label[r.g]);
  const h = Math.max(260, rows.length * 62 + 90);
  const hb = (datasets, xt, fmt, stacked = false) => (cv) => new Chart(cv, {
    type: 'bar', data: { labels, datasets },
    options: { indexAxis: 'y', maintainAspectRatio: false, layout: { padding: { right: 64, left: 4 } },
      scales: { x: { stacked, grid: { color: GRID }, title: { display: true, text: xt }, ticks: { callback: (v) => nf0.format(v) } }, y: { stacked, grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.x)}` } } } },
    plugins: stacked ? [] : [barEndLabels((i, v) => fmt(v))],
  });
  return figure(host, {
    title: `${scope}: what was built and what it delivered, by fuel`,
    callout,
    views: [
      { id: 'link', label: 'Built vs delivered', height: h, legend: `<span><i style="background:#9fb3bd"></i>Change in capacity in service (GW)</span><span><i style="background:${INK}"></i>Change in average output (GW)</span>`,
        note: `For each fuel, the change in capacity in service (additions minus retirements) next to the change in its average output, both in gigawatts, between ${ymLabel(base.from)}–${ymLabel(base.to)} and ${ymLabel(latest.from)}–${ymLabel(latest.to)}. A gigawatt of capacity that ran every hour would add a gigawatt of average output.`,
        draw: hb([{ label: 'Change in capacity', data: rows.map((r) => r.dCap / 1000), backgroundColor: '#9fb3bd', borderRadius: 4, barPercentage: 0.85, categoryPercentage: 0.7 }, { label: 'Change in average output', data: rows.map((r) => r.dGen / 1000), backgroundColor: INK, borderRadius: 4, barPercentage: 0.85, categoryPercentage: 0.7 }], 'Gigawatts', (v) => `${v >= 0 ? '+' : '−'}${nf1.format(Math.abs(v))} GW`) },
      { id: 'split', label: 'New capacity or running more', height: h, legend: `<span><i style="background:#9fb3bd"></i>From the change in capacity, at the earlier capacity factor</span><span><i style="background:${TIME.warm}"></i>From the fleet running more or less</span>`,
        note: 'The change in each fuel\'s yearly energy split in two: the change in capacity multiplied by the capacity factor before the release, and the remainder, which is the whole fleet producing more or less per megawatt. It is arithmetic on fleet totals and does not say which units ran.',
        draw: hb([{ label: 'From change in capacity', data: rows.map((r) => r.twhCap), backgroundColor: '#9fb3bd', borderRadius: 3 }, { label: 'From running more or less', data: rows.map((r) => r.twhUse), backgroundColor: TIME.warm, borderRadius: 3 }], 'TWh a year', (v) => `${sgn(v)} TWh`, true) },
      { id: 'table', label: 'The numbers', note: 'Capacity is the average in service over each 12-month window; output is average generation.', table: table(['Fuel', 'Change in capacity', 'Change in average output', 'Output per MW added', 'Capacity factor before', 'Capacity factor latest', 'Energy from capacity change', 'Energy from running more/less'],
        rows.map((r) => [label[r.g], `${sg0(r.dCap)} MW`, `${sg0(r.dGen)} MW`, r.dCap > 0 && r.dCap >= 0.1 * base.groups[r.g].cap_mw ? `${nf0.format((1000 * r.dGen) / r.dCap)} kW` : 'n/a', `${(100 * r.cf0).toFixed(1)}%`, `${(100 * r.cf1).toFixed(1)}%`, `${sgn(r.twhCap)} TWh`, `${sgn(r.twhUse)} TWh`])) },
    ],
    foot: `Sources: capacity is net summer capacity in service for the whole month from EIA's generator inventory (EIA-860M operating units and its Retired tab back to 2015); output is ${esc(cg.method.generation)}. Storage is not included because it moves energy rather than producing it. ${scope === 'PJM' ? 'PJM solar output per megawatt comes out lower than the national figure; the inventory and the EIA-930 feed are separate reports and may not cover exactly the same plants, so treat the PJM solar level with caution and read the change. ' : ''}"Output per MW added" is shown only where capacity grew by at least 10%.`,
  });
}
