// fix.js – the document workspace: upload → requirements → analyze → fix → results
import { state, addFiles, analyze, applyPlan, activeFile, propsFor, setRequirements, cancelProcessing, loadPdfLib, BUILTIN_PROFILES, setExam, assignDocTypes, processExam, examLib } from '../app.js';
import { makeZip } from '../lib/zip.js';
import { classifyDocType, requirementsForDoc, matchExam, EXAM_REGISTRY, ALL_DOC_TYPES, DOC_TYPES, zipBaseName } from '../lib/exam.js';
import { emptyRequirements, validateRequirements, interpretWithAIFallback } from '../lib/requirements.js';
import { evaluateCompliance, labelStep, verifyOutput, isReadyToSubmit, STATUS } from '../lib/engine.js';
import { formatBytes, MIME_TO_FORMAT, SUPPORTED_FORMATS } from '../lib/units.js';
import { renderAssistant } from './assistant.js';
import { esc } from './components.js';

let currentMode = 'profiles';
let currentFile = null;

export function renderFix(root) {
  root.innerHTML = `
  <div class="ws container">
    <div class="ws-head">
      <div>
        <h2 class="page-title">Document workspace</h2>
        <p class="page-intro" style="margin:0">Upload a file, set the destination's requirements, and get a submission-ready output – measured, not assumed.</p>
      </div>
      <div class="ws-actions">
        <button class="btn btn-ghost btn-trash" id="clearWs" title="Remove all files and reset the workspace">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9L18 7M10 11v6M14 11v6"/></svg>
          Clear workspace
        </button>
      </div>
    </div>

    <div class="steps-row" role="tablist" aria-label="Workflow steps">
      <button class="step-tab" role="tab" aria-selected="true" data-step="1"><span class="num">1</span><span class="done-ico" aria-hidden="true">&#10003;</span>File</button>
      <button class="step-tab" role="tab" aria-selected="false" data-step="2"><span class="num">2</span><span class="done-ico" aria-hidden="true">&#10003;</span>Requirements</button>
      <button class="step-tab locked" role="tab" aria-selected="false" data-step="3" data-tip="Available after you upload a file" aria-disabled="true"><span class="num">3</span><span class="done-ico" aria-hidden="true">&#10003;</span>Diagnosis &amp; fix</button>
      <button class="step-tab locked" role="tab" aria-selected="false" data-step="4" data-tip="Available after you upload a file" aria-disabled="true"><span class="num">4</span><span class="done-ico" aria-hidden="true">&#10003;</span>Result</button>
    </div>

    <div class="two-col">
      <div class="grid" style="gap:18px">
        <!-- STEP 1: FILE -->
        <div class="card" data-panel="1">
          <h3 style="margin-bottom:14px">Your file</h3>
          <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Upload a file">
            <div class="dz-ico">📄</div>
            <div style="font-weight:600">Drag a file here, or <a href="#" id="pickFile">browse</a></div>
            <div class="hint">JPG · PNG · WebP · PDF – up to 25 MB, processed on this device</div>
          </div>
          <input type="file" id="fileInput" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" class="hidden" />
          <div class="filelist" id="filelist"></div>

          <!-- Exam / portal guided mode -->
          <div class="divider"></div>
          <h4 style="margin:0 0 4px;font-size:14px">Or fix a whole set for an exam / portal</h4>
          <p class="hint" style="margin:0 0 10px">Type the exam or destination. We list the typical documents it needs, match your uploads to each, and flag anything missing so you can decide whether to skip it.</p>
          <div class="exam-fetch-row">
            <div class="field"><label for="examName">Exam / portal name</label>
              <input id="examName" type="text" placeholder="e.g. UPSC CSE, JEE Advanced, or a college portal" /></div>
            <button class="btn btn-primary" id="examLookup">Look up requirements</button>
          </div>
          <div id="examArea" class="hidden" style="margin-top:14px"></div>
        </div>

        <!-- STEP 2: REQUIREMENTS -->
        <div class="card" data-panel="2">
          <h3 style="margin-bottom:14px">What does the destination require?</h3>
          <div class="modes" role="tablist">
            <button class="mode" role="tab" data-mode="profiles" aria-selected="true"><b>Profile</b><span>Pick a starter & edit</span></button>
            <button class="mode" role="tab" data-mode="manual" aria-selected="false"><b>Manual</b><span>Enter limits yourself</span></button>
            <button class="mode" role="tab" data-mode="nl" aria-selected="false"><b>Describe</b><span>Plain-English, auto-parsed</span></button>
          </div>

          <div data-modepanel="profiles">
            <label for="profileSel">Starter profile <span class="muted">(examples, not official standards)</span></label>
            <select id="profileSel">
              <option value="">Choose a starting point</option>
              ${BUILTIN_PROFILES.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
            </select>
            <p class="note" id="profileNote" style="margin-top:12px"></p>
          </div>

          <div data-modepanel="manual" class="hidden">
            ${manualFields()}
          </div>

          <div data-modepanel="nl" class="hidden">
            <label for="nlText">Describe the requirements</label>
            <textarea id="nlText" rows="3" placeholder="e.g. 'A JPEG between 20 KB and 100 KB, 200 by 230 pixels.'"></textarea>
            <div class="hint">Try: "Make this PDF smaller than 500 KB and keep all three pages." Unit ambiguities (px vs mm) are asked about, not guessed.</div>
            <button class="btn btn-soft sm" id="nlParse" style="margin-top:10px">Interpret this</button>
            <p class="hint" id="nlSource" style="margin-top:8px"></p>
          </div>

          <button class="btn btn-primary btn-lg" id="analyzeBtn" style="width:100%; margin-top:8px">Analyze & show fixes</button>
          <p class="note err hidden" id="reqErrors"></p>
        </div>

        <!-- STEP 3: DIAGNOSIS & PLAN -->
        <div class="card" data-panel="3" id="diagCard">
          <h3 style="margin-bottom:4px">Diagnosis & proposed fixes</h3>
          <p class="muted" style="margin-top:0">Measured against the requirements you set.</p>
          <div id="diagBody"></div>
          <div style="display:flex; gap:10px; margin-top:16px; flex-wrap:wrap">
            <button class="btn btn-primary" id="applyBtn">Apply fixes</button>
            <button class="btn btn-ghost hidden" id="cancelBtn">Cancel</button>
          </div>
        </div>

        <!-- STEP 4: RESULT -->
        <div class="card" data-panel="4" id="resultCard"></div>
      </div>

      <!-- SIDE: assistant in a matching glass card so it aligns with the left cards -->
      <div class="grid" style="gap:18px">
        <div class="card side-card">
          <div id="assistantHost"></div>
        </div>
      </div>
    </div>
  </div>`;

  renderAssistant(document.getElementById('assistantHost'));
  wire(root);
}

