// Story charts drawn as SVG at the width they are shown (so text stays readable on a phone), each with a hover readout.
import { esc } from './format.js';
import { C } from './story.js';

const HALO = ' paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round"';
const T = (x, y, s, o = {}) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${o.a || 'middle'}" font-size="${o.fs || 13}"${o.w ? ` font-weight="${o.w}"` : ''} fill="${o.c || C.mute}"${o.halo ? HALO : ''}>${esc(s)}</text>`;
const path = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
const gwT = (mw, d = 1) => `${(mw / 1000).toFixed(d)} GW`;
const sgn = (mw, d = 1) => `${mw >= 0 ? '+' : '−'}${gwT(Math.abs(mw), d)}`;
const grid = (L, R, y, lab) => `<line x1="${L}" x2="${R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e6e8ee"/>${T(L - 8, y + 4, lab, { a: 'end' })}`;

// Draws with draw(width) -> { svg, h, pts: [{ x, html }], top, bottom }, redraws when the width changes,
// and shows a guide line and readout at the nearest point under the pointer.
export function live(host, draw) {
  let w = 0, cur = null;
  host.classList.add('schart');
  const tip = document.createElement('div'); tip.className = 'schart__tip'; tip.hidden = true;
  const go = () => {
    const nw = Math.round(host.clientWidth);
    if (!nw || nw === w) return;
    w = nw; cur = draw(w);
    host.innerHTML = `<svg viewBox="0 0 ${w} ${cur.h}" width="${w}" height="${cur.h}" role="img" aria-label="${esc(cur.aria || '')}">${cur.svg}<line class="schart__guide" x1="0" x2="0" y1="${cur.top}" y2="${cur.bottom}" visibility="hidden"/></svg>`;
    host.appendChild(tip);
  };
  const move = (e) => {
    if (!cur?.pts?.length) return;
    const r = host.getBoundingClientRect(), x = e.clientX - r.left;
    let best = cur.pts[0];
    cur.pts.forEach((p) => { if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; });
    const g = host.querySelector('.schart__guide');
    g.setAttribute('x1', best.x); g.setAttribute('x2', best.x); g.setAttribute('visibility', 'visible');
    tip.innerHTML = best.html; tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(w - tw, best.x + 12 + tw > w ? best.x - tw - 12 : best.x + 12))}px`;
    tip.style.top = `${cur.top}px`;
  };
  const leave = () => { tip.hidden = true; host.querySelector('.schart__guide')?.setAttribute('visibility', 'hidden'); };
  host.addEventListener('pointermove', move); host.addEventListener('pointerdown', move); host.addEventListener('pointerleave', leave);
  const ro = new ResizeObserver(go); ro.observe(host); go();
  return { destroy: () => ro.disconnect(), redraw: () => { w = 0; leave(); go(); } };
}

// Picture 2: the average of the quietest 100 hours in each 12-month year.
// years: [{ y, v, pre, span }] (v in MW; span labels the 12 months); base: the pre-release average (MW)
export function floorChart(w, { years, base }) {
  const narrow = w < 560, L = 56, R = w - 16, top = 20, bottom = narrow ? 250 : 300, h = bottom + 40;
  const vs = years.map((d) => d.v), lo = Math.floor((Math.min(...vs, base) - 1500) / 5000) * 5000, hi = Math.ceil((Math.max(...vs) + 1500) / 5000) * 5000;
  const X = (i) => L + ((R - L) * i) / (years.length - 1), Y = (v) => bottom - ((bottom - top) * (v - lo)) / (hi - lo);
  let s = '';
  const k = years.findIndex((d) => !d.pre), last = years.length - 1;
  if (k > 0) s += `<rect x="${((X(k - 1) + X(k)) / 2).toFixed(1)}" y="${top}" width="${(R - (X(k - 1) + X(k)) / 2).toFixed(1)}" height="${bottom - top}" fill="${C.hot}" opacity=".06"/>${T((X(k - 1) + X(k)) / 2 + 8, bottom - 10, 'After ChatGPT', { a: 'start', w: 700, c: C.hot, halo: true })}`;
  for (let v = lo; v <= hi; v += 5000) s += grid(L, R, Y(v), `${v / 1000} GW`);
  years.forEach((d, i) => { if (i % 2 === 0 || i === last) s += T(X(i), bottom + 26, String(d.y)); });
  s += `<line x1="${L}" x2="${R}" y1="${Y(base).toFixed(1)}" y2="${Y(base).toFixed(1)}" stroke="${C.mute}" stroke-width="1.5" stroke-dasharray="5 5"/>`;
  s += T(R - 8, Y(base) + 20, narrow ? `Before: about ${Math.round(base / 1000)} GW` : `Before ChatGPT: about ${Math.round(base / 1000)} GW`, { a: 'end', fs: narrow ? 12 : 13, w: 600, halo: true });
  const P = years.map((d, i) => [X(i), Y(d.v)]);
  s += `<path d="${path(P.slice(0, k))}" fill="none" stroke="${C.grey}" stroke-width="3.5" stroke-linejoin="round"/>`;
  s += `<path d="${path(P.slice(k - 1))}" fill="none" stroke="${C.hot}" stroke-width="4" stroke-linejoin="round"/>`;
  P.forEach(([x, y], i) => { s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${i < k ? C.grey : C.hot}" stroke="#fff" stroke-width="2.5"/>`; });
  s += T(P[last][0] - 10, P[last][1] - 4, `${Math.round(years[last].v / 1000)} GW`, { a: 'end', fs: 17, w: 800, c: C.hot, halo: true });
  return { svg: s, h, top, bottom, aria: `Average of the 100 quietest hours each year: about ${Math.round(base / 1000)} gigawatts before ChatGPT, ${Math.round(years[last].v / 1000)} gigawatts in the latest year`,
    pts: years.map((d, i) => ({ x: X(i), html: `<b>${esc(d.span)}</b>Quietest 100 hours: ${gwT(d.v)}` })) };
}

