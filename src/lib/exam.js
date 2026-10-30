// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
// exam.js – exam/portal "guided fetch" flow (honest, no fake scraping).
// Pure, Node-testable decision layer. Browser fetch helpers are separate.
// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-

// Document types we recognize and the heuristics that map a filename to one.
export const DOC_TYPES = {
  photo:      { label: 'Photo',      keywords: ['photo', 'photograph', 'picture', 'headshot', 'passport'], mime: 'image/jpeg' },
  signature:  { label: 'Signature',  keywords: ['signature', 'sign'], mime: 'image/png' },
  document:   { label: 'Document',   keywords: ['doc', 'document', 'certificate', 'cert', 'transcript', 'marksheet', 'marks', 'result', 'degree', 'report'], mime: 'application/pdf' },
  form:       { label: 'Form',       keywords: ['form', 'application', 'applied'], mime: 'application/pdf' },
  id_proof:   { label: 'ID proof',   keywords: ['id', 'aadhaar', 'aadhar', 'pan', 'passport', 'voter', 'driver', 'licence', 'license'], mime: 'application/pdf' },
  address_proof: { label: 'Address proof', keywords: ['address', 'proof', 'utility', 'bill'], mime: 'application/pdf' },
  essay:       { label: 'Essay',      keywords: ['essay', 'sop', 'statement', 'letter'], mime: 'application/pdf' },
};

export const ALL_DOC_TYPES = Object.keys(DOC_TYPES);

/**
 * Classify a filename into a document type using keyword + extension heuristics.
 * @param {string} filename
 * @returns {{type:string, confidence:'high'|'low'|'unknown', reason:string}}
 */
export function classifyDocType(filename) {
  const name = String(filename || '').toLowerCase();
  const ext = name.split('.').pop() || '';
  const extMime = ext === 'pdf' ? 'application/pdf' : ext.startsWith('png') ? 'image/png' : ext.startsWith('jpg') || ext.startsWith('jpeg') ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : null;

  // Highest-priority keyword matches first (photo & signature are the most
  // unambiguous; a file named "photo.jpg" is a photo even if it's PNG).
  let best = null;
  for (const key of ALL_DOC_TYPES) {
    const info = DOC_TYPES[key];
    for (const kw of info.keywords) {
      // match as a word-ish boundary to avoid "pan" matching inside "panel"
      const re = new RegExp('(^|[^a-z])' + kw + '($|[^a-z])', 'i');
      if (re.test(name)) {
        // photo & signature beat everything else
        const rank = key === 'photo' || key === 'signature' ? 0 : 1;
        if (!best || rank < best.rank) best = { type: key, rank };
        break;
      }
    }
  }

  if (best) {
    const isImageExpectation = (best.type === 'photo' || best.type === 'signature');
    const confidence = isImageExpectation && extMime && !extMime.startsWith('image/') ? 'low' : 'high';
    return { type: best.type, confidence, reason: `matched "${best.type}" keyword` };
  }

  // Fall back to extension only.
  if (extMime === 'application/pdf') return { type: 'document', confidence: 'low', reason: 'PDF, no type keyword – assumed a generic document' };
  if (extMime) return { type: 'document', confidence: 'low', reason: 'image, no type keyword – please confirm the type' };
  return { type: 'document', confidence: 'unknown', reason: 'unrecognized filename' };
}

/**
 * A curated exam registry holding *public, user-verifiable* guideline data.
 * We deliberately do NOT scrape live pages (many portals block it, require
 * login, or change yearly). Instead we keep the stable public facts and a
 * `verifyUrl` the user can check. This is honest and testable.
 */
