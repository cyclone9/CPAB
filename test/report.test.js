// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { REPORT_KINDS, REPORT_REPO, browserLabel, buildReport } from '../src/shared/report.js';
import { normalizeSettings } from '../src/shared/settings.js';
import { STRINGS } from '../src/i18n/strings.js';

// The titles as the build writes them into rules/summary.json.
const LISTS = [
  ['ads', 'ads', 'EasyList'], ['ads', 'ads-adguard-base', 'AdGuard Base filter'], ['ads', 'iran', 'PersianBlocker'],
  ['ads', 'cpab-own', 'CPAB\'s own rules'], ['trackers', 'trackers', 'EasyPrivacy'], ['trackers', 'trackers-hagezi-light', 'HaGeZi Multi Light'],
  ['popups', 'popups-adguard', 'AdGuard Popups filter'], ['widgets', 'widgets-adguard', 'AdGuard Widgets filter'],
  ['widgets', 'widgets-fanboy-social', 'Fanboy\'s Social Blocking List'], ['harmful', 'harmful-hagezi-tif', 'HaGeZi Threat Intelligence Feeds - mini'],
  ['harmful', 'harmful-badware', 'uBlock filters - Badware risks'], ['adult', 'adult-hagezi-nsfw', 'HaGeZi NSFW'],
].map(([group, ruleset, title]) => ({ group, ruleset, title, available: true }));

const report = (change = {}, rest = {}) => buildReport({
  kind: 'broken', site: 'www.example.com', version: '0.3.6', browser: 'Chrome 157',
  settings: normalizeSettings(change), lists: LISTS, ...rest,
});
const params = (url) => new URL(url).searchParams;

test('the address carries exactly the template, the title and the three fields', () => {
  const { url, fields, title } = report();
  assert.ok(url.startsWith(`${REPORT_REPO}/issues/new?template=broken-site.yml&`), url);
  assert.deepEqual([...params(url).keys()], ['template', 'title', 'site', 'cpab', 'lists']);
  assert.equal(params(url).get('labels'), null);
  assert.equal(title, 'Broken site: example.com');
  assert.deepEqual(fields, {
    site: 'example.com',
    cpab: 'CPAB 0.3.6, Chrome 157',
    lists: ['EasyList', 'AdGuard Base filter', 'PersianBlocker', 'CPAB\'s own rules', 'EasyPrivacy', 'HaGeZi Multi Light',
      'AdGuard Popups filter', 'AdGuard Widgets filter', 'Fanboy\'s Social Blocking List', 'Harmful sites: on', 'Exceptions for Iranian sites: on'].join('\n'),
  });
});

test('every value in the address is shown in the preview, word for word', () => {
  for (const kind of [...REPORT_KINDS, 'warning']) {
    const { url, text } = report({}, { kind, warnedBy: 'harmful-badware' });
    for (const [key, value] of params(url)) if (key !== 'template') assert.ok(text.includes(value), `${kind}: ${key}`);
  }
});

test('the suggest choice uses its own form and title', () => {
  const { url, title } = report({}, { kind: 'missed' });
  assert.equal(params(url).get('template'), 'suggest-site.yml');
  assert.equal(title, 'Suggest a site: example.com');
  assert.throws(() => report({}, { kind: 'adult' }), /not a report kind/);
});

test('a whole address gives the host alone: no path, query, fragment, port or login', () => {
  for (const site of ['https://user:pw@www.example.com:8443/private/page?token=secret&id=7#frag', 'http://example.com/a?b=1']) {
    const { url, text } = report({}, { site });
    assert.equal(params(url).get('site'), 'example.com');
    for (const leak of ['private', 'token', 'secret', 'frag', '8443', 'user', '/a', 'b=1']) {
      assert.ok(!decodeURIComponent(url).includes(leak), `${site}: ${leak} in the address`);
      assert.ok(!text.includes(leak), `${site}: ${leak} in the preview`);
    }
  }
  assert.throws(() => report({}, { site: 'chrome://settings/' }), /needs a site/);
  assert.throws(() => report({}, { site: '' }), /needs a site/);
});

test('Adult sites never appears, on or off', () => {
  for (const adult of [true, false]) {
    const { url, text } = report({ groups: { adult }, lists: { 'adult-hagezi-nsfw': true } });
    for (const word of ['NSFW', 'Adult', 'adult']) {
      assert.ok(!decodeURIComponent(url).includes(word), `${adult}: ${word}`);
      assert.ok(!text.includes(word), `${adult}: ${word}`);
    }
  }
});

test('nothing from the person\'s own site lists or statistics goes in', () => {
  const settings = { allowedSites: ['allowed.example'], blockedSites: ['mine.example'], pausedSites: ['other.example'], statsTopSites: true };
  const { url } = report(settings);
  for (const word of ['allowed.example', 'mine.example', 'other.example']) assert.ok(!decodeURIComponent(url).includes(word), word);
});

