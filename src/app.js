// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
// app.js – DocFix SPA shell: router, shared state, workspace orchestration.
// Pure ESM, no build step. UI components live in src/pages/*.
// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
import { emptyRequirements, validateRequirements, interpretWithAIFallback, BUILTIN_PROFILES } from './lib/requirements.js';
import { evaluateCompliance, buildPlan, verifyOutput, isReadyToSubmit, labelStep, STATUS } from './lib/engine.js';
import { detectMime, isSupportedMime, formatBytes, extToMime, verifyOutputMime, SUPPORTED_FORMATS, MIME_TO_FORMAT } from './lib/units.js';
import { measureImageDims, imageToCanvas, adaptiveCompress, flattenAlpha } from './lib/capabilities.js';

// Lazy-load PDF libraries (used only when a PDF is involved)
let _pdfLib;
export async function loadPdfLib() {
  if (!_pdfLib) _pdfLib = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/build/pdf-lib.min.js');
  return _pdfLib;
}
// pdf.js is loaded lazily inside addFiles/inspectPdfSafe only when a PDF is present.
export let _pdfJs;

// Useful, non-sensitive diagnostics: log processing lifecycle events only.
export function logDiagnostics(msg) {
  if (typeof console !== 'undefined') console.debug('[DocFix]', msg);
}

export const state = {
  files: [],          // {id, name, size, mime, isImage, isPdf, props, blob, previewUrl, status, error, docType?}
  requirements: emptyRequirements(),
  reqErrors: [],
  source: null,       // {profile, url, docType, notes, lastVerified}
  profileId: null,
  plan: null,
  result: null,
  processing: false,
  cancelRequested: false,
  // Exam-mode state
  exam: null,         // {id, name, authority, docs:[{type,label,...}], disclaimer}
  examMode: false,
  assignments: [],    // [{fileId, docType, deferred:bool, reason}]
  examResults: null,  // [{docType, label, originalName, blob, name, verify, ready}]
};

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file resource limit

let fileSeq = 0;

/** Inspect an uploaded File into our internal representation. */
export async function addFiles(fileList) {
  const arr = Array.from(fileList || []);
  const out = [];
  for (const f of arr) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const sig = new Uint8Array(await f.slice(0, 8).arrayBuffer());
    const det = detectMime(ext, f.type, sig);
    const mime = det.mime;
    const rec = {
      id: 'f' + (++fileSeq),
      name: f.name,
      size: f.size,
      mime,
      detected: det,
      blob: f,
      file: f,
      status: 'inspecting',
      error: null,
      previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
      props: null,
    };

    if (f.size === 0) { rec.status = 'error'; rec.error = 'The file is empty (0 bytes).'; out.push(rec); continue; }
    if (f.size > MAX_FILE_BYTES) { rec.status = 'error'; rec.error = `File is ${formatBytes(f.size)} – above the ${formatBytes(MAX_FILE_BYTES)} per-file limit.`; out.push(rec); continue; }
    if (!isSupportedMime(mime)) {
      rec.status = 'error';
      rec.error = `Detected type ${mime || 'unknown'} is not supported yet. DocFix currently works with JPG, PNG, WebP and PDF.`;
      out.push(rec); continue;
    }

    if (mime === 'application/pdf') {
      rec.isPdf = true;
      try {
        const data = new Uint8Array(await f.arrayBuffer());
        const info = await inspectPdfSafe(data);
        rec.pageCount = info.pageCount;
        rec.pdfData = data;
        rec.status = 'ready';
      } catch (e) {
        rec.status = 'error';
        rec.error = 'Could not read this PDF – it may be encrypted or corrupted. (' + e.message + ')';
      }
    } else {
      rec.isImage = true;
      try {
        const dims = await measureImageDims(f);
        rec.width = dims.width; rec.height = dims.height; rec.hasAlpha = dims.hasAlpha;
        rec.status = 'ready';
      } catch (e) {
        rec.status = 'error';
        rec.error = 'Image could not be decoded – the file may be corrupt. (' + e.message + ')';
      }
    }
    out.push(rec);
  }
  state.files = out.length ? out : state.files;
  return out;
}

