// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildRules,
  convertList,
  groupByOptions,
  hostsToFilters,
  normalizeRuleDomain,
  parseLine,
  parseOptions,
} from '../scripts/convert.js';
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
  assert.equal(parseLine('||a.com/ads.js').dropped, 'not a ||domain^ rule');
  assert.equal(parseLine('||a.com^*.gif').dropped, 'not a ||domain^ rule');
  assert.equal(parseLine('||a.*^').dropped, 'not a ||domain^ rule');
  assert.equal(parseLine('@@||a.com/x^$script').allow, true);
  assert.equal(parseLine('/ads/banner.').dropped, 'not a ||domain^ rule');
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
  assert.equal(result.dropped['not a ||domain^ rule'], 2);
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
