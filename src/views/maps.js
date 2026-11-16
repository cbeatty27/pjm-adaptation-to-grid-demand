// One Map tab for both places.
import { mountMap, mount as mountPjm } from './map.js';
import { loadUS } from '../lib/data.js';

let last = null;
export async function mount(root, data) {
  const hasUS = !!data.meta.has_us;
  let cleanup = null, token = 0;
  root.innerHTML = `<div class="mapswitch"><div class="seg" role="group" aria-label="Place">${[['pjm', 'PJM'], ...(hasUS ? [['us', 'Whole U.S.']] : [])].map(([k, l]) => `<button type="button" data-place="${k}">${l}</button>`).join('')}</div></div><div id="mapHost"></div>`;
  const host = root.querySelector('#mapHost');
  async function show(place) {
    const my = ++token;
    last = place;
    root.querySelectorAll('[data-place]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.place === place)));
    if (cleanup) { cleanup(); cleanup = null; }
    // each map gets its own box, so a map still loading can never draw into the one that replaced it
    const box = document.createElement('div');
    box.innerHTML = `<p class="maploading" role="status">Loading the ${place === 'us' ? 'U.S.' : 'PJM'} map…</p>`;
    host.replaceChildren(box);
    let c = null;
    try {
      if (place === 'us') {
        const us = await loadUS();
        if (my !== token) return;
        c = await mountMap(box, data, { scope: 'us', units: us.units, snapshot: data.meta.plants_us.snapshot_period, statusNames: us.statusNames, retired: data.retired });
      } else c = await mountPjm(box, data);
    } catch (err) {
      if (my === token) box.innerHTML = `<p class="maploading" role="alert">The ${place === 'us' ? 'U.S.' : 'PJM'} map could not be loaded (${String(err?.message || err).replace(/[<&]/g, '')}). Reload the page to try again.</p>`;
      return;
    }
    if (my !== token) { c && c(); return; }
    cleanup = c || null;
  }
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-place]'); if (b && b.dataset.place !== last) show(b.dataset.place); });
  await show(last || 'pjm');
  return () => { token++; if (cleanup) cleanup(); };
}
