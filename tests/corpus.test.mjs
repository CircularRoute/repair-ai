import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../lib/db.mjs';
import { validTags, sanitizeTags, taxonomyPromptText } from '../lib/taxonomy.mjs';
import { chunkText, cosine, vectorToBlob, blobToVector, rankChunks } from '../lib/embeddings.mjs';
import { parseClassifierOutput } from '../lib/classify.mjs';
import { parseExtractionOutput, validateInsight } from '../lib/insights.mjs';

test('taxonomy contains the spec tags and priority subtags', () => {
  const tags = validTags();
  assert.ok(tags.has('growth/property-manager-channel'));
  assert.ok(tags.has('operations/job-diversion-subcontracting'));
  assert.ok(tags.has('market/property-managers'));
  assert.ok(tags.has('product-ideas'));
  assert.ok(tags.has('other'));
  assert.equal(taxonomyPromptText().includes('property-manager-channel'), true);
});

test('approved proposals extend the taxonomy; pending ones do not', () => {
  const db = openDb({ path: ':memory:' });
  db.prepare("INSERT INTO taxonomy_proposals (tag, proposedBy, proposedAt, status) VALUES ('operations/van-stock', 'extractor', '2026-08-05', 'approved')").run();
  db.prepare("INSERT INTO taxonomy_proposals (tag, proposedBy, proposedAt, status) VALUES ('growth/tiktok', 'extractor', '2026-08-05', 'pending')").run();
  const tags = validTags(db);
  assert.ok(tags.has('operations/van-stock'));
  assert.equal(tags.has('growth/tiktok'), false);
});

test('sanitizeTags keeps valid tags, clamps confidence, falls back to other', () => {
  const out = sanitizeTags([
    { tag: 'operations/diagnostics', confidence: 2 },
    { tag: 'nonsense/made-up', confidence: 0.9 },
    { tag: 'operations/diagnostics', confidence: 0.5 },
  ]);
  assert.deepEqual(out, [{ tag: 'operations/diagnostics', confidence: 1 }]);
  assert.deepEqual(sanitizeTags([{ tag: 'junk' }]), [{ tag: 'other', confidence: 0.3 }]);
});

test('chunker: short text is one chunk, long text splits on boundaries', () => {
  assert.deepEqual(chunkText('short message'), ['short message']);
  assert.deepEqual(chunkText(''), []);
  const sentence = 'The compressor on the fridge failed and the part took nine days to arrive. ';
  const long = sentence.repeat(40);
  const chunks = chunkText(long);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 1200);
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(), long.replace(/\s+/g, ' ').trim());
});

test('cosine and blob round trip', () => {
  const v = [0.5, -1, 2, 0];
  const back = blobToVector(vectorToBlob(v));
  assert.equal(back.length, 4);
  assert.ok(Math.abs(back[1] - -1) < 1e-6);
  assert.ok(Math.abs(cosine(Float32Array.from(v), back) - 1) < 1e-6);
  assert.equal(cosine(Float32Array.from([1, 0]), Float32Array.from([0, 1])), 0);
});

test('rankChunks orders by similarity', () => {
  const db = openDb({ path: ':memory:' });
  const insert = db.prepare('INSERT INTO chunks (messageId, text, embedding) VALUES (?, ?, ?)');
  insert.run('m1', 'about parts', vectorToBlob([1, 0, 0]));
  insert.run('m2', 'about calls', vectorToBlob([0, 1, 0]));
  insert.run('m3', 'mixed', vectorToBlob([0.7, 0.7, 0]));
  const ranked = rankChunks(db, [1, 0, 0], 3);
  assert.equal(ranked[0].messageId, 'm1');
  assert.equal(ranked[1].messageId, 'm3');
});

test('classifier output parsing tolerates fences and garbage', () => {
  assert.deepEqual(parseClassifierOutput('```json\n[{"tag":"other","confidence":0.4}]\n```'), [{ tag: 'other', confidence: 0.4 }]);
  assert.deepEqual(parseClassifierOutput('{"tags":[{"tag":"growth","confidence":1}]}'), [{ tag: 'growth', confidence: 1 }]);
  assert.deepEqual(parseClassifierOutput('not json'), []);
});

test('insight validation enforces provenance (hard rule 6)', () => {
  const batch = new Set(['m1', 'm2']);
  assert.equal(validateInsight({ text: 'A finding with no sources', tag: 'other', sourceMessageIds: [] }, batch), null);
  assert.equal(validateInsight({ text: 'Sources outside batch', tag: 'other', sourceMessageIds: ['zz'] }, batch), null);
  const ok = validateInsight(
    { text: 'Owner loses two jobs weekly to missed calls during repairs', tag: 'operations/customer-communication', weight: 4, sourceMessageIds: ['m1', 'zz'] },
    batch
  );
  assert.equal(ok.tag, 'operations/customer-communication');
  assert.deepEqual(ok.sourceMessageIds, ['m1']);
  assert.equal(ok.weight, 4);
});

test('extraction output parsing is defensive', () => {
  assert.deepEqual(parseExtractionOutput('garbage'), { insights: [], proposals: [] });
  const parsed = parseExtractionOutput('{"insights":[{"text":"x"}],"proposals":[{"tag":"operations/van-stock"}]}');
  assert.equal(parsed.insights.length, 1);
  assert.equal(parsed.proposals.length, 1);
});