// Picture 2: a typical week, before and after. before, after: 168 hourly averages in MW, Monday midnight first
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hr12 = (h) => (h === 0 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? `${h} a.m.` : `${h - 12} p.m.`);
export function weekChart(w, { before, after, q, aName = 'Latest 12 months', bName = '12 months before ChatGPT', aShort = 'Now', bShort = 'Before' }) {
  const narrow = w < 560, L = 56, R = w - 12, top = 20, bottom = narrow ? 290 : 320, h = bottom + 34;
  const lo = Math.floor((Math.min(...before) - 3000) / 10000) * 10000, hi = Math.ceil((Math.max(...after) + 4000) / 10000) * 10000;
  const X = (i) => L + ((R - L) * i) / 167, Y = (v) => bottom - ((bottom - top) * (v - lo)) / (hi - lo);
  let s = '';
  for (let d = 0; d < 7; d++) {
    if (d >= 5) s += `<rect x="${X(d * 24).toFixed(1)}" y="${top}" width="${(X(Math.min(167, d * 24 + 24)) - X(d * 24)).toFixed(1)}" height="${bottom - top}" fill="#f1f2f7"/>`;
    if (d) s += `<line x1="${X(d * 24).toFixed(1)}" x2="${X(d * 24).toFixed(1)}" y1="${top}" y2="${bottom}" stroke="#e6e8ee"/>`;
    s += T(X(d * 24 + 12), bottom + 24, narrow ? DAYS[d].slice(0, 3) : DAYS[d]);
  }
  for (let v = lo; v <= hi; v += 10000) s += grid(L, R, Y(v), `${v / 1000} GW`);
  const A = after.map((v, i) => [X(i), Y(v)]), B = before.map((v, i) => [X(i), Y(v)]);
  s += `<path d="${path([...A, ...B.slice().reverse()])}Z" fill="${C.hot}" opacity=".13"/>`;
  s += `<path d="${path(B)}" fill="none" stroke="${C.grey}" stroke-width="3" stroke-linejoin="round"/>`;
  s += `<path d="${path(A)}" fill="none" stroke="${C.hot}" stroke-width="3.5" stroke-linejoin="round"/>`;
  // the quietest hour of the week now, and how much more it needs than before
  const xq = X(q), ya = Y(after[q]), yb = Y(before[q]);
  s += `<line x1="${xq.toFixed(1)}" x2="${xq.toFixed(1)}" y1="${(ya + 3).toFixed(1)}" y2="${(yb - 3).toFixed(1)}" stroke="${C.ink}" stroke-width="2"/><circle cx="${xq.toFixed(1)}" cy="${ya.toFixed(1)}" r="4.5" fill="${C.hot}" stroke="#fff" stroke-width="2"/><circle cx="${xq.toFixed(1)}" cy="${yb.toFixed(1)}" r="4.5" fill="${C.grey}" stroke="#fff" stroke-width="2"/>`;
  const qd = Math.floor(q / 24), lab = `${sgn(after[q] - before[q])} at ${hr12(q % 24)} ${narrow ? DAYS[qd].slice(0, 3) : DAYS[qd]}`;
  s += T(xq - 10, yb + 22, lab, { a: 'end', fs: narrow ? 13 : 14, w: 700, c: C.ink, halo: true });
  // series names, next to their lines on Wednesday afternoon and early Wednesday morning
  const pk = 2 * 24 + 15, nt = 2 * 24 + 3;
  if (!narrow && aName) s += T(X(pk), Math.min(Y(after[pk]), Y(before[pk])) - 12, aName, { fs: 14, w: 700, c: C.hot, halo: true }) + T(X(nt), Math.max(Y(before[nt]), Y(after[nt])) + 22, bName, { fs: 14, w: 700, c: C.mute, halo: true });
  return { svg: s, h, top, bottom, aria: `Average electricity use for each hour of the week: the latest 12 months run ${((after[q] - before[q]) / 1000).toFixed(1)} gigawatts higher even at the quietest hour`,
    pts: after.map((v, i) => ({ x: X(i), html: `<b>${DAYS[Math.floor(i / 24)]}, ${hr12(i % 24)}</b>${esc(bShort)}: ${gwT(before[i])}<br>${esc(aShort)}: ${gwT(v)} (${sgn(v - before[i])})` })) };
}

