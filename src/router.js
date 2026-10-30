// router.js – tiny hash router + global chrome (brand, dark mode, footer)
import { renderLanding } from './pages/landing.js';
import { renderFix } from './pages/fix.js';
import { renderProfiles } from './pages/profiles.js';
import { renderHelp } from './pages/help.js';
import { renderPrivacy } from './pages/privacy.js';

const routes = {
  '#/': renderLanding,
  '#/fix': renderFix,
  '#/profiles': renderProfiles,
  '#/help': renderHelp,
  '#/privacy': renderPrivacy,
};

export function go(hash) { location.hash = hash; }

const LOGO = `<svg class="mark-icon" width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
  <rect x="3" y="3" width="26" height="26" rx="7" fill="currentColor" opacity="0.14"/>
  <rect x="3" y="3" width="26" height="26" rx="7" stroke="currentColor" stroke-width="1.6" fill="none"/>
  <path d="M11 13.2c2.4-2.6 5.4-3.6 8.2-2.9M21 18.8c-2.4 2.6-5.4 3.6-8.2 2.9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
  <path d="M12.8 16h6.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
</svg>`;


const THEME_KEY = 'docfix.theme'; // 'dark' | 'light' | 'auto'
function osPrefersDark() { return matchMedia('(prefers-color-scheme: dark)').matches; }
function getPref() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'dark' || v === 'light' || v === 'auto') return v;
  } catch {}
  return 'auto';
}
function resolveMode(pref) { return pref === 'auto' ? (osPrefersDark() ? 'dark' : 'light') : pref; }
function applyMode(mode) { document.documentElement.dataset.theme = mode; }




export function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = `
    <a class="brand" href="#/">
      ${LOGO}<span class="brand-name">DocFix</span>
    </a>
    <div class="navlinks">
      <a href="#/fix">Fix</a>
      <a href="#/profiles">Profiles</a>
      <a href="#/help">Help</a>
      <a href="#/privacy">Privacy</a>
      <a class="btn btn-primary cta" href="#/fix">Fix a document</a>
    </div>`;
  // No visible theme control: just apply the saved preference (or follow OS if 'auto').
  const pref = getPref();
  applyMode(resolveMode(pref));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getPref() === 'auto') applyMode(resolveMode('auto'));
  });

  const foot = document.getElementById('foot');
  foot.innerHTML = `
    <div class="foot-left">
      ${LOGO}<span>DocFix</span>
      <span class="foot-note">Document files never leave your device. This tool only measures and rewrites the files you upload, locally in your browser.</span>
      <span class="foot-credit">Built by <b>Dhruv Sharma</b> · Contact: <a href="mailto:weirdodhruv@gmail.com">weirdodhruv@gmail.com</a></span>
    </div>
    <nav class="foot-links" aria-label="Footer">
      <a href="#/fix">Fix a document</a>
      <a href="#/profiles">Profiles</a>
      <a href="#/help">Help</a>
      <a href="#/privacy">Privacy</a>
      <a href="mailto:weirdodhruv@gmail.com">Contact</a>
    </nav>`;
}

export function startRouter() {
  renderNav();
  const onHash = () => {
    const h = location.hash || '#/';
    const fn = routes[h] || renderLanding;
    const root = document.getElementById('page');
    root.innerHTML = '';
    fn(root);
    document.querySelectorAll('.navlinks a[href^="#/"]').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === h);
    });
    window.scrollTo(0, 0);
  };
  window.addEventListener('hashchange', onHash);
  onHash();
}
