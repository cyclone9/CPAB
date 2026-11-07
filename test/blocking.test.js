// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { convertList } from '../scripts/convert.js';
import { LISTS } from '../scripts/lists.config.js';
import {
  ALLOWED_RULE_ID,
  ALLOW_RULE_ID_BASE,
  BADGE_COLORS,
  BLOCKED_RULE_ID,
  BLOCK_GROUPS,
  EXCEPTIONS_RULE_ID,
  PAUSED_RULE_ID,
  allowedDomains,
  allowedRules,
  blockedRules,
  countBlocked,
  pausedRules,
  splitBlocked,
  wantedRulesets,
} from '../src/shared/blocking.js';
import { STRINGS } from '../src/i18n/strings.js';
import { GROUP_RULESETS, RULESET_IDS, normalizeSettings } from '../src/shared/settings.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('wanted rulesets follow the master switch and the groups', () => {
  const declared = ['ads', 'trackers', 'iran'];
  assert.deepEqual(wantedRulesets(normalizeSettings({}), declared), declared);
  assert.deepEqual(wantedRulesets(normalizeSettings({ master: false }), declared), []);
  assert.deepEqual(wantedRulesets(normalizeSettings({ groups: { ads: false } }), declared), ['trackers']);
});

test('a list runs only with its group and its own switch on', () => {
  const declared = ['ads', 'ads-adguard-base', 'trackers', 'iran'];
  assert.deepEqual(wantedRulesets(normalizeSettings({}), declared), declared);
  assert.deepEqual(wantedRulesets(normalizeSettings({ lists: { 'ads-adguard-base': false } }), declared), ['ads', 'trackers', 'iran']);
  assert.deepEqual(wantedRulesets(normalizeSettings({ lists: { ads: false } }), declared), ['ads-adguard-base', 'trackers', 'iran']);
  assert.deepEqual(wantedRulesets(normalizeSettings({ lists: { ads: false, 'ads-adguard-base': false } }), declared), ['trackers', 'iran']);
  assert.deepEqual(wantedRulesets(normalizeSettings({ lists: { iran: false } }), declared), ['ads', 'ads-adguard-base', 'trackers']);
});

test('a group off stops all its lists, and turning it back on restores each list\'s own choice', () => {
  const declared = ['ads', 'ads-adguard-base', 'trackers', 'iran'];
  const choice = { lists: { 'ads-adguard-base': false } };
  const off = normalizeSettings({ ...choice, groups: { ads: false } });
  assert.deepEqual(wantedRulesets(off, declared), ['trackers']);
  assert.equal(off.lists.ads, true);
  assert.equal(off.lists['ads-adguard-base'], false);
  const on = normalizeSettings({ ...off, groups: { ...off.groups, ads: true } });
  assert.deepEqual(wantedRulesets(on, declared), ['ads', 'trackers', 'iran']);
});

test('the master switch stops every list but Harmful sites, and loses no list\'s choice', () => {
  const settings = normalizeSettings({ master: false, lists: { ads: false } });
  assert.deepEqual(wantedRulesets(settings, RULESET_IDS), GROUP_RULESETS.harmful);
  assert.equal(settings.lists.ads, false);
  assert.equal(settings.lists['ads-adguard-base'], true);
});

test('a ruleset this build left out is never asked for', () => {
  assert.deepEqual(wantedRulesets(normalizeSettings({}), ['ads', 'trackers']), ['ads', 'trackers']);
});

test('paused sites are one allowAllRequests rule above every block and allow rule', () => {
  assert.deepEqual(pausedRules([]), []);
  assert.deepEqual(pausedRules(['a.com', 'b.ir']), [{
    id: PAUSED_RULE_ID,
    priority: 3,
    action: { type: 'allowAllRequests' },
    condition: { requestDomains: ['a.com', 'b.ir'], resourceTypes: ['main_frame', 'sub_frame'] },
  }]);
});

test('blocked sites are one rule above the pause rule, on every resource type', () => {
  const [rule] = blockedRules(normalizeSettings({ blockedSites: ['a.com', 'b.ir'] }));
  assert.equal(rule.id, BLOCKED_RULE_ID);
  assert.notEqual(rule.id, PAUSED_RULE_ID);
  assert.ok(rule.priority > pausedRules(['x.com'])[0].priority);
  assert.equal(rule.action.type, 'block');
  assert.deepEqual(rule.condition.requestDomains, ['a.com', 'b.ir']);
  assert.ok(rule.condition.resourceTypes.includes('main_frame'));
  assert.equal(rule.condition.resourceTypes.length, 15);
});