async function inspectPdfSafe(data) {
  const pdfJs = await loadPdfJsLazy();
  const { inspectPdf } = await import('./lib/capabilities.js');
  return inspectPdf(pdfJs, new Blob([data]));
}

async function loadPdfJsLazy() {
  if (!_pdfJs) _pdfJs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs');
  return _pdfJs;
}

export function propsFor(rec) {
  return {
    size: rec.size,
    mime: rec.mime,
    width: rec.width, height: rec.height,
    dpi: rec.dpi || null,
    isImage: !!rec.isImage,
    isPdf: !!rec.isPdf,
    pageCount: rec.pageCount || 0,
    hasAlpha: rec.hasAlpha,
  };
}

export function setRequirements(req, errors = [], source = null) {
  state.requirements = req;
  state.reqErrors = errors || [];
  state.source = source || null;
}

export function analyze() {
  const f = activeFile();
  if (!f || f.status !== 'ready') { state.plan = null; return null; }
  const v = validateRequirements(state.requirements);
  state.plan = buildPlan(propsFor(f), v.requirements, { canImage: true, canPdf: true });
  state.plan._v = v;
  return state.plan;
}

export async function loadPdfJsPublic() { return loadPdfJsLazy(); }

export function activeFile() {
  return state.files.find(f => f.status === 'ready') || null;
}

/** Execute the current plan on the active file; re-measure the output. */
export function revokePriorResult() {
  if (state.result && state.result.output && state.result.output.previewUrl) {
    try { URL.revokeObjectURL(state.result.output.previewUrl); } catch { /* noop */ }
  }
}

export async function applyPlan(onProgress) {
  revokePriorResult();
  logDiagnostics('applyPlan start: ' + (state.plan ? state.plan.steps.length + ' step(s)' : 'none'));
  const f = activeFile();
  if (!f || !state.plan || state.plan.steps.length === 0) {
    return { error: f ? 'No changes were needed – the file already meets the measurable requirements. You can download the original.' : 'No ready file to process.' };
  }
  state.processing = true; state.cancelRequested = false;
  try {
    let out = await runPlan(f, state.plan, onProgress);
    const outRec = {
      name: out.name,
      mime: out.mime,
      blob: out.blob,
      width: out.width, height: out.height,
      pageCount: out.pageCount,
      size: out.blob.size,
    };
    const outProps = {
      size: outRec.size, mime: outRec.mime, width: outRec.width, height: outRec.height,
      dpi: null, isImage: out.mime !== 'application/pdf', isPdf: out.mime === 'application/pdf',
      pageCount: outRec.pageCount || 0,
    };
    const v = verifyOutput(outProps, state.requirements);
    const previewUrl = out.mime.startsWith('image/') ? URL.createObjectURL(outRec.blob) : null;
    state.result = {
      original: { name: f.name, size: f.size, mime: f.mime, width: f.width, height: f.height, pageCount: f.pageCount, hasAlpha: f.hasAlpha },
      output: { ...outRec, previewUrl },
      verify: v,
      ready: isReadyToSubmit(v),
      warnings: out.warnings || [],
      note: state.plan.note,
    };
    return state.result;
  } catch (e) {
    const stepHint = state._activeStep ? ' (' + state._activeStep + ')' : '';
    return { error: (e.message || 'Processing failed.') + stepHint };
  } finally {
    state.processing = false;
  }
}

export function cancelProcessing() { state.cancelRequested = true; }

