// The story: six pictures about PJM, one idea each. The full charts and the method sit behind each picture.
import { esc, nf0, nf1, pct, ymLabel } from '../lib/format.js';
import { TIME } from '../lib/fuels.js';
import { Chart, GRID, table, simple, yieldFigure, dem } from '../lib/figs.js';
import { demandTrendFigure, loadShapeFigure, generationTrendFigure, capacityLinkFigure, complete } from '../lib/trendfigs.js';
import { trendFit, rolling12, RELEASE } from '../lib/stats.js';
import { loadExplorer } from '../lib/data.js';
import { bars, pairs, mountLine, C } from '../lib/story.js';
import { pjmGeo, stateName } from '../lib/geo.js';

const gw = (mw, d = 1) => `${(Math.abs(mw) / 1000).toFixed(d)} GW`;
const plus = (mw) => `${mw >= 0 ? '+' : '−'}${gw(mw)}`;

export async function mount(root, data) {
  const { meta, demand, capgen: cg } = data;
  const parts = [];
  const ex = await loadExplorer('pjm');
  const b = demand.comparison.baseline, l = demand.comparison.latest;
  const mo = demand.monthly, valsD = complete(mo.avg_mw, mo.coverage);
  const f = trendFit(mo.months, valsD), fLow = trendFit(mo.months, complete(mo.min_mw, mo.coverage)), fHigh = trendFit(mo.months, complete(mo.peak_mw, mo.coverage));
  const up = dem(b.avg_mw, l.avg_mw);
  const sped = f && f.significant && f.dSlope > 0;
  const steps = []; // { h, g, cap, proof?, link? }

  // 2. round the clock
  if (f && fLow && fLow.significant && fLow.post > 0) {
    steps.push({ h: 'The new demand runs all night.',
      g: bars([{ label: 'Quietest hour of the month', value: fLow.post, text: `${plus(fLow.post)} a year`, color: C.hot }, { label: 'Average hour', value: f.post, text: `${plus(f.post)} a year`, color: C.grey }, ...(fHigh ? [{ label: 'Busiest hour of the month', value: fHigh.post, text: `${plus(fHigh.post)} a year`, color: C.grey }] : [])]),
      cap: 'How fast electricity use is growing since the release. Hot and cold days push up the busiest hours. Only something that never switches off pushes up the quietest ones.',
      proof: (host) => [loadShapeFigure(host, { demand, scope: 'PJM', series: 'respondent PJM' })] });
  }

  // 3. one zone
  const zs = Object.entries(demand.comparison.zones || {}).map(([z, v]) => ({ z, name: demand.zones[z]?.name || z, short: (demand.zones[z]?.name || z).replace(/ zone$/i, ''), base: v.baseline.avg_mw, last: v.latest.avg_mw, ch: dem(v.baseline.avg_mw, v.latest.avg_mw), d: v.latest.avg_mw - v.baseline.avg_mw })).sort((a, c) => c.d - a.d);
  const tz = zs.reduce((a, r) => a + r.d, 0);
  if (zs.length > 4 && tz > 0) {
    const top = zs.slice(0, 4), rest = zs.slice(4).reduce((a, r) => a + r.d, 0), share = (100 * zs[0].d) / tz;
    steps.push({ h: `${share >= 45 && share <= 55 ? 'Half' : `${nf0.format(share)}%`} of the growth is in one utility's territory: ${zs[0].short}.`,
      g: bars([...top.map((r, i) => ({ label: r.short, value: r.d, text: plus(r.d), color: i === 0 ? C.hot : C.grey })), { label: `The other ${zs.length - 4} territories together`, value: rest, text: plus(rest), color: C.grey }]),
      cap: 'Growth in average electricity use across the areas PJM reports, the latest 12 months against the 12 before the release.',
      proof: (host) => [zoneFigure(host, zs, b, l)] });
  }

  // 4. where the data centers are against where the power plants went
  const geo = pjmGeo(data);
  if (geo) {
    const p = (v, t) => (100 * v) / t, same = geo.builder.s === geo.lead.s;
    const rows = (same ? geo.top.slice(0, 2) : [geo.lead, geo.builder]).map((r) => ({ name: stateName(r.s), a: p(r.sqft, geo.tSq), b: p(r.add, geo.tAdd), aText: `${nf0.format(p(r.sqft, geo.tSq))}%`, bText: `${nf0.format(p(r.add, geo.tAdd))}%` }));
    steps.push({ h: same ? `${stateName(geo.lead.s)} has the most data centers and the most new power plants.` : `${stateName(geo.lead.s)} has the data centers. ${stateName(geo.builder.s)} got the power plants.`,
      g: pairs(rows, { aLabel: 'Data center floor space', bLabel: 'New power plants' }),
      cap: `Each state's share of the PJM states' total.${geo.gasTop.length === 2 && geo.tGas > 0 ? ` ${(geo.gasTop[0].gas + geo.gasTop[1].gas) / geo.tGas > 0.95 ? `Nearly all of the ${gw(geo.tGas)} of new gas plants` : `${gw(geo.gasTop[0].gas + geo.gasTop[1].gas)} of the ${gw(geo.tGas)} of new gas plants`} went to ${stateName(geo.gasTop[0].s)} and ${stateName(geo.gasTop[1].s)}.` : ''}`,
      link: ['#/maps', 'See it on the map'] });
  }

  // 5 and 6. what was built against what it delivers, and what filled the gap
  const st = cg?.steps?.baseline_to_latest;
  if (st && cg.baseline) {
    const gl = Object.fromEntries(meta.groups.map((g) => [g.key, g.label.toLowerCase()]));
    const grown = Object.entries(st).filter(([, v]) => v.implied_cf != null).sort((a, c) => c[1].d_cap_mw - a[1].d_cap_mw)[0];
    const proofLink = (host) => [capacityLinkFigure(host, { meta, cg, demand, scope: 'PJM' }), yieldFigure(host, { meta, cg, scope: 'PJM' })];
    if (grown) {
      const nm = gl[grown[0]], v = grown[1], sun = grown[0] === 'solar';
      steps.push({ h: `PJM built ${gw(v.d_cap_mw)} of ${nm}. On an average hour it delivers ${gw(v.d_gen_mw)}.`,
        g: bars([{ label: `New ${nm}, size on paper`, value: v.d_cap_mw, text: gw(v.d_cap_mw), color: sun ? C.solarSoft : C.grey }, { label: 'What it delivers on average', value: v.d_gen_mw, text: gw(v.d_gen_mw), color: sun ? C.solar : C.ink }, { label: 'Growth in electricity use', value: l.avg_mw - b.avg_mw, text: gw(l.avg_mw - b.avg_mw), color: C.hot }]),
        cap: sun ? 'A solar farm’s size is what it makes in full sun. Counting nights, clouds and winter, it averages about a fifth of that.' : `A plant’s size is the most it can make. Averaged over the year, new ${nm} delivered ${nf0.format((100 * v.d_gen_mw) / v.d_cap_mw)}% of that.`,
        proof: proofLink });
    }
    const r = Object.entries(st).map(([g2, v]) => { const cf0 = cg.baseline.groups[g2]?.cf; return cf0 == null ? null : { g: g2, use: v.d_gen_mw - v.d_cap_mw * cf0, cap: v.d_cap_mw * cf0, cf0, cf1: cg.windows[cg.windows.length - 1].groups[g2]?.cf }; }).filter(Boolean).sort((a, c) => c.use - a.use)[0];
    if (r && r.use > 0) {
      const nm = gl[r.g], coal = st.coal?.d_cap_mw;
      steps.push({ h: `So ${nm} plants that already existed are running harder.`,
        g: bars([{ label: `Existing ${nm} plants running more`, value: r.use, text: plus(r.use), color: C.gas }, { label: `${r.cap >= 0 ? 'New' : 'Closed'} ${nm} plants`, value: r.cap, text: plus(r.cap), color: C.grey }]),
        cap: `Extra power from ${nm} on an average hour. ${nm[0].toUpperCase()}${nm.slice(1)} plants made ${nf0.format(100 * r.cf0)}% of the most they could before the release and ${nf0.format(100 * r.cf1)}% now.${coal < 0 ? ` Over the same time, ${gw(coal)} of coal plants closed.` : ''}`,
        proof: (host) => [generationTrendFigure(host, { meta, ex, scope: 'PJM' }), ...(grown ? [] : proofLink(host))] });
    }
  }

  root.innerHTML = `<article class="story">
    <header class="hero">
      <h2>${sped ? 'Electricity use was flat for years. Then it started climbing.' : `Electricity use is ${Math.abs(up).toFixed(0)}% ${up >= 0 ? 'higher' : 'lower'} than before ChatGPT.`}</h2>
      <p>PJM runs the power grid for 13 states and Washington, D.C. Since ChatGPT came out in November 2022, electricity use there is <strong>${up >= 0 ? 'up' : 'down'} ${Math.abs(up).toFixed(0)}%</strong>. Here is what changed, in ${steps.length + 1} pictures.</p>
    </header>
    <section class="step step--hero">
      <div id="heroLine"></div>
      <p class="step__cap">Average electricity use in PJM, smoothed over 12 months, in gigawatts (GW). The dotted line is where the earlier trend was heading. Touch the line to read any month.</p>
      <details class="proof" data-proof="0"><summary>Show the full chart and how it was checked</summary><div></div></details>
    </section>
    ${steps.map((s, i) => `<section class="step">
      <span class="step__n" aria-hidden="true">${i + 2}</span>
      <h3>${esc(s.h)}</h3>
      ${s.g}
      <p class="step__cap">${esc(s.cap)}</p>
      ${s.proof ? `<details class="proof" data-proof="${i + 1}"><summary>Show the full chart and how it was checked</summary><div></div></details>` : ''}
      ${s.link ? `<a class="go" href="${s.link[0]}">${esc(s.link[1])}</a>` : ''}
    </section>`).join('')}
    <section class="step step--end">
      <h3>What this does not prove</h3>
      <p>These pictures show what changed and when. They do not prove who caused it: the government’s data does not say which customers use the power.</p>
      <div class="end__links"><a class="go" href="#/maps">Open the map</a><a class="go go--quiet" href="#/data">Explore all the data</a>${meta.has_us ? '<a class="go go--quiet" href="#/us">Compare with the whole U.S.</a>' : ''}<a class="go go--quiet" href="#/sources">Sources and method</a></div>
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
    fmt: (v, d = 0) => `${(v / 1000).toFixed(d)} GW`, label: (v) => `${(v / 1000).toFixed(0)} GW`,
    splitLabel: 'ChatGPT released', ghostLabel: 'Earlier trend',
    aria: `Average electricity use in PJM over 12 months: about ${nf0.format(b.avg_mw / 1000)} gigawatts before the release of ChatGPT and ${nf0.format(l.avg_mw / 1000)} gigawatts now`,
  }));

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
