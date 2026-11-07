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
  BLOCKED_PAGE_RULE_ID,
  BLOCKED_RULE_ID,
  HOST_OF_ADDRESS,
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
import { ownBlockedRedirect, readBlocked } from '../src/shared/harmful.js';
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

const OWN_ID = 'hgfgdeboohokimlkibkjlhgppmpdpgal';
const OWN = ownBlockedRedirect(OWN_ID);

test('blocked sites are a block for what pages load and a redirect for the site itself, both above the pause rule', () => {
  const [block, page] = blockedRules(normalizeSettings({ blockedSites: ['a.com', 'b.ir'] }), OWN);
  assert.equal(block.id, BLOCKED_RULE_ID);
  assert.equal(page.id, BLOCKED_PAGE_RULE_ID);
  assert.equal(new Set([PAUSED_RULE_ID, BLOCKED_RULE_ID, BLOCKED_PAGE_RULE_ID]).size, 3);
  for (const rule of [block, page]) {
    assert.ok(rule.priority > pausedRules(['x.com'])[0].priority);
    assert.deepEqual(rule.condition.requestDomains, ['a.com', 'b.ir']);
  }
  assert.equal(block.action.type, 'block');
  assert.ok(!block.condition.resourceTypes.includes('main_frame'));
  assert.equal(block.condition.resourceTypes.length, 14);
  assert.deepEqual(page.action, { type: 'redirect', redirect: { regexSubstitution: `chrome-extension://${OWN_ID}/blocked/blocked.html?list=own&h=\\1` } });
  assert.deepEqual(page.condition.resourceTypes, ['main_frame']);
  assert.equal(page.condition.regexFilter, HOST_OF_ADDRESS);
});

test('the own blocked page gets the host alone, and reads it back', () => {
  const regex = new RegExp(HOST_OF_ADDRESS);
  const substitute = (url) => url.replace(regex, OWN.regexSubstitution.replace('\\1', '$1'));
  const landed = substitute('https://user@sub.a.com:8443/path?q=secret#frag');
  assert.equal(landed, `chrome-extension://${OWN_ID}/blocked/blocked.html?list=own&h=sub.a.com`);
  assert.deepEqual(readBlocked(new URL(landed).search), { list: 'own', host: 'sub.a.com' });
  assert.throws(() => ownBlockedRedirect('not-an-id'));
});

test('blocked sites follow the master switch, and nothing else', () => {
  assert.deepEqual(blockedRules(normalizeSettings({}), OWN), []);
  assert.deepEqual(blockedRules(normalizeSettings({ master: false, blockedSites: ['a.com'] }), OWN), []);
  assert.equal(blockedRules(normalizeSettings({ blockedSites: ['a.com'], pausedSites: ['b.com'], groups: { ads: false } }), OWN).length, 2);
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
    for (const own of blockedRules(normalizeSettings({ blockedSites: ['x.com'] }), OWN)) assert.ok(rule.priority < own.priority);
  }
  const ids = [PAUSED_RULE_ID, BLOCKED_RULE_ID, BLOCKED_PAGE_RULE_ID, ALLOWED_RULE_ID, EXCEPTIONS_RULE_ID];
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

// Adult sites is the one group the popup never counts.
test('every ruleset but Adult sites belongs to one counted group, and every group has its name in both languages', () => {
  const { rule_resources: resources } = JSON.parse(read('../src/manifest.json')).declarative_net_request;
  const owned = BLOCK_GROUPS.flatMap(({ rulesets }) => rulesets).filter((id) => id !== '_dynamic');
  assert.deepEqual([...owned, ...GROUP_RULESETS.adult].sort(), resources.map(({ id }) => id).sort());
  assert.ok(!owned.some((id) => GROUP_RULESETS.adult.includes(id)));
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
  // Chrome turns on what the manifest says before the worker first runs, so Adult sites starts off there too.
  for (const { id, enabled } of resources) assert.equal(enabled, !GROUP_RULESETS.adult.includes(id), id);
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
