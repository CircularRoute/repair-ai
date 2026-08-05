import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onboardingMessage, OTTO_ID } from '../lib/otto.mjs';

test('otto internal id avoids the parent-org collision', () => {
  assert.equal(OTTO_ID, 'otto-r');
});

test('onboarding exists in all three languages, greets by name, names the founder', () => {
  for (const [lang, founder] of [['en', 'Rashad'], ['ru', 'Рашад'], ['az', 'Rəşad']]) {
    const msg = onboardingMessage('Elvin', lang);
    assert.ok(msg.includes('Elvin'), lang);
    assert.ok(msg.includes(founder), lang);
    assert.ok(msg.length > 200, lang);
  }
});

test('consent line is present in every language', () => {
  assert.match(onboardingMessage('X', 'en'), /recorded, transcribed, and analyzed/);
  assert.match(onboardingMessage('X', 'ru'), /записывается/);
  assert.match(onboardingMessage('X', 'az'), /qeydə alınır/);
});

test('onboarding ends with the warm opening question', () => {
  for (const lang of ['en', 'ru', 'az']) {
    assert.ok(onboardingMessage('X', lang).trim().endsWith('?'), lang);
  }
});

test('no em dashes anywhere in onboarding (hard rule 1)', () => {
  for (const lang of ['en', 'ru', 'az']) {
    assert.equal(onboardingMessage('X', lang).includes(String.fromCharCode(0x2014)), false, lang);
  }
});

test('unknown language falls back to English', () => {
  assert.match(onboardingMessage('X', 'de'), /I am Otto/);
});
