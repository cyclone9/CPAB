// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { format, formatDate, formatNumber, resolveLanguage, t } from '../src/i18n/i18n.js';
import { STRINGS } from '../src/i18n/strings.js';

const ZWNJ = '‌';
const placeholders = (text) => (text.match(/\{\w+\}/g) ?? []).sort();
const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

test('both languages have the same strings and placeholders', () => {
  assert.deepEqual(Object.keys(STRINGS.fa).sort(), Object.keys(STRINGS.en).sort());
  for (const key of Object.keys(STRINGS.en)) {
    assert.ok(STRINGS.en[key] && STRINGS.fa[key], key);
    assert.deepEqual(placeholders(STRINGS.fa[key]), placeholders(STRINGS.en[key]), key);
  }
});

test('Persian text keeps the project rules', () => {
  for (const [key, text] of Object.entries(STRINGS.fa)) {
    assert.ok(!text.includes('فیلتر'), `${key} uses a forbidden word`);
    assert.ok(!/[يك]/.test(text), `${key} uses Arabic letter forms`);
    assert.ok(!/(^|\s)(می|نمی) /.test(text), `${key} is missing a ZWNJ after می`);
    assert.ok(!text.includes('تبلیغشکن') && !text.includes('تبلیغ شکن'), `${key} misspells the name`);
  }
  assert.equal(STRINGS.fa.productName, `تبلیغ${ZWNJ}شکن`);
});

test('English avoids the forms the naming rule forbids', () => {
  for (const [key, text] of Object.entries(STRINGS.en)) {
    assert.ok(!/adblock|\babp\b/i.test(text), key);
  }
});

test('every data-t in the pages has a string', () => {
  for (const page of ['popup/popup.html', 'settings/settings.html', 'warning/warning.html', 'blocked/blocked.html', 'welcome/welcome.html']) {
    const html = readFileSync(new URL(`../src/${page}`, import.meta.url), 'utf8');
    for (const [, key] of html.matchAll(/data-(?:t|label-key)="(\w+)"/g)) {
      assert.ok(key in STRINGS.en, `${page}: ${key}`);
    }
  }
});

test('resolveLanguage follows the setting, then the browser', () => {
  assert.equal(resolveLanguage('auto', 'fa'), 'fa');
  assert.equal(resolveLanguage('auto', 'fa-IR'), 'fa');
  assert.equal(resolveLanguage('auto', 'FA'), 'fa');
  assert.equal(resolveLanguage('auto', 'en-US'), 'en');
  assert.equal(resolveLanguage('auto', 'de'), 'en');
  assert.equal(resolveLanguage('auto', undefined), 'en');
  assert.equal(resolveLanguage('en', 'fa'), 'en');
  assert.equal(resolveLanguage('fa', 'en'), 'fa');
});

test('t and format fill in text and refuse unknown keys', () => {
  assert.equal(format('en', 'pausedRemoveLabel', { domain: 'a.com' }), 'Remove a.com');
  assert.throws(() => t('en', 'nothing'));
});

test('numbers and dates follow the interface language', () => {
  assert.equal(formatNumber('en', 45461), '45,461');
  assert.equal(formatNumber('fa', 189), '۱۸۹');
  assert.match(formatDate('en', '2026-11-04'), /2026/);
  assert.match(formatDate('fa', '2026-11-04'), /۱۴۰۵/);
});

test('the manifest asks only for what this version needs', () => {
  const manifest = readJson('../src/manifest.json');
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.minimum_chrome_version, '121');
  assert.equal(manifest.version, readJson('../package.json').version);
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'declarativeNetRequest', 'scripting', 'webNavigation', 'webRequest']);
  assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
  assert.equal(manifest.background.type, 'module');
  // CPAB's warning and blocked pages can't open in an incognito tab in the default "spanning" mode.
  assert.equal(manifest.incognito, 'split');
});

test('the manifest names come from _locales', () => {
  assert.deepEqual(readdirSync(new URL('../src/_locales/', import.meta.url)).sort(), ['en', 'fa']);
  assert.equal(readJson('../src/_locales/en/messages.json').extName.message, 'CPAB - Ad Blocker');
  assert.equal(readJson('../src/_locales/fa/messages.json').extName.message, `تبلیغ${ZWNJ}شکن`);
});

const brandFile = '/home/cyclone/projects/cpbs/cpab/brand.json';
test('brand text matches CPBS word for word', { skip: !existsSync(brandFile) }, () => {
  const brand = JSON.parse(readFileSync(brandFile, 'utf8'));
  const { text } = brand;
  assert.equal(STRINGS.fa.productName, brand.name_fa);
  for (const language of ['en', 'fa']) {
    assert.equal(STRINGS[language].tagline, text[language].tagline);
    assert.equal(STRINGS[language].motto, text[language].motto);
    assert.equal(STRINGS[language].fullName, brand.full_name);
    const locale = readJson(`../src/_locales/${language}/messages.json`);
    assert.equal(locale.description_short.message, text[language].description_short);
  }
});
