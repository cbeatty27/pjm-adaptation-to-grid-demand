import './styles.css';
import { loadAll, loadUS } from './lib/data.js';
import { esc } from './lib/format.js';

const view = document.getElementById('view');
// needsUS routes read the U.S. files, which exist only when the data build included the U.S. pulls.
const routes = {
  findings: { load: () => import('./views/findings.js'), title: 'The story' },
  maps: { load: () => import('./views/maps.js'), title: 'Map and timeline' },
  us: { load: () => import('./views/usdemand.js'), title: 'U.S. demand', needsUS: true },
  usmap: { load: () => import('./views/usmap.js'), title: 'U.S. map and timeline', needsUS: true },
  map: { load: () => import('./views/map.js'), title: 'PJM map and timeline' },
  case: { load: () => import('./views/case.js'), title: 'PJM case study' },
  whatif: { load: () => import('./views/whatif.js'), title: 'What if' },
  data: { load: () => import('./views/explorer.js'), title: 'All the data' },
  sources: { load: () => import('./views/sources.js'), title: 'Sources and method' },
};
let cleanup = null;

function setTab(name) {
  const home = { us: 'data', case: 'data', usmap: 'maps', map: 'maps' }[name] || name;
  document.querySelectorAll('.tabs a').forEach((a) => a.dataset.tab === home ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  document.title = `${routes[name].title} | Grid demand since ChatGPT`;
}

async function render() {
  const { meta } = await loadAll().catch(() => ({ meta: null }));
  const fallback = 'findings';
  const asked = (location.hash.replace(/^#\//, '') || fallback).split('?')[0];
  const key = routes[asked] ? asked : fallback;
  setTab(key);
  if (cleanup) { cleanup(); cleanup = null; }
  view.innerHTML = '<p class="loading">Loading data…</p>';
  try {
    const data = await loadAll();
    const r = routes[key];
    let us = null;
    if (r.needsUS) {
      us = await loadUS();
      if (!us) {
        view.innerHTML = `<div class="errorbox"><h2>The U.S. data has not been built yet</h2>
          <p>This tab needs EIA's national hourly demand, fuel mix and generator inventory. They are added when the data pipeline runs with the U.S. pulls: <code>python3 -m pipeline.fetch_eia</code>, then <code>python3 -m pipeline.build_site_data</code>. The PJM tabs work without them.</p></div>`;
        return;
      }
    }
    const mod = await r.load();
    view.innerHTML = '';
    cleanup = (await mod.mount(view, data, us)) || null;
    view.focus({ preventScroll: true });
    scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="errorbox"><h2>The data could not be loaded</h2><p>${esc(e.message)}</p>
      <p>If you are running the site locally, run the data pipeline first (see the README), or start it with <code>npm run dev:fixtures</code> to preview the layout with synthetic data.</p></div>`;
  }
}

async function chrome() {
  try {
    const { meta } = await loadAll();
    const banner = document.getElementById('banner');
    if (meta.synthetic) {
      banner.hidden = false;
      banner.textContent = 'SYNTHETIC DEVELOPMENT DATA. Every EIA-shaped number on this page is invented for layout testing.';
      document.documentElement.style.setProperty('--banner-h', `${banner.offsetHeight}px`);
    }
  } catch { /* the view shows the error */ }
}

addEventListener('hashchange', render);
chrome();
render();
