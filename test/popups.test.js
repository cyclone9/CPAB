// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertPopups, filterTokens, formatPopupReport, popupBadfilters } from '../scripts/convert-popup.js';
import { isBlank, isPaused, isPopupAd, isWebPage, matchesFilter, popupLists } from '../src/shared/popups.js';
import { normalizeSettings } from '../src/shared/settings.js';

const PAGE = 'https://news.example.ir/article';
const lists = (...texts) => texts.map((text) => convertPopups(text).data);
const closes = (text, url, page = PAGE) => isPopupAd(lists(text), url, page);

const filterMatches = (filter, url) => {
  const { hostname } = new URL(url);
  const at = url.indexOf(hostname);
  const starts = [at];
  for (let dot = hostname.indexOf('.'); dot >= 0; dot = hostname.indexOf('.', dot + 1)) starts.push(at + dot + 1);
  return matchesFilter(filter, url, starts);
};

test('filters mean what Chrome documents for urlFilter', () => {
  const cases = [
    ['||ads.com^', 'https://ads.com/', true],
    ['||ads.com^', 'https://x.ads.com/a', true],
    ['||ads.com^', 'https://ads.com', true],
    ['||ads.com^', 'https://badads.com/', false],
    ['||ads.com^', 'https://ads.com.evil.net/', false],
    ['||ads.com^', 'https://example.com/?u=ads.com/', false],
    ['||ads.com/x', 'https://ads.com/xyz', true],
    ['|https://a.com/', 'https://a.com/b', true],
    ['|https://a.com/', 'https://b.com/?https://a.com/', false],
    ['/end|', 'https://a.com/end', true],
    ['/end|', 'https://a.com/end?x', false],
    ['/a*/b', 'https://x.com/a/1/2/b', true],
    ['/a*/b', 'https://x.com/b/a', false],
    ['||a.com/*?x=', 'https://a.com/p/q?x=1', true],
    ['^ad^', 'https://x.com/ad/y', true],
    ['^ad^', 'https://x.com/ad-y', false],
    ['ad^', 'https://x.com/ad', true],
    ['ad^x', 'https://x.com/ad', false],
    ['a^b', 'https://x.com/a.b', false],
    ['a^b', 'https://x.com/a%b', false],
    ['a^b', 'https://x.com/a_b', false],
    ['a^b', 'https://x.com/a/b', true],
    ['*.gif|', 'https://x.com/a.gif', true],
    ['/ad|*', 'https://x.com/ad|b', true],
    ['', 'https://x.com/', true],
  ];
  for (const [filter, url, expected] of cases) assert.equal(filterMatches(filter, url), expected, `${filter} on ${url}`);
});

test('a filter only names a bucket with a word that is whole in every address it matches', () => {
  assert.deepEqual(filterTokens('||ads.com^'), ['ads', 'com']);
  assert.deepEqual(filterTokens('/banner'), []);
  assert.deepEqual(filterTokens('/banner/'), ['banner']);
  assert.deepEqual(filterTokens('xad/foo/'), ['foo']);
  assert.deepEqual(filterTokens('||a.com/*foo*bar/'), ['a', 'com']);
  assert.deepEqual(filterTokens('|http://a.com/end|'), ['http', 'a', 'com', 'end']);
  assert.deepEqual(filterTokens('*foo^'), []);
});

test('a block rule closes a matching tab and leaves the rest', () => {
  assert.equal(closes('||ads.com^$popup', 'https://x.ads.com/a'), true);
  assert.equal(closes('||ads.com^$popup', 'https://shop.com/'), false);
  assert.equal(closes('/popunder/1$popup', 'https://shop.com/popunder/1'), true);
  assert.equal(closes('/POPS/1$popup', 'https://shop.com/pops/1'), true);
  assert.equal(closes('/POPS/1$popup,match-case', 'https://shop.com/pops/1'), false);
  assert.equal(closes('/POPS/1$popup,match-case', 'https://shop.com/POPS/1'), true);
});

test('a rule with no popup option never closes anything', () => {
  assert.equal(closes('||ads.com^\n||ads.com^$script\n', 'https://ads.com/'), false);
  assert.equal(closes('||ads.com^$all\n', 'https://ads.com/'), false);
});

test('exceptions lift a rule, across lists as well', () => {
  const text = '||ads.com^$popup\n@@||ads.com/ok^$popup\n';
  assert.equal(closes(text, 'https://ads.com/ok'), false);
  assert.equal(closes(text, 'https://ads.com/no'), true);
  assert.equal(isPopupAd(lists('||ads.com^$popup', '@@||ads.com^$popup,domain=example.ir'), 'https://ads.com/', PAGE), false);
  assert.equal(isPopupAd(lists('||ads.com^$popup', '@@||ads.com^$popup,domain=other.ir'), 'https://ads.com/', PAGE), true);
});

test('a $document exception protects the opening page', () => {
  const text = '||ads.com^$popup\n@@||news.example.ir/article^$document\n';
  assert.equal(closes(text, 'https://ads.com/'), false);
  assert.equal(closes(text, 'https://ads.com/', 'https://news.example.ir/other'), true);
});

test('domain= is the opening page, subdomains included', () => {
  const text = '||ads.com^$popup,domain=example.ir|~news.other.ir\n||b.com^$popup,domain=~example.ir\n';
  assert.equal(closes(text, 'https://ads.com/'), true);
  assert.equal(closes(text, 'https://ads.com/', 'https://elsewhere.org/'), false);
  assert.equal(closes(text, 'https://b.com/'), false);
  assert.equal(closes(text, 'https://b.com/', 'https://elsewhere.org/'), true);
});

