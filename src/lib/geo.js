// Where the data center floor area is against where generating capacity was added, by state.
// Plain sums of IM3 building footprints and EIA nameplate MW; nothing is inferred about who uses the power.
import { sum, ymIndex } from './format.js';

export const STATE = { VA: 'Virginia', OH: 'Ohio', IL: 'Illinois', NJ: 'New Jersey', PA: 'Pennsylvania', TX: 'Texas', CA: 'California', GA: 'Georgia', AZ: 'Arizona', OR: 'Oregon', WA: 'Washington', NC: 'North Carolina', MI: 'Michigan', KY: 'Kentucky', WV: 'West Virginia', DE: 'Delaware', TN: 'Tennessee', IA: 'Iowa', NY: 'New York', NV: 'Nevada', UT: 'Utah', NE: 'Nebraska', MD: 'Maryland', IN: 'Indiana' };
export const stateName = (s) => STATE[s] || s;

// op: operating units; winUnits: units that began operating in the window; retired: units retired in the window.
export function geoStats({ US, pjmStates, op, winUnits, retired, dcs }) {
  // PJM view: only states where EIA lists at least 1,000 MW of PJM generators, so a state PJM barely touches is not counted
  const fleetBy = {};
  op.forEach((u) => { fleetBy[u.state] = (fleetBy[u.state] || 0) + (u.mw || 0); });
  const inScope = (st) => US || (pjmStates.has(st) && (fleetBy[st] || 0) >= 1000);
  const bld = dcs.filter((d) => d.type === 'building' && d.lat != null && inScope(d.state_abb));
  const by = {};
  const row = (s) => (by[s] ??= { s, sqft: 0, add: 0, gas: 0, solar: 0, ret: 0 });
  bld.forEach((d) => { row(d.state_abb).sqft += d.sqft || 0; });
  winUnits.filter((u) => inScope(u.state)).forEach((u) => { const r = row(u.state); r.add += u.mw || 0; if (u.group === 'gas') r.gas += u.mw || 0; if (u.group === 'solar') r.solar += u.mw || 0; });
  (retired || []).filter((u) => inScope(u.state)).forEach((u) => { row(u.state).ret += u.mw || 0; });
  const all = Object.values(by), tSq = sum(all.map((r) => r.sqft)), tAdd = sum(all.map((r) => r.add)), tGas = sum(all.map((r) => r.gas));
  const top = all.filter((r) => r.sqft > 0).sort((a, c) => c.sqft - a.sqft).slice(0, 5);
  if (!top.length || !(tSq > 0) || !(tAdd > 0)) return null;
  const lead = top[0];
  // the county with the most floor area, and what was added within 100 km of it
  const cty = {};
  bld.forEach((d) => { const k = `${d.county}|${d.state_abb}`; (cty[k] ??= { k, sqft: 0, lat: 0, lon: 0, n: 0 }); cty[k].sqft += d.sqft || 0; cty[k].lat += d.lat; cty[k].lon += d.lon; cty[k].n++; });
  const h = Object.values(cty).sort((a, c) => c.sqft - a.sqft)[0];
  const hLat = h.lat / h.n, hLon = h.lon / h.n, rad = (x) => (x * Math.PI) / 180;
  const km = (la, lo) => { const a = Math.sin(rad(la - hLat) / 2) ** 2 + Math.cos(rad(hLat)) * Math.cos(rad(la)) * Math.sin(rad(lo - hLon) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(a)); };
  const nearU = winUnits.filter((u) => u.lat != null && km(u.lat, u.lon) <= 100);
  const [cName, cSt] = h.k.split('|');
  const builder = all.slice().sort((a, c) => c.add - a.add)[0];
  const bU = winUnits.filter((u) => u.state === builder.s && u.lat != null);
  return {
    all, top, lead, builder, tSq, tAdd, tGas,
    gasTop: all.filter((r) => r.gas > 0).sort((a, c) => c.gas - a.gas).slice(0, 2),
    hub: { name: cName, st: cSt, lat: hLat, lon: hLon, sqft: h.sqft },
    near: { add: sum(nearU.map((u) => u.mw || 0)), solar: sum(nearU.filter((u) => u.group === 'solar').map((u) => u.mw || 0)), gas: sum(nearU.filter((u) => u.group === 'gas').map((u) => u.mw || 0)) },
    bCenter: bU.length ? { lat: sum(bU.map((u) => u.lat)) / bU.length, lon: sum(bU.map((u) => u.lon)) / bU.length } : null,
  };
}

// The same inputs the map uses, built from the loaded PJM data.
export function pjmGeo(data) {
  const { meta } = data;
  const WIN = ymIndex(meta.window_start.slice(0, 7)), LATEST = ymIndex(meta.plants.snapshot_period);
  const op = data.units.filter((u) => u.state_cls === 'operating');
  const t = (u) => (u.online ? ymIndex(u.online) : null);
  const winUnits = op.filter((u) => { const x = t(u); return x != null && x > WIN && x <= LATEST; });
  const retired = (data.retired || []).filter((r) => r.pjm && r.lat != null && r.lon != null && r.ret && ymIndex(r.ret) > WIN && ymIndex(r.ret) <= LATEST);
  return geoStats({ US: false, pjmStates: new Set(meta.pjm_states_with_eia_plants), op, winUnits, retired, dcs: data.dcs });
}
