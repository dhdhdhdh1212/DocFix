// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
// engine.js – pure, framework-independent analysis & planning.
// Browser APIs (canvas, PDF.js, pdf-lib) are injected so the same code runs
// in Node tests with mocked/browser capabilities.
// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
import { formatBytes, parseByteLimit, formatChangePct, verifyOutputMime, extToMime, MIME_TO_FORMAT } from './units.js';
import { validateRequirements } from './requirements.js';

export const STATUS = { PASS: 'pass', FAIL: 'fail', UNKNOWN: 'unknown', NA: 'n/a' };

/**
 * A compliance check against a single requirement dimension.
 * @returns {ConstraintResult}
 */
function cr(key, label, status, detail = '', measured = null) {
  return { key, label, status, detail, measured };
}

/**
 * Compare a file's measured properties against a validated requirement object.
 * @param {object} props {size, width, height, mime, pageCount, isImage, isPdf, dpi}
 * @param {object} req validated requirements
 * @returns {{checks:ConstraintResult[], failures:string[], passes:string[]}}
 */
export function evaluateCompliance(props, req) {
  const checks = [];
  const r = req;

  // Format
  if (r.allowedMimeTypes && r.allowedMimeTypes.length) {
    const ok = r.allowedMimeTypes.includes(props.mime);
    checks.push(cr('format', 'File format', ok ? STATUS.PASS : STATUS.FAIL,
      ok ? `Format is ${props.mime}.` : `Format is ${props.mime}; allowed: ${r.allowedMimeTypes.join(', ')}.`, props.mime));
  }
  if (r.targetFormat) {
    const targetMime = MIME_TO_FORMAT[r.targetFormat] || null;
    const ok = targetMime ? props.mime === targetMime : false;
    checks.push(cr('targetFormat', 'Output format', ok ? STATUS.PASS : STATUS.FAIL,
      ok ? `Already ${targetMime}.` : `Needs conversion to ${r.targetFormat}.`, props.mime));
  }

  // Size
  if (r.maximumSizeBytes != null) {
    const ok = props.size <= r.maximumSizeBytes;
    checks.push(cr('maxSize', 'File size ≤ limit', ok ? STATUS.PASS : STATUS.FAIL,
      `${formatBytes(props.size)} ${ok ? '≤' : '>'} ${formatBytes(r.maximumSizeBytes)} (${r.maximumSizeBytes.toLocaleString()} bytes).`, props.size));
  }
  if (r.minimumSizeBytes != null) {
    const ok = props.size >= r.minimumSizeBytes;
    checks.push(cr('minSize', 'File size ≥ minimum', ok ? STATUS.PASS : STATUS.FAIL,
      `${formatBytes(props.size)} ${ok ? '≥' : '<'} ${formatBytes(r.minimumSizeBytes)}.`, props.size));
  }

  // Dimensions (images only; for PDFs, width/height constraints are NA)
  if (props.isImage) {
    if (r.targetWidth != null || r.targetHeight != null) {
      const w = r.targetWidth ?? props.width, h = r.targetHeight ?? props.height;
      const wOk = r.targetWidth == null || props.width === r.targetWidth;
      const hOk = r.targetHeight == null || props.height === r.targetHeight;
      const ok = wOk && hOk;
      checks.push(cr('dims', 'Exact dimensions', ok ? STATUS.PASS : STATUS.FAIL,
        `${props.width}×${props.height}px ${ok ? 'matches' : `vs required ${r.targetWidth ?? w}×${r.targetHeight ?? h}px`}.`,
        { width: props.width, height: props.height }));
    }
    if (r.minimumWidth != null || r.minimumHeight != null) {
      const wOk = r.minimumWidth == null || props.width >= r.minimumWidth;
      const hOk = r.minimumHeight == null || props.height >= r.minimumHeight;
      checks.push(cr('minDims', 'Minimum dimensions', (wOk && hOk) ? STATUS.PASS : STATUS.FAIL,
        `${props.width}×${props.height}px vs min ${r.minimumWidth ?? ' – '}×${r.minimumHeight ?? ' – '}px.`));
    }
    if (r.maximumWidth != null || r.maximumHeight != null) {
      const wOk = r.maximumWidth == null || props.width <= r.maximumWidth;
      const hOk = r.maximumHeight == null || props.height <= r.maximumHeight;
      checks.push(cr('maxDims', 'Maximum dimensions', (wOk && hOk) ? STATUS.PASS : STATUS.FAIL,
        `${props.width}×${props.height}px vs max ${r.maximumWidth ?? ' – '}×${r.maximumHeight ?? ' – '}px.`));
    }
    if (r.aspectRatio) {
      const actual = ratioOf(props.width, props.height);
      const want = r.aspectRatio.numerator / r.aspectRatio.denominator;
      const ok = Math.abs(actual - want) < 0.02;
      checks.push(cr('aspect', 'Aspect ratio', ok ? STATUS.PASS : STATUS.FAIL,
        `Current ${ratioLabel(props.width, props.height)} vs required ${r.aspectRatio.numerator}:${r.aspectRatio.denominator}.`, actual));
    }
  } else if (r.targetWidth != null || r.targetHeight != null || r.aspectRatio) {
    checks.push(cr('dims', 'Dimensions', STATUS.NA, 'Pixel dimensions do not apply to a PDF (pages have their own size).'));
  }

  // DPI (informational: we can report the image's pixel density only if known)
  if (r.targetDpi != null) {
    if (props.isImage && props.dpi) {
      const ok = props.dpi >= r.targetDpi;
      checks.push(cr('dpi', 'Resolution (DPI)', ok ? STATUS.PASS : STATUS.FAIL,
        `Measured ${props.dpi} DPI ${ok ? '≥' : '<'} ${r.targetDpi} DPI.`, props.dpi));
    } else {
      checks.push(cr('dpi', 'Resolution (DPI)', STATUS.UNKNOWN,
        `Cannot reliably verify DPI for this file${props.isImage ? ' (no embedded DPI metadata found)' : ' (PDF page size is not DPI)'}. Set targetWidth/targetHeight in pixels instead.`));
    }
  }

  // Pages (PDF only)
  if (r.maximumPages != null) {
    if (props.isPdf) {
      const ok = props.pageCount <= r.maximumPages;
      checks.push(cr('pages', 'Page count ≤ limit', ok ? STATUS.PASS : STATUS.FAIL,
        `${props.pageCount} page${props.pageCount === 1 ? '' : 's'} ${ok ? '≤' : '>'} ${r.maximumPages}.`, props.pageCount));
    } else {
      checks.push(cr('pages', 'Page count ≤ limit', STATUS.NA, 'Page limit applies to PDFs, not this file type.'));
    }
  }

  // Unverifiable extras
  for (const note of (r.additionalConstraints || [])) {
    checks.push(cr('extra:' + note, 'Custom constraint', STATUS.UNKNOWN,
      `"${note}" – recorded but not automatically verifiable. Check it against the portal manually.`, null));
  }

  const failures = checks.filter(c => c.status === STATUS.FAIL).map(c => c.key);
  const passes = checks.filter(c => c.status === STATUS.PASS).map(c => c.key);
  return { checks, failures, passes };
}

