// profiles.js – user-saved requirement profiles, stored in localStorage only.
import { BUILTIN_PROFILES, emptyRequirements, validateRequirements } from '../lib/requirements.js';
import { SUPPORTED_FORMATS, formatBytes, parseByteLimit } from '../lib/units.js';
import { go } from '../router.js';
import { esc } from './components.js';

const KEY = 'dfx.profiles.v1';

function loadUser() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function saveUser(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { console.warn('Could not save profile:', e); }
}

function sectionLabel(t) {
  return `<div class="doc-section-label">${esc(t)}</div>`;
}

export function renderProfiles(root) {
  const user = loadUser();
  root.innerHTML = `
  <div class="container doc-page">
    <header class="doc-head">
      <h2 class="page-title">Requirements profiles</h2>
      <p class="page-intro">Reusable sets of destination requirements. Saved profiles stay <b>on this device</b> only (your browser's local storage) - you can export or delete them any time. Built-in ones are examples, not official standards.</p>
    </header>

    <div class="row profile-toolbar" style="margin-bottom:22px">
      <button class="btn btn-primary" id="newProfile">New profile</button>
      <button class="btn btn-ghost" id="exportAll">Export all</button>
      <button class="btn btn-ghost" id="importOne">Import JSON</button>
      <input type="file" id="importFile" accept="application/json" class="hidden" />
      <button class="btn btn-ghost" id="wipe" style="color:var(--bad)">Delete all saved</button>
    </div>

    ${sectionLabel('Built-in examples')}
    <div class="profile-grid" style="margin-bottom:30px">
      ${BUILTIN_PROFILES.map(p => builtinCard(p)).join('')}
    </div>

    ${sectionLabel('Your saved profiles (' + user.length + ')')}
    ${user.length ? `<div class="profile-grid" id="userProfiles">${user.map((p,i)=>userCard(p,i)).join('')}</div>` : `<div class="note">No saved profiles yet. Create one from the fix workspace, or import a JSON file above.</div>`}
  </div>`;

  // wire
  root.querySelectorAll('[data-apply]').forEach(b => b.addEventListener('click', () => { go('#/fix'); }));
  root.querySelector('#newProfile').addEventListener('click', () => openEditor(root, null, user));
  root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEditor(root, user[Number(b.dataset.edit)], user)));
  root.querySelectorAll('[data-dup]').forEach(b => b.addEventListener('click', () => {
    const p = JSON.parse(JSON.stringify(user[Number(b.dataset.dup)]));
    p.id = 'u_' + Date.now(); p.name = p.name + ' (copy)';
    user.push(p); saveUser(user); renderProfiles(root);
  }));
  root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    user.splice(Number(b.dataset.del), 1); saveUser(user); renderProfiles(root);
  }));
  root.querySelector('#wipe').addEventListener('click', () => { if (confirm('Delete all saved profiles on this device?')) { saveUser([]); renderProfiles(root); } });
  root.querySelector('#exportAll').addEventListener('click', () => {
    const payload = { profiles: user };
    downloadJson(payload, 'documentfixer-profiles.json');
  });
  const imp = root.querySelector('#importOne'); imp.addEventListener('click', () => root.querySelector('#importFile').click());
  root.querySelector('#importFile').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    file.text().then(txt => {
      try {
        const data = JSON.parse(txt);
        const list = Array.isArray(data) ? data : (data.profiles || []);
        let added = 0;
        for (const raw of list) {
          const v = validateRequirements(raw.requirements || raw);
          if (v.ok) { user.push({ id: 'u_' + Date.now() + '_' + added, name: raw.name || 'Imported profile', requirements: v.requirements, notes: raw.notes, destination: raw.destination, lastVerified: raw.lastVerified }); added++; }
        }
        saveUser(user); renderProfiles(root);
        alert(`Imported ${added} profile(s).`);
      } catch { alert('That file is not a valid DocFix profile JSON.'); }
    });
  });
}

function builtinCard(p) {
  return `<div class="profile-card">
    <div class="p-name">${esc(p.name)}</div>
    <p class="p-label">${esc(p.label)}</p>
    <div class="p-spec">${profileSpecTags(p.requirements)}</div>
    <div class="p-actions"><button class="btn btn-soft sm" data-apply="${p.id}">Use on a new upload</button></div>
  </div>`;
}

function profileSpecTags(r) {
  const bits = [];
  if (r.allowedMimeTypes?.length) bits.push('formats: ' + r.allowedMimeTypes.map(m=>m.replace('image/','').replace('application/','')).join(', '));
  if (r.maximumSizeBytes) bits.push('max ' + formatBytes(r.maximumSizeBytes));
  if (r.targetWidth) bits.push(r.targetWidth + '×' + (r.targetHeight||'?') + 'px');
  if (r.minimumSizeBytes) bits.push('min ' + formatBytes(r.minimumSizeBytes));
  if (r.maximumPages) bits.push('≤ ' + r.maximumPages + ' pages');
  if (r.targetFormat) bits.push('output: ' + r.targetFormat);
  return bits.length ? bits.map(b => `<span class="tag">${esc(b)}</span>`).join('') : '<span class="tag">no constraints set</span>';
}

