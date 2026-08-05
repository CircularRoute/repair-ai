import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvText } from '../lib/env.mjs';

test('parses plain KEY=VALUE lines', () => {
  const out = parseEnvText('A=1\nB=hello world\n');
  assert.deepEqual(out, { A: '1', B: 'hello world' });
});

test('ignores comments, blanks, malformed lines', () => {
  const out = parseEnvText('# comment\n\n=nokey\nnoequals\nOK=yes\n');
  assert.deepEqual(out, { OK: 'yes' });
});

test('strips export prefix and matching quotes', () => {
  const out = parseEnvText('export A="quoted value"\nB=\'single\'\nC="unterminated\n');
  assert.equal(out.A, 'quoted value');
  assert.equal(out.B, 'single');
  assert.equal(out.C, '"unterminated');
});

test('keeps equals signs inside values', () => {
  const out = parseEnvText('KEY=abc=def==\n');
  assert.equal(out.KEY, 'abc=def==');
});

test('rejects invalid key names', () => {
  const out = parseEnvText('9BAD=1\nGOOD_1=2\n');
  assert.deepEqual(out, { GOOD_1: '2' });
});
