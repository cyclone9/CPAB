// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildRules,
  convertList,
  formatReport,
  groupByOptions,
  hostsToFilters,
  normalizeRuleDomain,
  parseLine,
  parseOptions,
  patternProblem,
} from '../scripts/convert.js';
import { LISTS } from '../scripts/lists.config.js';
import { ALLOW_RULE_ID_BASE } from '../src/shared/blocking.js';

const ruleFor = (text) => convertList(text).rules[0];

test('comments, headers and blank lines are not rules', () => {
  const result = convertList('[Adblock Plus 2.0]\n! Title: x\n\n  \n');
  assert.equal(result.read, 0);
  assert.deepEqual(result.rules, []);
});

test('plain domain rules with no options merge into one block rule', () => {
  const result = convertList('||a.com^\n||b.org^\n||a.com^\n');
  assert.equal(result.read, 3);
  assert.equal(result.converted, 3);
  assert.equal(result.domains, 2);
  assert.deepEqual(result.rules, [{
    id: 1,
    priority: 1,
    action: { type: 'block' },
    condition: { requestDomains: ['a.com', 'b.org'], excludedResourceTypes: ['main_frame'] },
  }]);
});

test('different option sets stay in different rules, same sets merge', () => {
  const { rules } = convertList('||a.com^$third-party\n||b.com^$third-party\n||c.com^$script\n||d.com^\n');
  assert.equal(rules.length, 3);
  const merged = rules.find((rule) => rule.condition.domainType === 'thirdParty');
  assert.deepEqual(merged.condition.requestDomains, ['a.com', 'b.com']);
});

test('option order does not split a group', () => {
  const { rules } = convertList('||a.com^$script,image\n||b.com^$image,script\n');
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].condition.resourceTypes, ['image', 'script']);
});

test('exceptions become allow rules at priority 2, ids apart from block rules', () => {
  const { rules } = convertList('||a.com^\n@@||ok.a.com^$image\n@@||b.a.com^$image\n');
  const allow = rules.find((rule) => rule.action.type === 'allow');
  const block = rules.find((rule) => rule.action.type === 'block');
  assert.equal(allow.priority, 2);
  assert.equal(block.priority, 1);
  assert.deepEqual(allow.condition.requestDomains, ['b.a.com', 'ok.a.com']);
  assert.ok(allow.id > ALLOW_RULE_ID_BASE);
  assert.ok(block.id <= ALLOW_RULE_ID_BASE);
});

test('a block and an exception with the same options stay apart', () => {
  assert.equal(convertList('||a.com^$script\n@@||b.com^$script\n').rules.length, 2);
});

test('every resource type maps, and subdocument becomes sub_frame', () => {
  const names = ['script', 'image', 'stylesheet', 'xmlhttprequest', 'subdocument', 'font', 'media', 'object', 'ping', 'websocket', 'other'];
  const { condition } = parseOptions(names);
  assert.deepEqual(condition.resourceTypes, [
    'font', 'image', 'media', 'object', 'other', 'ping', 'script', 'stylesheet', 'sub_frame', 'websocket', 'xmlhttprequest',
  ]);
});

test('~ types exclude those types and keep main_frame excluded', () => {
  assert.deepEqual(ruleFor('||a.com^$~script,~subdocument\n').condition.excludedResourceTypes, ['main_frame', 'script', 'sub_frame']);
  assert.equal(ruleFor('||a.com^$~script\n').condition.resourceTypes, undefined);
});

test('a type named both ways is removed, and nothing left drops the rule', () => {
  assert.deepEqual(parseOptions(['script', 'image', '~image']).condition.resourceTypes, ['script']);
  assert.equal(parseOptions(['script', '~script']).dropped, 'no resource type left');
});

test('party options map in both forms', () => {
  assert.equal(parseOptions(['third-party']).condition.domainType, 'thirdParty');
  assert.equal(parseOptions(['~first-party']).condition.domainType, 'thirdParty');
  assert.equal(parseOptions(['first-party']).condition.domainType, 'firstParty');
  assert.equal(parseOptions(['~third-party']).condition.domainType, 'firstParty');
  assert.ok(parseOptions(['third-party', 'first-party']).dropped);
});

