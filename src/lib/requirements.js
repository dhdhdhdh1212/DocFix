// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
// requirements.js – requirement schema, validation, built-in profiles and the
// rule-based natural-language interpreter. Pure JS, Node-testable.
// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
import { parseByteLimit, parsePixels, parseAspectRatio, physicalToPixels, isSupportedMime, MIME_TO_FORMAT, SUPPORTED_FORMATS } from './units.js';

/** The canonical requirement object (see spec). Every field optional. */
export function emptyRequirements() {
  return {
    allowedMimeTypes: [],
    minimumSizeBytes: null,
    maximumSizeBytes: null,
    targetWidth: null,
    targetHeight: null,
    minimumWidth: null,
    maximumWidth: null,
    minimumHeight: null,
    maximumHeight: null,
    aspectRatio: null,
    targetDpi: null,
    maximumPages: null,
    targetFormat: null,
    compressionPreference: null,
    additionalConstraints: []
  };
}

export const STATER = [
  'image/jpeg','image/png','image/webp','application/pdf'
];

/**
 * Validate a raw requirement object. Returns {ok, requirements, errors}.
 * Accepts partial objects; unknown keys are dropped (never executed).
 */
export function validateRequirements(raw) {
  const errors = [];
  const r = emptyRequirements();
  if (!raw || typeof raw !== 'object') { r.errors = ['requirements must be an object']; return { ok: false, requirements: r, errors }; }

  if (Array.isArray(raw.allowedMimeTypes)) {
    r.allowedMimeTypes = raw.allowedMimeTypes.filter(m => typeof m === 'string' && STATER.includes(m));
    if (r.allowedMimeTypes.length === 0) errors.push('allowedMimeTypes: no recognized mime types');
  }
  const size = parseByteLimit(raw.maximumSizeBytes);
  if (raw.maximumSizeBytes != null && size == null) errors.push('maximumSizeBytes: could not parse');
  else if (size != null) r.maximumSizeBytes = size;
  const minSize = parseByteLimit(raw.minimumSizeBytes);
  if (raw.minimumSizeBytes != null && minSize == null) errors.push('minimumSizeBytes: could not parse');
  else if (minSize != null) r.minimumSizeBytes = minSize;

  for (const k of ['targetWidth','targetHeight','minimumWidth','maximumWidth','minimumHeight','maximumHeight','targetDpi','maximumPages']) {
    const v = raw[k];
    if (v != null) {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) errors.push(`${k}: must be a positive integer`);
      else r[k] = n;
    }
  }
  if (raw.aspectRatio != null) {
    const a = parseAspectRatio(raw.aspectRatio.w ?? raw.aspectRatio, raw.aspectRatio.h ?? 1);
    if (!a) errors.push('aspectRatio: could not parse'); else r.aspectRatio = a;
  }
  if (raw.targetFormat != null) {
    const f = String(raw.targetFormat).toLowerCase().replace(/^\./,'');
    if (!SUPPORTED_FORMATS.find(s => s.name === f || s.ext === f)) errors.push(`targetFormat: "${raw.targetFormat}" is not a supported output format (JPG/PNG/WebP/PDF)`);
    else r.targetFormat = SUPPORTED_FORMATS.find(s => s.name === f || s.ext === f).name;
  }
  if (raw.compressionPreference != null) {
    const p = String(raw.compressionPreference).toLowerCase();
    if (!['smallest','balanced','quality'].includes(p)) errors.push('compressionPreference: must be "smallest", "balanced" or "quality"');
    else r.compressionPreference = p;
  }
  if (Array.isArray(raw.additionalConstraints)) {
    r.additionalConstraints = raw.additionalConstraints.filter(c => typeof c === 'string' && c.length > 0 && c.length <= 300);
  }
  const ok = errors.length === 0;
  return { ok, requirements: r, errors };
}

// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
// Built-in starter profiles – labelled as *examples*, not official standards.
// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
export const BUILTIN_PROFILES = [
  {
    id: 'college-application',
    name: 'College application',
    label: 'Example – verify the portal\'s current limits before submitting',
    requirements: {
      allowedMimeTypes: ['application/pdf'],
      maximumSizeBytes: parseByteLimit('2 MB'),
      maximumPages: 10,
      compressionPreference: 'balanced'
    },
    notes: 'Illustrative: many admission portals cap PDFs around 1–2 MB, but the real limit varies by institution and document type. Confirm the exact requirement on the portal.'
  },
  {
    id: 'examination-application',
    name: 'Examination application',
    label: 'Example – typical form for competitive exams',
    requirements: {
      allowedMimeTypes: ['application/pdf','image/jpeg'],
      maximumSizeBytes: parseByteLimit('500 KB'),
      maximumPages: 5,
      compressionPreference: 'smallest'
    },
    notes: 'Illustrative only. Exam bodies publish different limits each year; check the current notification.'
  },
  {
    id: 'job-application',
    name: 'Job application',
    label: 'Example – resume / cover letter',
    requirements: {
      allowedMimeTypes: ['application/pdf'],
      maximumSizeBytes: parseByteLimit('1 MB'),
      maximumPages: 3,
      compressionPreference: 'quality'
    },
    notes: 'Illustrative. Recruiters commonly ask for a short PDF under ~1 MB.'
  },
  {
    id: 'passport-photo',
    name: 'Passport-style photograph',
    label: 'Example – common dimensions, not an official spec',
    requirements: {
      allowedMimeTypes: ['image/jpeg','image/png'],
      targetWidth: parsePixels(25, 'mm'),   // ~354 px at 96 dpi – a common passport crop box
      targetHeight: parsePixels(30, 'mm'),  // ~425 px
      maximumSizeBytes: parseByteLimit('200 KB'),
      compressionPreference: 'quality'
    },
    notes: 'Illustrative: many services ask ~25×30 mm. Enter the exact pixel size the service demands.'
  },
  {
    id: 'signature',
    name: 'Signature upload',
    label: 'Example – small PNG/JPEG signature',
    requirements: {
      allowedMimeTypes: ['image/jpeg','image/png','image/webp'],
      maximumWidth: 600,
      maximumHeight: 300,
      maximumSizeBytes: parseByteLimit('100 KB'),
      compressionPreference: 'smallest'
    },
    notes: 'Illustrative: signature boxes usually want a compact image. Set exact width/height if the portal specifies them.'
  },
  {
    id: 'certificate-pdf',
    name: 'Certificate / document PDF',
    label: 'Example – scanned document',
    requirements: {
      allowedMimeTypes: ['application/pdf'],
      maximumSizeBytes: parseByteLimit('1 MB'),
      maximumPages: 1,
      compressionPreference: 'balanced'
    },
    notes: 'Illustrative: many portals cap single-page certificates at 1 MB.'
  },
  {
    id: 'insurance-kyc',
    name: 'Insurance / KYC submission',
    label: 'Example – identity & proof documents',
    requirements: {
      allowedMimeTypes: ['image/jpeg','image/png','application/pdf'],
      maximumSizeBytes: parseByteLimit('2 MB'),
      maximumPages: 5,
      compressionPreference: 'balanced'
    },
    notes: 'Illustrative: KYC uploads vary widely between insurers and regulators.'
  }
];

// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
// Rule-based natural-language interpreter.
// Understands common patterns; flags ambiguity instead of guessing units.
// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
const MIME_ALIASES = {
  jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  pdf: 'application/pdf',
};

function extractMime(text) {
  const out = [];
  for (const [k, v] of Object.entries(MIME_ALIASES)) {
    if (new RegExp(`\\b${k}\\b`, 'i').test(text)) { if (!out.includes(v)) out.push(v); }
  }
  return out;
}

function extractMaxSize(text) {
  // e.g. "less than 500 KB", "under 2 MB", "maximum 1 MB", "max size 500kb", "smaller than 500 KB"
  const m = text.match(/(?:less than|under|below|maximum|max|smaller than|up to)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(kb|mb|gb|bytes?)\b/i);
  if (!m) return null;
  return parseByteLimit(`${m[1]} ${m[2]}`);
}

function extractMinSize(text) {
  const m = text.match(/(?:at least|minimum|min|no less than|larger than|bigger than)\s*(\d+(?:\.\d+)?)\s*(kb|mb|bytes?)\b/i);
  if (!m) return null;
  return parseByteLimit(`${m[1]} ${m[2]}`);
}

function extractSizeRange(text) {
  // "between 20 KB and 100 KB"
  const m = text.match(/between\s*(\d+(?:\.\d+)?)\s*(kb|mb|bytes?)\s*and\s*(\d+(?:\.\d+)?)\s*(kb|mb|bytes?)/i);
  if (!m) return null;
  return { min: parseByteLimit(`${m[1]} ${m[2]}`), max: parseByteLimit(`${m[3]} ${m[4]}`) };
}

function extractDimensions(text) {
  // "200 by 230", "200x230", "width 200 height 230"
  const m = text.match(/(\d+)\s*(?:x|by|×)\s*(\d+)\s*(pixels?|px|mm|in(ches?)?)?/i);
  if (!m) return null;
  return { w: Number(m[1]), h: Number(m[2]), unit: (m[3] || '').toLowerCase() };
}

function extractPages(text) {
  const m = text.match(/(?:maximum|max|no more than|up to|fewer than|at most)\s*(\d+)\s*pages?/i);
  if (m) return Number(m[1]);
  return null;
}

/**
 * Interpret a plain-language requirement into a structured object.
 * @returns {{ok:boolean, requirements:object, errors:string[], ambiguities:string[], matched:boolean}}
 * `matched:false` + `ambiguities` means "we understood some of it but need
 * clarification"; the UI should surface the questions, not guess.
 */
