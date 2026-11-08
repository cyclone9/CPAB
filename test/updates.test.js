// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertHarmful } from '../scripts/convert-harmful.js';
import { hostDomains } from '../scripts/data-files.js';
import { BLOCKED_RULE_ID, countBlocked, dynamicRuleId, dynamicRuleList, splitBlocked } from '../src/shared/blocking.js';
import { scriptChanges, wantedScripts } from '../src/shared/css.js';
import { hostRules } from '../src/shared/harmful.js';
import { RULESET_IDS, normalizeSettings } from '../src/shared/settings.js';
import { checkFile, checkVersion } from '../src/shared/update-schema.js';
import {
  OWN_RULES_RESERVE,
  compareGenerated,
  compareVersions,
  droppedRecord,
  dynamicRuleCount,
  fileKey,
  fitsDynamicRules,
  genericOffOverrides,
  listRules,
  newerVersion,
  qualifies,
  renumberRules,
  wantedFiles,
} from '../src/shared/updates.js';

const EXTENSION_ID = 'a'.repeat(32);
const sha = (character) => character.repeat(64);
const block = (id) => ({ id, priority: 1, action: { type: 'block' }, condition: { requestDomains: ['ads.example'], excludedResourceTypes: ['main_frame'] } });
const allow = (id) => ({ id, priority: 2, action: { type: 'allow' }, condition: { requestDomains: ['ok.example'], resourceTypes: ['script'] } });

test('served rule ids stay inside the ranges a list copy can hold', () => {
  const problems = (rules) => checkFile('rules', JSON.stringify(rules)).problems.join('\n');
  assert.equal(problems([block(1), block(49999), allow(1000001), allow(1049999)]), '');
  assert.match(problems([block(50000)]), /outside the block range/);
  assert.match(problems([block(1000001)]), /outside the block range/);
  assert.match(problems([allow(5)]), /outside the allow range/);
  assert.match(problems([allow(1050000)]), /outside the allow range/);
});

test('version.json may name the newest version, as a version number only', () => {
  const version = { schema: 1, generated: '2026-11-08T03:17:00Z', source: 'local', lists: {} };
  const problems = (extension) => checkVersion(JSON.stringify({ ...version, extension })).problems.join('\n');
  assert.equal(checkVersion(JSON.stringify(version)).problems.length, 0);
  assert.equal(problems({ version: '0.3.4' }), '');
  assert.match(problems({ version: '0.3' }), /invalid extension/);
  assert.match(problems({ version: '0.3.4', url: 'https://x.example/' }), /invalid extension/);
  assert.match(problems('0.3.4'), /invalid extension/);
  assert.match(problems({ version: 34 }), /invalid extension/);
});

test('each list gets its own id range, and its rules are found again from their ids', () => {
  const rules = renumberRules('trackers', [block(1), block(7), allow(1000001), allow(1000009)]);
  const base = 100000 * (RULESET_IDS.indexOf('trackers') + 1);
  assert.deepEqual(rules.map(({ id }) => id), [base + 1, base + 7, base + 50001, base + 50009]);
  assert.deepEqual(rules.map(({ id }) => dynamicRuleList(id)), [
    { ruleset: 'trackers', allow: false }, { ruleset: 'trackers', allow: false },
    { ruleset: 'trackers', allow: true }, { ruleset: 'trackers', allow: true },
  ]);
  const ranges = RULESET_IDS.map((list) => [dynamicRuleId(list, 1), dynamicRuleId(list, 1049999)]);
  for (const [index, [low, high]] of ranges.entries()) {
    assert.ok(low > 999 && high < low + 100000, RULESET_IDS[index]);
    if (index) assert.ok(low > ranges[index - 1][1]);
  }
  for (const id of [1, 5, 999]) assert.equal(dynamicRuleList(id), null);
  assert.equal(dynamicRuleList(100000 * (RULESET_IDS.length + 1) + 1), null);
});