test('a domain= rule is dropped and counted, block or exception', () => {
  const result = convertList('||a.com^$domain=b.com\n@@||c.com^$script,domain=d.com\n||e.com^$~domain=f.com\n');
  assert.deepEqual(result.rules, []);
  assert.equal(result.dropped['domain='], 2);
  assert.equal(result.droppedExceptions, 1);
});

test('$popup, $document, $all and unknown options are dropped by reason', () => {
  const result = convertList([
    '||a.com^$popup',
    '||b.com^$popup,third-party',
    '@@||c.com^$document',
    '||d.com^$all',
    '||e.com^$important',
    '||f.com^$csp=script-src',
    '||g.com^$strict3p',
  ].join('\n'));
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.dropped, {
    $popup: 2,
    $document: 1,
    $all: 1,
    'unknown option: important': 1,
    'unknown option: csp': 1,
    'unknown option: strict3p': 1,
  });
});

test('no output rule can ever touch main_frame', () => {
  const list = [
    '||a.com^', '@@||b.com^', '||c.com^$third-party', '||d.com^$~script', '||e.com^$subdocument',
    '||f.com^$document', '||g.com^$all', '||h.com^$main_frame', '@@||i.com^$~image,~third-party',
    '||j.com/ads/', '@@||k.com/ok/', '/ads/one.$third-party', '/ads/two.$~script', '/ads/three.$main_frame',
  ].join('\n');
  const { rules } = convertList(list);
  assert.ok(rules.length >= 5);
  for (const { condition } of rules) {
    assert.ok(!condition.resourceTypes?.includes('main_frame'));
    if (!condition.resourceTypes) assert.ok(condition.excludedResourceTypes.includes('main_frame'));
  }
});

test('other rule shapes are dropped by reason', () => {
  assert.equal(parseLine('example.com##.ad').dropped, 'cosmetic');
  assert.equal(parseLine('##.ad').dropped, 'cosmetic');
  assert.equal(parseLine('example.com#@#.ad').dropped, 'cosmetic');
  assert.equal(parseLine('example.com##+js(nowoif)').dropped, 'scriptlet');
  assert.equal(parseLine('/banner[0-9]+/').dropped, 'regex');
  assert.equal(parseLine('@@/banner[0-9]+/$script').dropped, 'regex');
});

test('a path rule comes apart into its pattern and its options', () => {
  assert.deepEqual(parseLine('||a.com/ads.js'), { allow: false, pattern: '||a.com/ads.js', options: [] });
  assert.deepEqual(parseLine('||a.com^*.gif$image'), { allow: false, pattern: '||a.com^*.gif', options: ['image'] });
  assert.deepEqual(parseLine('@@||a.com/x^$script,third-party'), { allow: true, pattern: '||a.com/x^', options: ['script', 'third-party'] });
  assert.deepEqual(parseLine('/ads/banner.'), { allow: false, pattern: '/ads/banner.', options: [] });
  assert.deepEqual(parseLine('|http://a.com/x|'), { allow: false, pattern: '|http://a.com/x|', options: [] });
});

test('only a well-formed list after the $ counts as options', () => {
  assert.deepEqual(parseLine('/a$b/c.js$script'), { allow: false, pattern: '/a$b/c.js', options: ['script'] });
  assert.deepEqual(parseLine('/a$b/c.js'), { allow: false, pattern: '/a$b/c.js', options: [] });
});

test('every path shape becomes a urlFilter, unchanged, and stays off main_frame', () => {
  for (const filter of ['||a.com/ads.js', '||a.com^*.gif', '||a.*/promo/', '||a.com*x=', '||adservice.google.', '|http://a.com/x', '|https://a.com/x|', '/banner/ad.', '-300x250-', '.com/*=abc', 'wss://a.*.com/ws^', '/addyn|*;adtech;']) {
    assert.deepEqual(ruleFor(filter), {
      id: 1,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: filter, excludedResourceTypes: ['main_frame'] },
    });
  }
});

