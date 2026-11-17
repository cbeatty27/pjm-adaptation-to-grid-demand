// Large, plain graphics for the story page. One idea each, numbers written on the marks, no chart jargon.
import { esc } from './format.js';

export const C = { ink: '#141b2d', mute: '#6b7389', grey: '#b3b9c7', line: '#dde0e8', hot: '#2b44d8', hotSoft: '#8f9df0', gas: '#e87e42', solar: '#d9ae36', solarSoft: '#f1e2b0' };

// Horizontal bars in HTML, so they reflow on a phone. items: [{ label, value, text, color, soft? }]
export function bars(items, { max = null, unit = 'MW' } = {}) {
  const m = max ?? Math.max(...items.map((d) => Math.abs(d.value)), 1e-9);
  return `<div class="bars" role="img" aria-label="${esc(items.map((d) => `${d.label}: ${d.text}`).join('; '))}">${items.map((d) => `
    <div class="bars__row" data-csv="${esc(JSON.stringify([d.label, '', d.value, unit]))}"><span class="bars__lab">${esc(d.label)}</span>
      <span class="bars__track"><i style="--f:${(Math.abs(d.value) / m).toFixed(4)};background:${d.color}"></i><b>${esc(d.text)}</b></span></div>`).join('')}</div>`;
}

// Two measures per place, side by side. rows: [{ name, a, b, aText, bText }]
// max: a shared scale, so two charts that are toggled between draw the same value at the same length.
export function pairs(rows, { aLabel, bLabel, aColor = C.ink, bColor = C.hot, max = null, unit = 'MW' }) {
  const m = max ?? Math.max(...rows.flatMap((r) => [r.a, r.b]), 1e-9);
  const bar = (v, color, lab, text) => `<span class="pairs__bar"><em>${esc(lab)}</em><span class="bars__track"><i style="--f:${(v / m).toFixed(4)};background:${color}"></i><b>${esc(text)}</b></span></span>`;
  return `<div class="pairs" role="img" aria-label="${esc(rows.map((r) => `${r.name}: ${r.hideB ? '' : `${aLabel} `}${r.aText}${r.hideB ? '' : `, ${bLabel} ${r.bText}`}`).join('; '))}">${rows.map((r) => `
    <div class="pairs__row" data-csv="${esc(JSON.stringify([[r.name, r.aLab || (r.hideB ? 'Growth at the current pace' : aLabel), r.a, unit], ...(r.hideB ? [] : [[r.name, bLabel, r.b, unit]])]))}"><strong>${esc(r.name)}</strong><div>${bar(r.a, r.aColor || aColor, r.aLab || (r.hideB ? 'Growth at the current pace' : aLabel), r.aText)}${r.hideB ? '' : bar(r.b, bColor, bLabel, r.bText)}</div></div>`).join('')}</div>`;
}