test('a paused site or the master switch off is marked first', () => {
  assert.equal(report({ pausedSites: ['example.com'] }).fields.lists.split('\n')[0], 'CPAB is paused on this site');
  assert.equal(report({ pausedSites: ['www.example.com'] }).fields.lists.split('\n')[0], 'CPAB is paused on this site');
  const off = report({ master: false, pausedSites: ['example.com'] }).fields.lists.split('\n');
  assert.equal(off[0], 'CPAB is off');
  assert.ok(!off.includes('CPAB is paused on this site'));
  assert.ok(off.includes('EasyList'), 'the chosen lists are still named while CPAB is off');
  assert.ok(!report().fields.lists.includes('CPAB is'));
});

test('lists and groups that are off are left out, and the switches say off', () => {
  const lines = report({ groups: { trackers: false, harmful: false }, lists: { iran: false }, recommendedExceptions: false }).fields.lists.split('\n');
  for (const gone of ['EasyPrivacy', 'HaGeZi Multi Light', 'PersianBlocker']) assert.ok(!lines.includes(gone), gone);
  assert.ok(lines.includes('Harmful sites: off'));
  assert.ok(lines.includes('Exceptions for Iranian sites: off'));
  assert.ok(!report({}, { lists: LISTS.filter(({ ruleset }) => ruleset !== 'iran') }).fields.lists.includes('PersianBlocker'), 'a list the build skipped');
});

test('the warning page reports the list that warned and nothing else', () => {
  const { url, fields, title } = report({ master: false, pausedSites: ['bad.example'] }, {
    kind: 'warning', site: 'http://www.bad.example/x?y=1#z', warnedBy: 'harmful-hagezi-tif',
  });
  assert.equal(params(url).get('template'), 'broken-site.yml');
  assert.equal(title, 'Wrong warning: bad.example');
  assert.equal(fields.lists, 'Harmful-site warning from: HaGeZi Threat Intelligence Feeds - mini');
  assert.ok(!decodeURIComponent(url).includes('/x') && !decodeURIComponent(url).includes('y=1'));
  for (const warnedBy of ['adult-hagezi-nsfw', 'ads', null]) {
    assert.equal(report({}, { kind: 'warning', warnedBy }).fields.lists, 'Harmful-site warning from: an unnamed list', String(warnedBy));
  }
});

test('the address stays well under GitHub\'s limit', () => {
  assert.ok(report().url.length < 2000, String(report().url.length));
  assert.ok(report({ master: false }).url.length < 2000);
});

test('browserLabel gives the major version only', () => {
  const brands = (list) => ({ userAgentData: { brands: list } });
  assert.equal(browserLabel(brands([{ brand: 'Not)A;Brand', version: '99' }, { brand: 'Google Chrome', version: '157' }, { brand: 'Chromium', version: '157' }])), 'Chrome 157');
  assert.equal(browserLabel(brands([{ brand: 'Chromium', version: '156' }, { brand: 'Microsoft Edge', version: '156' }])), 'Chrome 156');
  assert.equal(browserLabel({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.7000.12 Safari/537.36' }), 'Chrome 157');
  assert.equal(browserLabel({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0' }), 'Chrome');
  assert.equal(browserLabel(undefined), 'Chrome');
  assert.equal(browserLabel(brands([{ brand: 'Google Chrome', version: '157; os=Linux' }])), 'Chrome');
});

test('the report strings are in English and Persian', () => {
  const keys = Object.keys(STRINGS.en).filter((key) => key.startsWith('report') || key === 'warningReport' || key === 'welcomePrivacyReport');
  assert.ok(keys.length >= 10, keys.join(', '));
  for (const key of keys) {
    assert.ok(STRINGS.fa[key] && STRINGS.fa[key] !== STRINGS.en[key], key);
    assert.ok(/[؀-ۿ]/.test(STRINGS.fa[key]), `${key} is Persian`);
  }
  // The note says the text reaches GitHub on opening, even without submitting, and that reports are public.
  assert.match(STRINGS.en.reportNote, /even if you don't submit/);
  assert.match(STRINGS.en.reportNote, /public/);
});

test('the issue forms name the fields the report fills', () => {
  const form = (name) => readFileSync(new URL(`../scripts/lists-repo/.github/ISSUE_TEMPLATE/${name}`, import.meta.url), 'utf8');
  for (const name of ['broken-site.yml', 'suggest-site.yml']) {
    const text = form(name);
    for (const id of ['site', 'cpab', 'lists', 'details']) assert.match(text, new RegExp(`^\\s+id: ${id}$`, 'm'), `${name}: ${id}`);
  }
  assert.match(form('broken-site.yml'), /^labels: \[broken-site\]$/m);
  assert.match(form('suggest-site.yml'), /^labels: \[suggestion\]$/m);
});
