// landing.js - the "/" page (redesigned: boxed benefits, game-map workflow, clean CTA)
import { go } from '../router.js';

const ICONS = {
  clock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  target: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  refresh: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>',
  doc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  shield: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg>',
  bolt: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
  check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  arrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
};

export function renderLanding(root) {
  root.innerHTML = `
  <!-- HERO -->
  <section class="hero-2">
    <div class="container">
      <div class="hero-grid">
        <div class="hero-copy">
          <span class="pill"><span class="pill-dot"></span> Private by design - files never leave this device</span>
          <h1>Turn any document into a <span class="accent">submission-ready</span> file.</h1>
          <p class="lead">DocFix resizes, compresses and converts photos, signatures and PDFs to match the <b>exact</b> rules of the site you are uploading to, so you stop guessing file sizes, pixels and DPI.</p>
          <div class="hero-actions">
            <button class="btn btn-primary btn-lg" data-action="fix">Fix a document ${ICONS.arrow}</button>
            <a class="btn btn-ghost btn-lg" href="#/help">How it works</a>
          </div>
          <div class="hero-meta">
            <span class="chip ok">${ICONS.check} Runs in your browser</span>
            <span class="chip muted">JPG - PNG - WebP - PDF</span>
            <span class="chip muted">No account</span>
          </div>
        </div>

        <div class="hero-preview" aria-label="Preview of the fix workflow">
          <div class="prev-card">
            <div class="prev-head"><span class="prev-title">photo.jpg</span><span class="chip warn">450 KB</span></div>
            <div class="prev-rows">
              <div class="prev-row"><span>Format</span><span class="chip ok">JPEG</span></div>
              <div class="prev-row"><span>Max size 100 KB</span><span class="chip bad">450 KB</span></div>
              <div class="prev-row"><span>Size 200x230 px</span><span class="chip bad">1200x1600</span></div>
            </div>
            <div class="prev-fix"><span class="prev-fix-label">Applied</span> Resize to 200x230, then compress to 96 KB</div>
            <div class="prev-result"><span class="prev-result-dot"></span> Ready - 96 KB, 200x230, JPEG</div>
          </div>
          <div class="float-chip fc-1">${ICONS.bolt} 5 tools, 1 pass</div>
          <div class="float-chip fc-2">${ICONS.shield} nothing uploaded</div>
        </div>
      </div>
    </div>
  </section>

  <!-- BENEFITS: boxed, aligned, auto-sized icons -->
  <section class="band">
    <div class="container">
      <div class="grid grid-3">
        <div class="feature-card">
          <div class="feature-ico">${ICONS.clock}</div>
          <h3>Save time</h3>
          <p>Upload, analyze, apply and download in a single pass, instead of juggling five different tools.</p>
        </div>
        <div class="feature-card">
          <div class="feature-ico">${ICONS.target}</div>
          <h3>Meet the exact limits</h3>
          <p>Tell DocFix the destination's rules and it measures your file against every one of them, not an approximation.</p>
        </div>
        <div class="feature-card">
          <div class="feature-ico">${ICONS.refresh}</div>
          <h3>No retry loops</h3>
          <p>Fix size, dimensions, format and page count together. No more "upload, reject, resize again".</p>
        </div>
      </div>
    </div>
  </section>

  <!-- WORKFLOW: game-map, zig-zag checkpoints joined by a path -->
  <section class="band band-map">
    <div class="container narrow">
      <div class="center-head">
        <div class="eyebrow">The workflow</div>
        <h2>Four checkpoints, one path</h2>
        <p class="sub">Follow the trail. Each checkpoint is based on what the file <em>actually</em> is, and we don't guess.</p>
      </div>
      <div class="gamemap" role="list">
        ${[
          { n: 1, t: 'Upload', p: 'Drop a JPG, PNG, WebP or PDF. We read its real type, size, pixel dimensions and page count.', ic: ICONS.doc, side: 'l' },
          { n: 2, t: 'Set the requirements', p: 'Pick a profile, enter the limits by hand, or describe them in plain English. Units are asked, not guessed.', ic: ICONS.target, side: 'r' },
          { n: 3, t: 'Diagnose & fix', p: 'Each requirement is marked Passed / Fails / Unknown, and we show the exact fix plan before anything changes.', ic: ICONS.bolt, side: 'l' },
          { n: 4, t: 'Verify & download', p: 'The output is re-measured. Only when every measurable check passes do we label it ready.', ic: ICONS.check, side: 'r' },
        ].map(c => `
          <div class="gm-node ${c.side}" role="listitem">
            <div class="gm-card"><div class="gm-icon">${c.ic}</div><h3>${c.t}</h3><p>${c.p}</p></div>
            <div class="gm-marker"><span>${c.n}</span></div>
          </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- EXAM / BATCH MODE -->
  <section class="band band-dark">
    <div class="container narrow">
      <div class="center-head light">
        <div class="eyebrow light">Batch mode</div>
        <h2>Fixing a whole exam set? Name the exam.</h2>
        <p class="sub">Type the destination and DocFix lists the documents it typically needs, matches your uploads, flags anything missing, and hands you one <span class="kbd">exam-name.zip</span> with files named by type.</p>
      </div>
      <div class="grid grid-3">
        <div class="mini-card"><b>Name the destination</b><p>UPSC, JEE, a college portal, from a curated, user-verifiable list, always with the source shown so you can confirm the current year.</p></div>
        <div class="mini-card"><b>See what's missing</b><p>A checklist of required documents. Anything you haven't uploaded is flagged, and you can defer a doc you already have in the right format.</p></div>
        <div class="mini-card"><b>One ZIP, named files</b><p>Every fixed file is named by type (photo.jpg, signature.png...). A notes file records deferrals and anything needing a human check.</p></div>
      </div>
      <div class="cta-center"><button class="btn btn-light btn-lg" data-action="fix">Try batch mode ${ICONS.arrow}</button></div>
    </div>
  </section>

  <!-- TRUST: two aligned cards -->
  <section class="band">
    <div class="container">
      <div class="grid grid-2">
        <div class="trust-card">
          <div class="feature-ico">${ICONS.shield}</div>
          <h3>Where your files go</h3>
          <p>All inspection, resizing, compression and PDF work happens <b>inside your browser</b>. Files are not uploaded anywhere, and nothing is kept unless you explicitly save a profile on this device.</p>
        </div>
        <div class="trust-card">
          <div class="feature-ico">${ICONS.target}</div>
          <h3>What we can't promise</h3>
          <p>"Ready" means every requirement we can <em>measure</em> has passed. It does not guarantee a third-party site will accept the file; content and uncheckable rules stay yours to verify. Unverifiable items are marked <span class="chip warn">Unknown</span>, never green.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- CTA (tight, consistent spacing above the button) -->
  <section class="band cta-band">
    <div class="container narrow center-head cta-tight">
      <h2>Ready to make your documents pass?</h2>
      <p class="sub">No signup. Your files stay on your device.</p>
      <button class="btn btn-light btn-lg" data-action="fix">Fix a document ${ICONS.arrow}</button>
    </div>
  </section>`;

  root.querySelectorAll('[data-action="fix"]').forEach(b => b.addEventListener('click', () => go('#/fix')));
}
