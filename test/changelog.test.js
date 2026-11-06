// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CHANGELOG, recentChangelog } from '../src/shared/changelog.js';

const manifest = JSON.parse(readFileSync(new URL('../src/manifest.json', import.meta.url), 'utf8'));
const parts = (version) => version.split('.').map(Number);
const isNewer = (a, b) => {
  const [left, right] = [parts(a), parts(b)];
  const index = left.findIndex((value, position) => value !== right[position]);
  return index >= 0 && left[index] > right[index];
};

test('the manifest version has an entry in both languages', () => {
  const entry = CHANGELOG.find(({ version }) => version === manifest.version);
  assert.ok(entry, `no changelog entry for ${manifest.version}`);
  assert.ok(entry.en.length && entry.fa.length);
});

test('every entry has a date and the same lines in both languages', () => {
  for (const { version, date, en, fa } of CHANGELOG) {
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/, version);
    assert.ok(Array.isArray(en) && en.length, `${version} has no English`);
    assert.ok(Array.isArray(fa) && fa.length, `${version} has no Persian`);
    assert.equal(fa.length, en.length, version);
    for (const line of [...en, ...fa]) assert.ok(typeof line === 'string' && line.trim(), version);
  }
});

test('the newest version comes first', () => {
  for (const [index, { version }] of CHANGELOG.slice(1).entries()) {
    assert.ok(isNewer(CHANGELOG[index].version, version), `${CHANGELOG[index].version} before ${version}`);
  }
  assert.equal(CHANGELOG[0].version, manifest.version);
});

test('settings shows the last three versions', () => {
  assert.deepEqual(recentChangelog().map(({ version }) => version), CHANGELOG.slice(0, 3).map(({ version }) => version));
  assert.equal(recentChangelog().length, 3);
});

test('entries are written for a reader, with no rule syntax', () => {
  for (const { version, en, fa } of CHANGELOG) {
    for (const line of [...en, ...fa]) assert.ok(!/\|\||@@|##|\$\w|\^/.test(line), `${version}: ${line}`);
  }
});

test('Persian lines keep the project rules', () => {
  for (const { version, fa } of CHANGELOG) {
    for (const line of fa) {
      assert.ok(!line.includes('فیلتر'), `${version} uses a forbidden word`);
      assert.ok(!/[يك]/.test(line), `${version} uses Arabic letter forms`);
      assert.ok(!/(^|\s)(می|نمی) /.test(line), `${version} is missing a ZWNJ after می`);
    }
  }
});

test('English lines avoid the forms the naming rule forbids', () => {
  for (const { version, en } of CHANGELOG) {
    for (const line of en) assert.ok(!/adblock|\babp\b/i.test(line), version);
  }
});