test('blocked sites follow the master switch, and nothing else', () => {
  assert.deepEqual(blockedRules(normalizeSettings({})), []);
  assert.deepEqual(blockedRules(normalizeSettings({ master: false, blockedSites: ['a.com'] })), []);
  assert.equal(blockedRules(normalizeSettings({ blockedSites: ['a.com'], pausedSites: ['b.com'], groups: { ads: false } })).length, 1);
});

test('allowed addresses and the exceptions are two allow rules, above list blocks and below the pause and blocked-sites rules', () => {
  const rules = allowedRules(normalizeSettings({ allowedSites: ['a.com', 'b.ir'] }), ['seal.ir']);
  assert.deepEqual(rules.map(({ id }) => id), [ALLOWED_RULE_ID, EXCEPTIONS_RULE_ID]);
  const [mine, recommended] = rules;
  assert.equal(mine.action.type, 'allow');
  assert.deepEqual(mine.condition.requestDomains, ['a.com', 'b.ir']);
  assert.deepEqual(recommended.condition.requestDomains, ['seal.ir']);
  assert.equal(mine.condition.resourceTypes.length, 15);
  const listBlock = convertList('||ads.com^').rules[0];
  const listAllow = convertList('@@||ads.com^').rules[0];
  for (const rule of rules) {
    assert.ok(rule.priority > listBlock.priority);
    assert.ok(rule.priority >= listAllow.priority);
    assert.ok(rule.priority < pausedRules(['x.com'])[0].priority);
    assert.ok(rule.priority < blockedRules(normalizeSettings({ blockedSites: ['x.com'] }))[0].priority);
  }
  const ids = [PAUSED_RULE_ID, BLOCKED_RULE_ID, ALLOWED_RULE_ID, EXCEPTIONS_RULE_ID];
  assert.equal(new Set(ids).size, ids.length);
});

test('allowed addresses follow the master switch, and the exceptions their own switch too', () => {
  assert.deepEqual(allowedRules(normalizeSettings({}), []), []);
  assert.deepEqual(allowedRules(normalizeSettings({ master: false, allowedSites: ['a.com'] }), ['seal.ir']), []);
  const off = allowedRules(normalizeSettings({ allowedSites: ['a.com'], recommendedExceptions: false }), ['seal.ir']);
  assert.deepEqual(off.map(({ id }) => id), [ALLOWED_RULE_ID]);
  const onlyExceptions = allowedRules(normalizeSettings({ groups: { ads: false, trackers: false } }), ['seal.ir']);
  assert.deepEqual(onlyExceptions.map(({ id }) => id), [EXCEPTIONS_RULE_ID]);
  assert.deepEqual(allowedRules(normalizeSettings({ pausedSites: ['a.com'] }), []), []);
});

test('the allowed domains for the popup closer are the person\'s own, then the exceptions while on', () => {
  assert.deepEqual(allowedDomains(normalizeSettings({ allowedSites: ['a.com'] }), ['seal.ir']), ['a.com', 'seal.ir']);
  assert.deepEqual(allowedDomains(normalizeSettings({ allowedSites: ['a.com'], recommendedExceptions: false }), ['seal.ir']), ['a.com']);
});

test('a dynamic match counts only for the blocked-sites rule, never the pause or allow rules', () => {
  const allow = (ruleId) => ({ rule: { rulesetId: '_dynamic', ruleId } });
  assert.equal(countBlocked([allow(ALLOWED_RULE_ID), allow(EXCEPTIONS_RULE_ID)]), 0);
  assert.deepEqual(splitBlocked([allow(ALLOWED_RULE_ID), allow(EXCEPTIONS_RULE_ID)]), []);
});

test('a dynamic match counts only for the blocked-sites rule, never the pause rule', () => {
  const dynamic = (ruleId) => ({ rule: { rulesetId: '_dynamic', ruleId } });
  assert.equal(countBlocked([dynamic(BLOCKED_RULE_ID), dynamic(BLOCKED_RULE_ID), dynamic(PAUSED_RULE_ID)]), 2);
  assert.deepEqual(splitBlocked([dynamic(BLOCKED_RULE_ID), dynamic(PAUSED_RULE_ID)]), [{ label: 'groupYourSites', count: 1 }]);
  assert.deepEqual(splitBlocked([dynamic(PAUSED_RULE_ID)]), []);
});

test('the count leaves out allow rules and the pause rule', () => {
  const match = (rulesetId, ruleId) => ({ rule: { rulesetId, ruleId } });
  assert.equal(countBlocked([
    match('ads', 1),
    match('ads', 1),
    match('trackers', 7),
    match('ads', ALLOW_RULE_ID_BASE + 1),
    match('_dynamic', PAUSED_RULE_ID),
  ]), 3);
});

