import maplibregl from 'maplibre-gl';
import { FUEL_COLOR } from '../lib/fuels.js';
import { geoStats, stateName } from '../lib/geo.js';
import { homes } from '../lib/story.js';
import { esc, nf0, mw as fmtMw, ymIndex, indexYm, ymLabel, sum } from '../lib/format.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const BLANK = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e6eef1' } }] };
const INK = '#141b2d';
const DC = '#17404e'; // data center symbols

async function pickStyle() {
  if (new URLSearchParams(location.hash.split('?')[1] || '').get('basemap') === 'none') return { style: BLANK, ok: false };
  try {
    const r = await fetch(STYLE_URL, { method: 'GET' });
    if (r.ok) return { style: STYLE_URL, ok: true };
  } catch { /* fall through */ }
  return { style: BLANK, ok: false };
}

// Data center symbols, one silhouette per IM3 record type so the type reads without color:
// building = rounded square, campus = rounded square with an inner outline, point = diamond.
function dcIcon(kind) {
  const S = 48, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rr = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
  if (kind === 'point') {
    g.translate(S / 2, S / 2); g.rotate(Math.PI / 4);
    const h = 15; g.fillStyle = '#ffffff'; rr(-h - 3, -h - 3, 2 * h + 6, 2 * h + 6, 8); g.fill();
    g.fillStyle = DC; rr(-h, -h, 2 * h, 2 * h, 6); g.fill();
  } else {
    g.fillStyle = '#ffffff'; rr(2, 2, S - 4, S - 4, 14); g.fill();
    g.fillStyle = DC; rr(6, 6, S - 12, S - 12, 10); g.fill();
    if (kind === 'campus') { g.strokeStyle = '#ffffff'; g.lineWidth = 3; rr(15, 15, S - 30, S - 30, 5); g.stroke(); }
  }
  return g.getImageData(0, 0, S, S);
}
const dcGlyph = (kind) => {
  if (kind === 'point') return `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.4" y="2.4" width="7.2" height="7.2" rx="1.6" transform="rotate(45 6 6)" fill="${DC}"/></svg>`;
  if (kind === 'campus') return `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="3" fill="${DC}"/><rect x="3.4" y="3.4" width="5.2" height="5.2" rx="1.2" fill="none" stroke="#fff" stroke-width="1"/></svg>`;
  return `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="3" fill="${DC}"/></svg>`;
};

// Calm the basemap: cool paper land and soft blue water, only where the style has those layers.
function tintBasemap(map) {
  for (const l of map.getStyle().layers || []) {
    try {
      if (l.type === 'background') map.setPaintProperty(l.id, 'background-color', '#eef3f4');
      else if (l.type === 'fill' && l.id === 'water') map.setPaintProperty(l.id, 'fill-color', '#d6e5ec');
    } catch { /* style variant without this property */ }
  }
}

// The same map for two scopes. scope 'pjm': generators reporting PJM as their balancing authority and the
// IM3 records in states where EIA lists PJM generators (optional). scope 'us': every EIA generator in the
// 50 states and every IM3 record.
export function mount(root, data) {
  return mountMap(root, data, { scope: 'pjm', units: data.units, snapshot: data.meta.plants.snapshot_period, statusNames: {}, retired: data.retired ? data.retired.filter((r) => r.pjm) : null });
}

