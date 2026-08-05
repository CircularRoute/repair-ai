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