function manualFields() {
  const opts = (sel, all, extra) => all.map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${m}</option>`).join('') + (extra || '');
  return `
  <div class="field">
    <label for="m_fmt">Allowed formats</label>
    <div class="fmt-chips" id="m_fmt" role="group" aria-label="Allowed formats">
      ${SUPPORTED_FORMATS.map(f => {
        const lbl = f.name === 'jpeg' ? 'JPEG (.jpg)' : f.name === 'pdf' ? 'PDF (.pdf)' : f.name.toUpperCase();
        return `<label class="fmt-chip"><input type="checkbox" class="js-fmt" value="${f.mime}" /><span>${lbl}</span></label>`;
      }).join('')}
    </div>
    <div class="hint">Tick the formats the destination accepts. Leave none ticked = any supported type.</div>
  </div>
  <div class="row">
    <div class="field"><label for="m_target">Output format</label>
      <select id="m_target"><option value="">Keep current</option>
        ${SUPPORTED_FORMATS.map(f => `<option value="${f.name}">${f.name === 'jpeg' ? 'JPEG' : f.name === 'pdf' ? 'PDF' : f.name.toUpperCase()}</option>`).join('')}
      </select>
    </div>
  </div>
  <div class="row">
    <div class="field"><label for="m_max">Max file size</label><input id="m_max" type="text" placeholder="e.g. 100 KB" /><div class="hint">KB or MB – converted to bytes.</div></div>
    <div class="field"><label for="m_min">Min file size</label><input id="m_min" type="text" placeholder="e.g. 20 KB" /></div>
  </div>
  <div class="row">
    <div class="field"><label for="m_tw">Width (px)</label><input id="m_tw" type="number" min="1" placeholder="e.g. 200" /></div>
    <div class="field"><label for="m_th">Height (px)</label><input id="m_th" type="number" min="1" placeholder="e.g. 230" /></div>
    <div class="field"><label for="m_pages">Max pages</label><input id="m_pages" type="number" min="1" placeholder="PDFs only" /></div>
  </div>
  <div class="row">
    <div class="field"><label for="m_dpi">Resolution (DPI)</label><input id="m_dpi" type="number" min="1" placeholder="optional" /><div class="hint">DPI is only reported when it's actually measurable.</div></div>
    <div class="field"><label for="m_pref">Compression preference</label>
      <select id="m_pref"><option value="">Auto</option><option value="smallest">Smallest file</option><option value="balanced">Balanced</option><option value="quality">Best quality</option></select>
    </div>
  </div>
  <div class="field"><label for="m_note">Any other rules (recorded, not auto-checked)</label><input id="m_note" type="text" placeholder="e.g. 'must be a color photo, no border'" /></div>`;
}

function wire(root) {
  const dz = root.querySelector('#dropzone');
  const inp = root.querySelector('#fileInput');
  const pick = root.querySelector('#pickFile');

  pick.addEventListener('click', e => { e.preventDefault(); inp.click(); });
  dz.addEventListener('click', e => { if (e.target === dz || e.target.closest('.dz-ico')) inp.click(); });
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
  ['dragover','dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { e.preventDefault(); handleFiles(e.dataTransfer.files); });
  inp.addEventListener('change', () => { handleFiles(inp.files); inp.value = ''; });

  // modes
  root.querySelectorAll('.mode').forEach(m => m.addEventListener('click', () => {
    currentMode = m.dataset.mode;
    root.querySelectorAll('.mode').forEach(x => x.setAttribute('aria-selected', x === m));
    root.querySelectorAll('[data-modepanel]').forEach(p => p.classList.toggle('hidden', p.dataset.modepanel !== currentMode));
  }));

  // profile select
  root.querySelector('#profileSel').addEventListener('change', e => {
    const p = BUILTIN_PROFILES.find(x => x.id === e.target.value);
    const note = root.querySelector('#profileNote');
    if (p) {
      setRequirements({ ...p.requirements }, [], { profile: p.name, notes: p.notes });
      note.textContent = p.notes;
      note.classList.remove('hidden');
    } else {
      note.classList.add('hidden');
    }
  });

  // NL interpret
  root.querySelector('#nlParse').addEventListener('click', async () => {
    const txt = root.querySelector('#nlText').value.trim();
    const srcEl = root.querySelector('#nlSource');
    if (!txt) { srcEl.textContent = 'Type a description first.'; return; }
    srcEl.textContent = 'Interpreting…';
    const res = await interpretWithAIFallback(txt);
    setRequirements(res.requirements, res.errors || [], { source: res.source === 'ai' ? 'AI interpreter' : 'Built-in rule interpreter', notes: (res.notes || []).join(' · '), ambiguities: res.ambiguities || [] });
    srcEl.textContent = res.source === 'ai'
      ? 'Interpreted with the server AI. Confirm the fields below match what you meant.'
      : 'Interpreted with the built-in rule-based parser (offline). ' + ((res.ambiguities || []).length ? 'Needs clarification: ' + res.ambiguities.join(' ') : 'Read as stated.');
  });

  // analyze
  root.querySelector('#analyzeBtn').addEventListener('click', onAnalyze);
  root.querySelector('#applyBtn').addEventListener('click', onApply);
  root.querySelector('#cancelBtn').addEventListener('click', cancelProcessing);
  root.querySelector('#clearWs').addEventListener('click', clearWorkspace);

  // step tabs
  root.querySelectorAll('.step-tab').forEach(t => t.addEventListener('click', () => showStep(t.dataset.step)));

  renderFileList(root);
  paintDiagEmpty();
  paintResultEmpty();
  updateStepLocks();
  autoAdvance();

  // Exam guided mode
  const examArea = root.querySelector('#examArea');
  const look = root.querySelector('#examLookup');
  look.addEventListener('click', () => onExamLookup(root, examArea));
  root.querySelector('#examName').addEventListener('keydown', e => { if (e.key === 'Enter') onExamLookup(root, examArea); });
  // Re-audit coverage whenever files change in exam mode
  const origRender = renderFileList;
  renderFileList = function(rr) {
    origRender(rr);
    if (state.examMode) renderExamArea(root, examArea);
  };
}

// – – – – – – – – Exam guided mode – – – – – – – –
async function onExamLookup(root, examArea) {
  const name = root.querySelector('#examName').value.trim();
  if (!name) { examArea.classList.remove('hidden'); examArea.innerHTML = '<p class="hint">Enter the exam or destination name first.</p>'; return; }
  examArea.classList.remove('hidden');
  examArea.innerHTML = '<p class="hint">Looking up…</p>';

  const m = matchExam(name);
  let entry = m.match ? EXAM_REGISTRY.find(e => e.id === m.match) : null;

  if (!entry) {
    // No curated match: try a guided page fetch, then fall back to manual.
        const url = prompt('No curated entry for the given name. Paste the URL of the page that lists the upload requirements, or leave blank to enter them manually:', '');
    if (url) {
      examArea.innerHTML = '<p class="hint">Fetching ' + esc(url) + ' …</p>';
      const fetched = await fetchPage(url, name);
      if (fetched.ok) {
        examArea.innerHTML = '<p class="note">Page fetched. Please confirm the required document types below, then upload/assign files.</p>' + examManualDocsHtml(name, fetched.text);
        return;
      }
      examArea.innerHTML = '<p class="note warn">' + esc(fetched.reason) + '</p>' + examManualDocsHtml(name, '');
      return;
    }
    examArea.innerHTML = '<p class="hint">Enter the required documents manually.</p>' + examManualDocsHtml(name, '');
    return;
  }

  // Curated entry
  setExam(entry);
  state.exam.name = name || entry.name;
  renderExamArea(root, examArea);
}

function examManualDocsHtml(name, pageText) {
  // Let the user tick which doc types the destination needs; store locally.
  const types = ALL_DOC_TYPES.map(t => `<label class="check"><input type="checkbox" data-doctype="${t}" class="js-doctype" /> ${DOC_TYPES[t].label} <span class="muted">(${DOC_TYPES[t].mime})</span></label>`).join('');
  return `
    <div>
      <p class="hint">Tick the document types this destination asks for, then upload files and assign each to a type.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${types}</div>
      <button class="btn btn-soft sm js-exam-custom" style="margin-top:10px">Use these types</button>
      ${pageText ? '<p class="hint" style="margin-top:10px">Fetched page text (first 400 chars): ' + esc(pageText.slice(0,400)) + '…</p>' : ''}
    </div>`;
  // wire the checkbox + apply button
  const host = document.getElementById('examArea');
  if (!host) return;
  const applyBtn = host.querySelector('.js-exam-custom');
  if (applyBtn) applyBtn.addEventListener('click', () => {
    const picked = Array.from(host.querySelectorAll('.js-doctype:checked')).map(i => i.dataset.doctype);
    if (!picked.length) { alert('Tick at least one document type.'); return; }
    const entry = {
      id: 'custom-' + Date.now(),
      name: (document.getElementById('examName').value || 'Custom destination').trim(),
      authority: 'Custom / fetched',
      verifyUrl: null,
      disclaimer: 'Custom or fetched requirements – verify each value against the official current notice before submitting.',
      docs: picked.map(t => ({ type: t, label: DOC_TYPES[t].label, mime: DOC_TYPES[t].mime, maxKb: null, minKb: null, note: 'Custom – set the exact limit via Manual/Describe if known.' })),
    };
    setExam(entry);
    renderExamArea(document.getElementById('page'), host);
  });
}

function renderExamArea(root, examArea) {
  if (!state.exam) return;
  const { assignments, missing, required } = assignDocTypes();
  const docLabel = t => { const d = state.exam.docs.find(x => x.type === t); return (d && d.label) || DOC_TYPES[t].label; };

  // Required docs checklist
  let checklist = '<h4 style="margin:0 0 8px;font-size:14px">Required for ' + esc(state.exam.name) + '</h4><div class="filelist" style="margin-bottom:14px">';
  for (const t of required) {
    const covered = assignments.find(a => a.docType === t && !a.deferred);
    const chip = covered ? '<span class="chip ok">matched: ' + esc(covered.fileId ? (state.files.find(f=>f.id===covered.fileId)||{}).name || covered.fileId : ' – ') + '</span>' : '';
    const isMissing = !covered && !assignments.find(a=>a.deferred && a.docType===t);
    if (isMissing) {
      checklist += `<div class="filecard" style="border-left:3px solid var(--warn)">
        <div class="meta"><b>${esc(docLabel(t))}</b>
          <div class="sub">No uploaded file assigned to this yet.</div></div>
        <div style="display:flex;flex-direction:column;gap:6px;min-width:150px">
          <span class="chip warn">missing</span>
          <button class="btn btn-ghost sm js-defer" data-doc="${t}">I have the right format</button>
          <button class="btn btn-ghost sm js-defer2" data-doc="${t}">Skip for now</button>
        </div>
      </div>`;
    } else {
      checklist += `<div class="filecard"><div class="meta"><b>${esc(docLabel(t))}</b></div>${chip}</div>`;
    }
  }
  checklist += '</div>';

  // Assignments (file → doc type)
  let assignRows = assignments.map(a => {
    const f = state.files.find(x => x.id === a.fileId);
    const conf = f && f.docTypeConfidence === 'low' ? '<span class="chip warn">confirm type</span>' : '';
    const opts = required.map(t => `<option value="${t}" ${a.docType===t?'selected':''}>${esc(docLabel(t))}</option>`).join('');
    return `<div class="filecard">
      <div class="meta"><b>${esc(f.name)}</b><div class="sub">${esc(f.mime)} · ${conf ? ' ' + conf : ''}</div></div>
      <select data-assign="${a.fileId}" style="max-width:200px">${opts}</select>
      <button class="btn btn-ghost sm js-defmark" data-file="${a.fileId}">Defer</button>
    </div>`;
  }).join('');
  assignRows = assignRows ? '<h4 style="margin:0 0 8px;font-size:14px">Match your uploads</h4><div class="filelist" style="margin-bottom:14px">' + assignRows + '</div>' : '';

  const deferNote = assignments.filter(a=>a.deferred).length ? '<p class="hint">Deferred documents will be excluded from the ZIP and listed in the notes file.</p>' : '';

  examArea.innerHTML = (state.exam.disclaimer ? '<p class="note warn">ℹ ' + esc(state.exam.disclaimer) + '</p>' : '')
    + checklist + assignRows + deferNote
    + `<button class="btn btn-primary btn-lg js-exam-fix" style="width:100%;margin-top:8px">Fix all & download ${esc(zipBaseName(state.exam.name))}.zip</button>`
    + '<p class="hint" style="margin-top:8px">Each fixed file is named by its document type (photo.jpg, signature.png…). The ZIP is named after the exam. Originals are kept until you clear the workspace.</p>';

  // Wire up: select, defer, fix
  examArea.querySelectorAll('select[data-assign]').forEach(sel => sel.addEventListener('change', () => {
    const f = state.files.find(x => x.id === sel.dataset.assign);
    if (f) { f.docType = sel.value; f.docTypeConfidence = 'confirmed'; }
    renderExamArea(root, examArea);
  }));
  examArea.querySelectorAll('.js-defer,.js-defer2').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.doc;
    const existing = assignments.find(a => a.docType === t);
    if (existing) existing.deferred = true;
    else { assignments.push({ fileId: null, docType: t, deferred: true, reason: b.className.includes('defer2') ? 'skipped for now' : 'already have the right format' }); }
    state._examAssignments = assignments;
    renderExamArea(root, examArea);
  }));
  examArea.querySelectorAll('.js-defmark').forEach(b => b.addEventListener('click', () => {
    const a = (state._examAssignments || assignments).find(x => x.fileId === b.dataset.file);
    if (a) a.deferred = !a.deferred;
    renderExamArea(root, examArea);
  }));
  const fixBtn = examArea.querySelector('.js-exam-fix');
  if (fixBtn) fixBtn.addEventListener('click', () => runExamFix(root, examArea));
}

async function runExamFix(root, examArea) {
  const btn = examArea.querySelector('.js-exam-fix');
  btn.disabled = true; btn.textContent = 'Processing…';
  const status = document.createElement('p'); status.className = 'hint'; status.textContent = 'Working on file 0/0…';
  btn.after(status);
  const out = await processExam((i, total, label) => { status.textContent = 'File ' + (i + 1) + ' of ' + total + ': ' + label; });
  btn.disabled = false; btn.textContent = 'Fix all & download ' + zipBaseName(state.exam.name) + '.zip';
  status.remove();
  if (out.error) { examArea.insertAdjacentHTML('beforeend', '<p class="note err">' + esc(out.error) + '</p>'); return; }

  // Package a ZIP of the fixed files (+ a notes.txt of deferrals & caveats).
  const enc = new TextEncoder();
  const entries = [];
  const notes = [];
  let anyReady = false;
  for (const r of out.results) {
    if (r.error) { notes.push('FAILED: ' + r.originalName + ' (' + r.label + '): ' + r.error); continue; }
    entries.push({ name: r.outName, data: new Uint8Array(await r.blob.arrayBuffer()) });
    notes.push((r.ready ? 'READY' : 'REVIEW') + ' – ' + r.outName + '  (was ' + r.originalName + ')' + (r.warnings && r.warnings.length ? '  [' + r.warnings.join('; ') + ']' : ''));
    if (r.ready) anyReady = true;
  }
  const defers = (state._examAssignments || []).filter(a => a.deferred);
  if (defers.length) notes.push('\nDeferred (not in ZIP): ' + defers.map(a => DOC_TYPES[a.docType].label + ' – ' + (a.reason || 'deferred')).join('; '));
  if (state.exam.disclaimer) notes.push('\nNOTE: ' + state.exam.disclaimer + ' Verify against the current official notice before submitting.');
  entries.push({ name: 'notes.txt', data: enc.encode(notes.join('\n')) });

  const blob = makeZip(entries);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = out.zipName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);

  const sum = document.createElement('p');
  sum.className = 'note ' + (anyReady ? '' : 'warn');
  sum.textContent = 'Downloaded ' + out.zipName + ' with ' + (out.results.filter(r=>!r.error).length) + ' document(s) + notes.txt.'
    + (anyReady ? ' All measurable requirements met on the included files.' : ' Some files are marked REVIEW – open notes.txt before submitting.');
  examArea.insertAdjacentHTML('beforeend', sum.outerHTML || '');
  examArea.appendChild(sum);
}

async function fetchPage(url, exam) {
  try {
    const resp = await fetch('/api/fetchpage', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ url, exam }) });
    if (!resp.ok) {
      return { ok: false, reason: 'The page-fetch service is not available on this host. Enter the requirements manually, or paste them into the Describe box instead.' };
    }
    const d = await resp.json();
    return d;
  } catch {
    return { ok: false, reason: 'The page-fetch service is not available on this host. Enter the requirements manually, or paste them into the Describe box instead.' };
  }
}

// renderFileList is reassigned above via closure; keep the export surface intact


async function handleFiles(files) {
  const root = document.getElementById('page');
  const res = await addFiles(files);
  renderFileList(root);
  autoAdvance();
}

function clearWorkspace() {
  if (currentDownloadUrl) { try { URL.revokeObjectURL(currentDownloadUrl); } catch { } currentDownloadUrl = null; }
  if (state.result && state.result.output && state.result.output.previewUrl) {
    try { URL.revokeObjectURL(state.result.output.previewUrl); } catch { /* noop */ }
  }
  state.files = [];
  state.plan = null;
  state.result = null;
  state.requirements = emptyRequirements();
  state.exam = null; state.examMode = false; state.examResults = null; state._examAssignments = null;
  const root = document.getElementById('page');
  renderFileList(root);
  updateStepLocks();
  const db = document.querySelector('#diagBody'); if (db) db.innerHTML = '';
  const rc = document.querySelector('#resultCard'); if (rc) rc.innerHTML = '';
  paintDiagEmpty();
  paintResultEmpty();
}

function stepDone(n) {
  switch (Number(n)) {
    case 1: return state.files.some(f => f.status === 'ready');
    case 2: return (state.requirements && (Object.values(state.requirements).some(v => v !== null && (Array.isArray(v) ? v.length : true))) || !!state.exam);
    case 3: return !!(state.plan && state.plan.steps.length);
    case 4: return !!state.result;
    default: return false;
  }
}

function showStep(n, opts = {}) {
  const root = document.getElementById('page');
  const nStr = String(n);
  const tab = root.querySelector('.step-tab[data-step="' + nStr + '"]');
  if (tab && tab.classList.contains('locked')) {
    // gently nudge the user to upload a file first
    const dz = root.querySelector('#dropzone');
    if (dz) { dz.classList.add('pulse'); setTimeout(() => dz.classList.remove('pulse'), 1200); }
    return;
  }
  const isDone = { '1': stepDone(1), '2': stepDone(2), '3': stepDone(3), '4': stepDone(4) };

  // 1) highlight the clicked tab + mark finished ones with a check
  root.querySelectorAll('.step-tab').forEach(t => {
    const sel = t.dataset.step === nStr;
    t.setAttribute('aria-selected', sel);
    t.classList.toggle('done', !sel && isDone[t.dataset.step]);
    t.classList.toggle('active', sel);
  });

    // 2) panels 3 & 4 are ALWAYS visible (they carry empty-state messages),
  //    so a tab click always lands on something concrete.
  const diag = root.querySelector('[data-panel="3"]');
  const res = root.querySelector('[data-panel="4"]');
  if (diag) diag.classList.remove('hidden');
  if (res) res.classList.remove('hidden');

  // 3) spotlight the target card and scroll to it
  root.querySelectorAll('[data-panel]').forEach(c => c.classList.remove('focus'));
  const target = root.querySelector('[data-panel="' + nStr + '"]');
  if (target) { target.classList.add('focus'); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

function paintDiagEmpty() {
  const body = document.getElementById('diagBody');
  if (body && !body.children.length) body.innerHTML = '<p class="hint">Nothing to show yet. Upload a file, set the requirements, and click <b>Analyze &amp; show fixes</b> – the diagnosis and fix plan appear here.</p>';
}
function paintResultEmpty() {
  const card = document.getElementById('resultCard');
  if (card && !card.children.length) card.innerHTML = '<p class="hint">No result yet. Once you run <b>Apply fixes</b>, the before/after report and download button appear here.</p>';
}

// Auto-advance: after a file is uploaded -> step 2; after analysis -> step 3; after result -> step 4.
function updateStepLocks() {
  const root = document.getElementById('page');
  const hasFile = state.files.some(f => f.status === 'ready');
  root.querySelectorAll('.step-tab[data-step]').forEach(t => {
    if (t.dataset.step === '3' || t.dataset.step === '4') {
      const wasLocked = t.classList.contains('locked');
      t.classList.toggle('locked', !hasFile);
      t.setAttribute('aria-disabled', String(!hasFile));
      if (wasLocked && hasFile) { t.classList.add('pop'); setTimeout(() => t.classList.remove('pop'), 500); }
    }
  });
}

function autoAdvance() {
  updateStepLocks();
  if (state.result) return showStep('4', { scroll: true });
  if (state.plan) return showStep('3', { scroll: true });
  if (state.files.some(f => f.status === 'ready')) return showStep('2', { scroll: false });
}

function renderFileList(root) {
  const host = root.querySelector('#filelist');
  if (!host) return;
  host.innerHTML = '';
  if (!state.files.length) return;
  for (const f of state.files) {
    const card = document.createElement('div');
    card.className = 'filecard';
    let thumb = '<span>📄</span>';
    if (f.previewUrl) thumb = `<img src="${f.previewUrl}" alt="preview of ${esc(f.name)}" />`;
    else if (f.isPdf) thumb = '<span>PDF</span>';
    const props = f.status === 'ready' ? `<span class="chip info">${esc(f.mime.replace('image/','').replace('application/','').toUpperCase())}</span> ${f.size ? esc(formatBytes(f.size)) : ''} ${f.width ? `· ${f.width}×${f.height}px` : ''} ${f.pageCount ? `· ${f.pageCount} page${f.pageCount>1?'s':''}` : ''} ${f.hasAlpha ? '· transparent' : ''}` : '';
    const statusChip = f.status === 'error' ? '<span class="chip bad">error</span>' : f.status === 'ready' ? '<span class="chip ok">ready</span>' : '<span class="chip info">inspecting…</span>';
    card.innerHTML = `
      <div class="thumb">${thumb}</div>
      <div class="meta">
        <b>${esc(f.name)}</b>
        <div class="sub">${esc(f.size ? formatBytes(f.size) : '')} ${props ? '· ' + props : ''}</div>
      </div>
      ${statusChip}
      ${f.status === 'error' ? `<div style="flex:1"><span class="note err" style="margin:0;font-size:12px">${esc(f.error)}</span></div>` : ''}
      <button class="btn btn-ghost sm" data-remove="${f.id}" aria-label="Remove ${esc(f.name)}">✕</button>`;
    host.appendChild(card);
  }
  host.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
    state.files = state.files.filter(x => x.id !== b.dataset.remove);
    if (state.result) state.result = null;
    if (state.plan) state.plan = null;
    renderFileList(document.getElementById('page'));
    updateStepLocks();
    const diag = document.querySelector('#diagBody');
    const res = document.getElementById('resultCard');
    if (diag) { diag.innerHTML = ''; }
    if (res) { res.innerHTML = ''; }
    paintDiagEmpty();
    paintResultEmpty();
  }));
}

function currentRequirements() {
  if (currentMode === 'manual') {
    const root = document.getElementById('page');
    const q = id => root.querySelector('#' + id).value;
    const num = id => { const v = q(id); return v === '' ? null : Number(v); };
    const bytes = id => { const v = q(id); return v.trim() === '' ? null : parseBytesSafe(v); };
    const req = emptyRequirements();
    const sel = Array.from(root.querySelectorAll('.js-fmt:checked')).map(c => c.value);
    req.allowedMimeTypes = sel.length ? sel : [];
    const t = q('m_target'); if (t) req.targetFormat = t;
    const mx = bytes('m_max'); if (mx != null) req.maximumSizeBytes = mx;
    const mn = bytes('m_min'); if (mn != null) req.minimumSizeBytes = mn;
    const tw = num('m_tw'); if (tw) req.targetWidth = tw;
    const th = num('m_th'); if (th) req.targetHeight = th;
    const pg = num('m_pages'); if (pg) req.maximumPages = pg;
    const dp = num('m_dpi'); if (dp) req.targetDpi = dp;
    const pf = q('m_pref'); if (pf) req.compressionPreference = pf;
    const note = q('m_note'); if (note.trim()) req.additionalConstraints = [note.trim()];
    setRequirements(req, [], { source: 'Manual entry' });
    return req;
  }
  // profiles / nl modes already set state.requirements
  return state.requirements;
}

function parseBytesSafe(v) {
  // reuse units parseByteLimit
  const m = String(v).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb|bytes?|b|k|m|g)?$/);
  if (!m) return null;
  const mult = { byte:1,b:1,kb:1024,k:1024,mb:1048576,m:1048576,gb:1073741824,g:1073741824 }[m[2] || 'byte'];
  return Math.round(parseFloat(m[1]) * mult);
}

async function onAnalyze() {
  const root = document.getElementById('page');
  const f = activeFile();
  if (!f || f.status !== 'ready') {
    const e = root.querySelector('#reqErrors');
    e.textContent = 'Upload a supported, readable file first.';
    e.classList.remove('hidden');
    showStep('1');
    return;
  }
  currentRequirements();
  const v = validateRequirements(state.requirements);
  const errBox = root.querySelector('#reqErrors');
  if (!v.ok || v.requirements === null) {
    errBox.textContent = 'Requirements problem: ' + v.errors.join(' ');
    errBox.classList.remove('hidden');
    return;
  }
  state.requirements = v.requirements;
  errBox.classList.add('hidden');

  analyze();
  showStep('3');
  renderDiagnosis(root, f);
  if (state.plan.steps.length === 0) {
    // nothing to do → show a positive result with the original
    const verify = evaluateCompliance(propsFor(f), state.requirements);
    const fullVerify = verifyOutput(verify, state.requirements);
    state.result = {
      original: { name: f.name, size: f.size, mime: f.mime, width: f.width, height: f.height, pageCount: f.pageCount, hasAlpha: f.hasAlpha },
      output: { name: f.name, mime: f.mime, blob: f.blob, width: f.width, height: f.height, pageCount: f.pageCount, previewUrl: f.previewUrl, size: f.size },
      verify: fullVerify,
      ready: isReadyToSubmit(fullVerify),
      warnings: [], alreadyCompliant: !fullVerify.anyFail,
    };
    showStep('4');
    renderResult(root, state.result);
  }
}

function renderDiagnosis(root, f) {
  const body = root.querySelector('#diagBody');
  if (!body) return;
  body.innerHTML = '';
  const plan = state.plan;
  // compliance table
  const ev = evaluateCompliance(propsFor(f), state.requirements);
  const tbl = document.createElement('div');
  tbl.innerHTML = `
    <table class="ctable"><thead><tr><th>Requirement</th><th>Current file</th><th>Status</th></tr></thead>
    <tbody>
      ${ev.checks.map(c => `<tr><td>${esc(c.label)}</td><td class="mono">${esc(c.detail)}</td><td>${statusChip(c.status)}</td></tr>`).join('')}
    </tbody></table>`;
  body.appendChild(tbl);
  // plan
  if (plan.steps.length) {
    const ph = document.createElement('h4'); ph.textContent = 'Proposed fixes'; ph.style.margin = '18px 0 8px';
    body.appendChild(ph);
    const steps = document.createElement('div');
    steps.className = 'plan-steps';
    steps.innerHTML = plan.steps.map((s, i) => `<div class="pstep"><div class="idx">${i + 1}</div><div>${esc(labelStep(s))}</div></div>`).join('');
    body.appendChild(steps);
    if (plan.risks.length) {
      const rk = document.createElement('p'); rk.className = 'note warn';
      rk.innerHTML = '⚠ <b>Quality notes:</b> ' + plan.risks.map(esc).join('<br>');
      body.appendChild(rk);
    }
  }
  if (plan.note) { const n = document.createElement('p'); n.className = 'note warn'; n.textContent = 'ℹ ' + plan.note; body.appendChild(n); }
  // source badge
  if (state.source) { const s = document.createElement('p'); s.className = 'hint'; s.textContent = 'Requirements from: ' + esc(state.source.profile || state.source.source || 'your input'); body.appendChild(s); }
}

function statusChip(status) {
  const map = { pass: ['status-pass', 'Passed'], fail: ['status-fail', 'Fails'], unknown: ['status-unknown', 'Unknown'], 'n/a': ['status-na', 'Not applicable'] };
  const [cls, txt] = map[status] || map.unknown;
  return `<span class="status-chip ${cls}">${txt}</span>`;
}

async function onApply() {
  const root = document.getElementById('page');
  const applyBtn = root.querySelector('#applyBtn');
  const cancelBtn = root.querySelector('#cancelBtn');
  applyBtn.disabled = true;
  cancelBtn.classList.remove('hidden');
  applyBtn.textContent = 'Processing…';
  const res = await applyPlan(i => {
    const c = root.querySelector('#diagCard');
    if (!c) return;
    let bar = c.querySelector('.progress');
    if (!bar) { bar = document.createElement('div'); bar.className = 'progress'; bar.innerHTML = '<span style="width:0%"></span>'; c.appendChild(bar); }
    bar.querySelector('span').style.width = Math.round(((i + 1)) * 100) + '%';
  });
  cancelBtn.classList.add('hidden');
  applyBtn.disabled = false;
  applyBtn.textContent = 'Apply fixes';
  removeProgress(root);
  if (res && res.error && !res.output) {
    renderResultError(root, res.error);
    showStep('3');
  } else {
    renderResult(root, res);
    showStep('4');
  }
}
function stepLabelAt(i) {
  const step = state.plan && state.plan.steps[i];
  return step ? labelStep(step) : 'working';
}

function removeProgress(root) { root.querySelectorAll('.progress').forEach(b => b.remove()); }

function renderResultError(root, msg) {
  const card = root.querySelector('#resultCard');
  card.classList.remove('hidden');
  const step = msg.match(/^\(\(.+\)\)\)?\s*$/);
  card.innerHTML = `<h3>Processing didn't complete</h3>
    <p class="note err">What went wrong: ${esc(msg)}</p>
    <p class="hint">Common causes: the browser can't encode that output format, the file is corrupt/encrypted, or a dimension target is missing. Your original file is still safe in the workspace.</p>`;
}