function ratioOf(w, h) { return w / h; }
function ratioLabel(w, h) {
  // express as a short ratio
  const g = (a, b) => b ? g(b, a % b) : a;
  const n = Math.round(w / g(w, h)), d = Math.round(h / g(w, h));
  return `${n}:${d}`;
}

/**
 * Build a transformation plan (ordered, typed steps) from the current file
 * properties and a validated requirement. Deterministic; no side effects.
 * @returns {{steps:PlanStep[], risks:string[], resolvable:boolean, note:string|null}}
 */
export function buildPlan(props, req, caps = {}) {
  const steps = [];
  const risks = [];
  let note = null;
  const resolvable = { format: false, size: false, dims: false, pages: false, aspect: false };

  const r = req;
  const mime = props.mime;
  const canImage = caps.canImage !== false;
  const canPdf = caps.canPdf !== false;

  // 1) Format conversion / target format
  const targetMime = r.targetFormat ? (MIME_TO_FORMAT[r.targetFormat] || null) : null;
  const needsFormat = (r.allowedMimeTypes && r.allowedMimeTypes.length && !r.allowedMimeTypes.includes(mime))
    || (targetMime && targetMime !== mime);
  if (needsFormat) {
    const to = targetMime || (r.allowedMimeTypes || [])[0] || null;
    if (to && (canImage || to === 'application/pdf')) {
      steps.push({ type: 'convert', to });
      resolvable.format = true;
    } else {
      note = note || `Cannot convert to "${to}" in this environment.`;
    }
  }

  // 2) Dimension resize (images) – before compression
  const needExact = props.isImage && (r.targetWidth != null || r.targetHeight != null);
  const needMax = props.isImage && (r.maximumWidth != null || r.maximumHeight != null)
    && ((r.maximumWidth != null && props.width > r.maximumWidth) || (r.maximumHeight != null && props.height > r.maximumHeight));
  const needAspect = props.isImage && r.aspectRatio && Math.abs(ratioOf(props.width, props.height) - r.aspectRatio.numerator / r.aspectRatio.denominator) >= 0.02;

  if (needExact || needMax || needAspect) {
    if (!canImage) { note = note || 'Image resize requires a browser canvas; not available in this environment.'; }
    else {
      let nw, nh;
      const alreadyExact = needExact
        && (r.targetWidth == null || props.width === r.targetWidth)
        && (r.targetHeight == null || props.height === r.targetHeight);
      if (needExact && !alreadyExact) {
        nw = r.targetWidth ?? props.width;
        nh = r.targetHeight ?? props.height;
        // preserve aspect if only one axis given
        if (r.targetWidth != null && r.targetHeight == null) nh = Math.round(nw * (props.height / props.width));
        if (r.targetHeight != null && r.targetWidth == null) nw = Math.round(nh * (props.width / props.height));
        steps.push({ type: 'resize', width: nw, height: nh, mode: 'exact' });
        resolvable.dims = true;
      }
      if (needAspect) {
        // crop to the aspect ratio
        const want = r.aspectRatio.numerator / r.aspectRatio.denominator;
        if (props.width / props.height > want) nh = Math.round(props.width / want); else nw = Math.round(props.height * want);
        steps.push({ type: 'crop', width: nw, height: nh, mode: 'aspect' });
        resolvable.aspect = true;
        risks.push('Cropping removes part of the image to match the aspect ratio – center-crop is used; check the preview.');
      }
      if (needMax) {
        // fit within max
        const scale = Math.min(
          r.maximumWidth != null ? r.maximumWidth / props.width : 1,
          r.maximumHeight != null ? r.maximumHeight / props.height : 1,
          1
        );
        if (scale < 1) {
          nw = Math.round(props.width * scale); nh = Math.round(props.height * scale);
          steps.push({ type: 'resize', width: nw, height: nh, mode: 'max', scale });
          resolvable.dims = true;
        }
      }
      if (needExact && !alreadyExact) risks.push('Exact resize may crop or pad; the result is checked against the target size.');
    }
  }

  // 3) Size cap – adaptive compression
  const overMax = r.maximumSizeBytes != null && props.size > r.maximumSizeBytes;
  const underMin = r.minimumSizeBytes != null && props.size < r.minimumSizeBytes;
  if (overMax) {
    if (props.isImage && canImage) {
      steps.push({ type: 'compress', targetBytes: r.maximumSizeBytes });
      resolvable.size = true;
      risks.push('Compression lowers quality until the size target is met; the exact final size is measured and reported, not promised.');
      if (r.minimumSizeBytes != null && r.minimumSizeBytes > r.maximumSizeBytes)
        note = note || 'Size range is impossible: minimum (' + formatBytes(r.minimumSizeBytes) + ') exceeds maximum (' + formatBytes(r.maximumSizeBytes) + ').';
    } else if (props.isPdf && canPdf) {
      steps.push({ type: 'pdfCompress', targetBytes: r.maximumSizeBytes });
      resolvable.size = true;
      risks.push('PDF compression re-saves the file; if re-saving cannot reach the target, an explicit "rasterize pages" option is offered. Rasterizing removes selectable text and vectors – your choice.');
    } else {
      note = note || `Cannot reduce the size of this file type here.`;
    }
  }
  if (underMin) {
    // Honest: we can add weight (higher quality / PNG) but can't guarantee a minimum.
    note = note || `File is below the ${formatBytes(r.minimumSizeBytes)} minimum. Some portals reject undersized files; DocFix can pad quality but cannot guarantee an exact minimum size – verify manually.`;
    resolvable.size = true;
  }

  // 4) Page operations (PDF)
  if (props.isPdf && r.maximumPages != null && props.pageCount > r.maximumPages) {
    if (canPdf) {
      steps.push({ type: 'extractPages', from: 1, to: r.maximumPages });
      resolvable.pages = true;
      risks.push(`Will keep the first ${r.maximumPages} page(s). Choose which pages to keep if that is wrong – extraction is explicit and reversible from the original.`);
    } else {
      note = note || 'Page extraction requires PDF.js; not available in this environment.';
    }
  }

  // Order: convert → resize/crop → compress → pdf ops. (already appended in that order)
  const canPlan = steps.length > 0 || (r.allowedMimeTypes && r.allowedMimeTypes.length > 0 && r.allowedMimeTypes.includes(mime));
  return {
    steps,
    risks,
    resolvable,
    note,
    canPlan,
    summary: steps.length ? steps.map(s => labelStep(s)).join(' → ') : (canPlan ? 'No changes needed – file already meets the measurable requirements.' : 'No automated fix available for these requirements.'),
  };
}