/** The single real execution path for a plan. */
async function runPlan(f, plan, onProgress) {
  const steps = plan.steps;
  const warns = [];
  let warnings = warns;
  const r = state.requirements;
  let mime = f.mime;
  let blob = f.blob;
  let width = f.width, height = f.height;
  let pageCount = f.pageCount || 0;

  // Determine effective output format (target or allowed[0])
  let outMime = mime;
  for (const s of steps) {
    if (s.type === 'convert') outMime = s.to;
  }
  if (outMime === mime && r.targetFormat) outMime = MIME_TO_FORMAT[r.targetFormat];

  for (let i = 0; i < steps.length; i++) {
    if (state.cancelRequested) throw new Error('Processing was cancelled.');
    state._activeStep = labelStep(steps[i]);
    onProgress && onProgress(i, steps.length, labelStep(steps[i]));
    const s = steps[i];

    if (s.type === 'resize' || s.type === 'crop') {
      const c = await imageToCanvas(blob, s.width, s.height, { fill: outMime === 'image/jpeg' ? '#ffffff' : null });
      if (outMime === 'image/jpeg' && f.hasAlpha) warns.push('Transparency was flattened onto a white background because JPEG has no alpha channel.');
      blob = await encodeCanvasSafe(c, outMime, r.compressionPreference === 'quality' ? 0.92 : 0.85);
      mime = outMime; width = s.width; height = s.height;
    }

    if (s.type === 'convert') {
      if (outMime === 'application/pdf' && f.isImage) {
        const pdfLib = await loadPdfLib();
        const { imageToPdf } = await import('./lib/capabilities.js');
        const bytes = await imageToPdf(pdfLib, blob, mime);
        blob = new Blob([bytes], { type: 'application/pdf' });
        mime = 'application/pdf'; width = height = null;
      } else {
        const c = f.isImage ? await imageToCanvas(blob, width || null, height || null, { fill: outMime === 'image/jpeg' && f.hasAlpha ? '#ffffff' : null }) : null;
        if (c) { blob = await encodeCanvasSafe(c, outMime, 0.92); mime = outMime; }
      }
    }

    if (s.type === 'compress' && mime !== 'application/pdf') {
      const c = await imageToCanvas(blob, width, height, {});
      const res = await adaptiveCompress(c, mime, s.targetBytes, r.compressionPreference || 'smallest');
      blob = res.blob;
      if (!res.met) warns.push(`Could not reach ${formatBytes(s.targetBytes)} with image encoding (best: ${formatBytes(res.finalSize)}). A PDF conversion or further downscale may be needed.`);
      width = c.width; height = c.height;
    }

    if (s.type === 'pdfCompress') {
      const pdfLib = await loadPdfLib();
      const { resavePdf } = await import('./lib/capabilities.js');
      const data = f.pdfData || new Uint8Array(await f.blob.arrayBuffer());
      const bytes = await resavePdf(pdfLib, data);
      const newBlob = new Blob([bytes], { type: 'application/pdf' });
      if (newBlob.size <= s.targetBytes) { blob = newBlob; }
      else warns.push(`Re-saving the PDF made it ${formatBytes(newBlob.size)} – larger than the ${formatBytes(s.targetBytes)} target. True lossy compression is not available in the browser. Option: rasterize pages to images (loses selectable text & vectors) – add that as a manual step if you need the hard size limit.`);
    }

    if (s.type === 'extractPages') {
      const pdfLib = await loadPdfLib();
      const { extractPdfPages } = await import('./lib/capabilities.js');
      const data = f.pdfData || new Uint8Array(await f.blob.arrayBuffer());
      const res = await extractPdfPages(pdfLib, data, s.from, s.to);
      blob = new Blob([res.blob], { type: 'application/pdf' });
      mime = 'application/pdf'; width = height = null; pageCount = res.pageCount;
    }
  }

  const outName = renameOut(f.name, outMime, r.targetFormat);
  return { blob, name: outName, mime, width, height, pageCount: mime === 'application/pdf' ? pageCount : 0, warnings };
}

function renameOut(orig, mime, targetFormat) {
  const fmt = targetFormat || (mime && MIME_TO_FORMAT[mime]);
  const ext = fmt === 'pdf' ? 'pdf' : fmt || (mime === 'image/jpeg' ? 'jpg' : (mime === 'image/png' ? 'png' : 'webp'));
  const base = orig.replace(/\.[^.]+$/, '');
  return `${base}-fixed.${ext}`;
}

async function encodeCanvasSafe(canvas, mime, q) {
  const { encodeCanvas } = await import('./lib/capabilities.js');
  return encodeCanvas(canvas, mime, q);
}


// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
// Exam mode: batch-process every file against its assigned doc-type's
// requirements and package outputs into <exam-name>.zip.
// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
import * as examLib from './lib/exam.js';
export { examLib };

export function setExam(exam) { state.exam = exam; state.examMode = !!exam; }

