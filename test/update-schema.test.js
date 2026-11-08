// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIMITS, checkFile, checkTotals, checkVersion } from '../src/shared/update-schema.js';

const block = { id: 1, priority: 1, action: { type: 'block' }, condition: { requestDomains: ['ads.example.com'], excludedResourceTypes: ['main_frame'] } };
const allow = { id: 1000001, priority: 2, action: { type: 'allow' }, condition: { urlFilter: '||cdn.example.com/ad.js', initiatorDomains: ['example.org'], resourceTypes: ['script'] } };
const wholePage = { id: 1000002, priority: 2, action: { type: 'allowAllRequests' }, condition: { urlFilter: '||shop.example.com^', resourceTypes: ['main_frame', 'sub_frame'] } };

const rules = (...list) => checkFile('rules', JSON.stringify(list));
const problemsOf = (result) => result.problems.join('\n');

test('rules the converter writes pass', () => {
  const result = rules(block, allow, wholePage, {
    id: 2, priority: 1, action: { type: 'block' },
    condition: { urlFilter: '/banner/', domainType: 'thirdParty', isUrlFilterCaseSensitive: true, excludedInitiatorDomains: ['edu', '_sips._tcp.example.com'], excludedResourceTypes: ['main_frame', 'ping'] },
  });
  assert.deepEqual(result.problems, []);
  assert.equal(result.count, 4);
});

test('actions other than block, allow and allowAllRequests are refused', () => {
  for (const type of ['redirect', 'modifyHeaders', 'upgradeScheme', 'allow ']) {
    assert.match(problemsOf(rules({ ...block, action: { type, redirect: { url: 'https://x.example/' } } })), /not allowed/, type);
  }
  assert.match(problemsOf(rules({ ...block, action: { type: 'block', redirect: { url: 'https://x.example/' } } })), /not allowed/);
});

test('regexFilter and unknown condition keys are refused', () => {
  assert.match(problemsOf(rules({ ...block, condition: { ...block.condition, regexFilter: '.*' } })), /regexFilter is not allowed/);
  assert.match(problemsOf(rules({ ...block, condition: { ...block.condition, requestMethods: ['post'] } })), /requestMethods is not allowed/);
  assert.match(problemsOf(rules({ ...block, condition: { ...block.condition, tabIds: [1] } })), /tabIds is not allowed/);
  assert.match(problemsOf(rules({ ...block, extra: 1 })), /key extra/);
});

test('priorities above the converter\'s are refused, so data cannot lift Harmful or Adult sites', () => {
  assert.match(problemsOf(rules({ ...allow, priority: 8 })), /priority 8/);
  assert.match(problemsOf(rules({ ...block, priority: 2 })), /priority 2/);
});

test('block and allow rules stay off main_frame', () => {
  assert.match(problemsOf(rules({ ...block, condition: { requestDomains: ['a.example'], resourceTypes: ['main_frame'] } })), /main_frame/);
  assert.match(problemsOf(rules({ ...block, condition: { requestDomains: ['a.example'] } })), /main_frame/);
  assert.match(problemsOf(rules({ ...wholePage, condition: { urlFilter: '||a.example^', resourceTypes: ['script'] } })), /main_frame or sub_frame/);
  assert.match(problemsOf(rules({ ...block, condition: { requestDomains: ['a.example'], resourceTypes: ['bogus'] } })), /invalid resourceTypes/);
});

test('ids, domains and filters are checked', () => {
  assert.match(problemsOf(rules(block, { ...block })), /used twice/);
  assert.match(problemsOf(rules({ ...block, id: 0 })), /invalid id/);
  assert.match(problemsOf(rules({ ...block, condition: { ...block.condition, requestDomains: ['Bad Domain'] } })), /invalid domain/);
  assert.match(problemsOf(rules({ ...block, condition: { ...block.condition, requestDomains: [] } })), /not a list of domains/);
  assert.match(problemsOf(rules({ ...allow, condition: { ...allow.condition, urlFilter: '||*x' } })), /invalid urlFilter/);
  assert.match(problemsOf(rules({ ...allow, condition: { ...allow.condition, urlFilter: 'a b' } })), /invalid urlFilter/);
  assert.match(problemsOf(rules({ ...allow, condition: { resourceTypes: ['script'] } })), /neither a urlFilter nor requestDomains/);
  assert.match(problemsOf(checkFile('rules', '{')), /not valid JSON/);
  assert.match(problemsOf(checkFile('rules', '{}')), /not a list of rules/);
});

