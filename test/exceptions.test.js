// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseExceptions } from '../scripts/convert-exceptions.js';

const DATED = '! 2026-11-07, seal.ir: the reason\n';

test('every domain under a dated reason is read, sorted', () => {
  assert.deepEqual(parseExceptions(`! Title: x\n!\n${DATED}z.seal.ir\na.seal.ir\n`), ['a.seal.ir', 'z.seal.ir']);
  assert.deepEqual(parseExceptions(`${DATED}! more about it\nseal.ir\n`), ['seal.ir']);
  assert.deepEqual(parseExceptions('! Title: x\n'), []);
});

test('a domain with no dated reason fails, and a blank line or bare ! ends a reason', () => {
  assert.throws(() => parseExceptions('seal.ir\n'), /line 1: seal.ir has no dated reason/);
  assert.throws(() => parseExceptions('! the reason, with no date\nseal.ir\n'), /no dated reason/);
  assert.throws(() => parseExceptions(`${DATED}seal.ir\n\nother.ir\n`), /line 4: other.ir has no dated reason/);
  assert.throws(() => parseExceptions(`${DATED}seal.ir\n!\nother.ir\n`), /other.ir has no dated reason/);
  // The header's example is a quoted comment, not a reason.
  assert.throws(() => parseExceptions('! ! 2026-11-07, example.ir: why\nexample.ir\n'), /no dated reason/);
});

test('anything but one lowercase site per line fails the build', () => {
  for (const line of ['Seal.ir', 'ir', '||seal.ir^', 'seal.ir/path', 'سیل.ir', '10.0.0.1', 'a b.ir']) {
    assert.throws(() => parseExceptions(`${DATED}${line}\n`), Error, line);
  }
  assert.throws(() => parseExceptions(`${DATED}seal.ir\nseal.ir\n`), /listed twice/);
});

test('the shipped file parses and keeps the e-rasaneh trust seal', () => {
  const domains = parseExceptions(readFileSync(new URL('../lists/cpab-exceptions.txt', import.meta.url), 'utf8'));
  assert.ok(domains.includes('trustseal.e-rasaneh.ir'));
});
