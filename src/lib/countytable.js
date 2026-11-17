// County ranking: data center building footprint (IM3) against new power plant capacity (EIA-860M) by county,
// for PJM generators and data centers in PJM states. A plain join on state and county name; nothing is inferred.
import { esc, nf0, ymIndex, ymLabel, indexYm } from './format.js';

const key = (st, name) => `${st}|${String(name || '').toLowerCase().replace(/\s+(county|parish)$/, '').replace(/\s+/g, ' ').trim()}`;
const COLS = [
  { k: 'county', label: 'County', num: false },
  { k: 'st', label: 'State', num: false },
  { k: 'sqft', label: 'Data center footprint (sq ft)', num: true },
  { k: 'add', label: 'New power plants (MW)', num: true },
  { k: 'gas', label: 'of which gas (MW)', num: true },
  { k: 'solar', label: 'of which solar (MW)', num: true },
  { k: 'wind', label: 'of which wind (MW)', num: true },
];

export function countyRows(data) {
  const { meta } = data;
  const WIN = ymIndex(meta.window_start.slice(0, 7)), LATEST = ymIndex(meta.plants.snapshot_period);
  // same rule as the map: states where EIA lists at least 1,000 MW of PJM generators, so a state PJM barely touches is left out
  const fleet = {};
  (data.units || []).filter((u) => u.state_cls === 'operating').forEach((u) => { fleet[u.state] = (fleet[u.state] || 0) + (u.mw || 0); });
  const pjmStates = new Set(meta.pjm_states_with_eia_plants.filter((st) => (fleet[st] || 0) >= 1000));
  const by = {};
  const row = (st, name) => (by[key(st, name)] ??= { county: String(name).replace(/\s+(County|Parish)$/i, ''), st, sqft: 0, add: 0, gas: 0, solar: 0, wind: 0 });
  (data.dcs || []).filter((d) => d.type === 'building' && d.county && pjmStates.has(d.state_abb)).forEach((d) => { row(d.state_abb, d.county).sqft += d.sqft || 0; });
  (data.units || []).filter((u) => u.state_cls === 'operating' && u.online && u.county && ymIndex(u.online) > WIN && ymIndex(u.online) <= LATEST).forEach((u) => {
    const r = row(u.state, u.county); r.add += u.mw || 0;
    if (r[u.group] != null && ['gas', 'solar', 'wind'].includes(u.group)) r[u.group] += u.mw || 0;
  });
  return { rows: Object.values(by).filter((r) => r.sqft > 0 || r.add > 0), from: indexYm(WIN + 1), to: meta.plants.snapshot_period };
}

export const toCsv = (rows) => [COLS.map((c) => `"${c.label}"`).join(','), ...rows.map((r) => COLS.map((c) => (c.num ? Math.round(r[c.k]) : `"${String(r[c.k]).replace(/"/g, '""')}"`)).join(','))].join('\n');

export function mountCountyTable(host, data, download) {
  const { rows, from, to } = countyRows(data);
  let sortK = 'sqft', dir = -1, show = 25;
  const draw = () => {
    const sorted = rows.slice().sort((a, b) => {
      const c = COLS.find((x) => x.k === sortK);
      return c.num ? dir * (a[sortK] - b[sortK]) : dir * String(a[sortK]).localeCompare(String(b[sortK]));
    });
    host.innerHTML = `<div class="fig__head"><h3>By county</h3>
        <p class="fig__note">Data center building footprint and power plants that began operating in each county, ${esc(ymLabel(from))} to ${esc(ymLabel(to))}. PJM power plants only; data centers in the states where PJM has at least 1,000 MW of generators (whole states, though PJM covers only part of some). Click a column to sort. ${nf0.format(rows.length)} counties.</p></div>
      <div class="xdl"><button type="button" class="btn" data-ct="csv">Download all counties (CSV)</button></div>
      <div class="fig__table ctable"><table><thead><tr>${COLS.map((c) => `<th scope="col"${c.num ? ' class="num"' : ''}><button type="button" data-sort="${c.k}" aria-sort="${sortK === c.k ? (dir < 0 ? 'descending' : 'ascending') : 'none'}">${esc(c.label)}${sortK === c.k ? (dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>`).join('')}</tr></thead>
      <tbody>${sorted.slice(0, show).map((r) => `<tr>${COLS.map((c) => `<td${c.num ? ' class="num"' : ''}>${c.num ? (r[c.k] ? nf0.format(r[c.k]) : '–') : esc(r[c.k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      ${sorted.length > show ? `<button type="button" class="btn" data-ct="more">Show all ${nf0.format(sorted.length)}</button>` : ''}
      <p class="fig__foot">Counties are matched by name between the IM3 Data Center Atlas and EIA-860M; a county with the same name as a city in Virginia may be combined with it. Footprint is ground area of buildings, not power use.</p>`;
  };
  host.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sort]');
    if (s) { const k = s.dataset.sort; if (k === sortK) dir = -dir; else { sortK = k; dir = COLS.find((c) => c.k === k).num ? -1 : 1; } draw(); host.querySelector(`[data-sort="${k}"]`)?.focus(); return; }
    const b = e.target.closest('[data-ct]');
    if (b?.dataset.ct === 'more') { show = Infinity; draw(); }
    if (b?.dataset.ct === 'csv') download('pjm_counties.csv', toCsv(rows.slice().sort((a, c) => c.sqft - a.sqft)));
  });
  draw();
}
