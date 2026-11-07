// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { breachHost, convertBreaches, formatBreachReport, isPublicSuffixLike, newestAdded } from '../scripts/convert-breaches.js';
import { DATALEAK_LISTS, LISTS } from '../scripts/lists.config.js';
import { formatYears } from '../src/i18n/i18n.js';
import { DATALEAK_FILE, breachNotice, findBreaches, noticeTitle, siteLabel } from '../src/shared/dataleak.js';
import { siteFromUrl } from '../src/shared/domains.js';
import { DEFAULTS, normalizeSettings } from '../src/shared/settings.js';

const NOW = new Date('2026-11-07T00:00:00Z');
const breach = (fields) => ({
  Name: 'Example',
  Title: 'Example',
  Domain: 'example.com',
  BreachDate: '2019-05-01',
  AddedDate: '2019-06-01T00:00:00Z',
  IsVerified: true,
  IsFabricated: false,
  IsSensitive: false,
  IsRetired: false,
  IsSpamList: false,
  IsMalware: false,
  IsStealerLog: false,
  Description: '<a href="https://example.com/">HTML from outside</a>',
  ...fields,
});
const convert = (catalogue) => convertBreaches(catalogue, { now: NOW });

test('only verified breaches with a site are kept, sensitive ones included', () => {
  const result = convert([
    breach({ Name: 'Kept' }),
    breach({ Name: 'Sensitive', Domain: 'sensitive.com', IsSensitive: true }),
    breach({ Name: 'NoDomain', Domain: '' }),
    breach({ Name: 'Blank', Domain: '  ' }),
    breach({ Name: 'Unverified', IsVerified: false }),
    breach({ Name: 'Fabricated', IsFabricated: true }),
    breach({ Name: 'Spam', IsSpamList: true }),
    breach({ Name: 'Malware', IsMalware: true }),
    breach({ Name: 'Stealer', IsStealerLog: true }),
    breach({ Name: 'Retired', IsRetired: true }),
  ]);
  assert.equal(result.read, 10);
  assert.equal(result.kept, 2);
  assert.deepEqual(result.dropped, {
    'no domain': 2, unverified: 1, fabricated: 1, 'spam list': 1, malware: 1, 'stealer log': 1, retired: 1,
  });
  assert.deepEqual(result.data, { domains: { 'example.com': [['Kept', 'Example', 2019]], 'sensitive.com': [['Sensitive', 'Example', 2019]] } });
});

test('the output holds only name, title and year: never the description or anything else', () => {
  const { data } = convert([breach({ PwnCount: 5, DataClasses: ['Email addresses'], LogoPath: 'x' })]);
  assert.deepEqual(data, { domains: { 'example.com': [['Example', 'Example', 2019]] } });
  assert.ok(!JSON.stringify(data).includes('HTML'));
});

test('names, titles and years that could carry anything else are dropped', () => {
  const result = convert([
    breach({ Name: '7-Eleven', Domain: '7-eleven.com' }),
    breach({ Name: 'Bad Name', Domain: 'a.com' }),
    breach({ Name: 'Bad<script>', Domain: 'b.com' }),
    breach({ Name: '-Lead', Domain: 'c.com' }),
    breach({ Title: '<b>Bold</b>', Domain: 'd.com' }),
    breach({ Title: 'x'.repeat(81), Domain: 'e.com' }),
    breach({ Title: `Right‮to left`, Domain: 'f.com' }),
    breach({ Title: 'Line\nbreak', Domain: 'g.com' }),
    breach({ Title: '   ', Domain: 'h.com' }),
    breach({ Title: 42, Domain: 'i.com' }),
    breach({ BreachDate: '1999-12-31', Domain: 'j.com' }),
    breach({ BreachDate: '2028-01-01', Domain: 'k.com' }),
    breach({ BreachDate: 'soon', Domain: 'l.com' }),
    breach({ Title: 'Медицинская лаборатория (Gemotest)', Domain: 'gemotest.ru', BreachDate: '2027-01-01' }),
  ]);
  assert.deepEqual(Object.keys(result.data.domains), ['7-eleven.com', 'gemotest.ru']);
  assert.deepEqual(result.dropped, {
    'name not letters, digits and hyphens': 3,
    'title not plain text up to 80 characters': 6,
    'breach year out of range': 3,
  });
});