/** Assign each ready file to a doc type; record coverage against required types. */
export function assignDocTypes() {
  const required = state.exam ? state.exam.docs.map(d => d.type) : [];
  const seen = {};
  const assignments = state.files.filter(f => f.status === 'ready').map(f => {
    let t = f.docType;
    if (!t) {
      const c = examLib.classifyDocType(f.name);
      t = c.type;
      f.docType = t;
      f.docTypeConfidence = c.confidence;
    }
    seen[t] = (seen[t] || 0) + 1;
    return { fileId: f.id, docType: t, deferred: false, reason: '' };
  });
  const covered = {};
  for (const a of assignments) if (!covered[a.docType]) covered[a.docType] = a.fileId;
  const missing = required.filter(t => !covered[t]);
  return { assignments, missing, required };
}

/**
 * Process all assigned files for the current exam. For each file we build a
 * plan from that doc type's requirements, run it, and record a per-file result.
 * Returns an array of per-doc results (ready/not, blob, output name) plus a
 * zipName. The UI zips the blobs with makeZip().
 */
export async function processExam(onProgress) {
  if (!state.exam) return { error: 'No exam selected.' };
  const KB = 1024;
  const docByIdx = {};
  for (const d of state.exam.docs) docByIdx[d.type] = d;

  const ready = state.files.filter(f => f.status === 'ready');
  const results = [];
  const zipName = examLib.zipBaseName(state.exam.name) + '.zip';

  for (let idx = 0; idx < ready.length; idx++) {
    const f = ready[idx];
    onProgress && onProgress(idx, ready.length, f.name + ' → ' + (f.docType || 'unknown'));
    const doc = docByIdx[f.docType];
    const req = doc ? examLib.requirementsForDoc(doc, KB) : emptyRequirements();
    const reqObj = validateRequirements(req).requirements;
    const plan = buildPlan(propsFor(f), reqObj, { canImage: true, canPdf: true });

    // If nothing to do, the original file is the "fixed" file.
    let out = null;
    let verify = null;
    if (plan.steps.length === 0) {
      out = { blob: f.blob, name: renameForZip(f, f.docType, reqObj), mime: f.mime, width: f.width, height: f.height, pageCount: f.pageCount, warnings: [] };
      verify = verifyOutput(propsFor(f), reqObj);
    } else {
      // Temporarily run the plan on this file.
      state.requirements = reqObj;
      state.plan = plan;
      const r = await applyPlan();
      if (r.error) {
        results.push({ docType: f.docType, label: doc ? doc.label : f.docType, originalName: f.name, error: r.error, ok: false });
        continue;
      }
      out = { blob: r.output.blob, name: renameForZip(f, f.docType, reqObj), mime: r.output.mime, width: r.output.width, height: r.output.height, pageCount: r.output.pageCount, warnings: r.output.warnings || [] };
      verify = r.verify;
    }
    results.push({
      docType: f.docType,
      label: doc ? doc.label : f.docType,
      originalName: f.name,
      ok: true,
      blob: out.blob,
      outName: out.name,
      mime: out.mime,
      verify,
      ready: isReadyToSubmit(verify),
      warnings: out.warnings,
    });
  }
  // Restore a neutral requirement object so single-file mode still works.
  state.requirements = emptyRequirements();
  state.examResults = results;
  state.examZipName = zipName;
  return { results, zipName };
}

function renameForZip(f, docType, reqObj) {
  const ext = (reqObj && reqObj.targetFormat) || mimeToExt(f.mime, reqObj && reqObj.allowedMimeTypes && reqObj.allowedMimeTypes[0]);
  // Filename = doc type ("photo", "signature", ...) so the zip stays tidy.
  return (docType || 'file') + '.' + ext;
}
function mimeToExt(mime, preferredMime) {
  const m = preferredMime || mime;
  if (m === 'application/pdf') return 'pdf';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  return 'jpg';
}

export { emptyRequirements, validateRequirements, interpretWithAIFallback, BUILTIN_PROFILES, extToMime, formatBytes, SUPPORTED_FORMATS, MIME_TO_FORMAT, labelStep, STATUS };