// Picture 4: growth in average use and in solar output at each hour of the day. d, s: 24 values in MW (midnight first)
export function hourChart(w, { d, s: sol }) {
  const narrow = w < 560, L = 52, R = w - 16, top = 16, bottom = narrow ? 260 : 320, h = bottom + 30;
  const hi = Math.ceil((Math.max(...d, ...sol) + 300) / 3000) * 3000;
  const X = (i) => L + ((R - L) * i) / 23, Y = (v) => bottom - ((bottom - top) * Math.max(0, v)) / hi;
  const thr = 0.05 * Math.max(...sol), day = sol.map((v) => v >= thr), first = day.indexOf(true), lastDay = day.lastIndexOf(true);
  let s = '';
  const bands = first > 0 ? [[0, first - 1], [lastDay + 1, 23]].filter(([a, b]) => b > a) : [];
  bands.forEach(([a, b]) => { s += `<rect x="${X(a).toFixed(1)}" y="${top}" width="${(X(b) - X(a)).toFixed(1)}" height="${bottom - top}" fill="#f1f2f7"/>${T((X(a) + X(b)) / 2, top + 16, 'Night', { w: 600, halo: true })}`; });
  for (let v = 0; v <= hi; v += 3000) s += grid(L, R, Y(v), `${v / 1000} GW`);
  const ticks = narrow ? [[0, '12am'], [6, '6am'], [12, 'Noon'], [18, '6pm'], [23, '11pm']] : [[0, 'Midnight'], [6, '6 a.m.'], [12, 'Noon'], [18, '6 p.m.'], [23, '11 p.m.']];
  ticks.forEach(([i, t]) => { s += T(X(i), bottom + 24, t, {}); });
  const cov = d.map((v, i) => Math.max(0, Math.min(v, sol[i])));
  const D = d.map((v, i) => [X(i), Y(v)]), CV = cov.map((v, i) => [X(i), Y(v)]);
  s += `<defs><pattern id="unc" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#e3e7fb"/><line x1="0" y1="0" x2="0" y2="8" stroke="#aab5ef" stroke-width="3"/></pattern></defs>`;
  s += `<path d="${path([...D, ...CV.slice().reverse()])}Z" fill="url(#unc)"/>`;
  s += `<path d="${path([[X(0), bottom], ...CV, [X(23), bottom]])}Z" fill="${C.solar}"/>`;
  s += `<path d="${path(D)}" fill="none" stroke="${C.hot}" stroke-width="4" stroke-linejoin="round"/>`;
  const fs = narrow ? 13 : 15;
  const noon = cov.indexOf(Math.max(...cov));
  s += T(X(noon), (Y(cov[noon]) + bottom) / 2 + 5, narrow ? 'Covered by solar' : 'Covered by new solar', { fs, w: 700, c: C.ink, halo: true });
  const inside = (x, txt, f) => { const half = (txt.length * f * 0.56) / 2; return Math.max(L + half, Math.min(R - half, x)); };
  bands.forEach(([a, b]) => { const m = Math.round((a + b) / 2); s += T(inside((X(a) + X(b)) / 2, 'Not covered', fs), (Y(d[m]) + Y(cov[m])) / 2 + 5, 'Not covered', { fs, w: 700, c: C.hot, halo: true }); });
  const lt = 'Growth in electricity use', lf = narrow ? 13 : 14;
  s += T(inside(X(noon), lt, lf), Math.min(Y(d[noon]), Y(cov[noon])) - 14, lt, { fs: lf, w: 700, c: C.hot, halo: true });
  const hr = (i) => (i === 0 ? 'Midnight' : i === 12 ? 'Noon' : i < 12 ? `${i} a.m.` : `${i - 12} p.m.`);
  return { svg: s, h, top, bottom, aria: 'Growth in electricity use by hour of the day, and how much of it new solar covers',
    pts: d.map((v, i) => ({ x: X(i), html: `<b>${hr(i)}</b>Use: ${sgn(v)}<br>Solar: ${sgn(sol[i])}` })) };
}

