import { go } from '../router.js';

const STEPS = [
  ['1', 'You upload', "We read the file's <b>real</b> type from its contents (not just the name), measure its size and, for images, its exact pixel dimensions; for PDFs we count pages and read page sizes. This all runs locally in your browser."],
  ['2', 'You set requirements', 'Three ways: pick a starter profile, fill in limits by hand, or describe them in plain English. The interpreter turns words into a structured, validated list of constraints - and asks you when a unit is ambiguous instead of guessing.'],
  ['3', 'We diagnose', 'Each measurable requirement is compared to your file and marked <span class="chip status-pass">Passed</span> <span class="chip status-fail">Fails</span> <span class="chip status-unknown">Unknown</span>, or not applicable. We then build an ordered plan of the exact operations needed.'],
  ['4', 'You approve the fix', 'You see every transformation and any quality trade-offs before anything changes. Applying runs only the steps needed; the original file is kept.'],
  ['5', 'We verify the output', 'The generated file is <b>re-measured</b> against every requirement. Only when all measured checks pass do we label it ready - and we always note what can\'t be verified here.']
];

const FAQ = [
  ['Q', 'Does it accept my file to the website?', 'No - it makes your file meet the technical requirements you give it. Content, naming, and portal-side rules that can\'t be checked locally are marked unknown. "Ready" means every measurable check passed - not guaranteed acceptance.'],
  ['Q', 'Is my data safe?', 'Processing is in-browser; nothing you upload is sent to a server. Read the <a href="#/privacy">privacy page</a> for the full picture, including the optional AI interpreter.'],
  ['Q', 'What about DOCX or scanned content?', 'Office documents and OCR aren\'t in this build. We say "not supported" rather than pretend. See <a href="#/privacy">limitations</a>.']
];

export function renderHelp(root) {
  root.innerHTML = `
  <div class="container doc-page">
    <header class="doc-head">
      <h2 class="page-title">How DocFix works</h2>
      <p class="page-intro">A short, honest explanation of the workflow and what each step really does to your file.</p>
    </header>

    <section class="doc-section">
      <div class="doc-section-label">The workflow</div>
      <div class="steps-list">
        ${STEPS.map(([n, t, p]) => `
          <div class="step-row">
            <div class="step-badge">${n}</div>
            <div class="step-body"><h3>${t}</h3><p>${p}</p></div>
          </div>`).join('')}
      </div>
    </section>

    <section class="doc-section">
      <div class="doc-section-label">FAQ</div>
      <div class="faq-list">
        ${FAQ.map(([q, h, p]) => `
          <div class="faq-item">
            <div class="faq-q">
              <span class="faq-badge">${q}</span>
              <h3>${h}</h3>
            </div>
            <p class="faq-a">${p}</p>
          </div>`).join('')}
      </div>
    </section>

    <div class="doc-cta">
      <button class="btn btn-primary btn-lg" onclick="location.hash='#/fix'">Open the workspace</button>
    </div>
  </div>`;
}
