// Findings: the condensed argument. PJM first, with the Lower 48 as context.
import { esc, nf0, nf1, pct, ymLabel } from '../lib/format.js';
import { TIME } from '../lib/fuels.js';
import { Chart, GRID, table, simple, yieldFigure, dem } from '../lib/figs.js';
import { demandTrendFigure, loadShapeFigure, generationTrendFigure, capacityLinkFigure, complete } from '../lib/trendfigs.js';
import { trendFit, breakScan, rolling12, RELEASE } from '../lib/stats.js';
import { loadUS, loadExplorer } from '../lib/data.js';
import { miniBars, miniLine } from '../lib/mini.js';

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
    // ---- the conclusions: one headline, one small graphic, one line of evidence each
    const up = (v, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}%`;
    const gwS = (mw) => `${nf1.format(Math.abs(mw) / 1000)} GW`;
    const C = { grey: '#9fb3bd', ink: '#15323d', warm: TIME.warm, cool: TIME.cool, gas: '#e87e42', solar: '#d9ae36' };
    const items = [];
    const valsD = complete(mo.avg_mw, mo.coverage);
    if (f) {
      const scan = breakScan(mo.months, valsD);
      const roll = rolling12(mo.months, valsD), cf = rolling12(mo.months, mo.months.map((m) => f.fitAt(m, true)));
      const i0 = roll.findIndex((v) => v != null), ri = mo.months.indexOf(RELEASE) - i0;
      const r2 = roll.slice(i0), c2 = cf.slice(i0).map((v, i) => (i >= ri ? v : null));
      const g = miniLine([{ vals: r2, color: C.cool, colorAfter: C.warm }, { vals: c2, color: '#8d9aa2', dash: '2 4', width: 1.6 }], { split: ri, splitText: 'ChatGPT released', years: [mo.months[i0].slice(0, 4), mo.months[mo.months.length - 1].slice(0, 4)], startText: `${nf0.format(r2[0])} MW`, endText: `${nf0.format(l.avg_mw)} MW`, aria: 'Average demand over 12 months, flat before the release and rising after; dotted line is the earlier trend continued' });
      const when = scan && scan.best.m !== RELEASE ? ` The turn fits best at ${ymLabel(scan.best.m)}; any month from ${ymLabel(scan.nearFrom)} to ${ymLabel(scan.nearTo)} fits nearly as well.` : '';
      items.push(f.significant && f.dSlope > 0
        ? { to: 'demand', h: `Demand growth sped up, from ${up((100 * f.pre) / b.avg_mw)} to ${up((100 * f.post) / b.avg_mw)} a year.`, g, d: `12-month average demand; the dotted line is where the earlier trend pointed.${when}` }
        : { to: 'demand', h: `Demand is ${pct(dem(b.avg_mw, l.avg_mw))} higher, but its trend has not changed by a distinguishable amount.`, g, d: `It was changing ${up((100 * f.pre) / b.avg_mw)} a year before and ${up((100 * f.post) / b.avg_mw)} a year after.` });
    }
    if (f && fLow && fLow.significant && fLow.post > 0) {
      const fHigh = trendFit(mo.months, complete(mo.peak_mw, mo.coverage));
      items.push({ to: 'shape', h: `The growth is round-the-clock: the quietest hour is rising ${nf0.format((100 * fLow.post) / f.post)}% as fast as the average.`,
        g: miniBars([{ label: 'Quietest hour', value: fLow.post, text: `+${nf0.format(fLow.post)} MW/yr`, color: C.ink }, { label: 'Average', value: f.post, text: `+${nf0.format(f.post)} MW/yr`, color: C.warm }, ...(fHigh ? [{ label: 'Busiest hour', value: fHigh.post, text: `+${nf0.format(fHigh.post)} MW/yr`, color: C.grey }] : [])]),
        d: 'Growth per year since the release, by hour of the month. Weather lifts the busiest hours; only load that runs every hour lifts the quietest.' });
    }
    if (!us) {
      const zl = Object.entries(demand.comparison.zones || {}).map(([z, v]) => ({ z, name: (demand.zones[z]?.name || z).replace(/ zone$/i, ''), d: v.latest.avg_mw - v.baseline.avg_mw })).sort((a, c) => c.d - a.d);
      const tz = zl.reduce((a, r) => a + r.d, 0);
      if (zl.length && tz > 0) {
        const top = zl.slice(0, 4), rest = zl.slice(4).reduce((a, r) => a + r.d, 0);
        items.push({ to: 'zones', h: `${nf0.format((100 * zl[0].d) / tz)}% of the growth is in one zone: ${zl[0].name}.`,
          g: miniBars([...top.map((r, i) => ({ label: r.name.length > 17 ? r.z : r.name, value: r.d, text: `+${nf0.format(r.d)} MW`, color: i === 0 ? C.warm : C.grey })), { label: `Other ${zl.length - 4} zones`, value: rest, text: `${rest >= 0 ? '+' : '−'}${nf0.format(Math.abs(rest))} MW`, color: C.grey }], { rowH: 32, barH: 17 }),
          d: 'Change in average demand by PJM zone, latest 12 months against the 12 before the release.' });
      }
    }
    if (st && cg.baseline) {
      if (grown) {
        const nm = gl[grown[0]].toLowerCase();
        items.push({ to: 'link', h: `${gwS(grown[1].d_cap_mw)} of ${nm} was added. It delivers ${gwS(grown[1].d_gen_mw)} on average.`,
          g: miniBars([{ label: 'Capacity added', value: grown[1].d_cap_mw, text: gwS(grown[1].d_cap_mw), color: C.grey }, { label: 'Average output', value: grown[1].d_gen_mw, text: gwS(grown[1].d_gen_mw), color: C.solar }, ...(!us ? [{ label: 'Demand growth', value: l.avg_mw - b.avg_mw, text: gwS(l.avg_mw - b.avg_mw), color: C.warm }] : [])]),
          d: `Each megawatt of ${nm} added went with ${nf0.format((1000 * grown[1].d_gen_mw) / grown[1].d_cap_mw)} kW of average output.` });
      }
      const r = Object.entries(st).map(([g2, v]) => { const cf0 = cg.baseline.groups[g2]?.cf; return cf0 == null ? null : { g: g2, use: (v.d_gen_mw - v.d_cap_mw * cf0) * 8760 * 1e-6, cap: v.d_cap_mw * cf0 * 8760 * 1e-6, cf0, cf1: cg.windows[cg.windows.length - 1].groups[g2]?.cf }; }).filter(Boolean).sort((a, c) => c.use - a.use)[0];
      const totTwh = Object.values(st).reduce((a, v) => a + v.d_twh, 0);
      if (r && r.use > 0) {
        const nm = gl[r.g].toLowerCase();
        items.push({ to: 'link', h: r.use > 0.5 * totTwh ? `Most of the extra energy came from existing ${nm} plants running more, not from new plants.` : `Existing ${nm} plants running more added ${nf0.format(r.use)} TWh a year.`,
          g: miniBars([{ label: 'Running more', value: r.use, text: `+${nf1.format(r.use)} TWh/yr`, color: C.gas }, { label: 'New capacity', value: r.cap, text: `${r.cap >= 0 ? '+' : '−'}${nf1.format(Math.abs(r.cap))} TWh/yr`, color: C.grey }]),
          d: `Where the rise in ${nm} output came from. The fleet's capacity factor went from ${(100 * r.cf0).toFixed(1)}% to ${(100 * r.cf1).toFixed(1)}%.` });
      }
    }
    if (ex?.monthly?.gen && !us) {
      const mm = ex.monthly, keys = Object.keys(mm.gen.avg_mw);
      const tot = mm.months.map((_, i) => { if ((mm.gen.coverage[i] ?? 0) < 0.95) return null; let t = 0, any = false; keys.forEach((k) => { const v = mm.gen.avg_mw[k][i]; if (v != null) { t += v; any = true; } }); return any ? t : null; });
      const rG = rolling12(mm.months, tot), rD = rolling12(mm.months, complete(mm.demand.avg_mw, mm.demand.coverage));
      const net = rG.map((v, i) => (v != null && rD[i] != null ? v - rD[i] : null));
      const i0 = mm.months.indexOf('2022-10'); let i1 = -1; net.forEach((v, i) => { if (v != null) i1 = i; });
      if (i0 >= 0 && i1 > i0 && net[i0] != null) {
        const n0 = net[i0], n1 = net[i1];
        if (n0 > 0 && n1 >= 0 && n1 < n0) items.push({ to: 'gen', h: `PJM sends less power to its neighbours: its surplus fell from ${nf0.format(n0)} MW to ${nf0.format(n1)} MW.`,
          g: miniBars([{ label: 'Before the release', value: n0, text: `${nf0.format(n0)} MW`, color: C.cool }, { label: 'Latest 12 months', value: n1, text: `${nf0.format(n1)} MW`, color: C.warm }], {}),
          d: 'Generation minus demand, on average. Part of the growth in demand was met by keeping power that used to leave.' });
      }
    }
    root.querySelector('#ledger').dataset.n = String(items.length);
    root.querySelector('#ledger').innerHTML = items.map((it, i) => `<li><h3><span class="concl__n">${i + 1}</span>${esc(it.h)}</h3><div class="concl__g">${it.g}</div><p>${esc(it.d)}</p><a class="concl__to" href="#fig-${it.to}" data-to="fig-${it.to}">See the full chart</a></li>`).join('');
    const push = (x) => x && parts.push(x);
    const tag = (id, x) => { if (x) { x.el.id = id; parts.push(x); } };

    tag('fig-demand', demandTrendFigure(figs, { demand, scope: name, series: us ? 'respondent US48, the Lower 48 total' : 'respondent PJM' }));
    tag('fig-shape', loadShapeFigure(figs, { demand, scope: name, series: us ? 'respondent US48, the Lower 48 total' : 'respondent PJM' }));

    if (!us) {
      const cmp = demand.comparison;
      const zs = Object.entries(cmp.zones || {}).map(([z, v]) => ({ z, name: demand.zones[z]?.name || z, base: v.baseline.avg_mw, last: v.latest.avg_mw, ch: dem(v.baseline.avg_mw, v.latest.avg_mw), d: v.latest.avg_mw - v.baseline.avg_mw })).sort((a, c) => c.d - a.d);
      if (zs.length) {
        const top = zs[0], totUp = zs.reduce((a, r) => a + r.d, 0);
        tag('fig-zones', simple(figs, {
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

    tag('fig-gen', generationTrendFigure(figs, { meta, ex, scope: name }));
    if (cg) {
      tag('fig-link', capacityLinkFigure(figs, { meta, cg, demand, scope: name }));
      push(yieldFigure(figs, { meta, cg, scope: name }));
    }
    root.querySelector('#more').innerHTML = us
      ? 'More detail: <a href="#/us">the full U.S. page</a> (retail sales by sector, fuel shares, every generator added and retired) and <a href="#/data">all the data</a>.'
      : 'More detail: <a href="#/case">the full PJM case study</a> (fuel shares, every generator added and retired) and <a href="#/data">all the data</a>.';
  }
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-to]');
    if (a) { e.preventDefault(); const el = root.querySelector(`#${a.dataset.to}`); if (el) { el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); el.classList.add('fig--flash'); setTimeout(() => el.classList.remove('fig--flash'), 1600); } }
  });
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-scope]'); if (b && b.dataset.scope !== lastScope) show(b.dataset.scope); });
  await show(lastScope === 'us' && !meta.has_us ? 'pjm' : lastScope);
  return () => { token++; parts.forEach((p) => p.destroy()); };
}
