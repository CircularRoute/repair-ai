import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguageHeuristic } from '../lib/lang.mjs';

test('detects Russian from Cyrillic', () => {
  assert.equal(detectLanguageHeuristic('Сегодня было три заказа, один сорвался'), 'ru');
});

test('detects Azerbaijani from distinctive letters', () => {
  assert.equal(detectLanguageHeuristic('Bu gün üç sifariş var idi, biri ləğv olundu'), 'az');
  assert.equal(detectLanguageHeuristic('səhər gələcəm'), 'az');
});

test('detects English from plain Latin sentences', () => {
  assert.equal(detectLanguageHeuristic('I lost two jobs this week because of missed calls'), 'en');
});

test('English about Baku is still English (words, not topic)', () => {
  assert.equal(detectLanguageHeuristic('I was in Baku last week fixing a washing machine'), 'en');
});

test('empty and ambiguous input returns null', () => {
  assert.equal(detectLanguageHeuristic(''), null);
  assert.equal(detectLanguageHeuristic('   '), null);
  assert.equal(detectLanguageHeuristic('ok'), null);
});

test('post-edit guard: meta leaks and ballooned output fall back to the raw transcript', async () => {
  const { guardPostEdit } = await import('../lib/pipeline.mjs');
  const raw = 'Kontrol paneldə start düyməsi işləmir';
  // Honest correction passes through.
  assert.equal(guardPostEdit(raw, 'Kontrol panelində start düyməsi işləmir'), 'Kontrol panelində start düyməsi işləmir');
  // Leaked reasoning (seen in production) is rejected.
  assert.equal(guardPostEdit(raw, 'I need to correct the speech-to-text errors in the primary transcript provided.'), raw);
  assert.equal(guardPostEdit(raw, 'The primary transcript appears to be German text.'), raw);
  // Empty or ballooned output is rejected.
  assert.equal(guardPostEdit(raw, ''), raw);
  assert.equal(guardPostEdit(raw, 'x'.repeat(raw.length * 2 + 100)), raw);
});

test('foreign-script transcripts are flagged as garbage (ruling 26)', async () => {
  const { looksForeignScript } = await import('../lib/pipeline.mjs');
  assert.equal(looksForeignScript('وَعَبُو'), true); // seen live from a noise note
  assert.equal(looksForeignScript('日本語のテキスト'), true);
  assert.equal(looksForeignScript('שלום'), true);
  assert.equal(looksForeignScript('Kontrol paneldə start düyməsi işləmir'), false);
  assert.equal(looksForeignScript('Потерял два заказа сегодня'), false);
  assert.equal(looksForeignScript('the start button sticks'), false);
  assert.equal(looksForeignScript(''), false);
});
