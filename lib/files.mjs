// Chat attachments (founder ruling 2026-08-05, decisions.md ruling 8).
// Strict allowlist enforced server-side by extension AND sniffed content type,
// never by the client alone. Files stored under DATA_DIR/files with randomized
// names, size-capped, served download-only. Never executed, never inline html.

import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

// extension -> allowed mime prefixes for that extension
export const ALLOWED_EXTENSIONS = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  heic: ['image/heic', 'image/heif'],
  m4a: ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac'],
  mp3: ['audio/mpeg', 'audio/mp3'],
  wav: ['audio/wav', 'audio/x-wav', 'audio/wave'],
  webm: ['audio/webm', 'video/webm'],
  ogg: ['audio/ogg', 'application/ogg'],
  mp4: ['video/mp4', 'audio/mp4'],
  mov: ['video/quicktime'],
  pdf: ['application/pdf'],
  txt: ['text/plain'],
  csv: ['text/csv', 'text/plain', 'application/csv'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};

// Magic-byte sniffing. Returns a coarse family or null when unrecognized.
export function sniffType(buf) {
  if (!buf || buf.length < 4) return null;
  const b = buf;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  if (b.length >= 12 && b.slice(0, 4).toString('ascii') === 'RIFF') {
    const kind = b.slice(8, 12).toString('ascii');
    if (kind === 'WEBP') return 'webp';
    if (kind === 'WAVE') return 'wav';
    return 'riff';
  }
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return 'ogg';
  if (b.length >= 12 && b.slice(4, 8).toString('ascii') === 'ftyp') return 'mp4family'; // mp4, m4a, mov, heic
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return 'mp3';
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3';
  if (b[0] === 0x50 && b[1] === 0x4b) return 'zip'; // docx/xlsx are zip containers
  if (b[0] === 0x4d && b[1] === 0x5a) return 'exe';
  if (b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) return 'elf';
  return null;
}

// Which sniffed families are acceptable for each extension. Extensions whose
// format has no reliable magic bytes (txt, csv) accept null but must not sniff
// as a known dangerous or mismatched binary family.
const EXPECTED_SNIFF = {
  jpg: ['jpeg'], jpeg: ['jpeg'], png: ['png'], gif: ['gif'], webp: ['webp'],
  heic: ['mp4family'],
  m4a: ['mp4family'], mp3: ['mp3'], wav: ['wav'],
  webm: ['webm'], ogg: ['ogg'],
  mp4: ['mp4family'], mov: ['mp4family'],
  pdf: ['pdf'],
  docx: ['zip'], xlsx: ['zip'],
  txt: [null], csv: [null],
};

// Validates an attachment. Returns { ok: true, ext } or { ok: false, reason }.
export function validateAttachment({ fileName, mime, buf, maxBytes = MAX_FILE_BYTES }) {
  const ext = extname(fileName || '').slice(1).toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS[ext]) {
    return { ok: false, reason: 'file type not allowed' };
  }
  if (!buf || buf.length === 0) return { ok: false, reason: 'empty file' };
  if (buf.length > maxBytes) return { ok: false, reason: 'file too large' };

  const mimeBase = (mime || '').split(';')[0].trim().toLowerCase();
  if (mimeBase && !ALLOWED_EXTENSIONS[ext].includes(mimeBase)) {
    return { ok: false, reason: 'content type does not match extension' };
  }

  const sniffed = sniffType(buf);
  const expected = EXPECTED_SNIFF[ext];
  if (sniffed === 'exe' || sniffed === 'elf') {
    return { ok: false, reason: 'executable content rejected' };
  }
  if (!expected.includes(sniffed)) {
    // txt/csv expect null; anything with a recognized binary signature is not text
    return { ok: false, reason: 'file content does not match its extension' };
  }
  // For text types, reject NUL bytes (binary masquerading as text).
  if ((ext === 'txt' || ext === 'csv') && buf.includes(0)) {
    return { ok: false, reason: 'binary content in text file' };
  }
  return { ok: true, ext };
}

// Stores a validated buffer under dataDir/<subdir>/ with a randomized name.
export function storeFile(dataDir, subdir, ext, buf) {
  const dir = join(dataDir, subdir);
  mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;
  const path = join(dir, name);
  writeFileSync(path, buf);
  return { path, name };
}

// Plain-text extraction where possible (ruling 8): txt and csv now; pdf/docx/xlsx
// extraction arrives with the corpus phases. Extracted text is untrusted data.
export function extractText(ext, buf) {
  if (ext === 'txt' || ext === 'csv') {
    return buf.toString('utf8').slice(0, 100_000);
  }
  return null;
}