test('a rule may hold 300,000 domains and no more', () => {
  const domains = (count) => Array.from({ length: count }, (_, index) => `d${index}.example`);
  assert.deepEqual(rules({ ...block, condition: { ...block.condition, requestDomains: domains(LIMITS.domainsPerRule) } }).problems, []);
  assert.match(problemsOf(rules({ ...block, condition: { ...block.condition, requestDomains: domains(LIMITS.domainsPerRule + 1) } })), /300000/);
});

test('generic CSS takes hiding rules only', () => {
  const good = '.ad{display:none!important}\n@container not style(--cpab-allow-0123456789ab:1){#banner{display:none!important}}';
  assert.deepEqual(checkFile('generic', good), { problems: [], count: 2, bytes: good.length });
  assert.deepEqual(checkFile('generic', '').problems, []);
  for (const bad of [
    '.ad{display:none!important}\n.b{background:url(https://x.example/)}',
    '.ad{color:red}',
    'body{display:none!important}',
    '.ad{display:none!important}.b{display:none!important}',
    '@import "https://x.example/a.css";',
    '.ad:has-text(x){display:none!important}',
    ':root{--cpab-allow-0123456789ab:1}',
    '.ad{display:none!important',
  ]) assert.notDeepEqual(checkFile('generic', bad).problems, [], bad);
});

test('site CSS takes hiding, :style() and exception rules, checked like the converter', () => {
  const sites = {
    'example.com': '.ad{display:none!important}.box{min-height:0!important;max-height:0!important}:root{--cpab-allow-0123456789ab:1;--cpab-allow-ba9876543210:1}body.locked{overflow:auto!important}body{overflow:auto!important;padding-right:0!important}',
  };
  assert.deepEqual(checkFile('sites', JSON.stringify(sites)).problems, []);
  for (const css of [
    'body{display:none!important}',
    'html{position:fixed!important}',
    '.a{background-image:url(x)}',
    '.a{content:"x"}',
    '.a{--cpab-allow-0123456789ab:1}',
    ':root{--cpab-allow-xyz:1}',
    '.a{display:none!important}}',
    '',
  ]) assert.notDeepEqual(checkFile('sites', JSON.stringify({ 'example.com': css })).problems, [], css);
  assert.match(problemsOf(checkFile('sites', JSON.stringify({ com: '.a{display:none!important}' }))), /invalid domain/);
  assert.match(problemsOf(checkFile('sites', '[]')), /not an object/);
});

test('popup data keeps its three sections and plain entries', () => {
  const good = { block: { ad: [{ url: '||ad.example^', on: ['example.com'], party: 'thirdParty' }], '': [{ url: '', on: ['site.example'] }] }, allow: {}, pages: { shop: [{ url: '||shop.example^' }] } };
  assert.deepEqual(checkFile('popup', JSON.stringify(good)), { problems: [], count: 3, bytes: JSON.stringify(good).length });
  assert.match(problemsOf(checkFile('popup', JSON.stringify({ block: {}, allow: {} }))), /exactly/);
  assert.match(problemsOf(checkFile('popup', JSON.stringify({ ...good, block: { x: [{ url: 'a', run: 'x' }] } }))), /key run/);
  assert.match(problemsOf(checkFile('popup', JSON.stringify({ ...good, pages: { '': [{ url: '' }] } }))), /popups everywhere/);
});

