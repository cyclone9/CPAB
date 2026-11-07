// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ANY_WEB_ADDRESS, BLOCK_RULE_ID, SHARED_HOSTING, WARN_RULE_ID, convertHarmful, extensionId } from '../scripts/convert-harmful.js';
import { LISTS } from '../scripts/lists.config.js';
import { CONTINUE_PRIORITY, HARMFUL_PRIORITY, allowedRules, blockedRules, harmfulRunning, pausedRules, wantedRulesets } from '../src/shared/blocking.js';
import { ownBlockedRedirect } from '../src/shared/harmful.js';
import { CONTINUE_PREFIX, CONTINUE_STALE_MS, continueRecord, continueRule, readWarning, staleContinues, staysOnHost, warningRedirect } from '../src/shared/harmful.js';
import { GROUP_RULESETS, RULESET_IDS, normalizeSettings } from '../src/shared/settings.js';

const ID = 'hgfgdeboohokimlkibkjlhgppmpdpgal';
const manifest = JSON.parse(readFileSync(new URL('../src/manifest.json', import.meta.url), 'utf8'));
const convert = (text, plainRules = 'block') => convertHarmful(text, { listId: 'harmful-badware', extensionId: ID, plainRules });
const rule = (result, id) => result.rules.find((entry) => entry.id === id);

test('the extension ID comes from the manifest key', () => {
  assert.equal(extensionId(manifest.key), ID);
});

test('the warning rule sends whole hosts to the warning page, with the address last', () => {
  const result = convert('||bad.example^$doc');
  assert.deepEqual(result.rules, [{
    id: WARN_RULE_ID,
    priority: HARMFUL_PRIORITY,
    action: { type: 'redirect', redirect: { regexSubstitution: `chrome-extension://${ID}/warning/warning.html?list=harmful-badware&u=\\0` } },
    condition: { requestDomains: ['bad.example'], regexFilter: ANY_WEB_ADDRESS, resourceTypes: ['main_frame'] },
  }]);
});

test('Badware: $doc warns, $all warns and blocks, a bare host only blocks what pages load', () => {
  const result = convert(['||doc.example^$doc', '||all.example^$all', '||plain.example^', '||noted.example^$doc,reason=malicious'].join('\n'));
  assert.deepEqual(rule(result, WARN_RULE_ID).condition.requestDomains, ['all.example', 'doc.example', 'noted.example']);
  assert.deepEqual(rule(result, BLOCK_RULE_ID).condition, { requestDomains: ['all.example', 'plain.example'], excludedResourceTypes: ['main_frame'] });
  assert.equal(rule(result, BLOCK_RULE_ID).action.type, 'block');
  assert.equal(rule(result, BLOCK_RULE_ID).priority, HARMFUL_PRIORITY);
});

test('a list of bare hosts can be warn only, with no block rule', () => {
  const result = convert('||a.example^\n||b.example^', 'warn');
  assert.equal(result.rules.length, 1);
  assert.deepEqual(rule(result, WARN_RULE_ID).condition.requestDomains, ['a.example', 'b.example']);
});

test('lines that name part of a site, or carry other conditions, are dropped and counted, never widened', () => {
  const result = convert([
    '||site.example/downloads/$doc',
    '||site.example/*.shtml$all',
    'bad-path.php$doc',
    '||ip.example^$doc,ipaddress=1.2.3.4',
    '||dom.example^$all,domain=~ok.example',
    '||to.example^$doc,to=com',
    '||frame.example^$doc,frame',
    'example.com##.ad',
    '@@||site.example/app/$doc',
  ].join('\n'));
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.dropped, {
    'part of a site, not a whole host': 3,
    $ipaddress: 1,
    $domain: 1,
    $to: 1,
    $subdocument: 1,
    cosmetic: 1,
    'exception for part of a site': 1,
  });
});

test('a whole shared hosting root is never warned, but a site under it is', () => {
  const lines = SHARED_HOSTING.map((host) => `||${host}^$all`);
  const result = convert([...lines, '||phish.github.io^$doc'].join('\n'));
  assert.deepEqual(rule(result, WARN_RULE_ID).condition.requestDomains, ['phish.github.io']);
  assert.equal(rule(result, BLOCK_RULE_ID), undefined);
  assert.equal(result.dropped['shared hosting root'], SHARED_HOSTING.length);
});

test('private addresses and invalid hosts are dropped', () => {
  const result = convert('||10.0.0.1^$doc\n||192.168.1.1^$all\n||bad_host!^$doc\n||ok.example^$doc');
  assert.deepEqual(rule(result, WARN_RULE_ID).condition.requestDomains, ['ok.example']);
  assert.equal(result.dropped['private address'], 2);
});

test('a host exception carves its host out of both rules', () => {
  const result = convert('||example.com^$all\n@@||safe.example.com^$doc');
  assert.deepEqual(rule(result, WARN_RULE_ID).condition.excludedRequestDomains, ['safe.example.com']);
  assert.deepEqual(rule(result, BLOCK_RULE_ID).condition.excludedRequestDomains, ['safe.example.com']);
});

