// Small inline SVG graphics for the findings cards. No axes: one idea each, with the numbers written on the marks.
import { esc } from './format.js';

const W = 360;
// Horizontal bars. items: [{ label, value, text, color }]; all bars share one scale (largest absolute value).
export function miniBars(items, { labelW = 126, rowH = 42, barH = 24, valueW = 112 } = {}) {
  const max = Math.max(...items.map((d) => Math.abs(d.value)), 1e-9);
  const x0 = labelW, span = W - labelW - valueW, H = items.length * rowH;
  const rows = items.map((d, i) => {
    const w = Math.max(3, (Math.abs(d.value) / max) * span), y = i * rowH + (rowH - barH) / 2;
    return `<text x="${x0 - 10}" y="${y + barH / 2}" text-anchor="end" dominant-baseline="central" class="mini__lab">${esc(d.label)}</text>
      <rect x="${x0}" y="${y}" width="${w.toFixed(1)}" height="${barH}" rx="4" fill="${d.color}"/>
      <text x="${x0 + w + 8}" y="${y + barH / 2}" dominant-baseline="central" class="mini__val">${esc(d.text)}</text>`;
  }).join('');
  return `<svg class="mini" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(items.map((d) => `${d.label}: ${d.text}`).join('; '))}"><line x1="${x0}" x2="${x0}" y1="2" y2="${H - 2}" stroke="#dde0e8" stroke-width="1"/>${rows}</svg>`;
}

// Line(s) over time. series: [{ vals, color, colorAfter?, dash?, width? }]; split = index of the release month.
export function miniLine(series, { split = -1, H = 160, startText = '', endText = '', splitText = '', years = null, aria = '' } = {}) {
  const all = series.flatMap((s) => s.vals.filter((v) => v != null));
  if (!all.length) return '';
  const lo = Math.min(...all), hi = Math.max(...all), n = series[0].vals.length;
  const padL = 8, padR = 10, padT = 30, padB = 24;
  const x = (i) => padL + (i / (n - 1)) * (W - padL - padR), y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  const path = (vals, a, b) => { let d = '', pen = false; for (let i = a; i <= b; i++) { const v = vals[i]; if (v == null) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`; pen = true; } return d; };
  let g = '';
  if (split > 0) g += `<rect x="${x(split)}" y="${padT - 8}" width="${W - padR - x(split) + 6}" height="${H - padT - padB + 14}" rx="6" fill="#2b44d8" opacity=".09"/>`;
  g += `<line x1="${padL}" x2="${W - padR + 6}" y1="${H - padB + 6}" y2="${H - padB + 6}" stroke="#dde0e8" stroke-width="1"/>`;
  series.forEach((s) => {
    const st = `fill="none" stroke-width="${s.width || 2.6}" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}`;
    if (s.colorAfter && split > 0) g += `<path d="${path(s.vals, 0, split)}" stroke="${s.color}" ${st}/><path d="${path(s.vals, split, n - 1)}" stroke="${s.colorAfter}" ${st}/>`;
    else g += `<path d="${path(s.vals, 0, n - 1)}" stroke="${s.color}" ${st}/>`;
  });
  if (split > 0) g += `<line x1="${x(split)}" x2="${x(split)}" y1="${padT - 8}" y2="${H - padB + 6}" stroke="#141b2d" stroke-width="1" stroke-dasharray="3 3"/><text x="${x(split) - 6}" y="${padT - 14}" text-anchor="end" class="mini__lab">${esc(splitText)}</text>`;
  const first = series[0].vals.findIndex((v) => v != null), last = series[0].vals.reduce((a, v, i) => (v != null ? i : a), -1);
  if (startText && first >= 0) g += `<circle cx="${x(first)}" cy="${y(series[0].vals[first])}" r="3.5" fill="${series[0].color}"/><text x="${x(first) + 2}" y="${Math.min(H - padB - 4, y(series[0].vals[first]) + 22)}" class="mini__val">${esc(startText)}</text>`;
  if (endText && last >= 0) g += `<circle cx="${x(last)}" cy="${y(series[0].vals[last])}" r="4" fill="${series[0].colorAfter || series[0].color}" stroke="#fff" stroke-width="1.5"/><text x="${x(last) + 2}" y="${y(series[0].vals[last]) - 12}" text-anchor="end" class="mini__val">${esc(endText)}</text>`;
  if (years) g += `<text x="${padL}" y="${H - 4}" class="mini__lab">${esc(years[0])}</text><text x="${W - padR + 4}" y="${H - 4}" text-anchor="end" class="mini__lab">${esc(years[1])}</text>`;
  return `<svg class="mini" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${g}</svg>`;
}