test('the split counts each group in order, with allow rules and the pause rule left out', () => {
  const match = (rulesetId, ruleId) => ({ rule: { rulesetId, ruleId } });
  const matches = [
    match('iran', 1),
    match('ads', 1),
    match('ads', 2),
    match('trackers', 7),
    match('ads', ALLOW_RULE_ID_BASE + 1),
    match('trackers', ALLOW_RULE_ID_BASE + 2),
    match('_dynamic', PAUSED_RULE_ID),
  ];
  const split = splitBlocked(matches);
  assert.deepEqual(split, [
    { label: 'groupAds', count: 3 },
    { label: 'groupTrackers', count: 1 },
  ]);
  assert.equal(split.reduce((sum, { count }) => sum + count, 0), countBlocked(matches));
});

test('every Ads list counts under Ads', () => {
  const match = (rulesetId, ruleId) => ({ rule: { rulesetId, ruleId } });
  assert.deepEqual(splitBlocked([match('ads', 1), match('ads-adguard-base', 1), match('ads-adguard-base', 2), match('trackers', 3)]), [
    { label: 'groupAds', count: 3 },
    { label: 'groupTrackers', count: 1 },
  ]);
  assert.deepEqual(splitBlocked([match('ads-adguard-base', ALLOW_RULE_ID_BASE + 1)]), []);
});

test('the split hides groups that blocked nothing', () => {
  const allowOnly = [{ rule: { rulesetId: 'iran', ruleId: ALLOW_RULE_ID_BASE + 1 } }];
  assert.deepEqual(splitBlocked([{ rule: { rulesetId: 'trackers', ruleId: 3 } }, ...allowOnly]), [
    { label: 'groupTrackers', count: 1 },
  ]);
  assert.deepEqual(splitBlocked(allowOnly), []);
  assert.deepEqual(splitBlocked([]), []);
});

test('a group joins by one entry, and that entry can own several rulesets', () => {
  const groups = [...BLOCK_GROUPS, { label: 'groupPopups', rulesets: ['popups-one', 'popups-two'] }];
  const matches = [{ rule: { rulesetId: 'popups-one', ruleId: 1 } }, { rule: { rulesetId: 'popups-two', ruleId: 1 } }];
  assert.deepEqual(splitBlocked(matches, groups), [{ label: 'groupPopups', count: 2 }]);
  assert.deepEqual(splitBlocked(matches), []);
});

test('every ruleset belongs to one group, and every group has its name in both languages', () => {
  const { rule_resources: resources } = JSON.parse(read('../src/manifest.json')).declarative_net_request;
  const owned = BLOCK_GROUPS.flatMap(({ rulesets }) => rulesets).filter((id) => id !== '_dynamic');
  assert.deepEqual([...owned].sort(), resources.map(({ id }) => id).sort());
  for (const { label } of BLOCK_GROUPS) assert.ok(STRINGS.en[label] && STRINGS.fa[label], label);
});

test('the badge colours are Ink on Citron from tokens.css', () => {
  const tokens = read('../src/assets/tokens.css');
  assert.ok(tokens.includes(`--cpab-ink: ${BADGE_COLORS.text};`));
  assert.ok(tokens.includes(`--cpab-citron: ${BADGE_COLORS.background};`));
});

test('the manifest, the list config and the settings agree on the rulesets', () => {
  const manifest = JSON.parse(read('../src/manifest.json'));
  const resources = manifest.declarative_net_request.rule_resources;
  assert.deepEqual(resources.map(({ id }) => id), RULESET_IDS);
  assert.deepEqual(LISTS.map(({ ruleset }) => ruleset), RULESET_IDS);
  assert.deepEqual(resources.map(({ path }) => path), LISTS.map(({ rulesFile }) => `rules/${rulesFile}`));
  assert.ok(resources.every(({ enabled }) => enabled));
  for (const { group, ruleset } of LISTS) assert.ok(GROUP_RULESETS[group].includes(ruleset), ruleset);
});

test('every list has its own rule file and its own record', () => {
  for (const key of ['rulesFile', 'listFile', 'metaFile', 'ruleset']) {
    assert.equal(new Set(LISTS.map((list) => list[key])).size, LISTS.length, key);
  }
});

test('only the Iran list may be missing, and its record avoids the name git-guard refuses', () => {
  assert.deepEqual(LISTS.filter(({ required }) => !required).map(({ ruleset }) => ruleset), ['iran']);
  const record = LISTS.find(({ ruleset }) => ruleset === 'iran');
  assert.ok(!record.metaFile.toLowerCase().includes(record.name));
  for (const list of LISTS) assert.equal(Object.keys(list.admission.checks).length, 7);
});
