// County and state outlines (U.S. Census Bureau cartographic boundaries, via the us-atlas package), loaded only when needed.
const FIPS = { '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', 10: 'DE', 11: 'DC', 12: 'FL', 13: 'GA', 15: 'HI', 16: 'ID', 17: 'IL', 18: 'IN', 19: 'IA', 20: 'KS', 21: 'KY', 22: 'LA', 23: 'ME', 24: 'MD', 25: 'MA', 26: 'MI', 27: 'MN', 28: 'MS', 29: 'MO', 30: 'MT', 31: 'NE', 32: 'NV', 33: 'NH', 34: 'NJ', 35: 'NM', 36: 'NY', 37: 'NC', 38: 'ND', 39: 'OH', 40: 'OK', 41: 'OR', 42: 'PA', 44: 'RI', 45: 'SC', 46: 'SD', 47: 'TN', 48: 'TX', 49: 'UT', 50: 'VT', 51: 'VA', 53: 'WA', 54: 'WV', 55: 'WI', 56: 'WY' };
let cache = null;
export function loadPlaces() {
  cache ??= (async () => {
    const [{ default: topo }, { feature }] = await Promise.all([import('us-atlas/counties-10m.json'), import('topojson-client')]);
    const box = (g) => { let w = 180, s = 90, e = -180, n = -90; const walk = (c) => (typeof c[0] === 'number' ? (w = Math.min(w, c[0]), e = Math.max(e, c[0]), s = Math.min(s, c[1]), n = Math.max(n, c[1])) : c.forEach(walk)); walk(g.coordinates); return [w, s, e, n]; };
    const states = feature(topo, topo.objects.states).features.filter((f) => FIPS[f.id]).map((f) => ({ kind: 'state', abb: FIPS[f.id], name: f.properties.name, label: f.properties.name, geom: f.geometry, box: box(f.geometry) }));
    const stName = Object.fromEntries(states.map((s) => [s.abb, s.name]));
    const counties = feature(topo, topo.objects.counties).features.filter((f) => FIPS[f.id.slice(0, 2)]).map((f) => { const abb = FIPS[f.id.slice(0, 2)]; return { kind: 'county', abb, name: f.properties.name, label: `${f.properties.name}${abb === 'LA' ? ' Parish' : /city$/i.test(f.properties.name) ? '' : ' County'}, ${abb}`, stateName: stName[abb], geom: f.geometry, box: box(f.geometry) }; });
    return { states, counties };
  })();
  return cache;
}

const inRing = (pt, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { if ((r[i][1] > pt[1]) !== (r[j][1] > pt[1]) && pt[0] < ((r[j][0] - r[i][0]) * (pt[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; } return c; };
export const inside = (geom, lon, lat) => (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates).some((poly) => inRing([lon, lat], poly[0]) && !poly.slice(1).some((h) => inRing([lon, lat], h)));
const inBox = (b, lon, lat) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
export const within = (place, lon, lat) => inBox(place.box, lon, lat) && inside(place.geom, lon, lat);
export const countyAt = (places, lon, lat) => places.counties.find((c) => within(c, lon, lat)) || null;
export const county = (places, name, abb) => { const n = norm(name); return places.counties.find((c) => c.abb === abb && norm(c.name) === n) || null; };
export const state = (places, abb) => places.states.find((s) => s.abb === abb) || null;

const norm = (s) => String(s).toLowerCase().replace(/\b(county|parish|city of)\b/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// A typed query that names a state or a county ("Ohio", "Loudoun", "Franklin County, OH", "Licking county ohio"). prefer: states to rank first.
export function matchLocal(places, q, prefer = []) {
  const raw = String(q).trim();
  if (/^\d/.test(raw)) return null;
  const st = places.states.find((s) => norm(s.name) === norm(raw) || s.abb.toLowerCase() === raw.toLowerCase());
  if (st) return st;
  // split off a trailing state, as a name or a two-letter code
  let namePart = norm(raw), abb = null;
  const m = raw.match(/^(.*?)[,\s]+([A-Za-z]{2})$/);
  if (m && places.states.some((s) => s.abb === m[2].toUpperCase())) { namePart = norm(m[1]); abb = m[2].toUpperCase(); }
  else { const s2 = places.states.find((s) => namePart.endsWith(` ${norm(s.name)}`)); if (s2) { abb = s2.abb; namePart = namePart.slice(0, -norm(s2.name).length).trim(); } }
  const saidCounty = /\b(county|parish)\b/i.test(raw);
  const hits = places.counties.filter((c) => norm(c.name) === namePart && (!abb || c.abb === abb));
  if (!hits.length) return null;
  if (hits.length === 1 || abb) return hits[0];
  const pref = hits.filter((c) => prefer.includes(c.abb));
  // a bare name shared by several counties is more likely a town unless the word "county" was typed or one is in the map's states
  if (pref.length === 1) return pref[0];
  return saidCounty ? (pref[0] || hits[0]) : null;
}

// Suggestions while typing: states and counties whose name starts with the text (then those that contain it).
export function suggest(places, q, prefer = [], limit = 6) {
  const n = norm(q);
  if (!n || /^\d/.test(q.trim())) return [];
  const score = (pl) => { const nm = norm(pl.kind === 'county' ? `${pl.name} ${pl.abb} ${pl.stateName}` : pl.name), base = norm(pl.name); const at = base.startsWith(n) ? 0 : nm.startsWith(n) ? 1 : nm.includes(` ${n}`) ? 2 : -1; return at < 0 ? -1 : at * 10 + (pl.kind === 'state' ? 0 : 2) + (prefer.includes(pl.abb) ? 0 : 4); };
  return [...places.states, ...places.counties].map((pl) => ({ pl, sc: score(pl) })).filter((x) => x.sc >= 0).sort((a, c) => a.sc - c.sc || a.pl.label.localeCompare(c.pl.label)).slice(0, limit).map((x) => x.pl);
}