test('party compares the tab with the opening page', () => {
  assert.equal(closes('||ads.com^$popup,third-party', 'https://ads.com/'), true);
  assert.equal(closes('||ads.com^$popup,third-party', 'https://ads.com/', 'https://www.ads.com/'), false);
  assert.equal(closes('||ads.com^$popup,first-party', 'https://ads.com/'), false);
  assert.equal(closes('||ads.com^$popup,first-party', 'https://ads.com/', 'https://www.ads.com/'), true);
});

test('an empty pattern needs a named site, on a rule or an exception', () => {
  assert.equal(closes('$popup,third-party,domain=example.ir', 'https://any.net/'), true);
  assert.equal(closes('$popup,third-party,domain=example.ir', 'https://example.ir/'), false);
  assert.equal(closes('||ads.com^$popup\n@@$popup,domain=example.ir,3p', 'https://ads.com/'), false);
  assert.deepEqual(convertPopups('$popup\n$popup,third-party\n').stats.dropped, { 'pattern too broad': 2 });
  assert.deepEqual(convertPopups('$popup,domain=~example.ir\n').stats.dropped, { 'pattern too broad': 1 });
});

test('a rule naming about: is dropped, so a blank start can never close a tab', () => {
  const { stats } = convertPopups('|about:$popup,domain=example.ir\n||about:blank$popup\n');
  assert.equal(stats.block, 0);
  assert.equal(stats.dropped['names a blank page'], 2);
});

test('what can never match a rule is dropped by reason', () => {
  const { stats } = convertPopups([
    '/^https?:\\/\\/ads/$popup,third-party',
    '||10.1.2.3^$popup',
    '||a.com^$popup,domain=google.*',
    '||a.com^$popup,important',
    '/x$popup,badfilter',
    '/x$popup',
    '@@||b.com^$document,popup',
    '||a.com^$popunder',
  ].join('\n'));
  assert.deepEqual(stats.dropped, {
    regex: 1,
    'private address': 1,
    'domain= wildcard': 1,
    'unknown option: important': 1,
    $badfilter: 1,
    'cancelled by $badfilter': 1,
    '$document with other options': 1,
  });
  assert.equal(stats.block, 0);
});

test('$popup,popunder converts, and types beside $popup are left to the network rule', () => {
  assert.equal(closes('||a.com^$popup,popunder', 'https://a.com/'), true);
  assert.equal(closes('/earn.php$popup,subdocument', 'https://a.com/earn.php'), true);
  assert.equal(closes('||a.com^$popup,document', 'https://a.com/'), true);
});

test('a $badfilter in one list cancels a popup rule in another', () => {
  const cancels = new Set(popupBadfilters('||zenaps.com^$popup,badfilter\n||other.com^$badfilter\n$popup,3p,domain=a.com,badfilter'));
  assert.equal(cancels.size, 2);
  const { data, stats } = convertPopups('||zenaps.com^$popup\n||keep.com^$popup\n$popup,third-party,domain=a.com', cancels);
  assert.equal(stats.block, 1);
  assert.equal(stats.dropped["cancelled by another list's $badfilter"], 2);
  assert.equal(isPopupAd([data], 'https://zenaps.com/', PAGE), false);
});

test('rules no address word can find are still read, and words named like Object members are harmless', () => {
  const data = convertPopups('adserv$popup\n').data;
  assert.equal(isPopupAd([data], 'https://shop.com/myadserver', PAGE), true);
  assert.equal(isPopupAd(lists('||ads.com^$popup'), 'https://constructor.com/__proto__/toString', PAGE), false);
});

test('duplicate lines become one rule, and a report names what was dropped', () => {
  const result = convertPopups('||a.com^$popup\n||a.com^$popup\n@@||b.com^$popup\n@@||b.com^$document\n/^x/$popup\n');
  assert.equal(result.stats.block, 1);
  assert.equal(result.stats.allow, 1);
  assert.equal(result.stats.pages, 0);
  assert.match(formatPopupReport('List', result), /read 5, dropped 2, output 1 rules, 1 exceptions and 0 page exceptions/);
});

test('blank and web addresses', () => {
  assert.ok(isBlank(''));
  assert.ok(isBlank('about:blank'));
  assert.ok(!isBlank('https://a.com/'));
  assert.ok(isWebPage('http://a.com/'));
  assert.ok(!isWebPage('chrome://settings/'));
  assert.ok(!isWebPage(undefined));
  assert.equal(isPopupAd(lists('||a.com^$popup'), 'not an address', PAGE), false);
});

test('a paused site is judged on the opening page, subdomains included', () => {
  const settings = normalizeSettings({ pausedSites: ['example.ir'] });
  assert.ok(isPaused(settings, 'https://news.example.ir/'));
  assert.ok(!isPaused(settings, 'https://elsewhere.org/'));
  assert.ok(isPaused(settings, 'not an address'));
});

test('the switches follow the rulesets, under Popups', () => {
  const index = { lists: [{ id: 'ads' }, { id: 'ads-adguard-base' }, { id: 'iran' }] };
  const on = (value) => popupLists(normalizeSettings(value), index);
  assert.deepEqual(on({}), ['ads', 'ads-adguard-base', 'iran']);
  assert.deepEqual(on({ popups: false }), []);
  assert.deepEqual(on({ master: false }), []);
  assert.deepEqual(on({ groups: { ads: false } }), []);
  assert.deepEqual(on({ lists: { 'ads-adguard-base': false } }), ['ads', 'iran']);
  assert.equal(normalizeSettings({}).popups, true);
  assert.equal(normalizeSettings({ popups: 'yes' }).popups, true);
});