test('harmful and adult data is plain sorted domains', () => {
  const good = { warn: ['bad.example', 'evil.example'], block: ['bad.example'], excluded: [] };
  assert.deepEqual(checkFile('domains', JSON.stringify(good)).problems, []);
  assert.equal(checkFile('domains', JSON.stringify(good)).count, 2);
  assert.match(problemsOf(checkFile('domains', JSON.stringify({ ...good, redirect: 'https://x.example/' }))), /exactly warn, block and excluded/);
  assert.match(problemsOf(checkFile('domains', JSON.stringify({ ...good, warn: ['evil.example', 'bad.example'] }))), /not sorted/);
  assert.match(problemsOf(checkFile('domains', JSON.stringify({ ...good, warn: ['com'] }))), /invalid domain/);
  assert.match(problemsOf(checkFile('domains', JSON.stringify([{ id: 1, action: { type: 'redirect' } }]))), /exactly/);
});

test('size limits', () => {
  assert.match(problemsOf(checkFile('generic', 'x'.repeat(LIMITS.fileBytes + 1))), /over/);
  const files = [{ kind: 'rules', count: 20000, bytes: 1 }, { kind: 'rules', count: 8001, bytes: 1 }, { kind: 'sites', count: 1, bytes: LIMITS.siteCssBytes }];
  assert.deepEqual(checkTotals(files).problems, ['28001 rules in all, over 28000']);
  assert.match(checkTotals([...files, { kind: 'sites', count: 1, bytes: 1 }]).problems.join(), /site CSS/);
  assert.match(problemsOf(checkFile('nope', '')), /unknown kind/);
});

const file = (path) => ({ path, sha256: 'a'.repeat(64), bytes: 10, count: 1 });
const version = {
  schema: 1,
  generated: '2026-11-08T03:17:00Z',
  source: 'local',
  lists: {
    ads: { title: 'EasyList', group: 'ads', licence: 'CC-BY-SA-4.0', snapshot: { date: '2026-11-08', version: '1', commit: 'abc', sha256: 'b'.repeat(64) }, files: { rules: file('lists/ads-easylist.json'), sites: file('lists/ads-easylist.sites.json') } },
    'harmful-badware': { title: 'Badware', group: 'harmful', licence: 'GPL-3.0-only', snapshot: { date: '2026-11-08' }, files: { domains: file('lists/harmful-badware.domains.json') } },
  },
};

test('version.json', () => {
  assert.deepEqual(checkVersion(JSON.stringify(version)).problems, []);
  const changed = (change) => problemsOf(checkVersion(JSON.stringify({ ...version, ...change })));
  assert.match(changed({ schema: 2 }), /schema/);
  assert.match(changed({ generated: 'yesterday' }), /generated/);
  assert.match(changed({ source: 'main' }), /source/);
  assert.match(changed({ code: 'x' }), /key code/);
  const list = (entry) => changed({ lists: { ads: { ...version.lists.ads, ...entry } } });
  assert.match(list({ files: { rules: file('../secret.json') } }), /invalid rules file/);
  assert.match(list({ files: { rules: file('https://x.example/a.json') } }), /invalid rules file/);
  assert.match(list({ files: { script: file('lists/a.js') } }), /unknown kind/);
  assert.match(list({ files: { rules: file('lists/a.json'), domains: file('lists/a.domains.json') } }), /rules and domains together/);
  assert.match(list({ files: { rules: { ...file('lists/a.json'), sha256: 'x' } } }), /invalid rules file/);
  assert.match(changed({ lists: { ads: version.lists.ads, other: version.lists.ads } }), /share a path/);
  assert.match(problemsOf(checkVersion(' '.repeat(LIMITS.versionBytes + 1))), /over/);
});

test('rule domains follow the converter: underscores and suffixes pass, over-long labels do not', async () => {
  const { isRuleDomain } = await import('../src/shared/domains.js');
  const { normalizeRuleDomain } = await import('../scripts/convert.js');
  for (const domain of ['ads.example', '_sips._tcp.example.com', 'gov', 'xn--mgbai9azgqp6j.xn--mgba3a4f16a']) assert.equal(isRuleDomain(domain), true, domain);
  for (const domain of ['', 'a..b', 'A.example', 'a b.example', `${'a'.repeat(64)}.example`, `${'a.'.repeat(127)}ab`]) assert.equal(isRuleDomain(domain), false, domain);
  assert.equal(normalizeRuleDomain(`${'a'.repeat(64)}.example`), null);
});