test('a list copy counts in the popup as its list, and Adult sites never counts', () => {
  const match = (rulesetId, ruleId) => ({ rule: { rulesetId, ruleId } });
  const matches = [
    match('_dynamic', dynamicRuleId('ads', 3)),
    match('_dynamic', dynamicRuleId('ads', 1000002)),
    match('_dynamic', dynamicRuleId('trackers-hagezi-light', 1)),
    match('_dynamic', dynamicRuleId('harmful-badware', 1)),
    match('_dynamic', dynamicRuleId('adult-hagezi-nsfw', 1)),
    match('_dynamic', BLOCKED_RULE_ID),
    match('ads', 4),
  ];
  assert.equal(countBlocked(matches), 5);
  assert.deepEqual(splitBlocked(matches), [
    { label: 'groupAds', count: 2 },
    { label: 'groupTrackers', count: 1 },
    { label: 'harmful', count: 1 },
    { label: 'groupYourSites', count: 1 },
  ]);
});

test('the extension builds Harmful and Adult rules from served domains exactly as the build does', () => {
  const text = '||evil.example^$all\n||phish.example^$doc\n||drop.example^\n@@||ok.evil.example^\n';
  for (const [listId, options] of [['harmful-badware', { plainRules: 'block' }], ['adult-hagezi-nsfw', { plainRules: 'block', adult: true }]]) {
    const built = convertHarmful(text, { listId, extensionId: EXTENSION_ID, ...options }).rules;
    const served = JSON.parse(hostDomains(built));
    assert.deepEqual(hostRules({ listId, extensionId: EXTENSION_ID, adult: Boolean(options.adult), ...served }), built, listId);
    const copy = listRules(listId, served, EXTENSION_ID);
    assert.deepEqual(copy.map(({ id }) => dynamicRuleList(id).ruleset), built.map(() => listId));
    assert.deepEqual(copy.map(({ action }) => action), built.map(({ action }) => action));
  }
});

const SUMMARY = {
  lists: [
    { ruleset: 'ads', available: true, snapshotSha256: sha('a'), snapshotDate: '2026-11-07' },
    { ruleset: 'trackers', available: true, snapshotSha256: sha('b'), snapshotDate: '2026-11-07' },
    { ruleset: 'iran', available: true, snapshotSha256: sha('c'), snapshotDate: '2026-11-07' },
    { ruleset: 'harmful-badware', available: true, snapshotSha256: sha('d'), snapshotDate: '2026-11-07' },
    { ruleset: 'popups-adguard', available: false },
  ],
};
const file = (count) => ({ path: 'lists/x.json', sha256: sha('f'), bytes: 10, count });

test('a served list replaces the bundled one only when it differs and is not older', () => {
  const bundled = SUMMARY.lists[0];
  assert.equal(qualifies({ snapshot: { date: '2026-11-08', sha256: sha('e') } }, bundled), true);
  assert.equal(qualifies({ snapshot: { date: '2026-11-07', sha256: sha('e') } }, bundled), true);
  assert.equal(qualifies({ snapshot: { date: '2026-11-08', sha256: sha('a') } }, bundled), false, 'same source as the build');
  assert.equal(qualifies({ snapshot: { date: '2026-11-06', sha256: sha('e') } }, bundled), false, 'older than the build');
  assert.equal(qualifies({ snapshot: { date: '2026-11-08', sha256: sha('e') } }, SUMMARY.lists[4]), false, 'not in this build');
  assert.equal(qualifies({ snapshot: { date: '2026-11-08', sha256: sha('e') } }, undefined), false);
});