// The big line: grey before the release, colour after, a dotted line where the earlier trend was heading.
// Redraws at the container's width so type stays readable on a phone; hover or touch shows any month.
export function mountLine(el, { months, vals, ghost = null, trend = null, preLabel = '', postLabel = '', split, fmt, label, splitLabel, ghostLabel, aria }) {
  el.classList.add('bigline');
  el.innerHTML = '<svg role="img"></svg><div class="bigline__tip" hidden></div>';
  const svg = el.querySelector('svg'), tip = el.querySelector('.bigline__tip');
  svg.setAttribute('aria-label', aria);
  const n = vals.length, all = [...vals, ...(ghost || []), ...(trend || [])].filter((v) => v != null);
  const lo0 = Math.min(...all), hi0 = Math.max(...all);
  const step = [500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000].find((s) => (hi0 - lo0) / s <= 4) || 50000;
  const lo = Math.floor(lo0 / step) * step, hi = Math.ceil(hi0 / step) * step;
  const last = vals.reduce((a, v, i) => (v != null ? i : a), -1), first = vals.findIndex((v) => v != null);
  let geo = null;
  function draw() {
    const W = Math.max(300, el.clientWidth), small = W < 620, H = small ? 300 : 430;
    const pL = 4, pR = small ? 12 : 20, pT = small ? 56 : 64, pB = 34, fs = small ? 12 : 14;
    const x0 = small ? 46 : 62, x = (i) => x0 + (i / (n - 1)) * (W - x0 - pR), y = (v) => pT + (1 - (v - lo) / (hi - lo)) * (H - pT - pB);
    geo = { x, y, W, H, pT, pB, x0 };
    const path = (a, from, to) => { let d = '', pen = false; for (let i = from; i <= to; i++) { const v = a[i]; if (v == null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`; pen = true; } return d; };
    let g = '';
    for (let v = lo; v <= hi + 1e-6; v += step) g += `<line x1="${pL}" x2="${W - pR}" y1="${y(v)}" y2="${y(v)}" stroke="${C.line}"/><text x="${pL}" y="${y(v) - 6}" font-size="${fs}" fill="${C.mute}">${esc(fmt(v))}</text>`;
    months.forEach((m, i) => { if (m.slice(5) === '01' && (Number(m.slice(0, 4)) % 2 === 0 || !small) && i > 2 && i < n - 3) g += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="${fs}" fill="${C.mute}">${m.slice(0, 4)}</text>`; });
    g += `<rect x="${x(split)}" y="${pT - 14}" width="${W - pR - x(split)}" height="${H - pT - pB + 14}" fill="${C.hot}" opacity=".06"/>`;
    g += `<line x1="${x(split)}" x2="${x(split)}" y1="${pT - 30}" y2="${H - pB}" stroke="${C.ink}" stroke-dasharray="4 4"/>`;
    g += `<text x="${x(split) - 8}" y="${pT - 30}" text-anchor="end" font-size="${fs + 1}" font-weight="600" fill="${C.ink}">${esc(splitLabel)}</text>`;
    if (ghost) {
      const gl = ghost.reduce((a, v, i) => (v != null ? i : a), -1);
      g += `<path d="${path(ghost, split, n - 1)}" fill="none" stroke="${C.mute}" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/>`;
      if (gl >= 0) g += `<text x="${x(gl)}" y="${y(ghost[gl]) + 22}" text-anchor="end" font-size="${fs}" fill="${C.mute}">${esc(ghostLabel)}</text>`;
    }
    if (trend) {
      g += `<path d="${path(trend, 0, split)}" fill="none" stroke="${C.ink}" stroke-width="2" stroke-dasharray="7 6"/><path d="${path(trend, split, n - 1)}" fill="none" stroke="${C.ink}" stroke-width="2" stroke-dasharray="7 6"/>`;
      const ft = trend.findIndex((v) => v != null);
      if (preLabel && ft >= 0) g += `<text x="${x(ft)}" y="${small ? H - pB - 14 : pT + 8}" class="halo" font-size="${small ? 13 : 16}" font-weight="700" fill="${C.ink}">${esc(small ? preLabel.replace(/^Trend b/, 'B').replace(/ \(.*\)$/, '') : preLabel)}</text>`;
      if (postLabel) g += `<text x="${W - pR}" y="${H - pB - 14}" text-anchor="end" class="halo" font-size="${small ? 13 : 16}" font-weight="700" fill="${C.hot}">${esc(small ? postLabel.replace(/^Trend a/, 'A') : postLabel)}</text>`;
    }
    g += `<path d="${path(vals, 0, split)}" fill="none" stroke="${C.grey}" stroke-width="${small ? 3 : 4}" stroke-linejoin="round" stroke-linecap="round"/>`;
    g += `<path d="${path(vals, split, n - 1)}" fill="none" stroke="${C.hot}" stroke-width="${small ? 4 : 5}" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (last >= 0) g += `<circle cx="${x(last)}" cy="${y(vals[last])}" r="7" fill="${C.hot}" stroke="#fff" stroke-width="3"/><text x="${x(last) - 14}" y="${y(vals[last]) - 14}" class="halo" text-anchor="end" font-size="${small ? 20 : 26}" font-weight="700" fill="${C.hot}">${esc(label(vals[last]))}</text>`;
    if (vals[split] != null) g += `<circle cx="${x(split)}" cy="${y(vals[split])}" r="5" fill="#fff" stroke="${C.ink}" stroke-width="2"/><text x="${x(split) - 12}" y="${y(vals[split]) + (small ? 34 : 44)}" class="halo" text-anchor="end" font-size="${small ? 15 : 18}" font-weight="700" fill="${C.ink}">${esc(label(vals[split]))}</text>`;
    g += `<g class="bigline__cur" style="display:none"><line y1="${pT - 14}" y2="${H - pB}" stroke="${C.ink}" stroke-width="1"/><circle r="6" fill="${C.ink}" stroke="#fff" stroke-width="2"/></g>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.innerHTML = g;
  }
  function move(e) {
    const r = svg.getBoundingClientRect(), px = e.clientX - r.left;
    let i = Math.round(((px - geo.x0) / (geo.x(n - 1) - geo.x0)) * (n - 1));
    i = Math.max(first, Math.min(last, i));
    if (vals[i] == null) return;
    const cur = svg.querySelector('.bigline__cur');
    cur.style.display = '';
    cur.querySelector('line').setAttribute('x1', geo.x(i)); cur.querySelector('line').setAttribute('x2', geo.x(i));
    cur.querySelector('circle').setAttribute('cx', geo.x(i)); cur.querySelector('circle').setAttribute('cy', geo.y(vals[i]));
    const [yy, mm] = months[i].split('-');
    tip.hidden = false;
    tip.innerHTML = `<b>${esc(fmt(vals[i], 1))}</b><span>12 months to ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mm) - 1]} ${yy}</span>`;
    const tx = Math.min(geo.W - 170, Math.max(0, geo.x(i) + 12));
    tip.style.transform = `translate(${tx}px, ${Math.max(0, geo.y(vals[i]) - 70)}px)`;
  }
  const leave = () => { tip.hidden = true; const c = svg.querySelector('.bigline__cur'); if (c) c.style.display = 'none'; };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move); svg.addEventListener('pointerleave', leave);
  draw();
  const ro = new ResizeObserver(() => { leave(); draw(); });
  ro.observe(el);
  return { destroy: () => ro.disconnect() };
}

// 1 GW in homes: EIA's average U.S. home bought 10,791 kWh in 2022, an average draw of about 1.23 kW.
export const HOME_KW = 10791 / 8760;
export function homes(mw) {
  const n = (mw * 1000) / HOME_KW;
  return n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million` : `${Math.round(n / 1e4) * 10},000`;
}

// Vertical columns for a short time series. items: [{ label, value, text, color, note? }]
export function cols(items, { unit = '' } = {}) {
  const m = Math.max(...items.map((d) => d.value), 1e-9);
  return `<div class="cols" role="img" aria-label="${esc(items.map((d) => `${d.label}: ${d.text}`).join('; '))}">${items.map((d) => `
    <div class="cols__c" data-csv="${esc(JSON.stringify([d.label, 'Capacity price', d.value, unit]))}"><b>${esc(d.text)}</b><i style="--f:${(d.value / m).toFixed(4)};background:${d.color}"></i><span>${esc(d.label)}</span>${d.note ? `<em>${esc(d.note)}</em>` : ''}</div>`).join('')}</div>`;
}