export async function mountMap(root, data, opt) {
  const { meta, dcs } = data;
  const US = opt.scope === 'us';
  const units = opt.units;
  const groups = meta.groups; // [{key,label}]
  const WIN = ymIndex(meta.window_start.slice(0, 7)); // month containing the ChatGPT release
  const LATEST = ymIndex(opt.snapshot);
  const N = LATEST - WIN; // months on the timeline: WIN+1 .. LATEST
  const pjmStates = new Set(meta.pjm_states_with_eia_plants);
  const scopeName = US ? 'U.S.' : 'PJM-area';

  // ---- classify units (EIA's own status text; nothing inferred) ----
  const op = units.filter((u) => u.state_cls === 'operating');
  op.forEach((u) => { u.t = u.online ? ymIndex(u.online) : null; });
  const winUnits = op.filter((u) => u.t != null && u.t > WIN && u.t <= LATEST);
  const fleetUnits = op.filter((u) => u.t != null && u.t <= WIN);
  const undated = op.filter((u) => u.t == null).length;
  const planned = units.filter((u) => u.state_cls === 'planned').length;

  // monthly additions by group, for the ruler and the panel
  const monthly = Array.from({ length: N }, () => Object.fromEntries(groups.map((g) => [g.key, 0])));
  winUnits.forEach((u) => { monthly[u.t - WIN - 1][u.group] += u.mw || 0; });
  const maxMonth = Math.max(1, ...monthly.map((m) => sum(Object.values(m))));

  // Retired generators (EIA-860M "Retired" tab), placed at the plant's coordinates; month index of retirement in .t
  const retired = (opt.retired || []).filter((r) => r.lat != null && r.lon != null && r.ret && ymIndex(r.ret) > WIN && ymIndex(r.ret) <= LATEST).map((r) => ({ ...r, t: ymIndex(r.ret) }));

  const state = { s: N - 1, mode: 'cum', playing: false, showRet: true, fuels: new Set(groups.map((g) => g.key)), showFleet: false, showDc: true, dcPjmOnly: true, dcTypes: new Set(['building', 'campus', 'point']) };

  root.innerHTML = `
    <div class="mapview">
      <div class="mapview__map"><div id="map" role="application" aria-label="Map of ${scopeName} generators and IM3 data center records"></div><div class="map-note" id="mapnote" hidden></div><div class="maplegend" id="maplegend" aria-label="Map legend"></div></div>
      <aside class="mapview__side" aria-label="Summary and layers">
        <section class="side__section" aria-live="polite">
          <h2 id="sumTitle"></h2>
          <div class="side__big num"><span id="sumMw"></span><small>GW</small></div>
          <p class="side__sub" id="sumCtx"></p>
          <p class="side__sub" id="sumSub"></p>
          <ul class="fuelrows" id="fuelRows"></ul>
          <p class="side__sub" id="sumRet"></p>
        </section>
        <section class="side__section">
          <h2>Show on the map</h2>
          <div class="toggles">
            <label class="check"><input type="checkbox" id="lyDc" checked><span>${dcGlyph('building')} Data centers</span></label>
            ${retired.length || opt.retired ? `<label class="check"><input type="checkbox" id="lyRet" checked><span><i class="ringkey"></i> Power plants that closed</span></label>` : ''}
            <label class="check"><input type="checkbox" id="lyFleet"><span><i class="dotkey"></i> Power plants built before ChatGPT</span></label>
          </div>
          <details class="fineprint"><summary>More options and notes</summary>
            <p>Data center record types (from IM3):</p>
            <div class="chips" id="dcTypes" role="group" aria-label="IM3 record types"></div>
            ${US ? '' : `<label class="check" style="margin-top:10px"><input type="checkbox" id="dcPjm" checked><span>Only data centers in PJM states<small>State level only: it includes parts of states outside PJM, and no boundary file is used. Turn it off to see every U.S. record.</small></span></label>`}
            <p id="dcCount"></p>
            <p>Data centers come from the IM3 atlas, which gives no opening date and no power use, so they do not move with the timeline. Symbol size follows floor space. Closed plants are hollow rings, from the “Retired” tab of EIA’s monthly generator file.</p>
            <p>Each power plant dot is one EIA-860M generator ${US ? 'in the 50 states' : 'reporting PJM as its balancing authority'}, placed at the plant’s EIA coordinates. EIA does not report whether a generator serves the grid or a particular customer, so this map does not label that.</p>
            <p id="sideCaveats"></p>
          </details>
        </section>
      </aside>
      <div class="mapview__dock">
        <div class="dock__row">
          <button class="btn" id="play" type="button">Play</button>
          <div class="dock__date num" id="dockDate"></div>
          <div class="seg" role="group" aria-label="Timeline mode">
            <button type="button" data-mode="cum" aria-pressed="true">Everything so far</button>
            <button type="button" data-mode="month" aria-pressed="false">This month only</button>
          </div>
          <span class="dock__hint">Each bar is the power plants that opened that month. Press Play or drag to travel through time.</span>
        </div>
        <div class="ruler" id="ruler" tabindex="0" role="slider" aria-label="Timeline month" aria-valuemin="0" aria-valuemax="${N - 1}"><svg id="rulerSvg" aria-hidden="true"></svg></div>
      </div>
    </div>`;

  const $ = (id) => root.querySelector(`#${id}`);
  $('sideCaveats').innerHTML = `Source: EIA Open Data API, generator inventory snapshot ${esc(opt.snapshot)}. ${nf0.format(undated)} operating units report no operating month and ${nf0.format(planned)} units are planned or under construction; neither appears on the timeline.`;

  // ---- map ----
  const { style, ok } = await pickStyle();
  const map = new maplibregl.Map({ container: root.querySelector('#map'), style, center: US ? [-96.5, 38.6] : [-79.5, 39.8], zoom: US ? 3.4 : 5.2, attributionControl: { compact: true } });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
  if (!ok) { const n = $('mapnote'); n.hidden = false; n.textContent = 'The basemap could not be loaded. Data layers still work.'; }

  const toFc = (arr, props) => ({ type: 'FeatureCollection', features: arr.map((u, i) => ({ type: 'Feature', id: i, properties: props(u, i), geometry: { type: 'Point', coordinates: [u.lon, u.lat] } })) });
  const winFc = toFc(winUnits, (u) => ({ group: u.group, mw: u.mw || 0, t: u.t, k: `${u.plant}|${u.gen}` }));
  const fleetFc = toFc(fleetUnits, (u) => ({ group: u.group, mw: u.mw || 0, k: `${u.plant}|${u.gen}` }));
  const dcFc = toFc(dcs, (u, i) => ({ type: u.type, st: u.state_abb, sqft: u.sqft ?? 0, i }));
  const byWin = new Map(winUnits.map((u) => [`${u.plant}|${u.gen}`, u]));
  const byFleet = new Map(fleetUnits.map((u) => [`${u.plant}|${u.gen}`, u]));
  const retFc = toFc(retired, (u, i) => ({ group: u.group, mw: Math.max(u.mw || 0, 0), t: u.t, i }));

  const colorExpr = ['match', ['get', 'group'], ...groups.flatMap((g) => [g.key, FUEL_COLOR[g.key] || FUEL_COLOR.other]), FUEL_COLOR.other];
  // Circle AREA is proportional to capacity: radius = K * sqrt(MW), with a small floor so 1 MW units stay visible.
  // On the U.S. map the whole scale shrinks when zoomed out (so the dense East stays readable); the legend follows the zoom.
  const K = 0.44, MINR = 1.4, ZOOM_LO = 3, ZOOM_HI = 7, FAR = 0.45;
  const rAt = (f) => ['max', MINR, ['*', K * f, ['sqrt', ['max', ['get', 'mw'], 0]]]];
  const radius = US ? ['interpolate', ['linear'], ['zoom'], ZOOM_LO, rAt(FAR), ZOOM_HI, rAt(1)] : rAt(1);
  const radiusPx = (mw, z) => {
    const s = Math.sqrt(Math.max(mw, 0));
    if (!US) return Math.max(MINR, K * s);
    const t = Math.min(1, Math.max(0, (z - ZOOM_LO) / (ZOOM_HI - ZOOM_LO)));
    const a = Math.max(MINR, K * FAR * s), b = Math.max(MINR, K * s);
    return a + (b - a) * t;
  };
  const iconSizeAt = (k) => ['interpolate', ['linear'], ['sqrt', ['max', ['get', 'sqft'], 0]], 0, 0.34 * k, 500, 0.46 * k, 2000, 0.62 * k, 6000, 0.9 * k];
  const iconSize = US ? ['interpolate', ['linear'], ['zoom'], 3, iconSizeAt(0.6), 7, iconSizeAt(1)] : iconSizeAt(1);

  function applyFilters() {
    if (!map.getLayer('win')) return;
    const T = WIN + 1 + state.s;
    const fuel = ['in', ['get', 'group'], ['literal', [...state.fuels]]];
    const time = state.mode === 'cum' ? ['<=', ['get', 't'], T] : ['==', ['get', 't'], T];
    map.setFilter('win', ['all', time, fuel]);
    map.setFilter('fleet', fuel);
    if (map.getLayer('ret')) {
      map.setFilter('ret', ['all', state.mode === 'cum' ? ['<=', ['get', 't'], T] : ['==', ['get', 't'], T], fuel]);
      map.setLayoutProperty('ret', 'visibility', state.showRet ? 'visible' : 'none');
    }
    map.setLayoutProperty('fleet', 'visibility', state.showFleet ? 'visible' : 'none');
    const dcF = ['all', ['in', ['get', 'type'], ['literal', [...state.dcTypes]]]];
    if (!US && state.dcPjmOnly) dcF.push(['in', ['get', 'st'], ['literal', [...pjmStates]]]);
    map.setFilter('dc', dcF);
    map.setLayoutProperty('dc', 'visibility', state.showDc ? 'visible' : 'none');
  }

  function fitAll(animate) {
    if (US) { map.fitBounds([[-125.5, 24.2], [-66.5, 49.6]], { padding: { top: 20, left: 20, right: 20, bottom: 40 }, animate }); return; }
    const pts = units.filter((u) => u.lat != null && u.lon != null);
    if (!pts.length) return;
    const bb = new maplibregl.LngLatBounds();
    pts.forEach((u) => bb.extend([u.lon, u.lat]));
    map.fitBounds(bb, { padding: { top: 30, left: 30, right: 30, bottom: 50 }, animate, maxZoom: 8 });
  }

  // ---- legend: circle-size scale (same sizes as the dots at the current zoom) and fuel colors ----
  const SCALE = [1, 100, 300, 500, 750, 1000];
  const hasRet = !!opt.retired;
  function drawLegend() {
    const z = map.getZoom ? map.getZoom() : 5;
    const W = 262, x0 = 10, perMw = (W - x0 - 14) / 1000;
    const rMax = radiusPx(1000, z);
    const cy = Math.ceil(rMax) + 3, axisY = cy + Math.ceil(rMax) + 6;
    const H = axisY + 24;
    const parts = [`<line x1="${x0}" x2="${x0 + 1000 * perMw}" y1="${axisY}" y2="${axisY}" stroke="#5b7886" stroke-width="1"/>`];
    for (const mwv of SCALE) {
      const x = x0 + mwv * perMw;
      parts.push(`<circle cx="${x.toFixed(1)}" cy="${cy}" r="${radiusPx(mwv, z).toFixed(2)}" fill="#141b2d"/>`,
        `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${axisY}" y2="${axisY + 6}" stroke="#5b7886"/>`,
        `<text x="${x.toFixed(1)}" y="${axisY + 19}" text-anchor="middle" font-size="11" fill="#454d63">${nf0.format(mwv)}</text>`);
    }
    $('maplegend').innerHTML = `<div class="ml__t">Circles are power plants. Bigger circle, bigger plant (MW).</div>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${parts.join('')}</svg>
      <ul class="ml__fuels">${groups.map((g) => `<li><i style="background:${FUEL_COLOR[g.key]}"></i>${esc(g.label)}</li>`).join('')}</ul>
      <p class="ml__n">${dcGlyph('building')}Data center${hasRet ? '<i class="ring" style="margin-left:14px"></i>Plant that closed' : ''}</p>
      <p class="ml__n">Data centers: IM3 atlas. Power plants: EIA.</p>`;
  }
  drawLegend();
  if (US) map.on('zoom', drawLegend);

  map.on('load', () => {
    if (ok) tintBasemap(map);
    for (const k of ['building', 'campus', 'point']) map.addImage(`dc-${k}`, dcIcon(k), { pixelRatio: 2 });
    map.addSource('fleet', { type: 'geojson', data: fleetFc });
    map.addSource('win', { type: 'geojson', data: winFc });
    map.addSource('dc', { type: 'geojson', data: dcFc });
    map.addSource('ret', { type: 'geojson', data: retFc });
    map.addLayer({ id: 'fleet', type: 'circle', source: 'fleet', paint: { 'circle-color': colorExpr, 'circle-opacity': 0.3, 'circle-radius': radius } });
    map.addLayer({
      id: 'dc', type: 'symbol', source: 'dc',
      layout: { 'icon-image': ['match', ['get', 'type'], 'campus', 'dc-campus', 'point', 'dc-point', 'dc-building'], 'icon-allow-overlap': true, 'icon-size': iconSize },
    });
    map.addLayer({ id: 'ret', type: 'circle', source: 'ret', paint: { 'circle-color': 'rgba(255,255,255,0.35)', 'circle-stroke-color': colorExpr, 'circle-stroke-width': 2.2, 'circle-radius': radius } });
    map.addLayer({ id: 'win', type: 'circle', source: 'win', paint: { 'circle-color': colorExpr, 'circle-opacity': 0.94, 'circle-radius': radius, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2 } });

    fitAll(false);
    applyFilters();

    const pop = new maplibregl.Popup({ closeButton: true, maxWidth: '340px' });
    const show = (e, html) => pop.setLngLat(e.lngLat).setHTML(html).addTo(map);
    const unitHtml = (u) => `<div class="pop"><h4>${esc(u.name || `Plant ${u.plant}`)}</h4><table>
      <tr><td>Generator</td><td>${esc(u.gen)} (EIA plant ${esc(u.plant)})</td></tr>
      <tr><td>Energy source</td><td>${esc(u.src)} (${esc(groups.find((g) => g.key === u.group)?.label)})</td></tr>
      <tr><td>Nameplate</td><td>${esc(fmtMw(u.mw))}</td></tr>
      <tr><td>Operating month</td><td>${esc(u.online ? ymLabel(u.online) : 'not reported')}</td></tr>
      <tr><td>EIA status</td><td>${esc(u.statusdesc || opt.statusNames[u.status] || u.status)}</td></tr>
      <tr><td>EIA sector</td><td>${esc(u.sector || 'n/a')}</td></tr>
      <tr><td>Owner</td><td>${esc(u.entity || 'n/a')}</td></tr>
      <tr><td>Location</td><td>${esc([u.county, u.state].filter(Boolean).join(', '))}</td></tr></table>
      <div class="fine">EIA-860M via the EIA Open Data API. EIA does not report whether this generator serves a data center.</div></div>`;
    for (const [id, lookup] of [['win', byWin], ['fleet', byFleet]]) {
      map.on('click', id, (e) => { const u = lookup.get(e.features[0].properties.k); if (u) show(e, unitHtml(u)); });
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
    }
    map.on('click', 'ret', (e) => {
      const r = retired[e.features[0].properties.i];
      show(e, `<div class="pop"><h4>${esc(r.name || `Plant ${r.plant}`)}</h4><table>
        <tr><td>Generator</td><td>${esc(r.gen)} (EIA plant ${esc(r.plant)})</td></tr>
        <tr><td>Energy source</td><td>${esc(r.src)} (${esc(groups.find((g) => g.key === r.group)?.label)})</td></tr>
        <tr><td>${esc(meta.retired.capacity_basis.replace(/^./, (c) => c.toUpperCase()))}</td><td>${esc(fmtMw(r.mw))}</td></tr>
        <tr><td>Retired</td><td>${esc(ymLabel(r.ret))}</td></tr>
        <tr><td>Operating since</td><td>${esc(r.online ? ymLabel(r.online) : 'not reported')}</td></tr>
        <tr><td>State</td><td>${esc(r.state || 'n/a')}</td></tr></table>
        <div class="fine">EIA-860M monthly generator file, "Retired" tab. Location is the plant's EIA coordinates.</div></div>`);
    });
    map.on('mouseenter', 'ret', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'ret', () => (map.getCanvas().style.cursor = ''));
    map.on('click', 'dc', (e) => {
      const d = dcs[e.features[0].properties.i];
      show(e, `<div class="pop"><h4>${esc(d.name || 'Unnamed record')}</h4><table>
        <tr><td>Operator</td><td>${esc(d.operator || 'not given')}</td></tr>
        <tr><td>County</td><td>${esc(d.county)}, ${esc(d.state_abb)}</td></tr>
        <tr><td>IM3 record type</td><td>${esc(d.type)}</td></tr>
        <tr><td>Footprint</td><td>${d.sqft ? `${nf0.format(d.sqft)} sq ft` : 'not given (point record)'}</td></tr>
        <tr><td>IM3 id</td><td>${esc(d.id)}</td></tr></table>
        <div class="fine">IM3 Open Source Data Center Atlas v2026.11.02, derived from OpenStreetMap. IM3 gives no online date and no power figure.</div></div>`);
    });
    map.on('mouseenter', 'dc', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'dc', () => (map.getCanvas().style.cursor = ''));
    updateDcCount();
  });


  // ---- what the map shows: where the data center floor area is against where capacity was added (static, whole window)
  {
    const G = geoStats({ US, pjmStates, op, winUnits, retired, dcs });
    if (G) {
      const p = (v, t) => (100 * v) / t, same = G.builder.s === G.lead.s;
      const rows = (same ? G.top.slice(0, 2) : [G.lead, G.builder]).map((r) => ({ name: stateName(r.s), a: p(r.sqft, G.tSq), b: p(r.add, G.tAdd), aText: `${nf0.format(p(r.sqft, G.tSq))}%`, bText: `${nf0.format(p(r.add, G.tAdd))}%` }));
      const sec = document.createElement('section');
      sec.className = 'side__section geo';
      sec.innerHTML = `<h2 class="geo__head">${same ? `${esc(stateName(G.lead.s))} has the most data centers and the most new power plants.` : (p(G.lead.sqft, G.tSq) > 50 ? `Most data centers are in ${esc(stateName(G.lead.s))}. Most new power plants are not.` : `${esc(stateName(G.lead.s))} has the most data centers. ${esc(stateName(G.builder.s))} got the most new power plants.`)}</h2>
        <p class="geo__how">${dcGlyph('building')} Squares are data centers mapped in the IM3 Data Center Atlas. <i class="dotkey" style="opacity:1"></i> Circles are power plants that opened since ChatGPT’s release (EIA), colored by fuel.</p>
        <div class="geo__go" role="group" aria-label="Look closer">
          <button type="button" id="geoZoom"><b>${esc(G.hub.name)}, ${esc(G.hub.st)}</b><span>The largest data center building footprint of any county. New gas plants within 100 km: ${nf0.format(G.near.gas)} MW.</span></button>
          ${!same && G.bCenter ? `<button type="button" id="geoZoom2"><b>${esc(stateName(G.builder.s))}</b><span>${nf0.format(p(G.builder.add, G.tAdd))}% of the new power plants${G.gasTop.length === 2 && G.tGas > 0 && (G.gasTop[0].gas + G.gasTop[1].gas) / G.tGas > 0.95 && G.gasTop.some((r) => r.s === G.builder.s) ? `, and with ${esc(stateName(G.gasTop.find((r) => r.s !== G.builder.s)?.s || G.gasTop[1].s))} nearly all of the new gas` : ''}.</span></button>` : ''}
          <button type="button" id="geoAll"><b>${US ? 'The whole U.S.' : 'All of PJM'}</b><span>Zoom back out.</span></button>
        </div>
        <p class="geo__basis">“Data centers” here means the ground area of data center buildings, in square feet, added up by state${US ? '' : ' for the PJM states only'}. It is not how much power they use: the atlas has no power figures and no opening dates. <a href="#/findings">See the shares in the story.</a></p>
        <details class="fineprint"><summary>About these numbers</summary>
          <p>Shares of the ${US ? 'national' : 'PJM-state'} totals for the whole window, ${esc(ymLabel(indexYm(WIN + 1)))} to ${esc(ymLabel(indexYm(LATEST)))}; they do not follow the slider. ${rows.map((r) => `${esc(r.name)}: ${r.aText} of the data center building footprint and ${r.bText} of new power plant capacity.`).join(' ')} ${esc(stateName(G.lead.s))}: ${(G.lead.sqft / 1e6).toFixed(1)}M sq ft and ${nf0.format(G.lead.add)} MW added (${nf0.format(G.lead.gas)} MW gas).${same ? '' : ` ${esc(stateName(G.builder.s))}: ${(G.builder.sqft / 1e6).toFixed(1)}M sq ft and ${nf0.format(G.builder.add)} MW added (${nf0.format(G.builder.gas)} MW gas, ${nf0.format(G.builder.solar)} MW solar); ${nf0.format(G.builder.ret)} MW retired there.`} Within 100 km of ${esc(G.hub.name)} (${(G.hub.sqft / 1e6).toFixed(1)}M sq ft): ${nf0.format(G.near.add)} MW added, ${nf0.format(G.near.solar)} MW of it solar.</p>
          <p>Floor space is IM3 building footprints${US ? '' : ' in states where EIA lists at least 1,000 MW of PJM generators (whole states, though PJM covers only part of some)'}; IM3 gives no dates and no power use. New power plants are EIA nameplate MW of ${US ? '' : 'PJM '}generators that began operating in the window.</p></details>`;
      const side = root.querySelector('.mapview__side');
      side.insertBefore(sec, side.children[0]);
      sec.querySelector('#geoZoom').addEventListener('click', () => map.flyTo({ center: [G.hub.lon, G.hub.lat], zoom: 8.2, essential: false }));
      sec.querySelector('#geoAll').addEventListener('click', () => fitAll(true));
      sec.querySelector('#geoZoom2')?.addEventListener('click', () => map.flyTo({ center: [G.bCenter.lon, G.bCenter.lat], zoom: US ? 5.2 : 6.4, essential: false }));
    }
  }

  // ---- side panel ----
  function renderSummary() {
    const T = WIN + 1 + state.s;
    const tot = Object.fromEntries(groups.map((g) => [g.key, { mw: 0, n: 0 }]));
    for (const u of winUnits) {
      if (state.mode === 'cum' ? u.t <= T : u.t === T) { tot[u.group].mw += u.mw || 0; tot[u.group].n += 1; }
    }
    const all = groups.filter((g) => state.fuels.has(g.key));
    const mwTot = sum(all.map((g) => tot[g.key].mw));
    const nTot = sum(all.map((g) => tot[g.key].n));
    $('sumTitle').textContent = state.mode === 'cum'
      ? `New power plants, Dec 2022 to ${ymLabel(indexYm(T))}`
      : `New power plants in ${ymLabel(indexYm(T))}`;
    $('sumMw').textContent = (mwTot / 1000).toFixed(mwTot >= 100 ? 1 : 2);
    $('sumCtx').textContent = mwTot >= 500 ? `At full output, enough for about ${homes(mwTot)} homes. Most plants run well below full output.` : '';
    $('sumSub').textContent = `${nf0.format(nTot)} generators. Tap a fuel to hide or show it.`;
    if (opt.retired) {
      const rr = (opt.retired || []).filter((r) => r.ret && ymIndex(r.ret) > WIN && (state.mode === 'cum' ? ymIndex(r.ret) <= T : ymIndex(r.ret) === T) && state.fuels.has(r.group));
      $('sumRet').innerHTML = `Closed in the same period: <b>${(sum(rr.map((r) => r.mw)) / 1000).toFixed(1)} GW</b>`;
    }
    // Bars show each fuel's share of all capacity in the period (not relative to the largest fuel, which would
    // pin the biggest fuel at full width), so they move as the slider moves.
    const allMw = Math.max(1, sum(groups.map((g) => tot[g.key].mw)));
    $('fuelRows').innerHTML = groups.map((g) => { const sh = (100 * tot[g.key].mw) / allMw; return `<li><button class="fuelrow" type="button" data-fuel="${g.key}" aria-pressed="${state.fuels.has(g.key)}">
        <i style="background:${FUEL_COLOR[g.key]}"></i><span>${esc(g.label)}</span>
        <span class="bar" title="${sh.toFixed(1)}% of the capacity shown"><b style="width:${sh}%;background:${FUEL_COLOR[g.key]}"></b></span>
        <span class="v">${(tot[g.key].mw / 1000).toFixed(1)}</span><span class="pc">${sh >= 0.5 ? Math.round(sh) : sh > 0 ? '<1' : 0}%</span></button></li>`; }).join('');
  }
  $('fuelRows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fuel]'); if (!b) return;
    const k = b.dataset.fuel;
    state.fuels.has(k) ? state.fuels.delete(k) : state.fuels.add(k);
    renderSummary(); drawRuler(); applyFilters();
  });

  function updateDcCount() {
    const n = dcs.filter((d) => state.dcTypes.has(d.type) && (US || !state.dcPjmOnly || pjmStates.has(d.state_abb))).length;
    $('dcCount').textContent = `${nf0.format(n)} IM3 records shown (of ${nf0.format(dcs.length)}). A campus and the buildings inside it are separate records, so this is not a count of facilities.`;
  }
  $('dcTypes').innerHTML = ['building', 'campus', 'point'].map((t) => `<button class="chip" type="button" data-type="${t}" aria-pressed="true">${dcGlyph(t)}${t}</button>`).join('');
  $('dcTypes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]'); if (!b) return;
    const t = b.dataset.type; state.dcTypes.has(t) ? state.dcTypes.delete(t) : state.dcTypes.add(t);
    b.setAttribute('aria-pressed', String(state.dcTypes.has(t))); applyFilters(); updateDcCount();
  });
  $('lyRet')?.addEventListener('change', (e) => { state.showRet = e.target.checked; applyFilters(); });
  $('lyFleet').addEventListener('change', (e) => { state.showFleet = e.target.checked; applyFilters(); });
  $('lyDc').addEventListener('change', (e) => { state.showDc = e.target.checked; applyFilters(); updateDcCount(); });
  $('dcPjm')?.addEventListener('change', (e) => { state.dcPjmOnly = e.target.checked; applyFilters(); updateDcCount(); });

  // ---- ruler (timeline) ----
  const ruler = $('ruler'), svg = $('rulerSvg');
  const SVGNS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, parent) => { const el = document.createElementNS(SVGNS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); (parent || svg).appendChild(el); return el; };
  let W = 0;
  const H = 92, padL = 6, padR = 6, barTop = 6, barBase = 62;
  function xOf(i) { return padL + ((i + 0.5) * (W - padL - padR)) / N; }
  function drawRuler() {
    if (!W) return;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';
    const bw = Math.max(1, (W - padL - padR) / N - 1.5);
    const scale = (barBase - barTop) / maxMonth;
    for (let i = 0; i < N; i++) {
      let y = barBase;
      const faded = i > state.s;
      for (const g of groups) {
        if (!state.fuels.has(g.key)) continue;
        const h = monthly[i][g.key] * scale;
        if (h <= 0) continue;
        mk('rect', { x: xOf(i) - bw / 2, y: y - h, width: bw, height: h, fill: FUEL_COLOR[g.key], opacity: faded ? 0.25 : 1, stroke: '#fff', 'stroke-width': 0.6, rx: 1 });
        y -= h;
      }
      mk('rect', { x: xOf(i) - bw / 2, y: barBase, width: bw, height: 2, fill: i <= state.s ? INK : '#d3dfe3' });
    }
    // axis: tick per month, label per January and the first month
    for (let i = 0; i < N; i++) {
      const ym = indexYm(WIN + 1 + i);
      const jan = ym.endsWith('-01');
      mk('line', { x1: xOf(i), x2: xOf(i), y1: barBase + 2, y2: barBase + (jan ? 9 : 5), stroke: '#5b7886', 'stroke-width': 1 });
      if (i === 0) { const t = mk('text', { x: padL, y: barBase + 22, 'text-anchor': 'start' }); t.textContent = ymLabel(ym); }
      else if (jan && i > 4) { const t = mk('text', { x: xOf(i), y: barBase + 22, 'text-anchor': 'middle' }); t.textContent = ym.slice(0, 4); }
    }
    // playhead
    const x = xOf(state.s);
    mk('line', { x1: x, x2: x, y1: 0, y2: barBase + 10, stroke: INK, 'stroke-width': 2 });
    mk('path', { d: `M${x - 6},${barBase + 10} L${x + 6},${barBase + 10} L${x},${barBase + 2} Z`, fill: INK });
  }
  new ResizeObserver(() => { W = ruler.clientWidth; drawRuler(); }).observe(ruler);

  function setS(s, { fromPlay = false } = {}) {
    state.s = Math.max(0, Math.min(N - 1, s));
    const ym = indexYm(WIN + 1 + state.s);
    $('dockDate').textContent = ymLabel(ym);
    ruler.setAttribute('aria-valuenow', String(state.s));
    ruler.setAttribute('aria-valuetext', ymLabel(ym));
    if (!fromPlay && state.playing) stop();
    renderSummary(); drawRuler(); applyFilters();
  }
  const sFromEvent = (e) => { const r = ruler.getBoundingClientRect(); return Math.round(((e.clientX - r.left - padL) / (r.width - padL - padR)) * N - 0.5); };
  let dragging = false;
  ruler.addEventListener('pointerdown', (e) => { dragging = true; ruler.setPointerCapture(e.pointerId); setS(sFromEvent(e)); ruler.focus(); });
  ruler.addEventListener('pointermove', (e) => { if (dragging) setS(sFromEvent(e)); });
  ruler.addEventListener('pointerup', () => { dragging = false; });
  ruler.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 12 : 1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setS(state.s - step); e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setS(state.s + step); e.preventDefault(); }
    else if (e.key === 'Home') { setS(0); e.preventDefault(); }
    else if (e.key === 'End') { setS(N - 1); e.preventDefault(); }
    else if (e.key === ' ') { state.playing ? stop() : play(); e.preventDefault(); }
  });

  // ---- play ----
  let timer = null, speed = 450;
  function stop() { state.playing = false; clearInterval(timer); $('play').textContent = 'Play'; }
  function play() {
    if (state.s >= N - 1) setS(0, { fromPlay: true });
    state.playing = true; $('play').textContent = 'Pause';
    timer = setInterval(() => { if (state.s >= N - 1) { stop(); return; } setS(state.s + 1, { fromPlay: true }); }, speed);
  }
  $('play').addEventListener('click', () => (state.playing ? stop() : play()));
  root.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
    speed = Number(b.dataset.speed);
    root.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (state.playing) { stop(); play(); }
  }));
  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    root.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderSummary(); applyFilters();
  }));

  setS(N - 1);
  return () => { stop(); map.remove(); };
}