// Picture 7: running totals, in average power, from the latest month to the end of 2030.
// months: ['2026-10', ...]; demand, build, close: MW at each month
export function runChart(w, { months, demand, build, close }) {
  const narrow = w < 560, L = 52, R = w - (narrow ? 70 : 170), top = 30, bottom = narrow ? 260 : 340, h = bottom + 40;
  const hi = Math.ceil((Math.max(...demand, ...build, ...close) + 200) / 2500) * 2500;
  const X = (i) => L + ((R - L) * i) / (months.length - 1), Y = (v) => bottom - ((bottom - top) * v) / hi;
  let s = `<defs><linearGradient id="dg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${C.hot}" stop-opacity=".22"/><stop offset="1" stop-color="${C.hot}" stop-opacity=".03"/></linearGradient></defs>`;
  for (let v = 0; v <= hi; v += 2500) s += grid(L, R, Y(v), `${v / 1000} GW`);
  months.forEach((m, i) => { if (m.endsWith('-01')) s += `<line x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${bottom}" y2="${bottom + 5}" stroke="${C.mute}"/>${T(X(i), bottom + 26, m.slice(0, 4))}`; });
  const step = (v) => v.flatMap((y, i) => (i ? [[X(i), Y(v[i - 1])], [X(i), Y(y)]] : [[X(i), Y(y)]]));
  const DM = demand.map((v, i) => [X(i), Y(v)]), n = months.length - 1;
  s += `<path d="${path([[X(0), bottom], ...DM, [X(n), bottom]])}Z" fill="url(#dg)"/><path d="${path(DM)}" fill="none" stroke="${C.hot}" stroke-width="4" stroke-linecap="round"/>`;
  s += `<path d="${path(step(close))}" fill="none" stroke="${C.gas}" stroke-width="4" stroke-linejoin="round"/>`;
  s += `<path d="${path(step(build))}" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>`;
  // where closures pass new plants for good
  const { i: cross, txt: crossTxt } = crossing(months, build, close);
  if (cross > 0) {
    const x = X(cross), y = Y(close[cross]), lab = `${crossTxt}: closures overtake new plants`, tw = lab.length * 7.2;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#fff" stroke="${C.ink}" stroke-width="2.5"/>`;
    if (!narrow) s += x - 10 - tw > L ? T(x - 10, y - 14, lab, { a: 'end', fs: 13.5, w: 700, c: C.ink, halo: true }) : T(Math.max(L, Math.min(x - tw / 2, R - tw)), y - 18, lab, { a: 'start', fs: 13, w: 700, c: C.ink, halo: true });
  }
  // end labels, nudged apart so they do not overlap
  const ends = [{ v: demand[n], c: C.hot, t: 'Demand growth' }, { v: close[n], c: C.gas, t: 'Plants closing' }, { v: build[n], c: C.ink, t: 'Plants being built' }].map((e) => ({ ...e, y: Y(e.v) })).sort((a, b) => a.y - b.y);
  const gap = narrow ? 20 : 36;
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < gap) ends[i].y = ends[i - 1].y + gap;
  ends.forEach((e) => {
    s += `<circle cx="${X(n).toFixed(1)}" cy="${Y(e.v).toFixed(1)}" r="5" fill="${e.c}"/>${T(X(n) + 12, e.y + 4, gwT(e.v), { a: 'start', fs: narrow ? 15 : 17, w: 800, c: e.c, halo: true })}`;
    if (!narrow) s += T(X(n) + 12, e.y + 21, e.t, { a: 'start', fs: 12.5, w: 600, halo: true });
  });
  const ml = (m) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
  return { svg: s, h, top, bottom, aria: `From today to 2030, in average power: demand grows ${gwT(demand[n])}, plants being built add ${gwT(build[n])}, plants due to close take away ${gwT(close[n])}`,
    pts: months.map((m, i) => ({ x: X(i), html: `<b>${ml(m)}</b>Demand: ${sgn(demand[i])}<br>Built: ${sgn(build[i])}<br>Closed: −${gwT(close[i])}` })) };
}

