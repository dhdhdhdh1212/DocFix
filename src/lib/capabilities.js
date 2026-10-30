// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
// capabilities.js – browser-side execution of the plan steps that the engine
// produces. Injects canvas / PDF.js / pdf-lib. Pure functions where possible so
// unit tests can exercise the *decision* logic (quality ladder, size math)
// with a mocked encode() while keeping the real code paths intact.
// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
import { extToMime, verifyOutputMime, formatBytes } from './units.js';

/**
 * Measure an image file's intrinsic pixel dimensions without decoding its
 * full pixel data – reads only the header bytes.
 * @returns {Promise<{width:number, height:number, hasAlpha:boolean}|null>}
 */
export async function measureImageDims(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    const loaded = new Promise((res, rej) => {
      img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => rej(new Error('Image failed to decode (corrupt or unsupported)'));
      img.src = url;
    });
    const d = await loaded;
    // Detect alpha: decode once, check a sampled pixel – only for PNG/WebP.
    let hasAlpha = false;
    if (blob.type === 'image/png' || blob.type === 'image/webp') {
      try {
        const c = document.createElement('canvas');
        c.width = Math.min(d.width, 10); c.height = Math.min(d.height, 10);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < data.length; i += 4) { if (data[i] !== 255) { hasAlpha = true; break; } }
      } catch { hasAlpha = false; }
    }
    return { ...d, hasAlpha };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Encode a canvas to a Blob of the given MIME type at the given quality. */
export function encodeCanvas(canvas, mime, quality) {
  return new Promise((res, rej) => {
    if (typeof canvas.toBlob !== 'function') { rej(new Error('Canvas encoding is not available in this browser.')); return; }
    canvas.toBlob(b => {
      if (b) { res(b); return; }
      rej(new Error(`Could not encode an image as ${mime}. Your browser may not support that format for canvas output. Try a different output format (JPEG or PNG).`));
    }, mime, quality);
  });
}

/**
 * Adaptive image compression: step through a quality ladder, measure the real
 * output size each time, stop when under the target. Honest – returns the
 * achieved size, not a promise.
 * @param {HTMLCanvasElement} canvas
 * @param {string} mime
 * @param {number} targetBytes
 * @returns {Promise<{blob:Blob, quality:number, attempts:number, met:boolean, finalSize:number}>}
 */
export async function adaptiveCompress(canvas, mime, targetBytes, pref = 'smallest') {
  const ladders = {
    smallest: [0.72, 0.6, 0.5, 0.42, 0.35, 0.28, 0.22, 0.16, 0.12, 0.09, 0.07, 0.05],
    balanced: [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.28, 0.2, 0.14],
    quality:  [0.95, 0.88, 0.8, 0.7, 0.6, 0.5]
  };
  const q = ladders[pref] || ladders.balanced;
  let last = null;
  for (const quality of q) {
    const blob = await encodeCanvas(canvas, mime, quality);
    last = { blob, quality };
    if (blob.size <= targetBytes) return { ...last, attempts: q.indexOf(quality) + 1, met: true, finalSize: blob.size };
    // early-stop if even the smallest plausible quality can't get close
    if (quality <= 0.05) break;
  }
  return { ...last, attempts: q.length, met: false, finalSize: last.blob.size };
}

/** Flatten transparency onto a background colour (needed when → JPEG). */
export function flattenAlpha(canvas, bg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, 0, 0);
  return c;
}

/** Draw an image blob into a canvas at exact or scaled dimensions. */
export async function imageToCanvas(blob, width, height, opts = {}) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = () => rej(new Error('decode failed')); i.src = url;
    });
    const c = document.createElement('canvas');
    const outW = width || 0, outH = height || 0;
    if (!outW || !outH) throw new Error('No target dimensions are set, so the image could not be rendered. Add a width and height (or exact dimensions) and try again.');
    c.width = outW; c.height = outH;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (opts.fill) { ctx.fillStyle = opts.fill; ctx.fillRect(0, 0, outW, outH); }
    // Fit: contain (default) – never stretches.
    const scale = Math.min(outW / img.naturalWidth, outH / img.naturalHeight);
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    ctx.drawImage(img, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
// PDF capabilities. pdf-lib / pdf.js are loaded lazily and injected so the
// module also works in Node when they're absent (returns an error, not a fake).
// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-

/** Count pages + per-page sizes from a PDF.js document. */
export async function inspectPdf(pdfjs, blob) {
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const vp = p.getViewport({ scale: 1 });
    pages.push({ index: i, widthPt: vp.width, heightPt: vp.height });
  }
  return { pageCount: doc.numPages, pages };
}

/** Render a single PDF page to a canvas (for previews). */
export async function renderPagePdf(pdfjs, data, pageNo, scale = 1.5) {
  const doc = await pdfjs.getDocument({ data }).promise;
  const page = await doc.getPage(pageNo);
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c;
}

/** Re-save a PDF with pdf-lib (honest re-save; reports whether size changed). */
export async function resavePdf(pdfLib, data) {
  const doc = await pdfLib.PDFDocument.load(data, { ignoreEncryption: false, updateMetadata: false });
  const out = await doc.save();
  return out;
}

/** Rotate specific pages (1-based) by 90° increments. */
export async function rotatePdfPages(pdfLib, data, pageNumbers, deg = 90) {
  const doc = await pdfLib.PDFDocument.load(data);
  const pages = await doc.getPages();
  for (const n of pageNumbers) {
    if (n >= 1 && n <= pages.length) pages[n - 1].rotate(deg);
  }
  return doc.save();
}

/** Extract a range of pages into a new PDF. */
export async function extractPdfPages(pdfLib, data, from, to) {
  const src = await pdfLib.PDFDocument.load(data);
  const dst = await pdfLib.PDFDocument.create();
  const end = Math.min(to, src.getPageCount());
  const idx = []; for (let i = from - 1; i < end; i++) idx.push(i);
  const newPages = await dst.copyPages(src, idx);
  newPages.forEach(p => dst.addPage(p));
  return { blob: new Uint8Array(await dst.save()), pageCount: end - from + 1 };
}

/** Merge multiple PDFs in order. */
export async function mergePdfs(pdfLib, blobs) {
  const dst = await pdfLib.PDFDocument.create();
  for (const b of blobs) {
    const src = await pdfLib.PDFDocument.load(new Uint8Array(await b.arrayBuffer()));
    const pages = await dst.copyPages(src, src.getPageIndices());
    pages.forEach(p => dst.addPage(p));
  }
  return new Uint8Array(await dst.save());
}

/** Build a one-page PDF from an image (image → PDF). */
export async function imageToPdf(pdfLib, imageBlob, mime) {
  const data = new Uint8Array(await imageBlob.arrayBuffer());
  const doc = await pdfLib.PDFDocument.create();
  let img, maxDim;
  if (mime === 'image/png') img = await doc.embedPng(data);
  else if (mime === 'image/jpeg') img = await doc.embedJpg(data);
  else {
    // webp/other: rasterize via canvas to PNG first
    const c = await imageToCanvas(imageBlob, 0, 0);
    const pngBytes = new Uint8Array(await c.toBlob('image/png')?.arrayBuffer());
    img = await doc.embedPng(pngBytes);
  }
  const page = doc.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  return new Uint8Array(await doc.save());
}