test('a breach domain becomes a bare lower-case host, and anything else is dropped', () => {
  assert.equal(breachHost('OwnedCore.com'), 'ownedcore.com');
  assert.equal(breachHost('www.example.com'), 'example.com');
  assert.equal(breachHost('forum.example.co.uk'), 'forum.example.co.uk');
  assert.equal(breachHost('phoenixim.ddns.net'), 'phoenixim.ddns.net');
  for (const bad of ['localhost', 'com', '1.2.3.4', 'example.com/path', 'https://example.com', 'пример.рф', 'a b.com', 'co.uk', 'com.au', 'github.io', 'ddns.net', '', null, 7]) {
    assert.equal(breachHost(bad), null, String(bad));
  }
  assert.ok(isPublicSuffixLike('gov.in'));
  assert.ok(!isPublicSuffixLike('trai.gov.in'));
  assert.ok(!isPublicSuffixLike('co.com'));
});

test('several breaches of one site sit together, oldest first, and sites are sorted', () => {
  const { data } = convert([
    breach({ Name: 'LinkedInScrape', Title: 'LinkedIn Scraped Data (2021)', Domain: 'linkedin.com', BreachDate: '2021-04-08' }),
    breach({ Name: 'Adobe', Title: 'Adobe', Domain: 'adobe.com', BreachDate: '2013-10-04' }),
    breach({ Name: 'LinkedIn', Title: 'LinkedIn', Domain: 'LinkedIn.com', BreachDate: '2012-05-05' }),
  ]);
  assert.deepEqual(Object.keys(data.domains), ['adobe.com', 'linkedin.com']);
  assert.deepEqual(data.domains['linkedin.com'], [['LinkedIn', 'LinkedIn', 2012], ['LinkedInScrape', 'LinkedIn Scraped Data (2021)', 2021]]);
});

test('the report names each drop reason with its count', () => {
  const report = formatBreachReport('HIBP', convert([breach({}), breach({ IsVerified: false }), breach({ Domain: '' })]));
  assert.equal(report, 'HIBP: read 3, kept 1 breaches on 1 sites\n  dropped, unverified: 1\n  dropped, no domain: 1');
  assert.throws(() => convert({ not: 'an array' }), /not a JSON array/);
  assert.equal(newestAdded([breach({ AddedDate: '2020-01-01T00:00:00Z' }), breach({ AddedDate: '2026-11-03T07:24:50Z' }), {}]), '2026-11-03T07:24:50Z');
  assert.equal(newestAdded([]), null);
});

const DOMAINS = {
  'linkedin.com': [['LinkedIn', 'LinkedIn', 2012], ['LinkedInScrape', 'LinkedIn Scraped Data (2021)', 2021]],
  'forum.example.com': [['ExampleForum', 'Example Forum', 2016]],
  'example.com': [['Example', 'Example', 2019]],
};

test('a site matches its own entry and every parent, its own first', () => {
  assert.deepEqual(findBreaches('linkedin.com', DOMAINS).map(({ name }) => name), ['LinkedIn', 'LinkedInScrape']);
  assert.deepEqual(findBreaches('uk.linkedin.com', DOMAINS).map(({ domain }) => domain), ['linkedin.com', 'linkedin.com']);
  assert.deepEqual(findBreaches('a.forum.example.com', DOMAINS).map(({ domain, name }) => [domain, name]), [
    ['forum.example.com', 'ExampleForum'],
    ['example.com', 'Example'],
  ]);
});

test('an entry for a subdomain never marks its parent or a look-alike', () => {
  const { 'example.com': _, ...onlySub } = DOMAINS;
  assert.deepEqual(findBreaches('example.com', onlySub), []);
  assert.deepEqual(findBreaches('other.example.com', onlySub), []);
  assert.deepEqual(findBreaches('notlinkedin.com', DOMAINS), []);
  assert.deepEqual(findBreaches('linkedin.com.evil.net', DOMAINS), []);
  assert.deepEqual(findBreaches('com', DOMAINS), []);
  assert.deepEqual(findBreaches('constructor.com', {}), []);
  assert.deepEqual(findBreaches('__proto__', JSON.parse('{"__proto__":[["X","X",2020]]}')), []);
  assert.deepEqual(findBreaches(null, DOMAINS), []);
  assert.deepEqual(findBreaches('linkedin.com', null), []);
});

test('the tab address is matched the way the popup names the site, without www', () => {
  assert.deepEqual(findBreaches(siteFromUrl('https://www.linkedin.com/feed/'), DOMAINS).length, 2);
  assert.equal(siteFromUrl('chrome://settings/'), null);
});