// Bridge (waterfall) chart. items: [{ label: [line1, line2], v (MW), kind: 'add' | 'cut' | 'total' }]
// 'add' widens the gap, 'cut' narrows it, 'total' is the result. Values are labelled directly, so there is no y axis.
export function bridge(w, items) {
  const narrow = w < 560, L = 8, R = w - 8, top = 34, bottom = narrow ? 230 : 280;
  // wrap each label line to the width of its column
  const maxCh = Math.max(6, Math.floor((R - L) / items.length / (narrow ? 6.6 : 7.4)));
  const wrap = (t) => t.split(' ').reduce((acc, wd) => { const last = acc[acc.length - 1]; if (last && (last + ' ' + wd).length <= maxCh) acc[acc.length - 1] = `${last} ${wd}`; else acc.push(wd); return acc; }, []);
  const lines = items.map((it) => it.label.filter(Boolean).flatMap((ln, j) => wrap(ln).map((t) => ({ t, sub: j > 0 }))));
  const h = bottom + 26 + 17 * Math.max(...lines.map((x) => x.length));
  let run = 0;
  const bars = items.map((it) => { const from = it.kind === 'total' ? 0 : run, to = it.kind === 'total' ? it.v : run + (it.kind === 'cut' ? -it.v : it.v); if (it.kind !== 'total') run = to; return { ...it, from, to }; });
  const hi = Math.max(...bars.map((b) => Math.max(b.from, b.to))) * 1.08, Y = (v) => bottom - ((bottom - top) * v) / hi;
  const slot = (R - L) / bars.length, bw = Math.min(narrow ? 58 : 96, slot * 0.58);
  const col = { add: '#3b4763', cut: '#c3c8d4', total: C.hot };
  let s = `<line x1="${L}" x2="${R}" y1="${bottom}" y2="${bottom}" stroke="#9aa1b2" stroke-width="1"/>`;
  bars.forEach((b, i) => {
    const cx = L + slot * (i + 0.5), x = cx - bw / 2, y0 = Y(Math.max(b.from, b.to)), y1 = Y(Math.min(b.from, b.to));
    s += `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, y1 - y0).toFixed(1)}" fill="${col[b.kind]}" rx="2"/>`;
    if (i < bars.length - 1) { const nx = L + slot * (i + 1.5) - bw / 2; s += `<line x1="${(x + bw).toFixed(1)}" x2="${nx.toFixed(1)}" y1="${Y(b.to).toFixed(1)}" y2="${Y(b.to).toFixed(1)}" stroke="#9aa1b2" stroke-dasharray="3 3"/>`; }
    const val = b.kind === 'total' ? `${(b.v / 1000).toFixed(1)} GW` : `${b.kind === 'cut' ? '−' : '+'}${(b.v / 1000).toFixed(1)}`;
    s += T(cx, y0 - 10, val, { fs: b.kind === 'total' ? (narrow ? 17 : 20) : (narrow ? 15 : 17), w: 800, c: b.kind === 'total' ? C.hot : C.ink });
    lines[i].forEach((ln, j) => { s += T(cx, bottom + 22 + j * 17, ln.t, { fs: narrow ? (ln.sub ? 11.5 : 12.5) : (ln.sub ? 13 : 14), w: ln.sub ? 500 : 650, c: ln.sub ? C.mute : C.ink }); });
  });
  return { svg: s, h, top, bottom, aria: items.map((it) => `${it.label.join(' ')}: ${(it.v / 1000).toFixed(1)} GW`).join('; '), pts: [] };
}