test('a path rule keeps its options', () => {
  assert.deepEqual(ruleFor('||a.com/x$script,image,third-party\n').condition, {
    urlFilter: '||a.com/x',
    domainType: 'thirdParty',
    resourceTypes: ['image', 'script'],
  });
  assert.deepEqual(ruleFor('/banner/x$~script,~third-party\n').condition, {
    urlFilter: '/banner/x',
    domainType: 'firstParty',
    excludedResourceTypes: ['main_frame', 'script'],
  });
});

test('a path exception is an allow rule at priority 2, with its id above the base', () => {
  const { rules } = convertList('||a.com/ads/\n@@||a.com/ads/ok.js$script\n');
  const allow = rules.find((rule) => rule.action.type === 'allow');
  assert.equal(allow.priority, 2);
  assert.ok(allow.id > ALLOW_RULE_ID_BASE);
  assert.deepEqual(allow.condition, { urlFilter: '||a.com/ads/ok.js', resourceTypes: ['script'] });
  assert.ok(rules.find((rule) => rule.action.type === 'block').id <= ALLOW_RULE_ID_BASE);
});

test('match-case asks for a case-sensitive match, and nothing else sets it', () => {
  assert.equal(ruleFor('/AdBanner/x$match-case\n').condition.isUrlFilterCaseSensitive, true);
  assert.equal(ruleFor('/AdBanner/x\n').condition.isUrlFilterCaseSensitive, undefined);
});

test('path rules stay one each, and only the very same rule folds', () => {
  const result = convertList('/ads/one.\n/ads/two.\n/ads/one.\n/ads/one.$script\n@@/ads/one.\n');
  assert.equal(result.read, 5);
  assert.equal(result.converted, 5);
  assert.equal(result.pathRules, 4);
  assert.equal(result.rules.length, 4);
});

test('domain rules still merge beside path rules, and hold the first ids', () => {
  const result = convertList('/ads/one.\n||a.com^\n||b.com^\n');
  assert.equal(result.domains, 2);
  assert.equal(result.pathRules, 1);
  assert.deepEqual(result.rules[0].condition.requestDomains, ['a.com', 'b.com']);
  assert.equal(result.rules[1].condition.urlFilter, '/ads/one.');
});

test('out-of-scope options drop a path rule by the same reasons as a domain rule', () => {
  const result = convertList([
    '||a.com/x$domain=b.com',
    '@@||a.com/y$script,domain=b.com',
    '/ads/x$popup',
    '/ads/y$document',
    '/ads/z$all',
    '/ads/w$removeparam=utm',
    '/ads/v$generichide',
  ].join('\n'));
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.dropped, {
    'domain=': 2,
    $popup: 1,
    $document: 1,
    $all: 1,
    'unknown option: removeparam': 1,
    'unknown option: generichide': 1,
  });
  assert.equal(result.droppedExceptions, 1);
});

test('a pattern Chrome would refuse is dropped by reason', () => {
  assert.equal(patternProblem('||a.com/تبلیغ/'), 'non-ASCII pattern');
  assert.equal(patternProblem('||تبلیغ.ir/ads/'), 'non-ASCII pattern');
  assert.equal(patternProblem('||*.com/ads/'), 'pattern starts with ||*');
  assert.equal(patternProblem('||*'), 'pattern starts with ||*');
  assert.equal(patternProblem(''), 'pattern too broad');
});

test('a pattern that could not match a real address, or was cut wrong, is dropped by reason', () => {
  assert.equal(patternProblem('/a b/c.js'), 'space, # or $ in pattern');
  assert.equal(patternProblem('/a$b/c.js'), 'space, # or $ in pattern');
  assert.equal(patternProblem('example.com#$?#.ad'), 'space, # or $ in pattern');
});

test('a pattern that could match nearly everything is refused', () => {
  for (const pattern of ['', '*', '**', '^', '|', '||', '|*', '||^', '|http', '|http://', '|https://*', 'http', 'https://', 'http*://', 'wss://', '://', '|http*://*?', 'www.', '//www.', '.com', '.com/', '/*', '/ads/', '/e/cm?', '?z=*&rb=', '.html', '.html?', '.php*', '.gif?']) {
    assert.equal(patternProblem(pattern), 'pattern too broad', pattern);
  }
  const result = convertList('*$image,third-party\n$third-party\n@@*$image\n');
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.dropped, { 'pattern too broad': 3 });
  assert.equal(result.droppedExceptions, 1);
});

