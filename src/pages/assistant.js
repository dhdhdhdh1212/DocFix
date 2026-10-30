// assistant.js – "Fix Assistant". Answers strictly from: current file metadata,
// validated requirements, known capabilities, actual results, and stated
// limitations. No fabricated knowledge, no pretending to see files.
import { state, activeFile, propsFor, BUILTIN_PROFILES } from '../app.js';
import { evaluateCompliance, labelStep, STATUS } from '../lib/engine.js';
import { formatBytes, MIME_TO_FORMAT, SUPPORTED_FORMATS } from '../lib/units.js';
import { esc } from './components.js';

export function renderAssistant(host) {
  host.innerHTML = `
  <div class="assistant">
    <div class="assistant-head"><div class="icon-badge" style="margin:0;width:28px;height:28px;font-size:14px">✦</div><div><b>Fix Assistant</b><div class="hint">Answers only from your file's real data – it never guesses.</div></div></div>
    <div class="assistant-body" id="asBody"></div>
    <div class="as-input-row">
      <input id="asInput" type="text" placeholder="e.g. Why is my file being rejected?" aria-label="Ask the assistant" />
      <button class="btn btn-primary as-send" id="asSend">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        Send
      </button>
    </div>
    <div class="as-quick">
      ${['Why is it being rejected?', 'Which requirements are unmet?', 'Can it get smaller?', 'What can it fix?'].map(q => `<button class="btn btn-ghost sm" data-ask="${esc(q)}" style="padding:5px 11px">${esc(q)}</button>`).join('')}
    </div>
  </div>`;
  const body = host.querySelector('#asBody');
  say(body, "Hi – I work from the file you've uploaded and the requirements you set. I report facts (what I measured), your requirements, and my suggestions – and I say when something can't be checked. Ask me anything about your document.");
  host.querySelector('#asSend').addEventListener('click', () => ask(host, body, host.querySelector('#asInput').value));
  host.querySelector('#asInput').addEventListener('keydown', e => { if (e.key === 'Enter') ask(host, body, e.target.value); });
  host.querySelectorAll('[data-ask]').forEach(b => b.addEventListener('click', () => ask(host, body, b.dataset.ask)));
}

function say(body, text, tag) {
  const m = document.createElement('div');
  m.className = 'msg bot';
  m.innerHTML = (tag ? `<span class="tag">${esc(tag)}</span>` : '') + text;
  body.appendChild(m);
  body.scrollTop = body.scrollHeight;
  return m;
}
function userMsg(body, text) {
  const m = document.createElement('div');
  m.className = 'msg user'; m.textContent = text;
  body.appendChild(m); body.scrollTop = body.scrollHeight;
}

function ask(host, body, q) {
  q = (q || '').trim();
  if (!q) return;
  userMsg(body, q);
  const t = q.toLowerCase();
  const f = activeFile();

  if (!f || f.status !== 'ready') {
    return say(body, 'I can only analyze files that are loaded and readable. Right now there\'s <b>no usable file in the workspace</b> – upload one first and I\'ll work from its real data.', 'No file loaded');
  }

  const p = propsFor(f);
  const req = state.requirements;
  const ev = evaluateCompliance(p, req);
  const fails = ev.checks.filter(c => c.status === STATUS.FAIL);
  const unknowns = ev.checks.filter(c => c.status === STATUS.UNKNOWN);

  if (/reject|fail|wrong|error|not|unmet|what.*(missing|missing)/.test(t) || /which.*requirement/.test(t)) {
    if (fails.length === 0 && unknowns.length === 0) {
      const msg = `<b>Facts:</b> measured against your requirements, this file fails <b>none</b> of the measurable checks. <b>Unverified:</b> nothing flagged unknown here, but any requirement not in your input (e.g. content rules) can't be checked – a website may still reject on criteria outside these.`;
      return say(body, msg, 'Unmet requirements');
    }
    return say(body, `<b>Measured failures:</b><br>` + fails.map(c => `• ${esc(c.label)} – ${esc(c.detail)}`).join('<br>') + (unknowns.length ? `<br><b>Unverifiable:</b> ${unknowns.map(c => esc(c.label)).join(', ')}` : ''), 'Unmet requirements');
  }
  if (/small|compress|size|kb|mb|big|weight/.test(t)) {
    const canShrink = p.isImage ? 'Yes – I can adaptively compress (and downscale) until it hits a byte target, then report the real size.'
      : p.isPdf ? 'Re-saving can reduce some PDFs; a hard byte cap may need page extraction or (your call) rasterizing pages, which drops selectable text.'
      : 'I can inspect size, but not modify it.';
    return say(body, `<b>Current:</b> ${esc(formatBytes(p.size))}. ${canShrink} I never claim a target size before measuring the output.`, 'File size');
  }
  if (/can.*(fix|do|make)|what.*(fix|do|capable)|capable|ops/.test(t)) {
    return say(body, `<b>It can:</b> ${SUPPORTED_FORMATS.map(s => esc(s.name)).join(', ')} files – resize to exact/max dimensions, aspect-crop, compress to a target size, convert formats (incl. image→PDF), and limit PDF page count. It <b>cannot</b>: edit PDF text, OCR, or verify portal content rules.`, 'Capabilities');
  }
  if (/dimension|px|pixel|size.*(image)|ratio/.test(t)) {
    return say(body, `<b>Facts:</b> this ${p.isImage ? `image is ${p.width}×${p.height}px${p.hasAlpha ? ' with transparency' : ''}` : p.isPdf ? `PDF has ${p.pageCount} page(s)` : 'file'} at ${esc(formatBytes(p.size))}. <b>Your requirement</b> asks for ${req.targetWidth ? req.targetWidth + '×' + req.targetHeight + 'px' : 'no exact dimension'}. ${p.isImage && req.targetWidth ? (p.width === req.targetWidth && p.height === req.targetHeight ? 'It already matches.' : 'I can resize/crop to match – check the preview before applying.') : ''}`, 'Dimensions');
  }
  if (/pdf/.test(t) && p.isPdf) {
    return say(body, `<b>Facts:</b> ${p.pageCount}-page PDF, ${esc(formatBytes(p.size))}. I can render page previews, extract a page range, rotate pages, merge PDFs, and re-save. True lossy compression isn't available in-browser, so I won't claim a size drop unless the re-save actually shrinks it.`, 'PDF');
  }
  if (/why|how|rejection/.test(t)) {
    return say(body, 'Sites usually reject uploads for: wrong format, over the size limit, wrong dimensions/aspect, too many pages, or content rules. <b>I checked yours:</b> ' + (fails.length ? fails.map(c => esc(c.label)).join(', ') + ' <b>fail</b> now' : 'no measurable failures so far') + '. Fix the measurable ones, and the "Unknown" ones you must confirm on the portal.', 'Why rejected');
  }
  return say(body, `<b>Current state:</b> ${esc(f.name)} · ${esc(formatBytes(p.size))} · ${esc((p.mime||'').split('/')[1]||'')}. Measured failures: ${fails.length ? fails.map(c => esc(c.label)).join(', ') : 'none'}. Unverifiable: ${unknowns.length ? unknowns.map(c => esc(c.label)).join(', ') : 'none'}. Ask about size, dimensions, format, pages, or what I can fix.`, 'Summary');
}
