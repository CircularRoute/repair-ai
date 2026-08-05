import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAttachment, sniffType } from '../lib/files.mjs';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF = Buffer.from('%PDF-1.7 something');
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
const TEXT = Buffer.from('hello, plain text file\nsecond line');

test('accepts a real jpeg as .jpg', () => {
  const v = validateAttachment({ fileName: 'photo.JPG', mime: 'image/jpeg', buf: JPEG });
  assert.equal(v.ok, true);
  assert.equal(v.ext, 'jpg');
});

test('accepts pdf, txt, csv, docx with matching content', () => {
  assert.equal(validateAttachment({ fileName: 'doc.pdf', mime: 'application/pdf', buf: PDF }).ok, true);
  assert.equal(validateAttachment({ fileName: 'notes.txt', mime: 'text/plain', buf: TEXT }).ok, true);
  assert.equal(validateAttachment({ fileName: 'data.csv', mime: 'text/csv', buf: TEXT }).ok, true);
  assert.equal(
    validateAttachment({
      fileName: 'report.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buf: ZIP,
    }).ok,
    true
  );
});

test('rejects disallowed extensions outright', () => {
  for (const name of ['run.exe', 'page.html', 'img.svg', 'archive.zip', 'macro.docm', 'script.sh', 'x.js']) {
    const v = validateAttachment({ fileName: name, mime: 'application/octet-stream', buf: TEXT });
    assert.equal(v.ok, false, name);
  }
});

test('rejects content that does not match the extension', () => {
  // An executable renamed to .jpg
  assert.equal(validateAttachment({ fileName: 'photo.jpg', mime: 'image/jpeg', buf: EXE }).ok, false);
  // A png renamed to .pdf
  assert.equal(validateAttachment({ fileName: 'doc.pdf', mime: 'application/pdf', buf: PNG }).ok, false);
  // A zip (could be anything) renamed to .txt
  assert.equal(validateAttachment({ fileName: 'notes.txt', mime: 'text/plain', buf: ZIP }).ok, false);
});

test('rejects mime that does not match the extension', () => {
  const v = validateAttachment({ fileName: 'photo.jpg', mime: 'text/html', buf: JPEG });
  assert.equal(v.ok, false);
});

test('rejects binary content in text files', () => {
  const withNul = Buffer.concat([TEXT, Buffer.from([0]), TEXT]);
  assert.equal(validateAttachment({ fileName: 'notes.txt', mime: 'text/plain', buf: withNul }).ok, false);
});

test('rejects empty and oversized files', () => {
  assert.equal(validateAttachment({ fileName: 'a.txt', mime: 'text/plain', buf: Buffer.alloc(0) }).ok, false);
  assert.equal(
    validateAttachment({ fileName: 'a.txt', mime: 'text/plain', buf: TEXT, maxBytes: 10 }).ok,
    false
  );
});

test('sniffs common formats', () => {
  assert.equal(sniffType(JPEG), 'jpeg');
  assert.equal(sniffType(PNG), 'png');
  assert.equal(sniffType(EXE), 'exe');
  assert.equal(sniffType(ZIP), 'zip');
  assert.equal(sniffType(TEXT), null);
});