let currentDownloadUrl = null;
function renderResult(root, res) {
  if (currentDownloadUrl) { try { URL.revokeObjectURL(currentDownloadUrl); } catch { } currentDownloadUrl = null; }
  const card = root.querySelector('#resultCard');
  card.classList.remove('hidden');
  const o = res.output, orig = res.original;
  const v = res.verify;
  const sizeCh = o.size && orig.size ? ((o.size - orig.size) / orig.size * 100) : 0;
  const sizeText = sizeCh < 0 ? `reduced by ${Math.abs(sizeCh).toFixed(0)}%` : sizeCh > 0 ? `increased by ${sizeCh.toFixed(0)}%` : 'no size change';
  const dimO = orig.width ? `${orig.width}×${orig.height}px` : ' – ';

  const banner = res.ready
    ? `<div class="ready-banner ready-yes">✓ All measurable requirements met. <span style="font-weight:400">Your browser can't confirm a third-party site will accept it – content & uncheckable rules still apply.</span></div>`
    : `<div class="ready-banner ready-no">⚠ Some measurable requirements are still not met or unverifiable – review below before submitting.</div>`;

  currentDownloadUrl = o.blob ? URL.createObjectURL(o.blob) : null;
  const downloadUrl = currentDownloadUrl;

  card.innerHTML = `
    <h3 style="margin-bottom:14px">Result</h3>
    ${banner}
    <div class="report">
      <div class="ba">
        <h4>Before</h4>
        <div class="stat"><span>Name</span><b>${esc(orig.name)}</b></div>
        <div class="stat"><span>Size</span><b class="mono">${esc(formatBytes(orig.size))}</b></div>
        <div class="stat"><span>Format</span><b>${esc((orig.mime||'').replace('image/','').replace('application/',''))}</b></div>
        <div class="stat"><span>Dimensions</span><b class="mono">${dimO}</b></div>
        ${orig.pageCount ? `<div class="stat"><span>Pages</span><b>${orig.pageCount}</b></div>` : ''}
      </div>
      <div class="ba">
        <h4>After</h4>
        <div class="stat"><span>Name</span><b>${esc(o.name)}</b></div>
        <div class="stat"><span>Size</span><b class="mono">${esc(formatBytes(o.size))} <span class="muted">(${esc(sizeText)})</span></b></div>
        <div class="stat"><span>Format</span><b>${esc((o.mime||'').replace('image/','').replace('application/',''))}</b></div>
        <div class="stat"><span>Dimensions</span><b class="mono">${o.width ? o.width + '×' + o.height + 'px' : ' – '}</b></div>
        ${o.pageCount ? `<div class="stat"><span>Pages</span><b>${o.pageCount}</b></div>` : ''}
        ${o.previewUrl ? `<div style="margin-top:12px"><img src="${o.previewUrl}" alt="output preview" style="max-width:100%;border-radius:8px;border:1px solid var(--line)"/></div>` : ''}
      </div>
    </div>

    <h4 style="margin:20px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-3)">Per-requirement check</h4>
    <table class="ctable"><tbody>
      ${v.checks.map(c => `<tr><td>${esc(c.label)}</td><td class="mono">${esc(c.detail)}</td><td>${statusChip(c.status)}</td></tr>`).join('')}
    </tbody></table>

    ${(res.warnings || []).length ? `<div class="note warn">${res.warnings.map(esc).join('<br>')}</div>` : ''}
    ${res.note ? `<div class="note">ℹ ${esc(res.note)}</div>` : ''}
    ${res.alreadyCompliant ? `<div class="note">No changes were needed – this is the original file, already compliant on the measurable requirements.</div>` : ''}

    <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
      ${downloadUrl ? `<a class="btn btn-primary" href="${downloadUrl}" download="${esc(o.name)}">Download ${esc(o.name)}</a>` : ''}
      <button class="btn btn-ghost" id="startAgain">Start again</button>
    </div>`;
  const sa = card.querySelector('#startAgain');
  if (sa) sa.addEventListener('click', () => { clearWorkspace(); });
}