test('$badfilter cancels a warning', () => {
  const result = convert('||gone.example^$doc\n||gone.example^$doc,badfilter\n||kept.example^$doc');
  assert.deepEqual(rule(result, WARN_RULE_ID).condition.requestDomains, ['kept.example']);
});

test('the redirect is built here, never from list data', () => {
  assert.throws(() => warningRedirect('not-an-id', 'harmful-badware'));
  assert.throws(() => warningRedirect(ID, 'x&u=https://elsewhere'));
});

test('priorities: a person\'s blocked site over Continue once, over the warning, over the rest', () => {
  const settings = normalizeSettings({ pausedSites: ['a.com'], blockedSites: ['b.com'], allowedSites: ['c.com'] });
  const [paused] = pausedRules(settings.pausedSites);
  const [blocked, ownPage] = blockedRules(settings, ownBlockedRedirect(ID));
  const [allowed] = allowedRules(settings, []);
  assert.ok(ownPage.priority > CONTINUE_PRIORITY);
  assert.ok(CONTINUE_PRIORITY > HARMFUL_PRIORITY);
  assert.ok(HARMFUL_PRIORITY > blocked.priority);
  assert.ok(HARMFUL_PRIORITY > paused.priority);
  assert.ok(HARMFUL_PRIORITY > allowed.priority);
});

test('Harmful sites ignore the master switch and pausing, and follow only their own switches', () => {
  const harmful = GROUP_RULESETS.harmful;
  const only = (settings) => wantedRulesets(normalizeSettings(settings), RULESET_IDS).filter((id) => harmful.includes(id));
  assert.deepEqual(only({}), harmful);
  assert.deepEqual(only({ master: false }), harmful);
  assert.deepEqual(only({ pausedSites: ['a.com'] }), harmful);
  assert.deepEqual(only({ groups: { harmful: false } }), []);
  assert.deepEqual(only({ master: false, lists: { 'harmful-badware': false } }), ['harmful-hagezi-tif']);
  assert.equal(harmfulRunning(normalizeSettings({ master: false })), true);
  assert.equal(harmfulRunning(normalizeSettings({ groups: { harmful: false } })), false);
  assert.equal(harmfulRunning(normalizeSettings({ lists: { 'harmful-badware': false, 'harmful-hagezi-tif': false } })), false);
});

test('the list config marks both harmful lists and says what a bare host means', () => {
  const harmful = LISTS.filter((list) => list.harmful);
  assert.deepEqual(harmful.map(({ ruleset }) => ruleset), GROUP_RULESETS.harmful);
  assert.deepEqual(Object.fromEntries(harmful.map(({ ruleset, plainRules }) => [ruleset, plainRules])), { 'harmful-hagezi-tif': 'warn', 'harmful-badware': 'block' });
  assert.ok(manifest.web_accessible_resources.some(({ resources }) => resources.includes('warning/warning.html')));
});

test('the warning page reads its list and the whole address back, fragment included', () => {
  const { list, url } = readWarning('?list=harmful-hagezi-tif&u=https://bad.example/a?b=1&c=%26', '#top');
  assert.equal(list, 'harmful-hagezi-tif');
  assert.equal(url.href, 'https://bad.example/a?b=1&c=%26#top');
  assert.equal(url.hostname, 'bad.example');
  assert.deepEqual(readWarning(''), { list: null, url: null });
  assert.equal(readWarning('?list=x&u=javascript:alert(1)').url, null);
  assert.equal(readWarning('?list=x&u=chrome://settings').url, null);
});

test('Continue once is an allow rule for one tab, one host, main frame only', () => {
  assert.deepEqual(continueRule(7, 'bad.example'), {
    id: 8,
    priority: CONTINUE_PRIORITY,
    action: { type: 'allow' },
    condition: { requestDomains: ['bad.example'], resourceTypes: ['main_frame'], tabIds: [7] },
  });
});

test('a Continue once runs out after an hour, and a record in an older shape counts as run out', () => {
  const now = 10 * CONTINUE_STALE_MS;
  const stored = {
    [`${CONTINUE_PREFIX}1`]: continueRecord('a.example', now - CONTINUE_STALE_MS),
    [`${CONTINUE_PREFIX}2`]: continueRecord('b.example', now - CONTINUE_STALE_MS + 1000),
    [`${CONTINUE_PREFIX}3`]: now - 10,
    'popupWatch:4': 0,
  };
  assert.deepEqual(staleContinues(stored, now), [1, 3]);
});