test('only the kinds the extension applies are kept, and a list in the wrong form is refused', () => {
  const snapshot = { date: '2026-11-08', sha256: sha('e') };
  const version = {
    lists: {
      ads: { snapshot, files: { rules: file(10), sites: file(3), generic: file(2), popup: file(1), genericOff: file(0), licence: file() } },
      trackers: { snapshot: { date: '2026-11-08', sha256: sha('b') }, files: { rules: file(5) } },
      'harmful-badware': { snapshot, files: { domains: file(100) } },
      unknown: { snapshot, files: { rules: file(5) } },
    },
  };
  const declared = ['ads', 'trackers', 'iran', 'harmful-badware'];
  const { lists, problems } = wantedFiles(version, SUMMARY, declared);
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.keys(lists), ['ads', 'harmful-badware']);
  assert.deepEqual(Object.keys(lists.ads.files), ['rules', 'sites', 'popup', 'genericOff']);
  assert.equal(dynamicRuleCount(lists), 12);
  assert.equal(fitsDynamicRules(lists, 12 + OWN_RULES_RESERVE), true);
  assert.equal(fitsDynamicRules(lists, 11 + OWN_RULES_RESERVE), false);

  const wrong = wantedFiles({ lists: { 'harmful-badware': { snapshot, files: { rules: file(1) } }, iran: { snapshot, files: { domains: file(1) } } } }, SUMMARY, declared);
  assert.equal(wrong.problems.length, 2);
});

test('versions compare part by part as numbers', () => {
  assert.equal(compareVersions('0.3.10', '0.3.9'), 1);
  assert.equal(compareVersions('0.3.4', '0.3.4'), 0);
  assert.equal(compareVersions('0.3.4', '1.0.0'), -1);
  assert.equal(newerVersion({ extension: '0.3.5' }, '0.3.4'), '0.3.5');
  assert.equal(newerVersion({ extension: '0.3.4' }, '0.3.4'), null);
  assert.equal(newerVersion({ extension: '0.3.3' }, '0.3.4'), null);
  assert.equal(newerVersion({ extension: null }, '0.3.4'), null);
  assert.equal(newerVersion(null, '0.3.4'), null);
});

test('data older than the data in use is refused, and the floor outlives a new build', () => {
  const record = { generated: '2026-11-08T03:17:00Z', floor: '2026-11-08T03:17:00Z' };
  assert.equal(compareGenerated('2026-11-07T03:17:00Z', record), 'older');
  assert.equal(compareGenerated('2026-11-08T03:17:00Z', record), 'same');
  assert.equal(compareGenerated('2026-11-09T03:17:00Z', record), 'newer');
  assert.equal(compareGenerated('2026-11-01T03:17:00Z', null), 'newer');
  const dropped = droppedRecord({ ...record, lists: { ads: {} }, extension: '0.3.5', status: 'ok', checkedAt: 5 }, '0.3.5');
  assert.deepEqual(dropped, { build: '0.3.5', floor: '2026-11-08T03:17:00Z', checkedAt: 5, status: null });
  // The same data comes in again after a new build, so the lists newer than the build return.
  assert.equal(compareGenerated('2026-11-08T03:17:00Z', dropped), 'newer');
  assert.equal(compareGenerated('2026-11-07T03:17:00Z', dropped), 'older');
});

test('an updated genericOff list replaces the build\'s in the registered script', () => {
  const index = { seed: 'x', lists: [{ id: 'ads', sites: 's1', generic: 'a.css', genericOff: ['off.com'] }] };
  const record = { lists: { ads: { files: { genericOff: { sha256: sha('1') } } } } };
  const stored = { [fileKey('ads', 'genericOff')]: { sha256: sha('1'), data: ['new.com', 'off.com'] } };
  const overrides = genericOffOverrides(record, stored);
  assert.deepEqual(overrides, { ads: ['new.com', 'off.com'] });
  assert.deepEqual(genericOffOverrides(record, { [fileKey('ads', 'genericOff')]: { sha256: sha('2'), data: [] } }), {});
  const settings = normalizeSettings({});
  const registered = wantedScripts(settings, index);
  const { add, update, remove } = scriptChanges(wantedScripts(settings, index, overrides), registered);
  assert.deepEqual({ add, remove }, { add: [], remove: [] });
  assert.deepEqual(update.map(({ excludeMatches }) => excludeMatches), [['*://*.new.com/*', '*://*.off.com/*']]);
});

test('every id on the settings page is used once', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../src/settings/settings.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
  assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
});
