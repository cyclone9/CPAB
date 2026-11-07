// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { HOST_OF_ADDRESS, SHARED_HOSTING, WARN_RULE_ID, convertHarmful } from '../scripts/convert-harmful.js';
import { LISTS } from '../scripts/lists.config.js';
import {
  ADULT_PRIORITY,
  BLOCKED_PAGE_RULE_ID,
  CONTINUE_PRIORITY,
  HARMFUL_PRIORITY,
  adultRunning,
  allowedRules,
  blockedRules,
  countBlocked,
  harmfulRunning,
  pausedRules,
  splitBlocked,
  wantedRulesets,
} from '../src/shared/blocking.js';
import { BLOCKED_PAGE, adultRedirect, continueRule, ownBlockedRedirect, readBlocked } from '../src/shared/harmful.js';
import { DEFAULTS, GROUP_RULESETS, PROTECTION_GROUPS, RULESET_IDS, normalizeSettings } from '../src/shared/settings.js';

const ID = 'hgfgdeboohokimlkibkjlhgppmpdpgal';
const ADULT = 'adult-hagezi-nsfw';
const manifest = JSON.parse(readFileSync(new URL('../src/manifest.json', import.meta.url), 'utf8'));
const adult = (text) => convertHarmful(text, { listId: ADULT, extensionId: ID, adult: true });
const harmful = (text) => convertHarmful(text, { listId: 'harmful-hagezi-tif', extensionId: ID, plainRules: 'warn' });
const adultOnly = (settings) => wantedRulesets(normalizeSettings(settings), RULESET_IDS).filter((id) => GROUP_RULESETS.adult.includes(id));

// What Chrome does with a redirect's regexSubstitution: the first match is replaced, the rest kept.
// RE2 and JavaScript agree on this pattern, and JavaScript writes $1 where Chrome writes \1.
const redirected = (url) => url.replace(new RegExp(HOST_OF_ADDRESS, 'i'), adultRedirect(ID, ADULT).regexSubstitution.replace('\\1', '$1'));

test('Adult sites is off by default and on a fresh install', () => {
  assert.equal(DEFAULTS.groups.adult, false);
  assert.equal(normalizeSettings(undefined).groups.adult, false);
  assert.deepEqual(adultOnly({}), []);
  assert.equal(adultRunning(normalizeSettings(undefined)), false);
});

// What 0.2.6 wrote to storage: every group, with no Adult group at all.
test('an update from 0.2.6 leaves Adult sites off, whatever else was saved', () => {
  const saved = {
    master: false,
    groups: { ads: true, trackers: true, popups: true, widgets: true, harmful: true },
    lists: Object.fromEntries(RULESET_IDS.filter((id) => !id.startsWith('adult-')).map((id) => [id, true])),
    pausedSites: ['a.com'],
    blockedSites: [],
    allowedSites: [],
    recommendedExceptions: true,
    language: 'fa',
    theme: 'light',
    badge: true,
  };
  const normal = normalizeSettings(saved);
  assert.equal(normal.groups.adult, false);
  assert.deepEqual(adultOnly(saved), []);
  assert.deepEqual(normalizeSettings(normal), normal);
  // The older migrations never reach it either.
  assert.equal(normalizeSettings({ groups: { ads: false, iran: true } }).groups.adult, false);
  assert.equal(normalizeSettings({ popups: true }).groups.adult, false);
  for (const junk of ['yes', 1, null, {}, []]) assert.equal(normalizeSettings({ groups: { adult: junk } }).groups.adult, false);
});

test('only the person\'s own switch turns it on, and the master switch and pausing don\'t stop it', () => {
  const on = { groups: { adult: true } };
  assert.deepEqual(adultOnly(on), [ADULT]);
  assert.deepEqual(adultOnly({ ...on, master: false }), [ADULT]);
  assert.deepEqual(adultOnly({ ...on, pausedSites: ['a.com'] }), [ADULT]);
  assert.deepEqual(adultOnly({ ...on, lists: { [ADULT]: false } }), []);
  assert.ok(PROTECTION_GROUPS.includes('adult'));
  assert.equal(adultRunning(normalizeSettings({ ...on, master: false })), true);
  // The two protection groups are independent of each other.
  assert.equal(harmfulRunning(normalizeSettings({ ...on, groups: { adult: true, harmful: false } })), false);
  assert.equal(adultRunning(normalizeSettings({ groups: { harmful: true } })), false);
});

test('one redirect rule to the blocked page, main frame only, above Continue once and Harmful sites', () => {
  const result = adult('||a.example^\n||b.example^');
  assert.deepEqual(result.rules, [{
    id: WARN_RULE_ID,
    priority: ADULT_PRIORITY,
    action: { type: 'redirect', redirect: { regexSubstitution: `chrome-extension://${ID}/${BLOCKED_PAGE}?list=${ADULT}&h=\\1` } },
    condition: { requestDomains: ['a.example', 'b.example'], regexFilter: HOST_OF_ADDRESS, resourceTypes: ['main_frame'] },
  }]);
  assert.equal(ADULT_PRIORITY, 7);
  assert.ok(ADULT_PRIORITY > CONTINUE_PRIORITY && CONTINUE_PRIORITY > HARMFUL_PRIORITY);
});

