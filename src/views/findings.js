// The story: six pictures about PJM, one idea each. The full charts and the method sit behind each picture.
import { esc, nf0, pct, ymLabel, ymIndex } from '../lib/format.js';
import { TIME } from '../lib/fuels.js';
import { Chart, GRID, table, simple, yieldFigure, dem } from '../lib/figs.js';
import { demandTrendFigure, loadShapeFigure, generationTrendFigure, capacityLinkFigure, complete } from '../lib/trendfigs.js';
import { trendFit, rolling12, RELEASE } from '../lib/stats.js';
import { loadExplorer, loadHourly } from '../lib/data.js';
import { bars, pairs, mountLine, C, homes } from '../lib/story.js';
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
    steps.push({ h: 'The new demand never switches off.',
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
    const restBase = zs.slice(2).reduce((a, r) => a + r.base, 0);
    const PLACE = { DOM: 'Dominion (Virginia)', AEP: 'AEP (Ohio and its neighbors)' };
    const nm = (r) => PLACE[r.z] || r.short;
    const known = two[0].z === 'DOM' && two[1].z === 'AEP';
    // how much of each state's data center floor space sits in its main cluster (IM3 building footprints by county)
    const bld = data.dcs.filter((d) => d.type === 'building');
    const shareIn = (st, counties) => { const t = bld.filter((d) => d.state_abb === st).reduce((a, d) => a + (d.sqft || 0), 0); return t ? (100 * bld.filter((d) => d.state_abb === st && counties.includes(d.county)).reduce((a, d) => a + (d.sqft || 0), 0)) / t : null; };
    const col = shareIn('OH', ['Licking County', 'Franklin County', 'Union County', 'Fairfield County', 'Delaware County', 'Madison County', 'Pickaway County']);
    const nova = shareIn('VA', ['Loudoun County', 'Prince William County', 'Fairfax County']);
    steps.push({ h: known ? `${nf0.format(share2)}% of the growth is in two places: Virginia and Ohio.` : `${nf0.format(share2)}% of the growth is in two utility territories.`,
      g: bars([...two.map((r, i) => ({ label: nm(r), value: r.d, text: `${plus(r.d)}  (up ${nf0.format(r.ch)}%)`, color: i === 0 ? C.hot : C.hotSoft })), { label: `The other ${zs.length - 2} utility territories together`, value: rest, text: `${plus(rest)}  (up ${nf0.format((100 * rest) / restBase)}%)`, color: C.grey }]),
      say: known ? 'The growth is not spread across the grid. It is where the data centers are.' : '',
      cap: known && col != null && nova != null ? `Dominion serves northern Virginia, where ${nf0.format(nova)}% of Virginia’s data center floor space sits in three counties. AEP serves the Columbus area, where ${nf0.format(col)}% of Ohio’s sits.${(100 * rest) / restBase < 3 ? ' Everywhere else, electricity use barely moved.' : ''}` : 'Growth in average electricity use across the areas PJM reports, the latest 12 months against the 12 before the release.',
      proof: (host) => [zoneFigure(host, zs, b, l)] });
  }

  // 4. where the data centers are against where the power plants went
  const geo = pjmGeo(data);
  if (geo) {
    const p = (v, t) => (100 * v) / t, same = geo.builder.s === geo.lead.s;
    const rows = (same ? geo.top.slice(0, 2) : [geo.lead, geo.builder]).map((r) => ({ name: stateName(r.s), a: p(r.sqft, geo.tSq), b: p(r.add, geo.tAdd), aText: `${nf0.format(p(r.sqft, geo.tSq))}%`, bText: `${nf0.format(p(r.add, geo.tAdd))}%` }));
    steps.push({ h: same ? `${stateName(geo.lead.s)} has the most data centers and the most new power plants.` : `Most data centers are in ${stateName(geo.lead.s)}. Most new power plants are not.`,
      say: same ? '' : `${stateName(geo.builder.s)}${geo.top[1]?.s === geo.builder.s ? ', second in data centers,' : ''} got the most new power plants. ${stateName(geo.lead.s)}, far ahead in data centers, got few.`,
      g: pairs(rows, { aLabel: 'Data center floor space', bLabel: 'New power plants' }),
      cap: `Each state's share of the PJM states' total.${geo.gasTop.length === 2 && geo.tGas > 0 ? ` ${(geo.gasTop[0].gas + geo.gasTop[1].gas) / geo.tGas > 0.95 ? 'Nearly all of the new gas plants' : `${gw(geo.gasTop[0].gas + geo.gasTop[1].gas)} of the ${gw(geo.tGas)} of new gas plants`} went to ${stateName(geo.gasTop[0].s)} and ${stateName(geo.gasTop[1].s)}.` : ''}`,
      link: ['#/maps', 'See it on the map'] });
  }

  // capacity of PJM generators that began operating after the release month (nameplate, or net summer with 'msum')
  const WIN = ymIndex(meta.window_start.slice(0, 7));
  const winMw = (group, col = 'mw') => data.units.filter((u) => u.state_cls === 'operating' && u.online && ymIndex(u.online) > WIN && (!group || u.group === group)).reduce((a, u) => a + (u[col] || 0), 0);
  // PJM solar output by hour of day over the latest 12 months (EIA-930 hourly, Eastern Standard Time)
  let night = null, noon = null;
  try {
    const y1 = Number(l.to.slice(0, 4)), hs = (await Promise.all([y1 - 1, y1].map((y) => loadHourly('pjm', y)))).filter(Boolean);
    const from = Date.UTC(Number(l.from.slice(0, 4)), Number(l.from.slice(5, 7)) - 1, 1, 5), to = Date.UTC(y1, Number(l.to.slice(5, 7)), 1, 5);
    const sm = new Array(24).fill(0), ct = new Array(24).fill(0);
    hs.forEach((h) => { const t0 = Date.parse(`${h.start_utc}:00:00Z`), a = h.gen_mw?.solar || []; a.forEach((v, i) => { const t = t0 + i * 36e5; if (v == null || t < from || t >= to) return; const hr = (new Date(t).getUTCHours() + 19) % 24; sm[hr] += v; ct[hr]++; }); });
    if (ct.every((c) => c > 300)) { const avg = sm.map((v, i) => v / ct[i]); night = Math.max(0, avg[3]); noon = Math.max(...avg); }
  } catch { /* the picture is drawn without the night bar */ }
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
      const items = [{ label: 'Growth in electricity use', value: need, text: gw(need), color: C.hot },
        { label: `New ${nm}, size on paper`, value: v.d_cap_mw, text: gw(v.d_cap_mw), color: sun ? C.solarSoft : C.grey },
        { label: 'What it delivers, averaged over day and night', value: v.d_gen_mw, text: gw(v.d_gen_mw), color: sun ? C.solar : C.ink }];
      if (sun && night != null) items.push({ label: 'What all of PJM’s solar delivers at 3 a.m.', value: night, text: gw(night), color: C.solar });
      steps.push({ h: sun ? `${shareBuilt > 50 ? 'Most of what PJM built was solar' : 'PJM built a lot of solar'}. It covers ${frac(v.d_gen_mw / need)} of the new demand, and none of it at night.` : `PJM built ${gw(v.d_cap_mw)} of ${nm}. On an average hour it delivers ${gw(v.d_gen_mw)}.`,
        g: bars(items),
        say: sun ? 'Solar is being built fast, but it cannot carry demand that never switches off.' : '',
        cap: sun ? `A solar farm’s size is what it makes in full sun. Counting nights, clouds and winter, it averages about a fifth of that${noon != null ? `: PJM’s solar peaks near ${gw(noon)} around midday and makes nothing after dark` : ''}.${shareBuilt != null ? ` Solar was ${nf0.format(shareBuilt)}% of the new power plant capacity PJM added.` : ''}` : `A plant’s size is the most it can make. Averaged over the year, new ${nm} delivered ${nf0.format((100 * v.d_gen_mw) / v.d_cap_mw)}% of that.`,
        proof: proofLink });
    }
    const r = Object.entries(st).map(([g2, v]) => { const cf0 = cg.baseline.groups[g2]?.cf; return cf0 == null ? null : { g: g2, use: v.d_gen_mw - v.d_cap_mw * cf0, cap: v.d_cap_mw * cf0, cf0, cf1: cg.windows[cg.windows.length - 1].groups[g2]?.cf }; }).filter(Boolean).sort((a, c) => c.use - a.use)[0];
    if (r && r.use > 0) {
      const nm = gl[r.g], coal = st.coal?.d_cap_mw, isGas = r.g === 'gas';
      const opened = winMw(r.g, 'msum'), closed = (data.retired || []).filter((x) => x.pjm && x.group === r.g).reduce((a, x) => a + (x.mw || 0), 0);
      const where = geo && geo.gasTop.length === 2 && isGas ? `, nearly all of the new ones in ${stateName(geo.gasTop[0].s)} and ${stateName(geo.gasTop[1].s)}` : '';
      steps.push({ h: opened > 0 && closed > 0 ? `Is PJM building ${isGas ? 'gas' : nm} plants? Barely. The old ones are running harder.` : `So ${nm} plants that already existed are running harder.`,
        g: bars([{ label: `${isGas ? 'Gas' : nm} plants opened`, value: opened, text: `+${gw(opened)}`, color: C.grey }, { label: `${isGas ? 'Gas' : nm} plants closed`, value: closed, text: `−${gw(closed)}`, color: C.grey }, ...(coal < 0 ? [{ label: 'Coal plants closed', value: -coal, text: `−${gw(coal)}`, color: C.grey }] : []), { label: `Extra power from ${isGas ? 'gas' : nm} plants that already existed`, value: r.use, text: `${plus(r.use)} on average`, color: C.gas }]),
        say: `The gap is being filled by burning more ${isGas ? 'gas' : nm} in plants built years ago.`,
        cap: `Since the release PJM opened ${gw(opened)} of ${isGas ? 'gas' : nm} plants and closed ${gw(closed)}${where}. Meanwhile the existing ${isGas ? 'gas' : nm} fleet went from running at ${nf0.format(100 * r.cf0)}% of its limit to ${nf0.format(100 * r.cf1)}%.`,
        proof: (host) => [generationTrendFigure(host, { meta, ex, scope: 'PJM' }), ...(grown ? [] : proofLink(host))] });
    }
  }

  root.innerHTML = `<article class="story">
    <header class="hero">
      <h2>${sped ? 'Electricity use was flat for years. Then it started climbing.' : `Electricity use is ${Math.abs(up).toFixed(0)}% ${up >= 0 ? 'higher' : 'lower'} than before ChatGPT.`}</h2>
      <p>PJM runs the power grid for 13 states and Washington, D.C. Since ChatGPT came out in November 2022, electricity use there is <strong>${up >= 0 ? 'up' : 'down'} ${Math.abs(up).toFixed(0)}%</strong>. Here is what changed, in ${steps.length + 1} pictures.</p>
      <p class="hero__gw"><b>1 GW</b> (gigawatt) is a measure of power: about what ${homes(1000)} average American homes use at once, or one large nuclear reactor. The growth since ChatGPT is ${gw(l.avg_mw - b.avg_mw)}, about ${homes(l.avg_mw - b.avg_mw)} homes’ worth.</p>
    </header>
    <section class="step step--hero">
      <div id="heroLine"></div>
      <p class="step__cap">Average electricity use in PJM, smoothed over 12 months, in gigawatts (GW). The dashed lines are the trend before and after ChatGPT’s release; the dotted line is where the earlier trend was heading. Touch the line to read any month.</p>
      <details class="proof" data-proof="0"><summary>Show the full chart and how it was checked</summary><div></div></details>
    </section>
    ${steps.map((s, i) => `<section class="step">
      <span class="step__n" aria-hidden="true">${i + 2}</span>
      <h3>${esc(s.h)}</h3>
      ${s.g}
      ${s.say ? `<p class="step__say">${esc(s.say)}</p>` : ''}
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
    trend: f ? rolling12(mo.months, mo.months.map((m) => f.fitAt(m))).slice(i0, i0 + end) : null,
    preLabel: f ? `Trend before: ${Math.abs((100 * f.pre) / b.avg_mw) < 0.3 ? 'flat' : `${pct((100 * f.pre) / b.avg_mw)} a year`}` : '', postLabel: f ? `Trend after: ${pct((100 * f.post) / b.avg_mw)} a year` : '',
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