export const EXAM_REGISTRY = [
  {
    id: 'upsc-cse',
    name: 'UPSC Civil Services Examination',
    aliases: ['upsc', 'cse', 'iics', 'civil services', 'ias'],
    authority: 'Union Public Service Commission (upsc.gov.in)',
    verifyUrl: 'https://upsc.gov.in/portal/index.php?routename=details&slug=upsc-cse',
    // These are the historically stable technical upload limits, NOT the
    // exhaustive ruleset. The user must verify against the current year.
    docs: [
      { type: 'photo',       label: 'Candidate photo',        mime: 'image/jpeg', maxKb: 200, minKb: 20, w: null, h: null, note: 'Recent-year limits have varied (commonly 20–100 KB JPEG); verify the current year\'s notification.' },
      { type: 'signature',   label: 'Signature',              mime: 'image/jpeg', maxKb: 30, minKb: null, w: null, h: null, note: 'Usually a dark-ink signature on white background; verify current limit.' },
      { type: 'form',        label: 'Filled application form',mime: 'application/pdf', maxKb: 1024, minKb: null, w: null, h: null, note: 'The form itself is a PDF; we can\'t verify it is fully filled – that is your responsibility.' },
    ],
    disclaimer: 'UPSC revises upload limits each cycle. These are typical recent-year values – open the current notification to confirm before submitting.'
  },
  {
    id: 'jee-advanced',
    name: 'JEE Advanced',
    aliases: ['jee advanced', 'jee-adv', 'jcea'],
    authority: 'IIT (convening institute)',
    verifyUrl: 'https://advancejee.ac.in/registration',
    docs: [
      { type: 'photo',     label: 'Candidate photo',    mime: 'image/jpeg', maxKb: 100, minKb: null, note: 'Recent years: JPG, often ~50–100 KB. Verify current.' },
      { type: 'signature', label: 'Signature',          mime: 'image/jpeg', maxKb: 50, minKb: null, note: 'Verify current.' },
    ],
    disclaimer: 'JEE Advanced changes image specs yearly; confirm against the current registration window.'
  },
  {
    id: 'generic-college',
    name: 'College / university admission',
    aliases: ['college', 'university', 'admission', 'b.tech', 'btech', 'mba', 'bca', 'b.sc'],
    authority: 'Institution-specific',
    verifyUrl: null,
    docs: [
      { type: 'photo',        label: 'Passport photo',         mime: 'image/jpeg', maxKb: 200, minKb: null },
      { type: 'signature',    label: 'Signature',              mime: 'image/png',  maxKb: 100, minKb: null },
      { type: 'id_proof',     label: 'ID proof (PDF)',         mime: 'application/pdf', maxKb: 2048, minKb: null },
      { type: 'document',     label: 'Marksheets / certificates', mime: 'application/pdf', maxKb: 2048, minKb: null },
      { type: 'form',         label: 'Application form',       mime: 'application/pdf', maxKb: 2048, minKb: null },
    ],
    disclaimer: 'Institution-specific; confirm the exact portal\'s requirements before submitting.'
  },
  {
    id: 'generic-recruitment',
    name: 'Job / recruitment application',
    aliases: ['job', 'recruitment', 'resume', 'cover', 'sbi', 'bank'],
    authority: 'Employer / portal-specific',
    verifyUrl: null,
    docs: [
      { type: 'photo',     label: 'Photo',      mime: 'image/jpeg', maxKb: 100, minKb: null },
      { type: 'signature', label: 'Signature',  mime: 'image/png',  maxKb: 100, minKb: null },
      { type: 'document',  label: 'Resume / certificates (PDF)', mime: 'application/pdf', maxKb: 1024, minKb: null },
    ],
    disclaimer: 'Employer-specific; many portals cap the resume PDF at ~1–2 MB.'
  },
];

/**
 * Match a free-text exam name to a registry entry.
 * @returns {{match:string|null, candidates:string[]}}
 */
export function matchExam(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return { match: null, candidates: [] };
  const candidates = [];
  for (const e of EXAM_REGISTRY) {
    if (e.name.toLowerCase() === q || e.aliases.some(a => a.toLowerCase() === q)) {
      return { match: e.id, candidates };
    }
  }
  // partial / keyword match
  for (const e of EXAM_REGISTRY) {
    if (e.name.toLowerCase().includes(q) || e.aliases.some(a => a.toLowerCase().includes(q) || q.includes(a.toLowerCase()))) {
      candidates.push(e.id);
    }
  }
  return { match: candidates.length === 1 ? candidates[0] : (candidates[0] || null), candidates };
}

/**
 * Build per-document requirement objects (in the requirements.js schema) from
 * a registry entry. This is what the planner/verifier will use.
 */
export function requirementsForDoc(doc, KB = 1024) {
  const r = {
    allowedMimeTypes: [doc.mime],
    maximumSizeBytes: doc.maxKb != null ? doc.maxKb * KB : null,
    minimumSizeBytes: doc.minKb != null ? doc.minKb * KB : null,
    targetFormat: null,
  };
  if (doc.mime === 'application/pdf') r.maximumPages = 1;
  if (doc.w || doc.h) { r.targetWidth = doc.w; r.targetHeight = doc.h; }
  r.additionalConstraints = [];
  if (doc.note) r.additionalConstraints.push(doc.note);
  if (doc.mime === 'image/jpeg' && doc.type === 'photo') r.additionalConstraints.push('Passport-style photo: plain background, face fully visible (content check – verify manually).');
  return r;
}

/**
 * Given the user's uploaded files (each {name, type}) and the required doc
 * types for the exam, return coverage: which required docs are present, which
 * are missing, and any files that don't match a required type.
 * @param {Array<{name:string, type:string}>} files
 * @param {Array<string>} requiredTypes  (keys of DOC_TYPES)
 * @returns {{covered:{[type]:string}, missing:string[], unclassified:{name:string,type:string}[]}}
 */
export function auditCoverage(files, requiredTypes) {
  const covered = {};
  const unclassified = [];
  for (const f of files || []) {
    const t = f.type;
    if (requiredTypes.includes(t) && !covered[t]) covered[t] = f.name;
    else unclassified.push({ name: f.name, type: t });
  }
  const missing = requiredTypes.filter(t => !covered[t]);
  return { covered, missing, unclassified };
}

/** Sanitize a zip / filename base from a free-text exam name. */
export function zipBaseName(examName) {
  const s = String(examName || '').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
  return s || 'documents';
}

export const KB_CONST = 1024;