function userCard(p, i) {
  return `<div class="profile-card">
    <div class="p-name">${esc(p.name)}</div>
    ${p.destination ? `<p class="p-label">Destination: ${esc(p.destination)}</p>` : ''}
    <div class="p-spec">${profileSpecTags(p.requirements)}</div>
    ${p.lastVerified ? `<p class="hint">Last verified: ${esc(p.lastVerified)}</p>` : ''}
    ${p.notes ? `<p class="hint">${esc(p.notes)}</p>` : ''}
    <div class="p-actions">
      <button class="btn btn-soft sm" data-edit="${i}">Edit</button>
      <button class="btn btn-ghost sm" data-dup="${i}">Duplicate</button>
      <button class="btn btn-ghost sm" data-del="${i}" style="color:var(--bad)">Delete</button>
    </div>
  </div>`;
}

function profileReqSummary(r) {
  const bits = [];
  if (r.allowedMimeTypes?.length) bits.push('formats: ' + r.allowedMimeTypes.map(m=>m.replace('image/','').replace('application/','')).join(', '));
  if (r.maximumSizeBytes) bits.push('max ' + formatBytes(r.maximumSizeBytes));
  if (r.targetWidth) bits.push(r.targetWidth + '×' + (r.targetHeight||'?') + 'px');
  if (r.maximumPages) bits.push('≤ ' + r.maximumPages + ' pages');
  if (r.targetFormat) bits.push('→ ' + r.targetFormat);
  return bits.length ? esc(bits.join(' · ')) : '<span class="muted">no constraints set</span>';
}

function openEditor(root, existing, user) {
  const p = existing || { name: '', destination: '', requirements: emptyRequirements(), notes: '', lastVerified: '' };
  const editor = document.createElement('div');
  editor.className = 'card glass-editor';
  editor.style.marginTop = '8px';
  editor.innerHTML = `
    <h3>${existing ? 'Edit' : 'New'} profile</h3>
    <div class="row">
      <div class="field"><label>Name</label><input id="e_name" value="${esc(p.name)}" /></div>
      <div class="field"><label>Destination URL (optional)</label><input id="e_url" type="url" value="${esc(p.destination||'')}" /></div>
      <div class="field"><label>Document type</label><input id="e_doc" value="${esc(p.docType||'')}" placeholder="photo, signature, certificate…" /></div>
      <div class="field"><label>Last verified</label><input id="e_verified" value="${esc(p.lastVerified||'')}" placeholder="e.g. 2026-10-19" /></div>
    </div>
    <div class="row">
      <div class="field" style="flex:2"><label>Allowed formats</label>
        <div class="fmt-chips" id="e_fmt" role="group" aria-label="Allowed formats">
          ${SUPPORTED_FORMATS.map(f => {
            const lbl = f.name === 'jpeg' ? 'JPEG (.jpg)' : f.name === 'pdf' ? 'PDF (.pdf)' : f.name.toUpperCase();
            return `<label class="fmt-chip"><input type="checkbox" class="js-fmt" value="${f.mime}" /><span>${lbl}</span></label>`;
          }).join('')}
        </div>
      </div>
      <div class="field"><label>Max size</label><input id="e_max" value="${p.requirements.maximumSizeBytes?formatBytes(p.requirements.maximumSizeBytes):''}" placeholder="e.g. 500 KB"/></div>
      <div class="field"><label>Width (px)</label><input id="e_w" type="number" value="${p.requirements.targetWidth||''}"/></div>
      <div class="field"><label>Height (px)</label><input id="e_h" type="number" value="${p.requirements.targetHeight||''}"/></div>
      <div class="field"><label>Max pages</label><input id="e_pg" type="number" value="${p.requirements.maximumPages||''}"/></div>
    </div>
    <div class="field"><label>Notes / source of requirements</label><textarea id="e_notes" rows="2">${esc(p.notes||'')}</textarea></div>
    <div class="row" style="margin-top:10px">
      <button class="btn btn-primary" id="e_save">Save</button>
      <button class="btn btn-ghost" id="e_cancel">Cancel</button>
    </div>`;
  (existing ? document.querySelector('#userProfiles') : root.querySelector('.container')).appendChild(editor);
  editor.scrollIntoView({ behavior: 'smooth' });
  editor.querySelector('#e_cancel').addEventListener('click', () => editor.remove());
  editor.querySelector('#e_save').addEventListener('click', () => {
    const q = id => editor.querySelector('#' + id).value;
    const num = id => { const v = q(id); return v === '' ? null : Number(v); };
    const req = emptyRequirements();
    req.allowedMimeTypes = Array.from(editor.querySelectorAll('.js-fmt:checked')).map(c => c.value);
    const mx = parseByteLimit(q('e_max')); if (mx != null) req.maximumSizeBytes = mx;
    const w = num('e_w'); if (w) req.targetWidth = w;
    const h = num('e_h'); if (h) req.targetHeight = h;
    const pg = num('e_pg'); if (pg) req.maximumPages = pg;
    const v = validateRequirements(req);
    if (!v.ok) { alert('Could not save: ' + v.errors.join(', ')); return; }
    const url = q('e_url');
    if (url && !/^https?:\/\//i.test(url)) { alert('Destination URL must start with http:// or https://'); return; }
    const rec = { id: existing ? existing.id : 'u_' + Date.now(), name: q('e_name') || 'Untitled', destination: url, docType: q('e_doc'), lastVerified: q('e_verified'), notes: q('e_notes'), requirements: v.requirements };
    if (existing) Object.assign(existing, rec); else user.push(rec);
    saveUser(user);
    renderProfiles(root);
  });
}

function downloadJson(obj, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