// Horizontal bridge: rows build up to a total, then the rows after it fill the total back down to zero.
// rows: [{ label, v (MW), kind: 'add' | 'total' | 'fill', hl }]; hl marks the row the headline is about.
export function hbridge(w, rows) {
  const narrow = w < 600, labW = narrow ? 0 : 250, L = labW, R = w - (narrow ? 64 : 84);
  const rowH = narrow ? 50 : 40, top = 4, h = top + rows.length * rowH + 4;
  let run = 0;
  const bs = rows.map((r) => { let a, b; if (r.kind === 'add') { a = run; b = run + r.v; run = b; } else if (r.kind === 'total') { a = 0; b = r.v; run = r.v; } else { a = run - r.v; b = run; run = a; } return { ...r, a: Math.min(a, b), b: Math.max(a, b) }; });
  const hi = Math.max(...bs.map((r) => r.b)), X = (v) => L + ((R - L) * Math.max(0, v)) / hi;
  let s = `<line x1="${X(0).toFixed(1)}" x2="${X(0).toFixed(1)}" y1="${top}" y2="${h - 4}" stroke="#9aa1b2"/>`;
  bs.forEach((r, i) => {
    const y = top + i * rowH, barY = y + (narrow ? 22 : 8), bh = narrow ? 20 : 24;
    const col = r.hl ? C.hot : r.kind === 'total' ? C.ink : r.kind === 'add' ? '#5d6880' : '#c3c8d4';
    if (r.kind === 'total') s += `<line x1="0" x2="${w}" y1="${(y + 1).toFixed(1)}" y2="${(y + 1).toFixed(1)}" stroke="#e6e8ee"/><line x1="0" x2="${w}" y1="${(y + rowH - 1).toFixed(1)}" y2="${(y + rowH - 1).toFixed(1)}" stroke="#e6e8ee"/>`;
    s += `<rect x="${X(r.a).toFixed(1)}" y="${barY}" width="${Math.max(2, X(r.b) - X(r.a)).toFixed(1)}" height="${bh}" fill="${col}" rx="2"/>`;
    if (i < bs.length - 1) { const nx = bs[i + 1]; const edge = r.kind === 'fill' ? r.a : r.b; s += `<line x1="${X(edge).toFixed(1)}" x2="${X(edge).toFixed(1)}" y1="${barY + bh}" y2="${top + (i + 1) * rowH + (narrow ? 22 : 8)}" stroke="#9aa1b2" stroke-dasharray="2 3"/>`; void nx; }
    const lab = T(narrow ? 0 : 0, narrow ? y + 15 : barY + bh / 2 + 5, r.label, { a: 'start', fs: narrow ? 13.5 : 15, w: r.hl || r.kind === 'total' ? 700 : 500, c: r.hl ? C.hot : C.ink });
    const val = `${r.kind === 'fill' ? '−' : r.kind === 'add' ? '+' : ''}${(r.v / 1000).toFixed(1)}${r.kind === 'total' ? ' GW' : ''}`;
    s += lab + T(X(r.b) + 8, barY + bh / 2 + 5, val, { a: 'start', fs: narrow ? 14 : 15.5, w: 800, c: r.hl ? C.hot : C.ink });
  });
  return { svg: s, h, top, bottom: h, aria: rows.map((r) => `${r.label}: ${(r.v / 1000).toFixed(1)} GW`).join('; '), pts: [] };
}

// The month from which plants closing outweigh plants being built for good, and a plain label for it ('Late 2028')
export function crossing(months, build, close) {
  const n = months.length - 1;
  for (let i = n; i > 0; i--) {
    if (close[i] <= build[i]) break;
    if (close[i - 1] <= build[i - 1]) { const mo = Number(months[i].slice(5, 7)); return { i, txt: `${mo <= 4 ? 'Early' : mo <= 8 ? 'Mid' : 'Late'} ${months[i].slice(0, 4)}` }; }
  }
  return { i: -1, txt: '' };
}

// The colour key, shown under a chart on a phone where the end labels have no room for names
export const key = (items) => `<div class="schart__key">${items.map(([c, t]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join('')}</div>`;