test('short patterns that name something real stay', () => {
  for (const pattern of ['/s.gif?', '/gtm.js', '/oo/*/l.js', '://t.*/open^', '.300x250.', '.468x60-', '.sharecounter.', '.EventTracking.', '-120x600-', '|http://r.i.ua^']) {
    assert.equal(patternProblem(pattern), null, pattern);
  }
});

test('a private address is dropped in a pattern too, whole or cut short', () => {
  for (const pattern of ['||10.10.34.*^', '||10.10.34.34/x', '|http://192.168.1.1/x', '://10.1.1.', '||172.16.0.1/x', '10.10.34.', '||127.0.0.1/x', 'http*://10.0.0.1/']) {
    assert.equal(patternProblem(pattern), 'private address', pattern);
  }
  for (const pattern of ['||142.91.159.', '||23.109.82.', '||172.15.0.1/x', '||10.example.com/x', '/images/10.10.gif']) {
    assert.equal(patternProblem(pattern), null, pattern);
  }
});

test('a wildcard host with no path is dropped, and a path narrows one down enough to keep', () => {
  assert.equal(patternProblem('||analytics-*.example.com^'), 'wildcard host, no path');
  assert.equal(patternProblem('||cacheserve.*/promodisplay/'), null);
  assert.equal(patternProblem('||api.example.com*plvid='), null);
  assert.equal(patternProblem('||example.com^*.gif'), null);
});

test('the real lists add up, take no pattern Chrome refuses, and fit the guaranteed rules', () => {
  const available = LISTS.filter((list) => existsSync(new URL(`../lists/${list.listFile}`, import.meta.url)));
  assert.ok(available.length >= 2);
  let total = 0;
  for (const list of available) {
    const result = convertList(readFileSync(new URL(`../lists/${list.listFile}`, import.meta.url), 'utf8'));
    const dropped = Object.values(result.dropped).reduce((sum, count) => sum + count, 0);
    assert.equal(result.read, result.converted + dropped, list.title);
    assert.ok(!Object.keys(result.dropped).some((reason) => reason.includes('||domain^')), list.title);
    assert.equal(new Set(result.rules.map((rule) => rule.id)).size, result.rules.length, list.title);
    for (const { condition } of result.rules) {
      if (!condition.urlFilter) continue;
      assert.match(condition.urlFilter, /^[\x00-\x7f]+$/);
      assert.ok(!condition.urlFilter.startsWith('||*'), condition.urlFilter);
      assert.ok(!condition.resourceTypes?.includes('main_frame'), condition.urlFilter);
      if (!condition.resourceTypes) assert.ok(condition.excludedResourceTypes.includes('main_frame'), condition.urlFilter);
    }
    total += result.rules.length;
  }
  assert.ok(total < 30000, `${total} rules`);
});

test('the report says how many path rules there are', () => {
  const report = formatReport('List', convertList('||a.com^\n/ads/one.\n*\n'));
  assert.match(report, /^List: read 3, converted 2, dropped 1 \(exceptions among them: 0\), output 2 rules: 1 path rules, the rest holding 1 domains/);
  assert.match(report, /1 {2}pattern too broad/);
});

test('domains are lowercased and converted to punycode', () => {
  assert.equal(normalizeRuleDomain('Ads.Example.COM'), 'ads.example.com');
  assert.match(normalizeRuleDomain('تبلیغ.ir'), /^xn--[a-z0-9-]+\.ir$/);
  assert.equal(normalizeRuleDomain('bücher.example'), 'xn--bcher-kva.example');
  assert.equal(normalizeRuleDomain('fb_servpub-a.akamaihd.net'), 'fb_servpub-a.akamaihd.net');
  assert.equal(normalizeRuleDomain('1.2.3.4'), '1.2.3.4');
});