export function labelStep(s) {
  switch (s.type) {
    case 'convert': return `Convert to ${s.to === 'application/pdf' ? 'PDF' : (s.to || '').split('/')[1] || s.to}`;
    case 'resize': return s.mode === 'exact' ? `Resize to ${s.width}×${s.height}px` : `Fit within ${s.width}×${s.height}px`;
    case 'crop': return `Crop to ${s.width}×${s.height}px (aspect match)`;
    case 'compress': return `Compress to ≤ ${formatBytes(s.targetBytes)}`;
    case 'pdfCompress': return `Reduce PDF size to ≤ ${formatBytes(s.targetBytes)}`;
    case 'extractPages': return `Keep pages ${s.from}–${s.to} only`;
    default: return s.type;
  }
}

/**
 * Validate a produced output file against the requirements. Reuses the same
 * evaluator on the measured output, so results are never assumed – they are
 * re-measured.
 * @returns {{checks:ConstraintResult[], allMeasuredPass:boolean, anyFail:boolean, anyUnknown:boolean}}
 */
export function verifyOutput(outputProps, req) {
  const { checks, failures } = evaluateCompliance(outputProps, req);
  const anyFail = failures.length > 0;
  const anyUnknown = checks.some(c => c.status === STATUS.UNKNOWN);
  // "all measurable pass" = no FAIL among the checks that produced a measured result.
  const allMeasuredPass = !anyFail;
  return { checks, allMeasuredPass, anyFail, anyUnknown, failures };
}

/** Compute an honest before/after size-change figure. */
export function reportSizeChange(original, output) {
  const ch = formatChangePct(original, output);
  if (!ch) return { text: '', pct: null };
  if (ch.decreased) return { text: `Reduced by ${ch.percent}%`, pct: ch.percent };
  if (ch.increased) return { text: `Increased by ${ch.percent}%`, pct: -ch.percent };
  return { text: 'No size change', pct: 0 };
}

/**
 * Determine whether it is safe/possible to declare "READY TO SUBMIT".
 * True only when: no FAIL, and no UNKNOWN that is a required, machine-checkable
 * constraint. Unknown "additionalConstraints" are allowed (they are inherently
 * unverifiable) but are surfaced, not counted as pass.
 */
export function isReadyToSubmit(verifyResult) {
  if (verifyResult.anyFail) return false;
  // required machine-verifiable constraint unknown → not ready
  const blockingUnknown = verifyResult.checks.some(c =>
    c.status === STATUS.UNKNOWN && !String(c.key).startsWith('extra:'));
  return !blockingUnknown;
}

export { evaluateCompliance as score, cr };
