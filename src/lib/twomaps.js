// Two small maps on one scale: where demand grew (by PJM utility territory, placed in its main state) and where new power
// was built (average output of plants opened since the release, by state). Outlines are the Census state boundaries.
import { loadPlaces } from './places.js';
import { esc } from './format.js';

const PJM = new Set(['DE', 'DC', 'IL', 'IN', 'KY', 'MD', 'MI', 'NJ', 'NC', 'OH', 'PA', 'VA', 'WV']);
// where each state's circle sits
const AT = { VA: [-78.4, 37.55], OH: [-82.7, 40.3], WV: [-80.6, 38.65], IL: [-89.0, 40.6], KY: [-84.8, 37.6], MD: [-76.75, 39.3], NJ: [-74.55, 40.1], DE: [-75.45, 38.85], PA: [-77.4, 40.95], NC: [-78.0, 36.0], IN: [-86.2, 39.9], MI: [-84.8, 42.4] };
const NAME = { VA: 'Virginia', OH: 'Ohio', IL: 'Illinois', PA: 'Pennsylvania', IN: 'Indiana', KY: 'Kentucky', WV: 'W. Va.', MD: 'Maryland', NJ: 'N.J.', NC: 'N. Carolina', MI: 'Michigan', DE: 'Del.' };
// which side a small circle's label goes on, to keep labels apart
const SIDE = { IN: 'b', PA: 't', WV: 'l', KY: 'b', IL: 'b', MD: 'b', VA: 'r', NC: 'r', NJ: 'r', DE: 'r', MI: 't' };
const W = 460, H = 300, X0 = -91.4, X1 = -73.4, Y0 = 35.4, Y1 = 42.5, K = Math.cos((39 * Math.PI) / 180);
const S = Math.min(W / ((X1 - X0) * K), H / (Y1 - Y0));
const P = ([lo, la]) => [(lo - X0) * K * S, (Y1 - la) * S];
const pathOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((poly) => poly.map((r) => `M${r.map((c) => P(c).map((v) => v.toFixed(1)).join(' ')).join('L')}Z`).join('')).join('');
const T = (x, y, t, o = {}) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${o.a || 'middle'}" font-size="${o.fs || 13}" font-weight="${o.w || 600}" fill="${o.c || '#141b2d'}"${o.halo === false ? '' : ' paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round"'}>${esc(t)}</text>`;

// dem, made: { ST: MW } ; returns the HTML for both maps and the size key
export async function twoMaps(dem, made) {
  const { states } = await loadPlaces();
  const all = [...Object.values(dem), ...Object.values(made)].filter((v) => v > 0);
  const MAX = Math.max(...all, 1), R = (v) => 44 * Math.sqrt(v / MAX);
  const map = (vals, color, label, tint) => {
    let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(label)}"><g><rect width="${W}" height="${H}" rx="12" fill="#fbfbfd"/>`;
    states.forEach((s) => {
      const [w, so, e, n] = s.box;
      if (e < X0 - 2 || w > X1 + 2 || n < Y0 - 2 || so > Y1 + 2) return;
      const inP = PJM.has(s.abb);
      g += `<path d="${pathOf(s.geom)}" fill="${inP ? (tint.includes(s.abb) ? '#dde2f8' : '#eceef4') : '#fbfbfd'}" stroke="${inP ? '#c7ccd9' : '#e8eaef'}" stroke-width="1"/>`;
    });
    const items = Object.entries(vals).filter(([s, v]) => v > 25 && AT[s]).sort((a, b) => b[1] - a[1]);
    items.forEach(([s, v]) => { const [cx, cy] = P(AT[s]); g += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${Math.max(3.5, R(v)).toFixed(1)}" fill="${color}" fill-opacity=".9" stroke="#fff" stroke-width="2"/>`; });
    items.forEach(([s, v]) => {
      const [cx, cy] = P(AT[s]), r = Math.max(3.5, R(v)), gw = (v / 1000).toFixed(1);
      if (r >= 19) { g += T(cx, cy + 6, gw, { fs: r > 34 ? 19 : 15, w: 800, c: '#fff', halo: false }) + T(cx, cy - r - 7, NAME[s], { fs: 14, w: 700 }); return; }
      if (v < 140) return;
      const sd = SIDE[s] || 'r', txt = `${NAME[s]} ${gw}`;
      if (sd === 'r') g += T(cx + r + 5, cy + 4.5, txt, { a: 'start' });
      if (sd === 'l') g += T(cx - r - 5, cy + 4.5, txt, { a: 'end' });
      if (sd === 't') g += T(cx, cy - r - 6, txt);
      if (sd === 'b') g += T(cx, cy + r + 15, txt);
    });
    return `${g}</g></svg>`;
  };
  const top2 = Object.entries(dem).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s);
  let key = '<svg class="twomaps__key" viewBox="0 0 230 100" role="img" aria-label="Circle sizes: 0.5, 1 and 3 GW, the same on both maps">';
  let x = 4;
  [[500, '0.5 GW'], [1000, '1 GW'], [3000, '3 GW']].forEach(([v, t]) => { const r = R(v); key += `<circle cx="${(x + r).toFixed(1)}" cy="${(84 - r).toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="#6b7389" stroke-width="1.5"/><text x="${(x + r).toFixed(1)}" y="98" text-anchor="middle" font-size="12" fill="#454d63">${t}</text>`; x += 2 * r + 22; });
  key += '</svg>';
  return `<div class="twomaps"><div><h4><i style="background:#2b44d8"></i>Where demand grew</h4>${map(dem, '#2b44d8', 'Where demand grew', top2)}</div>
    <div><h4><i style="background:#141b2d"></i>Where new power was built</h4>${map(made, '#141b2d', 'Where new power was built', [])}</div></div>
    <div class="mapkey">${key}<span>Same scale on both maps. Average power in GW: growth in electricity use, and what plants opened since December 2022 deliver.</span></div>`;
}