test('the tab keeps Continue once on the same host and its subdomains, and leaves it anywhere else', () => {
  const record = continueRecord('bad.example', 0);
  assert.equal(staysOnHost(record, 'https://bad.example/other/page?x=1'), true);
  assert.equal(staysOnHost(record, 'http://bad.example/'), true);
  assert.equal(staysOnHost(record, 'https://www.bad.example/'), true);
  assert.equal(staysOnHost(record, 'https://notbad.example/'), false);
  assert.equal(staysOnHost(record, 'https://bad.example.evil.test/'), false);
  assert.equal(staysOnHost(record, 'https://example/'), false);
  assert.equal(staysOnHost(record, 'not an address'), false);
  assert.equal(staysOnHost(1234, 'https://bad.example/'), false);
});

// The worker module, against a fake chrome that keeps session rules and storage.session in memory.
function fakeChrome() {
  const listeners = {};
  const on = (name) => ({ addListener: (listener) => { listeners[name] = listener; } });
  const session = new Map();
  const rules = new Map();
  const chrome = {
    runtime: { id: 'self', getURL: (path) => `chrome-extension://self/${path}`, onMessage: on('message') },
    webNavigation: { onCommitted: on('committed') },
    tabs: { onRemoved: on('removed') },
    storage: {
      session: {
        get: async (key) => (key === null ? Object.fromEntries(session) : session.has(key) ? { [key]: session.get(key) } : {}),
        set: async (items) => { for (const [key, value] of Object.entries(items)) session.set(key, value); },
        remove: async (keys) => { for (const key of [].concat(keys)) session.delete(key); },
      },
    },
    declarativeNetRequest: {
      updateSessionRules: async ({ removeRuleIds = [], addRules = [] }) => {
        for (const id of removeRuleIds) rules.delete(id);
        for (const entry of addRules) rules.set(entry.id, entry);
      },
    },
  };
  return { chrome, listeners, session, rules };
}

test('Continue once: the warning page asks, the tab keeps one rule on that host, and leaving the host takes it back', async () => {
  const fake = fakeChrome();
  globalThis.chrome = fake.chrome;
  fake.session.set(`${CONTINUE_PREFIX}99`, continueRecord('old.example', Date.now() - CONTINUE_STALE_MS));
  fake.rules.set(100, continueRule(99, 'old.example'));
  await import(`../src/background/harmful.js?${Date.now()}`);
  await new Promise((done) => setTimeout(done, 10));
  assert.ok(!fake.rules.has(100), 'a worker start clears what ran out');

  const ask = (message, sender) => new Promise((done) => {
    const pending = fake.listeners.message(message, sender, done);
    if (!pending) done('ignored');
  });
  const page = { id: 'self', url: 'chrome-extension://self/warning/warning.html?list=x&u=https://bad.example/', tab: { id: 5 } };

  assert.equal(await ask({ type: 'harmfulContinue', url: 'https://bad.example/' }, { ...page, url: 'https://evil.example/' }), 'ignored');
  assert.equal(await ask({ type: 'harmfulContinue', url: 'https://bad.example/' }, { ...page, id: 'other' }), 'ignored');
  assert.deepEqual(await ask({ type: 'harmfulContinue', url: 'javascript:alert(1)' }, page), { ok: false });
  assert.equal(fake.rules.size, 0);

  assert.deepEqual(await ask({ type: 'harmfulContinue', url: 'https://bad.example/path' }, page), { ok: true });
  assert.deepEqual([...fake.rules.values()], [continueRule(5, 'bad.example')]);

  const commit = async (details) => {
    fake.listeners.committed(details);
    await new Promise((done) => setTimeout(done, 10));
  };
  await commit({ tabId: 6, frameId: 0, url: 'https://elsewhere.example/' });
  await commit({ tabId: 5, frameId: 1, url: 'https://elsewhere.example/' });
  await commit({ tabId: 5, frameId: 0, url: 'https://elsewhere.example/', documentLifecycle: 'prerender' });
  assert.equal(fake.rules.size, 1, 'another tab, a frame or a prerender leaves it');

  await commit({ tabId: 5, frameId: 0, url: 'https://bad.example/path' });
  await commit({ tabId: 5, frameId: 0, url: 'https://bad.example/path' });
  await commit({ tabId: 5, frameId: 0, url: 'https://bad.example/other?page=2' });
  await commit({ tabId: 5, frameId: 0, url: 'https://cdn.bad.example/' });
  assert.equal(fake.rules.size, 1, 'the first page, a reload, a link and a subdomain keep it');
  assert.deepEqual(fake.session.get(`${CONTINUE_PREFIX}5`).host, 'bad.example');

  await commit({ tabId: 5, frameId: 0, url: 'https://elsewhere.example/' });
  assert.equal(fake.rules.size, 0, 'another host takes it back');
  assert.ok(!fake.session.has(`${CONTINUE_PREFIX}5`));

  await ask({ type: 'harmfulContinue', url: 'https://bad.example/' }, page);
  fake.listeners.removed(5);
  await new Promise((done) => setTimeout(done, 10));
  assert.equal(fake.rules.size, 0, 'closing the tab takes it back');
  delete globalThis.chrome;
});
