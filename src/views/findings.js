// The story: six pictures about PJM, one idea each. The full charts and the method sit behind each picture.
import { esc, nf0, pct, ymLabel, ymIndex } from '../lib/format.js';
import { TIME } from '../lib/fuels.js';
import { Chart, GRID, table, simple, yieldFigure, dem } from '../lib/figs.js';
import { demandTrendFigure, loadShapeFigure, generationTrendFigure, capacityLinkFigure, complete } from '../lib/trendfigs.js';
import { trendFit, rolling12, RELEASE } from '../lib/stats.js';
import { loadExplorer, loadHourly, loadPlanned, loadExtra } from '../lib/data.js';
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
      cap: known && col != null && nova != null ? `Dominion serves northern Virginia, where ${nf0.format(nova)}% of Virginia’s mapped data center building footprint sits in three counties. AEP serves the Columbus area, where ${nf0.format(col)}% of Ohio’s sits.${(100 * rest) / restBase < 3 ? ' Everywhere else, electricity use barely moved.' : ''}` : 'Growth in average electricity use across the areas PJM reports, the latest 12 months against the 12 before the release.',
      proof: (host) => [zoneFigure(host, zs, b, l)] });
  }

  // 6. where the new demand is against the power made there. Demand growth by PJM utility territory (EIA-930, monthly) and
  // net generation by state from all plants (EIA-923), over the same two 12-month windows; the part from plants that opened
  // since the release is each plant's size times the latest running rate of PJM's fleet of that fuel (solar from plant reports).
  // Territories and states do not line up exactly: Dominion is mostly Virginia; AEP also reaches into neighboring states.
  const geo = pjmGeo(data);
  const s923 = await loadExtra('solar923');
  if (s923?.rows?.length && demand.zones?.DOM?.avg_mw) {
    const months923 = [...new Set(s923.rows.filter((r) => r[2] === 'ALL').map((r) => r[0]))].sort();
    const twelve = (end) => { const out = []; let y = Number(end.slice(0, 4)), m = Number(end.slice(5, 7)); for (let k = 0; k < 12; k++) { out.unshift(`${y}-${String(m).padStart(2, '0')}`); if (--m === 0) { m = 12; y--; } } return out; };
    const W0 = twelve(b.to), W1 = twelve(months923[months923.length - 1]);
    const hrs = (m) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate() * 24;
    const zoneAvg = (zones, W) => { let x = 0, h = 0; for (const m of W) { const i = mo.months.indexOf(m); if (i < 0) return null; let v = 0; for (const z of zones) { const a = demand.zones[z]?.avg_mw?.[i]; if (a == null) return null; v += a; } x += v * hrs(m); h += hrs(m); } return x / h; };
    const genAvg = (st, W) => { let x = 0, h = 0; for (const m of W) { const r = s923.rows.find((q) => q[0] === m && q[1] === st && q[2] === 'ALL'); if (!r || r[3] == null) return null; x += r[3] * 1000; h += hrs(m); } return x / h; };
    const runNow = cg?.windows?.[cg.windows.length - 1]?.groups || {};
    const rate = (g) => (g === 'solar' && solarCheck?.latest12?.cf_eia923 ? solarCheck.latest12.cf_eia923 : runNow[g]?.cf || 0);
    const Wn = ymIndex(meta.window_start.slice(0, 7));
    const fromNew = (st) => data.units.filter((u) => u.state_cls === 'operating' && u.online && ymIndex(u.online) > Wn && u.state === st).reduce((x, u) => x + (u.mw || 0) * rate(u.group), 0);
    const place = (name, zones, st) => { const d0 = zoneAvg(zones, W0), d1 = zoneAvg(zones, W1), g0 = genAvg(st, W0), g1 = genAvg(st, W1); return d0 == null || d1 == null || g0 == null || g1 == null ? null : { name, d: d1 - d0, g: g1 - g0, n: fromNew(st) }; };
    const va = place('Virginia', ['DOM'], 'VA'), oh = place('Ohio', ['AEP', 'ATSI', 'DAY', 'DEOK'], 'OH');
    if (va && va.d > 0) {
      const rowsP = [va, oh].filter(Boolean);
      const gap = va.d - va.g;
      steps.push({ key: 'where', h: gap > va.d / 3 ? `The biggest new demand is far from the new power.` : `Most new power is being made close to the new demand.`,
        g: pairs(rowsP.map((r) => ({ name: r.name, a: Math.max(r.d, 0), b: Math.max(r.g, 0), aText: plus(r.d), bText: plus(r.g) })), { aLabel: 'Growth in electricity use', bLabel: 'Growth in power made there', aColor: C.hot, bColor: C.ink }),
        say: `Demand in Virginia grew ${gw(va.d)}. Power made in Virginia grew ${gw(va.g)}: about ${gw(Math.min(va.n, va.g))} from new plants and the rest from existing plants running harder. The other ${gw(gap)} is carried in from elsewhere on the grid.`,
        cap: `Average power, the 12 months to ${ymLabel(W1[11])} against the 12 months to ${ymLabel(W0[11])}. Electricity use is by utility territory: Dominion for Virginia; AEP, ATSI, Dayton and Duke for Ohio. Power made is all plants in the state, as reported to EIA. Territories and states do not line up exactly, since Dominion reaches into North Carolina and AEP into neighboring states, so the comparison is approximate. The new-plant share is each plant’s size times how hard PJM’s plants of that fuel ran over the latest 12 months.${geo ? ' Loudoun County, with the most data center floor space in PJM, has had no new power plants since the release.' : ''}`,
        links: [...(geo ? [[`#/maps?county=${encodeURIComponent(`${geo.hub.name},${geo.hub.st}`)}`, `See ${geo.hub.name.replace(/ County$/, '')} County on the map`]] : []), ['#/maps?state=OH', 'See Ohio on the map'], ['#/data?show=county', 'Compare every county']] });
    }
  }

  // capacity of PJM generators that began operating after the release month (nameplate, or net summer with 'msum')
  const WIN = ymIndex(meta.window_start.slice(0, 7));
  const winMw = (group, col = 'mw') => data.units.filter((u) => u.state_cls === 'operating' && u.online && ymIndex(u.online) > WIN && (!group || u.group === group)).reduce((a, u) => a + (u[col] || 0), 0);
  // Hour-by-hour picture (EIA-930 hourly): the 12 months before the release against the latest 12, for the average hour,
  // the 100 busiest hours and the 100 quietest hours of each period. Only hours with demand and every fuel reported count.
  let hrs = null, noon = null;
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
        steps.push({ h: 'Solar helps on the busiest afternoons. It does almost nothing overnight.',
          g: pairs(hourRows.map((r) => ({ name: r.name, a: Math.max(r.d, 0), b: Math.max(r.sv, 0), aText: plus(r.d), bText: solarTxt(r.sv) })), { aLabel: 'Growth in electricity use', bLabel: 'Extra power from solar', aColor: C.hot, bColor: C.solar }),
          say: `On the busiest afternoons, new solar covers ${frac(hrs.top.g.solar / hrs.top.d)} of the growth. Overnight, when demand is still up ${gw(hrs.low.d)}, it covers ${hrs.low.g.solar < 300 ? 'almost none' : frac(hrs.low.g.solar / hrs.low.d)}.`,
          cap: `PJM added ${gw(v.d_cap_mw)} of solar on paper, ${nf0.format(shareBuilt)}% of all new power plant capacity${noon != null ? `; its solar now peaks near ${gw(noon)} around midday` : ''}. The busiest and quietest hours are the 100 highest-demand and 100 lowest-demand hours of each 12-month period.${sc ? ` PJM’s hourly figures undercount solar (they captured about ${nf0.format(100 * solarCheck.first12.share_captured)}% of plant-reported solar output in ${solarCheck.first12.from.slice(0, 4)} and ${nf0.format(100 * solarCheck.latest12.share_captured)}% recently), but the changes shown here hold when that is corrected.` : ''}`,
          proof: proofLink });
      } else {
        steps.push({ h: `PJM built ${gw(v.d_cap_mw)} of ${nm}. On an average hour it delivers ${gw(v.d_gen_mw)}.`,
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
        steps.push({ key: 'slack', h: `What is picking up the slack? ${ups.slice(0, 2).map((r) => (r.k === 'gas' ? 'Gas' : r.label)).join(' first, then ').replace(/, then (\w)/, (m, c) => `, then ${c.toLowerCase()}`)}.`,
          g: bars([{ label: 'Gap to fill', value: gap, text: gw(gap), color: C.hot }, ...ups.map((r) => ({ label: r.label, value: r.x, text: plus(r.x), color: col(r.k) }))]),
          say: `PJM had to find ${gw(gap)}: ${gw(d.d)} of new demand${downs.length ? `, plus ${gw(downs[0].x)} that ${downs[0].label.toLowerCase()} no longer supplies` : ''}. Gas covered ${nf0.format((100 * d.g.gas) / gap)}% of it, most of that from plants built years ago.`,
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
        steps.push({ h: closeDel > ea ? `What is coming? Not enough to replace the plants due to close.` : `What is coming? Plants under construction would cover about ${span(ea)} of demand growth.`,
          views: [
            { label: 'What it should deliver', g: pairs([...exp.map((r) => ({ name: r.name, a: r.ea, b: r.eb, aText: gwP(r.ea), bText: gwP(r.eb) })), ...(closeMw > 0 ? [{ name: `Closing by ${horizon.slice(0, 4)}`, a: closeDel, b: 0, aText: `−${gw(closeDel)}`, bText: '', hideB: true, aColor: C.gas, aLab: 'What they deliver now' }] : []), { name: 'Demand', a: pace, b: 0, aText: `${plus(pace)} every year`, bText: '', hideB: true, aColor: C.hot }], { aLabel: 'Under construction', bLabel: 'Planned, construction not started', aColor: C.ink, bColor: C.grey, max: scaleMax }),
              say: `What is being built should add about ${gw(ea)}${soonTxt}.${closeMw > 0 ? ` Plants due to close by ${horizon.slice(0, 4)} supply about ${gw(closeDel)} today.` : ''} And demand grows ${gw(pace)} every year.` },
            { label: 'Size on paper', g: onPaper(closeMw > 0 ? [{ name: `Closing by ${horizon.slice(0, 4)}`, a: closeMw, b: 0, aText: `−${gw(closeMw)}`, bText: '', hideB: true, aColor: C.gas, aLab: 'Size on paper' }] : []), say: `${sayPaper} The rest of the plan would deliver about ${gw(eb)}, most of it gas that has not broken ground.` },
          ],
          cap: `${capBase} “What it should deliver” multiplies each plant’s size by how hard PJM’s existing plants of that fuel ran over the latest 12 months (${exp.map((r) => `${r.name.toLowerCase()} ${nf0.format(100 * r.cf)}%`).join(', ')}${closeCoal > 0 && cfOf('coal') ? `, coal ${nf0.format(100 * cfOf('coal'))}%` : ''}${solarCheck?.latest12?.cf_eia923 ? '; the solar rate is from plant reports, since PJM’s hourly figures undercount solar' : ''}). ${when.trim() ? `${when.trim().replace(/^Nearly all of that is/, 'Nearly all of what is under construction is')} ` : ''}${closeMw > 0 ? `${gw(closeMw)} of plants are due to close by the end of ${horizon.slice(0, 4)}, ${gw(closeCoal)} of it coal. ` : ''}Closures are plants whose owners have reported a retirement date to EIA; such dates often slip, and PJM can ask plants to stay open for reliability. Plants near retirement may run less than the average. New plants may run more or less than that${left.length ? `; ${left.join(' and ')} ${left.length > 1 || left[0].endsWith('s') ? 'are' : 'is'} left out because ${left.includes('batteries') ? 'batteries store power and do not make it' : 'there is no running rate to apply'}` : ''}.` });
      } else {
        steps.push({ h: head, g: onPaper(), say: sayPaper, cap: `${capBase} Sizes are on paper.` });
      }
    }
  }

  // 8. will it be enough: PJM's own capacity auctions, load forecast and interconnection queue (hand-entered from PJM's
  // publications, with sources, in pjm_reports.json)
  const pjmr = await loadExtra('pjm_reports');
  if (pjmr?.auctions?.length >= 2) {
    const A = pjmr.auctions, last = A[A.length - 1], fc = pjmr.forecast, q = pjmr.queue?.in_study;
    const mwTxt = (v) => (v >= 1000 ? gw(v) : `${nf0.format(v)} MW`);
    steps.push({ key: 'enough', h: `Will it be enough? PJM’s own auctions say no: ${gw(last.short_mw)} short for ${last.delivery_year.replace('/', '–').replace(/–20/, '–')}.`,
      g: pairs(A.map((a) => ({ name: `For ${a.delivery_year.replace('/', '–').replace(/–20/, '–')}`, a: a.new_gen_mw, b: a.short_mw, aText: mwTxt(a.new_gen_mw), bText: a.short_mw ? mwTxt(a.short_mw) : 'none' })), { aLabel: 'New power plants secured', bLabel: 'Short of PJM’s reliability target', aColor: C.ink, bColor: C.hot }),
      say: `Each auction is securing less new power, and for two years running PJM has fallen short of the reliability target it sets for itself.${fc ? ` It expects peak demand to grow ${fc.summer_peak_growth_10yr_pct}% a year for the next decade; in 2021 it expected ${fc.summer_peak_growth_10yr_pct_2021_report}%.` : ''}`,
      cap: `PJM buys power plant capacity about three years ahead in auctions. Figures are as PJM credits plants for reliability at peak times, which is less than their size on paper. ${A[1]?.forecast_increase_data_centers_mw ? `PJM said ${nf0.format(A[1].forecast_increase_data_centers_mw)} MW of the ${nf0.format(A[1].forecast_increase_mw)} MW rise in its forecast for the ${A[1].delivery_year} auction came from data centers. ` : ''}${q ? `More is in line: ${nf0.format(q.gw)} GW of projects entered PJM’s study process in ${ymLabel(q.date.slice(0, 7))}, led by gas (${nf0.format(q.by_fuel_gw.gas)} GW)${pjmr.queue.since_2020_processed_gw ? `, but since 2020 only about ${frac(pjmr.queue.since_2020_signed_gw / pjmr.queue.since_2020_processed_gw)} of the capacity PJM studied reached a signed agreement to connect` : ''}. ` : ''}Sources: PJM news releases and reports, listed on the Sources page.` });
  }

  // order of the argument: demand (1-3), then supply: what was built, what filled the gap, where it was built, what is coming
  { const w = steps.findIndex((x) => x.key === 'where'), k = steps.findIndex((x) => x.key === 'slack'); if (w >= 0 && k > w) steps.splice(k, 0, steps.splice(w, 1)[0]); }

  root.innerHTML = `<article class="story">
    <header class="hero">
      <h2>${sped ? 'Electricity use was flat for years. Then it started climbing.' : `Electricity use is ${Math.abs(up).toFixed(0)}% ${up >= 0 ? 'higher' : 'lower'} than before ChatGPT.`}</h2>
      <p>PJM runs the power grid for 13 states and Washington, D.C. Since ChatGPT came out in November 2022, electricity use there is <strong>${up >= 0 ? 'up' : 'down'} ${Math.abs(up).toFixed(0)}%</strong>. Here is what changed, in ${steps.length + 1} pictures.</p>
      <p class="hero__gw"><b>1 GW</b> (gigawatt) is a measure of power: about what ${homes(1000)} average American homes use at once, or one large nuclear reactor. The growth since ChatGPT’s release is ${gw(l.avg_mw - b.avg_mw)}, about ${homes(l.avg_mw - b.avg_mw)} homes’ worth.</p>
    </header>
    <section class="step step--hero">
      <span class="step__n" aria-hidden="true">1</span>
      <h3>${sped ? `Electricity use is climbing ${pct((100 * f.post) / b.avg_mw).replace('+', '')} a year, after years of no growth.` : 'Electricity use before and after ChatGPT.'}</h3>
      <div id="heroLine"></div>
      ${f ? `<p class="step__say">Before ChatGPT: ${pct((100 * f.pre) / b.avg_mw)} a year. Since: ${pct((100 * f.post) / b.avg_mw)} a year.${fW ? ` Taking out the effect of hot summers and cold winters: ${pct((100 * fW.post) / b.avg_mw)} a year, give or take ${((100 * 1.96 * fW.sePost) / b.avg_mw).toFixed(1)}%.` : ''}</p>` : ''}
      <p class="step__cap">Average electricity use in PJM, smoothed over 12 months, in gigawatts (GW).${fW ? ` The weather-adjusted rate uses heating and cooling degree days from EIA; “give or take” is a 95% range.` : ''} The dashed lines are the trend before and after ChatGPT’s release; the dotted line is where the earlier trend was heading. Touch the line to read any month.</p>
      <details class="proof" data-proof="0"><summary>Show the full chart and how it was checked</summary><div></div></details>
    </section>
    ${steps.map((s, i) => `<section class="step">
      <span class="step__n" aria-hidden="true">${i + 2}</span>
      <h3>${esc(s.h)}</h3>
      ${s.views ? `<div class="seg views" role="group" aria-label="Which hours">${s.views.map((v, j) => `<button type="button" data-view="${j}" aria-pressed="${j === 0}">${esc(v.label)}</button>`).join('')}</div>
      ${s.views.map((v, j) => `<div class="view" data-pane="${j}"${j ? ' hidden' : ''}>${v.g}<p class="step__say">${esc(v.say)}</p></div>`).join('')}` : `${s.g}
      ${s.say ? `<p class="step__say">${esc(s.say)}</p>` : ''}`}
      <p class="step__cap">${esc(s.cap)}</p>
      ${s.proof ? `<details class="proof" data-proof="${i + 1}"><summary>Show the full chart and how it was checked</summary><div></div></details>` : ''}
      ${s.links ? `<div class="step__links">${s.links.map(([h, t], i) => `<a class="go${i === s.links.length - 1 ? ' go--light' : ''}" href="${h}">${esc(t)}</a>`).join('')}</div>` : ''}
    </section>`).join('')}
    <section class="step step--end">
      <h3>Go further</h3>
      <div class="end__links"><a class="go" href="#/maps">Open the map</a><a class="go go--quiet" href="#/data">Explore all the data</a>${meta.has_us ? '<a class="go go--quiet" href="#/us">Compare with the whole U.S.</a>' : ''}<a class="go go--quiet" href="#/sources">Sources and method</a><button type="button" class="go go--quiet" id="storyCsv">Download the numbers (CSV)</button></div>
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

  root.addEventListener('click', (e) => {
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
