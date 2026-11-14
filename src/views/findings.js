// Findings: the condensed argument. PJM first, with the Lower 48 as context.
import { esc, nf0, nf1, pct, ymLabel } from '../lib/format.js';
import { TIME } from '../lib/fuels.js';
import { Chart, GRID, table, simple, yieldFigure, dem } from '../lib/figs.js';
import { demandTrendFigure, loadShapeFigure, generationTrendFigure, capacityLinkFigure, complete } from '../lib/trendfigs.js';
import { trendFit, breakScan, rolling12, RELEASE } from '../lib/stats.js';
import { loadUS, loadExplorer } from '../lib/data.js';

let lastScope = 'pjm';

export async function mount(root, data) {
  const { meta } = data;
  let parts = [];
  let token = 0;
  root.innerHTML = `<div class="doc">
    <div class="doc__intro">
      <h2>What changed on the grid after ChatGPT's release</h2>
      <p>What EIA data show for PJM, the grid operator for 13 states and D.C., with the Lower 48 as context.</p>
      <div class="seg scope" role="group" aria-label="Place">${[['pjm', 'PJM'], ...(meta.has_us ? [['us', 'U.S. Lower 48 (context)']] : [])].map(([k, l]) => `<button type="button" data-scope="${k}">${l}</button>`).join('')}</div>
    </div>
    <ol class="concl" id="ledger" aria-label="Findings"></ol>
    <p class="concl__note">Each compares the 12 months before the release of ChatGPT (Nov 2021 to Oct 2022) with the latest 12 months. These describe what changed and when; they do not show who caused it. The charts below give the evidence for each, in order.</p>
    <div id="figs"></div>
    <p class="more" id="more"></p></div>`;
  const figs = root.querySelector('#figs');

  async function show(scope) {
    const my = ++token;
    lastScope = scope;
    root.querySelectorAll('[data-scope]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scope === scope)));
    parts.forEach((p) => p.destroy()); parts = [];
    figs.innerHTML = '<p class="loading">Loading…</p>';
    const us = scope === 'us' ? await loadUS() : null;
    const ex = await loadExplorer(scope);
    if (my !== token) return;
    figs.innerHTML = '';
    const demand = us ? us.demand : data.demand, cg = us ? us.capgen : data.capgen;
    const name = us ? 'U.S.' : 'PJM';
    const b = demand.comparison.baseline, l = demand.comparison.latest;
    const mo = demand.monthly, f = trendFit(mo.months, complete(mo.avg_mw, mo.coverage)), fLow = trendFit(mo.months, complete(mo.min_mw, mo.coverage));
    const st = cg?.steps?.baseline_to_latest;
    const grown = st ? Object.entries(st).filter(([, v]) => v.implied_cf != null).sort((a, c) => c[1].d_cap_mw - a[1].d_cap_mw)[0] : null;
    const gl = Object.fromEntries(meta.groups.map((g) => [g.key, g.label]));
    const sum = (k) => (st ? Object.values(st).reduce((a, v) => a + v[k], 0) : null);
    // ---- the conclusions, in plain words, each computed from the same data as the chart it points to
    const up = (v, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}%`;
    const gwS = (mw) => `${nf1.format(Math.abs(mw) / 1000)} GW`;
    const items = [];
    if (f) {
      const scan = breakScan(mo.months, complete(mo.avg_mw, mo.coverage));
      const when = scan && scan.best.m !== RELEASE ? ` The change fits best at ${ymLabel(scan.best.m)}, not at the release itself.` : '';
      items.push(f.significant && f.dSlope > 0
        ? [`Demand growth sped up, from ${up((100 * f.pre) / b.avg_mw)} to ${up((100 * f.post) / b.avg_mw)} a year.`, `Average demand is ${pct(dem(b.avg_mw, l.avg_mw))} above the 12 months before the release, and the change in trend is statistically distinguishable.${when}`]
        : [`Demand is ${pct(dem(b.avg_mw, l.avg_mw))} above the 12 months before the release, but the trend has not changed by a distinguishable amount.`, `It was changing ${up((100 * f.pre) / b.avg_mw)} a year before and ${up((100 * f.post) / b.avg_mw)} a year after.`]);
    }
    if (f && fLow && fLow.significant && fLow.post > 0) items.push([`The growth is round-the-clock: the quietest hour is rising ${nf0.format((100 * fLow.post) / f.post)}% as fast as the average.`, `Demand in the lowest hour of each month is rising ${nf0.format(fLow.post)} MW a year. Weather-driven demand would not lift the quietest hour; load that runs every hour does.`]);
    if (!us) {
      const zl = Object.entries(demand.comparison.zones || {}).map(([z, v]) => ({ name: demand.zones[z]?.name || z, d: v.latest.avg_mw - v.baseline.avg_mw })).sort((a, c) => c.d - a.d);
      const tz = zl.reduce((a, r) => a + r.d, 0);
      if (zl.length && tz > 0) items.push([`${nf0.format((100 * zl[0].d) / tz)}% of the growth is in one zone: ${zl[0].name.replace(/ zone$/i, '')}.`, `That zone added ${nf0.format(zl[0].d)} MW of average demand${zl[1] ? `; the next largest, ${zl[1].name.replace(/ zone$/i, '')}, added ${nf0.format(zl[1].d)} MW` : ''}.`]);
    }
    if (st && cg.baseline) {
      const H = 8760 / 1e6;
      const dc = sum('d_cap_mw'), dg = sum('d_gen_mw');
      if (grown) items.push([`${gwS(grown[1].d_cap_mw)} of ${gl[grown[0]].toLowerCase()} was added, and it delivers ${gwS(grown[1].d_gen_mw)} on average.`, `Each megawatt of ${gl[grown[0]].toLowerCase()} added went with ${nf0.format((1000 * grown[1].d_gen_mw) / grown[1].d_cap_mw)} kW of average output. Across six fuels, capacity in service changed by ${dc >= 0 ? '+' : '−'}${gwS(dc)} after retirements and average output by ${dg >= 0 ? '+' : '−'}${gwS(dg)}.`]);
      const r = Object.entries(st).map(([g, v]) => { const cf0 = cg.baseline.groups[g]?.cf; return cf0 == null ? null : { g, use: (v.d_gen_mw - v.d_cap_mw * cf0) * 8760 * 1e-6, cap: v.d_cap_mw * cf0 * 8760 * 1e-6, cf0, cf1: cg.windows[cg.windows.length - 1].groups[g]?.cf }; }).filter(Boolean).sort((a, c) => c.use - a.use)[0];
      const totTwh = Object.values(st).reduce((a, v) => a + v.d_twh, 0);
      if (r && r.use > 0) items.push([r.use > 0.5 * totTwh ? `Most of the extra energy came from existing ${gl[r.g].toLowerCase()} plants running more, not from new plants.` : `Existing ${gl[r.g].toLowerCase()} plants running more added ${nf0.format(r.use)} TWh a year.`,
        `${gl[r.g]} output rose ${nf1.format(r.use)} TWh a year from the fleet running more (capacity factor ${(100 * r.cf0).toFixed(1)}% to ${(100 * r.cf1).toFixed(1)}%) and ${r.cap >= 0 ? '' : '−'}${nf1.format(Math.abs(r.cap))} TWh from its change in capacity.`]);
      void H;
    }
    if (ex?.monthly?.gen && !us) {
      const mm = ex.monthly, keys = Object.keys(mm.gen.avg_mw);
      const tot = mm.months.map((_, i) => { if ((mm.gen.coverage[i] ?? 0) < 0.95) return null; let t = 0, any = false; keys.forEach((k) => { const v = mm.gen.avg_mw[k][i]; if (v != null) { t += v; any = true; } }); return any ? t : null; });
      const rG = rolling12(mm.months, tot), rD = rolling12(mm.months, complete(mm.demand.avg_mw, mm.demand.coverage));
      const i0 = mm.months.indexOf('2022-10'); let i1 = -1; rG.forEach((v, i) => { if (v != null && rD[i] != null) i1 = i; });
      if (i0 >= 0 && i1 > i0 && rG[i0] != null && rD[i0] != null) {
        const n0 = rG[i0] - rD[i0], n1 = rG[i1] - rD[i1];
        if (n0 > 0 && n1 >= 0 && n1 < n0) items.push([`PJM sends less power to its neighbours: its surplus fell from ${nf0.format(n0)} MW to ${nf0.format(n1)} MW.`, 'Generation minus demand, on average. Part of the growth in demand was met by keeping power that used to leave.']);
      }
    }
    root.querySelector('#ledger').innerHTML = items.map(([h, d], i) => `<li><span class="concl__n">${i + 1}</span><div><strong>${esc(h)}</strong><p>${esc(d)}</p></div></li>`).join('');
    const push = (x) => x && parts.push(x);

    push(demandTrendFigure(figs, { demand, scope: name, series: us ? 'respondent US48, the Lower 48 total' : 'respondent PJM' }));
    push(loadShapeFigure(figs, { demand, scope: name, series: us ? 'respondent US48, the Lower 48 total' : 'respondent PJM' }));

    if (!us) {
      const cmp = demand.comparison;
      const zs = Object.entries(cmp.zones || {}).map(([z, v]) => ({ z, name: demand.zones[z]?.name || z, base: v.baseline.avg_mw, last: v.latest.avg_mw, ch: dem(v.baseline.avg_mw, v.latest.avg_mw), d: v.latest.avg_mw - v.baseline.avg_mw })).sort((a, c) => c.d - a.d);
      if (zs.length) {
        const top = zs[0], totUp = zs.reduce((a, r) => a + r.d, 0);
        push(simple(figs, {
          title: `Where in PJM: ${top.name} added ${nf0.format(top.d)} MW of average demand, ${nf0.format((100 * top.d) / totUp)}% of the net change across zones`,
          note: 'Change in average hourly demand by PJM zone, latest 12 months against the 12 months before the release, in megawatts. Warm bars grew, cool bars shrank.',
          foot: 'Source: EIA Form EIA-930 subregion demand (route <code>electricity/rto/region-sub-ba-data</code>, parent PJM). Zones are those PJM reports to EIA. Zone totals can differ slightly from the PJM-wide series.',
          tableHtml: table(['Zone', `Avg MW ${ymLabel(b.from)}–${ymLabel(b.to)}`, `Avg MW ${ymLabel(l.from)}–${ymLabel(l.to)}`, 'Change (MW)', 'Change (%)'], zs.map((r) => [`${r.name} (${r.z})`, nf0.format(r.base), nf0.format(r.last), `${r.d >= 0 ? '+' : '−'}${nf0.format(Math.abs(r.d))}`, pct(r.ch)])),
          height: Math.max(260, zs.length * 26 + 70),
          draw: (cv) => new Chart(cv, { type: 'bar', data: { labels: zs.map((r) => r.z), datasets: [{ data: zs.map((r) => r.d), backgroundColor: zs.map((r) => (r.d >= 0 ? TIME.warm : TIME.cool)), borderRadius: 4, barThickness: 14 }] },
            options: { indexAxis: 'y', maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => { const r = zs[it[0].dataIndex]; return `${r.name} (${r.z})`; }, label: (c) => { const r = zs[c.dataIndex]; return [`Change: ${r.d >= 0 ? '+' : '−'}${nf0.format(Math.abs(r.d))} MW (${pct(r.ch)})`, `${nf0.format(r.base)} MW to ${nf0.format(r.last)} MW`]; } } } },
              scales: { x: { grid: { color: GRID }, title: { display: true, text: 'Change in average hourly demand (MW)' }, ticks: { callback: (v) => nf0.format(v) } }, y: { grid: { display: false } } } } }),
        }));
      }
    }

    push(generationTrendFigure(figs, { meta, ex, scope: name }));
    if (cg) {
      push(capacityLinkFigure(figs, { meta, cg, demand, scope: name }));
      push(yieldFigure(figs, { meta, cg, scope: name }));
    }
    root.querySelector('#more').innerHTML = us
      ? 'More detail: <a href="#/us">the full U.S. page</a> (retail sales by sector, fuel shares, every generator added and retired) and <a href="#/data">all the data</a>.'
      : 'More detail: <a href="#/case">the full PJM case study</a> (fuel shares, every generator added and retired) and <a href="#/data">all the data</a>.';
  }
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-scope]'); if (b && b.dataset.scope !== lastScope) show(b.dataset.scope); });
  await show(lastScope === 'us' && !meta.has_us ? 'pjm' : lastScope);
  return () => { token++; parts.forEach((p) => p.destroy()); };
}
