// Findings: the condensed argument. PJM first, with the Lower 48 as context.
import { esc, nf0, nf1, pct, ymLabel } from '../lib/format.js';
import { TIME } from '../lib/fuels.js';
import { Chart, GRID, table, simple, yieldFigure, dem } from '../lib/figs.js';
import { demandTrendFigure, generationTrendFigure, capacityLinkFigure, complete } from '../lib/trendfigs.js';
import { trendFit } from '../lib/stats.js';
import { loadUS, loadExplorer } from '../lib/data.js';

let lastScope = 'pjm';

export async function mount(root, data) {
  const { meta } = data;
  let parts = [];
  let token = 0;
  root.innerHTML = `<div class="doc">
    <div class="doc__intro">
      <h2>What changed on the grid after ChatGPT's release</h2>
      <p>Four questions, answered with EIA data only: is demand growing faster, is generation keeping up, what was built, and how much of what was built shows up as energy. PJM, the grid operator for 13 states and D.C., is the case; the Lower 48 is the context.</p>
      <div class="seg scope" role="group" aria-label="Place">${[['pjm', 'PJM'], ...(meta.has_us ? [['us', 'U.S. Lower 48 (context)']] : [])].map(([k, l]) => `<button type="button" data-scope="${k}">${l}</button>`).join('')}</div>
    </div>
    <dl class="ledger" id="ledger"></dl>
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
    const mo = demand.monthly, f = trendFit(mo.months, complete(mo.avg_mw, mo.coverage));
    const st = cg?.steps?.baseline_to_latest;
    const grown = st ? Object.entries(st).filter(([, v]) => v.implied_cf != null).sort((a, c) => c[1].d_cap_mw - a[1].d_cap_mw)[0] : null;
    const gl = Object.fromEntries(meta.groups.map((g) => [g.key, g.label]));
    const sum = (k) => (st ? Object.values(st).reduce((a, v) => a + v[k], 0) : null);
    root.querySelector('#ledger').innerHTML = [
      ['Average demand, latest 12 months', `${nf0.format(l.avg_mw)} MW`, `${pct(dem(b.avg_mw, l.avg_mw))} vs the 12 months before the release`, TIME.warm],
      ...(f ? [['Demand trend, before to after', `${pct((100 * f.pre) / b.avg_mw)} → ${pct((100 * f.post) / b.avg_mw)}`, `a year; change ${f.significant ? 'is' : 'is not'} statistically distinguishable`, TIME.cool]] : []),
      ...(st ? [['Capacity in service, change', `${sum('d_cap_mw') >= 0 ? '+' : '−'}${nf1.format(Math.abs(sum('d_cap_mw')) / 1000)} GW`, 'additions minus retirements, six fuels', '#9fb3bd'],
        ['Average output, change', `${sum('d_gen_mw') >= 0 ? '+' : '−'}${nf1.format(Math.abs(sum('d_gen_mw')) / 1000)} GW`, 'what those fuels delivered, on average', '#15323d']] : []),
      ...(() => { if (!st || !cg.baseline) return []; const H = 8760 / 1e6;
        const r = Object.entries(st).map(([g, v]) => { const cf0 = cg.baseline.groups[g]?.cf; return cf0 == null ? null : { g, use: (v.d_gen_mw - v.d_cap_mw * cf0) * H, cap: v.d_cap_mw * cf0 * H }; }).filter(Boolean).sort((a, c) => c.use - a.use)[0];
        return r && r.use > 0 ? [[`${gl[r.g]}: existing fleet running more`, `+${nf1.format(r.use)} TWh`, `a year, against ${r.cap >= 0 ? '+' : '−'}${nf1.format(Math.abs(r.cap))} TWh from its change in capacity`, '#e87e42']] : []; })(),
      ...(grown ? [[`Each MW of ${gl[grown[0]].toLowerCase()} added`, `${nf0.format((1000 * grown[1].d_gen_mw) / grown[1].d_cap_mw)} kW`, 'of average output', '#d9ae36']] : []),
    ].map(([k, v, s, c]) => `<div style="--ledger:${c}"><dt>${esc(k)}</dt><dd>${esc(v)}<small>${esc(s)}</small></dd></div>`).join('');
    const push = (x) => x && parts.push(x);

    push(demandTrendFigure(figs, { demand, scope: name, series: us ? 'respondent US48, the Lower 48 total' : 'respondent PJM' }));

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
