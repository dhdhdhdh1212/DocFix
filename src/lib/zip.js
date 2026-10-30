// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-
// zip.js – minimal, dependency-free client-side ZIP writer (STORE method).
// Used to package the fixed documents into <exam-name>.zip. No JSZip, works
// offline. Produces a standard ZIP the OS archive tools can open.
// – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –-

// CRC-32 table (standard, public-domain algorithm).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
  const y = Math.max(1980, date.getFullYear());
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) & 0xFFFF;
  const d = (((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xFFFF;
  return { time, date: d };
}

function u16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
function u32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }

/**
 * @param {Array<{name:string, data:Uint8Array|Buffer|ArrayBuffer}>} entries
 * @returns {Blob} a valid ZIP (STORE/uncompressed) of the entries.
 */
export function makeZip(entries) {
  const now = new Date();
  const { time, date } = dosDateTime(now);
  const chunks = [];
  const central = [];
  let offset = 0;
  const enc = new TextEncoder();

  for (const e of entries) {
    const data = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data);
    const nameBytes = enc.encode(e.name);
    const crc = crc32(data);
    const dos = { time, date };

    // Local file header
    const local = [
      ...u32(0x04034b50), // signature
      ...u16(20),         // version needed
      ...u16(0x0800),     // flags: UTF-8 name
      ...u16(0),          // compression: STORE
      ...u16(dos.time), ...u16(dos.date),
      ...u32(crc),
      ...u32(data.length), // compressed size (== stored)
      ...u32(data.length), // uncompressed size
      ...u16(nameBytes.length),
      ...u16(0),           // extra len
      ...nameBytes,
    ];
    const localBytes = new Uint8Array(local.length);
    local.forEach((b, i) => localBytes[i] = b);
    chunks.push(localBytes, data);

    // Central directory record
    const cd = [
      ...u32(0x02014b50),
      ...u16(20), ...u16(20),
      ...u16(0x0800), ...u16(0),
      ...u16(dos.time), ...u16(dos.date),
      ...u32(crc),
      ...u32(data.length), ...u32(data.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...nameBytes,
    ];
    const cdBytes = new Uint8Array(cd.length);
    cd.forEach((b, i) => cdBytes[i] = b);
    central.push(cdBytes);

    offset += localBytes.length + data.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  central.forEach(c => { chunks.push(c); cdSize += c.length; });

  const end = [
    ...u32(0x06054b50),
    ...u16(0), ...u16(0),            // disk numbers
    ...u16(entries.length), ...u16(entries.length),
    ...u32(cdSize),
    ...u32(cdStart),
    ...u16(0),                        // comment len
  ];
  chunks.push(new Uint8Array(end));

  return new Blob(chunks, { type: 'application/zip' });
}

export default makeZip;