test('nothing is blocked for other pages, even from a line that asks for it', () => {
  const result = adult('||all.example^$all\n||doc.example^$doc\n||plain.example^');
  assert.equal(result.rules.length, 1);
  assert.deepEqual(result.rules[0].condition.requestDomains, ['all.example', 'doc.example', 'plain.example']);
  assert.equal(result.blocked, 0);
});

test('the shared hosting guard, private addresses and exceptions apply as for Harmful sites', () => {
  const result = adult([...SHARED_HOSTING.map((host) => `||${host}^`), '||x.github.io^', '||10.1.2.3^', '||site.example^', '@@||ok.site.example^'].join('\n'));
  assert.deepEqual(result.rules[0].condition.requestDomains, ['site.example', 'x.github.io']);
  assert.deepEqual(result.rules[0].condition.excludedRequestDomains, ['ok.site.example']);
  assert.equal(result.dropped['shared hosting root'], SHARED_HOSTING.length);
  assert.equal(result.dropped['private address'], 1);
});

test('the blocked page gets the host only: no path, query, user name or port', () => {
  const page = `chrome-extension://${ID}/${BLOCKED_PAGE}`;
  assert.equal(redirected('https://a.example/some/path?q=secret&x=1'), `${page}?list=${ADULT}&h=a.example`);
  assert.equal(redirected('http://sub.a.example'), `${page}?list=${ADULT}&h=sub.a.example`);
  assert.equal(redirected('https://user:pw@a.example:8443/p'), `${page}?list=${ADULT}&h=a.example`);
  assert.equal(redirected('https://a.example?only=query'), `${page}?list=${ADULT}&h=a.example`);
  assert.equal(redirected('https://xn--80ak6aa92e.example/'), `${page}?list=${ADULT}&h=xn--80ak6aa92e.example`);
});

test('the blocked page reads back a plain host and nothing else', () => {
  assert.deepEqual(readBlocked(`?list=${ADULT}&h=a.example`), { list: ADULT, host: 'a.example' });
  assert.deepEqual(readBlocked(''), { list: null, host: null });
  assert.equal(readBlocked(`?list=${ADULT}&h=a.example/path`).host, null);
  assert.equal(readBlocked(`?list=${ADULT}&h=a.example&u=https://b.example/`).host, null);
  assert.equal(readBlocked(`?list=${ADULT}&h=A.EXAMPLE`).host, null);
  assert.equal(readBlocked(`?list=${ADULT}&h=a..example`).host, null);
  assert.throws(() => adultRedirect('not-an-id', ADULT));
  assert.throws(() => adultRedirect(ID, 'x&h=elsewhere'));
});

test('on a host on both lists the adult page wins, and Continue once for Harmful sites can\'t open it', () => {
  const [warn] = harmful('||both.example^').rules;
  const [block] = adult('||both.example^').rules;
  const allowOnce = continueRule(4, 'both.example');
  // Chrome takes the highest priority among the rules that match, so with all three on the host the
  // blocked page is where the tab goes.
  const winner = [warn, allowOnce, block].sort((a, b) => b.priority - a.priority)[0];
  assert.equal(winner, block);
});

test('a pause, an allowed address or what a person\'s blocked site loads sit below it, and the site itself ties', () => {
  const settings = normalizeSettings({ pausedSites: ['a.com'], blockedSites: ['b.com'], allowedSites: ['c.com'] });
  for (const rule of [...pausedRules(settings.pausedSites), ...blockedRules(settings, ownBlockedRedirect(ID)), ...allowedRules(settings, ['d.ir'])]) {
    if (rule.id === BLOCKED_PAGE_RULE_ID) assert.equal(rule.priority, ADULT_PRIORITY);
    else assert.ok(ADULT_PRIORITY > rule.priority, rule.id);
  }
});

test('Adult sites never shows in the popup\'s count', () => {
  const matches = [
    { rule: { rulesetId: ADULT, ruleId: WARN_RULE_ID } },
    { rule: { rulesetId: 'ads', ruleId: 5 } },
  ];
  assert.equal(countBlocked(matches), 1);
  assert.deepEqual(splitBlocked(matches), [{ label: 'groupAds', count: 1 }]);
});

test('the list config, the manifest and the page agree', () => {
  const lists = LISTS.filter((list) => list.adult);
  assert.deepEqual(lists.map(({ ruleset, group }) => [ruleset, group]), [[ADULT, 'adult']]);
  assert.equal(lists[0].harmful, undefined);
  assert.equal(lists[0].plainRules, undefined);
  const resource = manifest.declarative_net_request.rule_resources.find(({ id }) => id === ADULT);
  assert.equal(resource.enabled, false);
  assert.ok(manifest.web_accessible_resources.some(({ resources }) => resources.includes(BLOCKED_PAGE)));
});
