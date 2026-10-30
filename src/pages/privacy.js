export function renderPrivacy(root) {
  const rows = [
    ['Where files are processed', 'By default, <b>all</b> inspection, resizing, compression, and PDF operations run inside your browser on this device. Files are not uploaded to a server, and nothing is retained after you clear the workspace or close the tab. Saved requirement profiles live only in your browser storage and can be deleted from the <a href="#/profiles">Profiles</a> page.'],
    ['Optional AI requirement interpreter', 'If a server with an API key is configured, you may let it interpret <b>your requirement text</b> into structured constraints. Only the short text you type (and minimal non-sensitive metadata) is sent - <b>never the document itself</b>. Without it, an offline rule-based interpreter is used. You decide when this happens.'],
    ['What we do not do', 'No files are used to train models. No third-party upload without explicit, disclosed consent. No scraping of password-protected sites, no bypassing restrictions, and no automatic submission of your files to any portal.']
  ];
  const limits = [
    ['Acceptance is not guaranteed', 'Meeting technical requirements does not mean a website will accept the document. Content, naming, and rules we can\'t measure locally are marked <span class="chip status-unknown">Unknown</span> and remain your responsibility to verify.'],
    ['Formats', 'JPG/PNG/WebP/PDF only. Office documents (DOCX etc.) are not supported yet.'],
    ['DPI', 'We report DPI only when it\'s genuinely measurable; changing a metadata label never adds image detail, and we won\'t claim it did.'],
    ['PDF compression', 'Re-saving and page operations are available; true lossy compression is not. We never claim a size drop that didn\'t happen, and rasterizing pages (which removes text) is always your explicit choice.'],
    ['Quality', 'Compression trades quality for size; we tell you when that\'s happening and keep the original.']
  ];

  root.innerHTML = `
  <div class="container doc-page">
    <header class="doc-head">
      <h2 class="page-title">Privacy &amp; limitations</h2>
      <p class="page-intro">What happens to your files, and what this tool can and cannot guarantee.</p>
    </header>

    <section class="doc-section">
      <div class="doc-section-label">Data &amp; consent</div>
      <div class="doc-rows">
        ${rows.map(([t, p]) => `<div class="doc-row"><h3>${t}</h3><p>${p}</p></div>`).join('')}
      </div>
    </section>

    <section class="doc-section">
      <div class="doc-section-label">Limitations - read this</div>
      <div class="doc-rows">
        ${limits.map(([t, p]) => `<div class="doc-row warn-row"><h3>${t}</h3><p>${p}</p></div>`).join('')}
      </div>
    </section>

    <section class="doc-section">
      <div class="doc-section-label">Stored locally</div>
      <div class="doc-rows">
        <div class="doc-row"><h3>Saved requirement profiles</h3><p>Names, URLs, and your own notes. These are your data on your device - export or delete them anytime from the <a href="#/profiles">Profiles</a> page. Clearing the workspace frees any open files immediately.</p></div>
      </div>
    </section>
  </div>`;
}
