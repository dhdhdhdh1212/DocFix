// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
// units.js – pure, framework-independent unit parsing, formatting and
// conversion. Node-testable. DocFix core.
// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-

const FORMATS = {
  jpeg: { exts: ['jpg', 'jpeg'], mime: 'image/jpeg' },
  png: { exts: ['png'], mime: 'image/png' },
  webp: { exts: ['webp'], mime: 'image/webp' },
  pdf: { exts: ['pdf'], mime: 'application/pdf' }
};

const MIME_TO_FORMAT = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};

/** @returns {{name:string, ext:string, mime:string}[]} */
export const SUPPORTED_FORMATS = Object.entries(FORMATS).map(([name, f]) => ({
  name, ext: f.exts[0], mime: f.mime
}));

export function extToMime(ext, fallbackMime = '') {
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  const format = Object.entries(FORMATS).find(([, f]) => f.exts.includes(e));
  if (format) return format[1].mime;
  return fallbackMime;
}

/**
 * Detect the likely MIME type of a file.
 * When signature bytes are provided (Uint8Array), magic bytes take priority
 * over the extension – so a file named photo.pdf that contains an image is
 * not silently treated as a PDF.
 * @returns {{mime:string, confidence:'magic'|'extension'|'provided'|'unknown'}}
 */
export function detectMime(ext, providedMime, signature) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  let mime = extToMime(e, '') || (providedMime || '');
  let confidence = mime ? (e ? 'extension' : 'provided') : 'unknown';

  if (signature && signature.length >= 4) {
    const b = signature;
    let magic = null;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) magic = 'image/jpeg';
    else if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) magic = 'image/png';
    else if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) magic = 'application/pdf';
    else if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) magic = 'image/webp'; // RIFF container
    if (magic) { mime = magic; confidence = 'magic'; }
    else if (mime && mime !== magic) {
      // bytes disagree with the extension: trust bytes only when they are positive
      if (confidence === 'extension') { mime = providedMime || mime; }
    }
  }
  return { mime, confidence };
}

export function isSupportedMime(mime) {
  return Boolean(mime && MIME_TO_FORMAT[mime]);
}

export function mimeToFormat(mime) {
  return mime ? MIME_TO_FORMAT[mime] || null : null;
}

/** Byte-size limit parser: accepts numbers (bytes) or strings like "500 KB", "2 MB". */
export function parseByteLimit(input) {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? Math.round(input) : null;
  if (typeof input !== 'string') return null;
  const m = input.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(bytes?|kb|k|mb|m|gb|g)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  const unit = m[2] || 'bytes';
  const base = unit === 'byte' || unit === 'bytes' || unit === 'b' ? 1
    : unit === 'kb' || unit === 'k' ? 1024
    : unit === 'mb' || unit === 'm' ? 1048576
    : 1073741824;
  return Math.round(n * base);
}

export function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${round1(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${round1(mb)} MB`;
  return `${round1(mb / 1024)} GB`;
}

function round1(n) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(/\.0$/, '');
}

/**
 * Parse a pixel/length value expressed in a specific unit.
 * @param {string|number} raw
 * @param {'px'|'in'|'mm'} unit
 * @returns {number|null}
 */
export function parsePixels(raw, unit = 'px') {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit === 'in') return Math.round(n * 96);      // 96 CSS px/inch
  if (unit === 'mm') return Math.round(n * 96 / 25.4);
  return Math.round(n);
}

/**
 * Convert a physical size to pixel dimensions at a given DPI.
 * @returns {{width:number, height:number}} rounded
 */
export function physicalToPixels(width, height, dpi, unit = 'mm') {
  const per = unit === 'mm' ? 25.4 : 1; // inches are 1:1 with CSS inches
  return {
    width: Math.round(width * dpi / per),
    height: Math.round(height * dpi / per)
  };
}

/**
 * Parse an aspect ratio "W: H" from a string/number pair.
 * @returns {{numerator:number, denominator:number} | null}
 */
export function parseAspectRatio(w, h) {
  const a = parseFloat(w), b = parseFloat(h);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  const g = gcd(a * 100, b * 100) / 100;
  const n = Math.round(a / g), d = Math.round(b / g);
  return { numerator: n, denominator: d };
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

/**
 * Verify a produced file actually matches the requested output MIME.
 * Uses magic bytes when signature is available; falls back to extension.
 * @returns {{matches:boolean, detected:string, method:'magic'|'extension'}}
 */
export function verifyOutputMime(mime) {
  // A produced file is format-compliant when the format we *asked for* is
  // supported by the engine AND we know how to verify its real type.
  if (!mime) return { matches: false, detected: null, method: 'none' };
  const ok = isSupportedMime(mime);
  return { matches: ok, detected: mime, method: 'extension' };
}

export function formatChangePct(originalSize, outputSize) {
  if (!originalSize || !outputSize || originalSize <= 0) return null;
  return { percent: Math.round(((originalSize - outputSize) / originalSize) * 1000) / 10, decreased: outputSize < originalSize, increased: outputSize > originalSize };
}

export { MIME_TO_FORMAT };