test('the notice gives one name, every year once, and links the first breach', () => {
  assert.deepEqual(breachNotice(findBreaches('linkedin.com', DOMAINS)), {
    label: 'LinkedIn',
    years: [2012, 2021],
    link: 'https://haveibeenpwned.com/PwnedWebsites#LinkedIn',
  });
  assert.deepEqual(breachNotice(findBreaches('a.forum.example.com', DOMAINS)), {
    label: 'Example Forum',
    years: [2016, 2019],
    link: 'https://haveibeenpwned.com/PwnedWebsites#ExampleForum',
  });
  assert.equal(breachNotice([]), null);
  assert.equal(breachNotice([{ name: '7-Eleven', title: '7-Eleven', year: 2017 }, { name: 'Again', title: 'x', year: 2017 }]).years.length, 1);
});

test('a date in a title comes off the name, and other brackets stay', () => {
  assert.equal(siteLabel('LinkedIn Scraped Data (2021)'), 'LinkedIn Scraped Data');
  assert.equal(siteLabel('Bell (2017 breach)'), 'Bell');
  assert.equal(siteLabel('Carding Mafia (March 2021)'), 'Carding Mafia');
  assert.equal(siteLabel('MGM Resorts (2022 Update)'), 'MGM Resorts');
  assert.equal(siteLabel('Twitter (200M)'), 'Twitter (200M)');
  assert.equal(siteLabel('Doxbin (TOoDA)'), 'Doxbin (TOoDA)');
  assert.equal(siteLabel('(2020)'), '(2020)');
});

test('years read as years in both languages', () => {
  assert.equal(formatYears('en', [2012, 2021]), '2012, 2021');
  assert.equal(formatYears('fa', [2012, 2021]), '۲۰۱۲، ۲۰۲۱');
});

test('the toolbar title keeps the action name and isolates the breach name', () => {
  const notice = breachNotice(findBreaches('linkedin.com', DOMAINS));
  assert.equal(noticeTitle('en', 'CPAB - Ad Blocker', notice), 'CPAB - Ad Blocker\nListed in a known data breach: ⁨LinkedIn⁩ (2012, 2021).');
  assert.ok(noticeTitle('fa', 'CPAB - Ad Blocker', notice).includes('⁨LinkedIn⁩ (۲۰۱۲، ۲۰۲۱ میلادی)'));
  assert.ok(!/unsafe|danger/i.test(noticeTitle('en', '', notice)));
});

test('the notice is on by default, and only its own switch turns it off', () => {
  assert.equal(DEFAULTS.dataLeak, true);
  assert.equal(normalizeSettings({}).dataLeak, true);
  assert.equal(normalizeSettings({ dataLeak: false }).dataLeak, false);
  assert.equal(normalizeSettings({ master: false, pausedSites: ['linkedin.com'] }).dataLeak, true);
});

test('the breach list has its admission record and stays out of the rulesets', () => {
  assert.equal(DATALEAK_LISTS.length, 1);
  const [list] = DATALEAK_LISTS;
  assert.equal(list.name, 'hibp-breaches');
  assert.equal(list.group, 'dataleak');
  assert.equal(`rules/${list.rulesFile}`, DATALEAK_FILE);
  assert.equal(list.licence.spdx, 'CC-BY-4.0');
  assert.equal(Object.keys(list.admission.checks).length, 7);
  assert.match(list.fetchHeaders['user-agent'], /^CPAB .*https:\/\/cpab\.cyclone9\.dev\//);
  assert.ok(!LISTS.some(({ name }) => name === list.name));
  const manifest = JSON.parse(readFileSync(new URL('../src/manifest.json', import.meta.url), 'utf8'));
  assert.ok(!manifest.declarative_net_request.rule_resources.some(({ path }) => path === DATALEAK_FILE));
});

const snapshot = new URL('../lists/hibp-breaches.json', import.meta.url);
test('the snapshot converts to the counts its record states', { skip: !existsSync(snapshot) }, () => {
  const meta = JSON.parse(readFileSync(new URL('../lists/hibp-breaches.meta.json', import.meta.url), 'utf8'));
  const catalogue = JSON.parse(readFileSync(snapshot, 'utf8'));
  const result = convertBreaches(catalogue, { now: new Date(`${meta.snapshot.date}T00:00:00Z`) });
  assert.equal(result.read, meta.snapshot.total);
  assert.equal(result.kept, meta.snapshot.kept);
  assert.equal(newestAdded(catalogue), meta.snapshot.newestAddedDate);
  for (const [host, breaches] of Object.entries(result.data.domains)) {
    assert.equal(breachHost(host), host);
    for (const [name, title, year] of breaches) {
      assert.match(name, /^[A-Za-z0-9-]+$/);
      assert.ok(typeof title === 'string' && title.length <= 80);
      assert.ok(Number.isInteger(year));
    }
  }
});