test('a numeric host the URL parser would rewrite is dropped, never turned into another address', () => {
  assert.equal(normalizeRuleDomain('10.10.34.'), null);
  assert.equal(normalizeRuleDomain('1234'), null);
  assert.equal(normalizeRuleDomain('1.2.3'), null);
  assert.equal(normalizeRuleDomain('0x7f.1'), null);
  assert.equal(normalizeRuleDomain('10.10.34.34'), '10.10.34.34');
});

test('a domain Chrome could not take is dropped, not kept', () => {
  assert.equal(normalizeRuleDomain('[::]'), null);
  assert.equal(normalizeRuleDomain('a..b'), null);
  const result = convertList('||[::]^\n||a.com^\n');
  assert.equal(result.dropped['invalid domain'], 1);
  assert.equal(result.converted, 1);
});

test('a host file becomes filter rules, with comments kept as comments', () => {
  const hosts = [
    '[AdBlock]',
    '# Title: Some hosts',
    '',
    'ads.example.com',
    '0.0.0.0 tracker.example.org',
    '127.0.0.1 a.example  b.example',
    'c.example # a reason',
    '10.10.34.34',
  ].join('\n');
  assert.deepEqual(hostsToFilters(hosts).split('\n').filter(Boolean), [
    '[AdBlock]',
    '! Title: Some hosts',
    '||ads.example.com^',
    '||tracker.example.org^',
    '||a.example^',
    '||b.example^',
    '! a reason',
    '||c.example^',
    '||10.10.34.34^',
  ]);
});

test('host-file rules convert, and a wildcard entry is dropped rather than guessed', () => {
  const result = convertList(hostsToFilters('# hosts\nads.example.com\nanalytics-*.example.com\n10.10.34.*\n'));
  assert.equal(result.read, 3);
  assert.equal(result.converted, 1);
  assert.deepEqual(result.rules[0].condition.requestDomains, ['ads.example.com']);
  assert.deepEqual(result.dropped, { 'wildcard host, no path': 1, 'private address': 1 });
});

test('the same input always builds the same output', () => {
  const entries = [
    { allow: false, domain: 'b.com', condition: { excludedResourceTypes: ['main_frame'] } },
    { allow: false, domain: 'a.com', condition: { excludedResourceTypes: ['main_frame'] } },
    { allow: false, domain: 'c.com', condition: { domainType: 'thirdParty', excludedResourceTypes: ['main_frame'] } },
  ];
  assert.deepEqual(buildRules(groupByOptions(entries)), buildRules(groupByOptions([...entries].reverse())));
  assert.deepEqual(buildRules(groupByOptions(entries))[1].condition.requestDomains, ['a.com', 'b.com']);
});

test('the same path rules in another order build the same output', () => {
  const lines = ['/ads/one.', '/ads/two.$script', '@@/ads/three.', '||a.com^', '||b.com/x'];
  assert.deepEqual(convertList(lines.join('\n')).rules, convertList([...lines].reverse().join('\n')).rules);
});

test('Windows line endings and surrounding spaces do not change a rule', () => {
  assert.deepEqual(convertList('||a.com^\r\n  ||b.com^  \r\n').rules[0].condition.requestDomains, ['a.com', 'b.com']);
});

test('short option names mean the same as the long ones', () => {
  assert.deepEqual(parseOptions(['3p']), parseOptions(['third-party']));
  assert.deepEqual(parseOptions(['1p', 'xhr']), parseOptions(['first-party', 'xmlhttprequest']));
  assert.deepEqual(parseOptions(['~3p']), parseOptions(['~third-party']));
  assert.deepEqual(parseOptions(['css', 'frame']), parseOptions(['stylesheet', 'subdocument']));
  assert.deepEqual(parseOptions(['doc']), { dropped: '$document' });
});

test('private addresses are dropped and public ones stay', () => {
  const result = convertList('||10.10.34.34^\n||192.168.1.1^\n||172.16.0.1^\n||127.0.0.1^\n||93.184.216.34^\n||ads.example.com^');
  assert.equal(result.dropped['private address'], 4);
  assert.deepEqual(result.rules[0].condition.requestDomains.sort(), ['93.184.216.34', 'ads.example.com']);
});