export function interpretRequirementsNL(text) {
  const r = emptyRequirements();
  const errors = [];
  const ambiguities = [];
  const t = String(text || '').trim();
  let matched = false;

  // Format
  const mimes = extractMime(t);
  if (mimes.length) { r.allowedMimeTypes = mimes; matched = true; }

  // Size range
  const range = extractSizeRange(t);
  if (range && range.min != null && range.max != null) { r.minimumSizeBytes = range.min; r.maximumSizeBytes = range.max; matched = true; }
  else {
    if (extractMaxSize(t) != null) { r.maximumSizeBytes = extractMaxSize(t); matched = true; }
    if (extractMinSize(t) != null) { r.minimumSizeBytes = extractMinSize(t); matched = true; }
  }

  // Dimensions
  const dim = extractDimensions(t);
  if (dim) {
    if (dim.unit === 'mm' || dim.unit.startsWith('in')) {
      // physical size: need DPI to convert → ask
      const dpiM = t.match(/(\d+)\s*(?:dpi|dots per inch)/i);
      if (dpiM) {
        const p = physicalToPixels(dim.w, dim.h, Number(dpiM[1]), dim.unit === 'mm' ? 'mm' : 'in');
        r.targetWidth = p.width; r.targetHeight = p.height; matched = true;
      } else {
        ambiguities.push(`"${dim.w} by ${dim.h} ${dim.unit}" is a physical size – what DPI should it be? (Common: 96 dpi for screen, 300 dpi for print.)`);
      }
    } else {
      // pixels (assumed when no unit or "px")
      r.targetWidth = dim.w; r.targetHeight = dim.h; matched = true;
      if (!dim.unit || dim.unit.startsWith('px')) {
        ambiguities.push(`Read "${dim.w} by ${dim.h}" as pixels. If the requirement is in mm or inches, tell me and I\'ll convert at the right DPI.`);
      }
    }
  }

  // Pages
  const pages = extractPages(t);
  if (pages != null) { r.maximumPages = pages; matched = true; }

  // DPI
  const dpi = t.match(/(\d+)\s*dpi\b/i);
  if (dpi) { r.targetDpi = Number(dpi[1]); matched = true; }

  // Format target
  const fmt = t.match(/\b(to|as)\s+(a|an)?\s*(jpeg|jpg|png|webp|pdf)\b/i);
  if (fmt && (!r.allowedMimeTypes.length || r.allowedMimeTypes.includes('image/jpeg') === false || r.allowedMimeTypes.includes(MIME_ALIASES[fmt[3]]))) {
    r.targetFormat = MIME_ALIASES[fmt[3]] === 'application/pdf' ? 'pdf' : (fmt[3] === 'jpg' ? 'jpeg' : fmt[3]);
  } else if (fmt) {
    r.targetFormat = fmt[3] === 'jpg' ? 'jpeg' : fmt[3];
  }

  // "keep all three pages" → record the exact page count (digits or small words)
  const WORD_NUMS = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
  const keepAll = t.match(/keep\s+(?:all|the|every)?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+pages?/i);
  if (keepAll) {
    const n = keepAll[1].toLowerCase();
    const pages = WORD_NUMS[n] ?? Number(n);
    if (Number.isFinite(pages) && pages > 0) {
      r.maximumPages = pages;
      r.additionalConstraints.push(`Keep all ${pages} pages – do not remove any.`);
      matched = true;
    }
  }

  if (!matched) errors.push('Could not recognize any size, format, dimension or page rule in that sentence.');
  const v = validateRequirements(r);
  return { ok: v.ok && !errors.length && !ambiguities.length, requirements: v.requirements, errors: [...errors, ...v.errors], ambiguities, matched };
}

/** Try the server AI endpoint; on any failure fall back to the rule-based interpreter. */
export async function interpretWithAIFallback(text, fetchImpl) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (doFetch) {
    try {
      const resp = await doFetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await resp.json();
      if (data && data.data && !data.error) {
        const v = validateRequirements(data.data);
        if (v.ok) return { source: 'ai', requirements: v.requirements, notes: [] };
        return { source: 'ai', requirements: v.requirements, notes: v.errors };
      }
      // No server AI configured → fall through to rules
      if (data && data.source === 'unavailable') return ruleBased(text);
      return { source: 'ai', requirements: emptyRequirements(), notes: [data.reason || data.error || 'AI interpretation failed'] };
    } catch {
      // network / file:// → rule-based fallback
      return ruleBased(text);
    }
  }
  return ruleBased(text);
}

export function ruleBased(text) {
  const res = interpretRequirementsNL(text);
  return {
    source: 'rules',
    requirements: res.requirements,
    notes: res.ambiguities,
    errors: res.errors,
    ambiguities: res.ambiguities,
    ok: res.ok
  };
}

export { parseByteLimit, parsePixels, parseAspectRatio };
