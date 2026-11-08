// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wantedRulesets } from '../src/shared/blocking.js';
import { DEFAULTS, RULESET_IDS, normalizeSettings } from '../src/shared/settings.js';

const ALL_LISTS_ON = { ads: true, 'ads-adguard-base': true, iran: true, 'cpab-own': true, trackers: true, 'trackers-hagezi-light': true, 'popups-adguard': true, 'widgets-adguard': true, 'widgets-fanboy-social': true, 'harmful-hagezi-tif': true, 'harmful-badware': true, 'adult-hagezi-nsfw': true };
// The harmful-sites lists, which come in on with every update and don't follow the master switch.
const HARMFUL = ['harmful-hagezi-tif', 'harmful-badware'];

// What 0.1.4 wrote to storage: a group switch for each list, and no per-list switches.
const SAVED_BY_0_1_4 = Object.freeze({
  master: true,
  groups: { ads: true, trackers: false, iran: false },
  pausedSites: ['a.com'],
  blockedSites: ['c.com'],
  language: 'fa',
  theme: 'light',
  badge: false,
});

// What 0.1.6 wrote to storage.
const SAVED_BY_0_1_6 = Object.freeze({
  ...SAVED_BY_0_1_4,
  groups: { ads: true, trackers: true, iran: true },
  lists: { ads: true, 'ads-adguard-base': false, trackers: true, iran: true },
});

test('the defaults are on, dark, automatic and empty', () => {
  assert.deepEqual(normalizeSettings(undefined), {
    master: true,
    groups: { ads: true, trackers: true, popups: true, widgets: true, harmful: true, adult: false },
    lists: ALL_LISTS_ON,
    pausedSites: [],
    blockedSites: [],
    allowedSites: [],
    recommendedExceptions: true,
    dataLeak: true,
    statsDaily: true,
    statsTopSites: false,
    language: 'auto',
    theme: 'dark',
    badge: true,
  });
  assert.deepEqual(normalizeSettings(undefined), normalizeSettings(DEFAULTS));
});

test('valid stored values are kept', () => {
  const stored = {
    master: false,
    groups: { ads: false, trackers: true, popups: false, widgets: false, harmful: false, adult: true },
    lists: { ads: false, 'ads-adguard-base': true, iran: false, 'cpab-own': true, trackers: true, 'trackers-hagezi-light': false, 'popups-adguard': false, 'widgets-adguard': true, 'widgets-fanboy-social': false, 'harmful-hagezi-tif': true, 'harmful-badware': false, 'adult-hagezi-nsfw': false },
    pausedSites: ['a.com', 'b.ir'],
    blockedSites: ['c.com'],
    allowedSites: ['d.ir'],
    recommendedExceptions: false,
    dataLeak: false,
    statsDaily: false,
    statsTopSites: true,
    language: 'fa',
    theme: 'light',
    badge: false,
  };
  assert.deepEqual(normalizeSettings(stored), stored);
});

test('bad stored values fall back to the defaults', () => {
  const normal = normalizeSettings({
    master: 'yes',
    groups: { ads: 0, adult: 'yes' },
    lists: { ads: 'off', unknown: false },
    pausedSites: 'a.com',
    blockedSites: 'b.com',
    allowedSites: { a: 'c.com' },
    recommendedExceptions: 'no',
    dataLeak: 'off',
    statsDaily: 'on',
    statsTopSites: 1,
    language: 'de',
    theme: 'blue',
    badge: null,
  });
  assert.deepEqual(normal, normalizeSettings(undefined));
  assert.deepEqual(normalizeSettings('junk'), normalizeSettings(undefined));
});

test('paused sites are cleaned, deduplicated and sorted', () => {
  const { pausedSites } = normalizeSettings({ pausedSites: ['www.b.com', 'b.com', 'not a domain', 7, 'a.com'] });
  assert.deepEqual(pausedSites, ['a.com', 'b.com']);
});

test('blocked sites are cleaned, deduplicated and sorted like paused sites', () => {
  const { blockedSites } = normalizeSettings({ blockedSites: ['www.b.com', 'b.com', 'not a domain', 7, 'a.com'] });
  assert.deepEqual(blockedSites, ['a.com', 'b.com']);
});

test('allowed addresses are cleaned, deduplicated and sorted like paused sites', () => {
  const { allowedSites } = normalizeSettings({ allowedSites: ['www.b.com', 'b.com', 'not a domain', 7, 'a.com'] });
  assert.deepEqual(allowedSites, ['a.com', 'b.com']);
});

test('settings saved by 0.1.4 keep every choice and gain the per-list switches', () => {
  assert.deepEqual(normalizeSettings(SAVED_BY_0_1_4), {
    ...SAVED_BY_0_1_4,
    groups: { ads: true, trackers: false, popups: true, widgets: true, harmful: true, adult: false },
    lists: { ...ALL_LISTS_ON, iran: false },
    allowedSites: [],
    recommendedExceptions: true,
    dataLeak: true,
    statsDaily: true,
    statsTopSites: false,
  });
});

// What 0.2.2 wrote to storage: no HaGeZi switch, no allowed addresses, no exceptions switch.
test('settings saved by 0.2.2 keep every choice and gain HaGeZi, allowed addresses and the exceptions switch, all on', () => {
  const saved = {
    master: true,
    groups: { ads: true, trackers: true },
    lists: { ads: true, 'ads-adguard-base': false, iran: true, 'cpab-own': true, trackers: false },
    popups: false,
    pausedSites: ['a.com'],
    blockedSites: ['c.com'],
    language: 'fa',
    theme: 'light',
    badge: true,
  };
  const normal = normalizeSettings(saved);
  const { popups, ...rest } = saved;
  assert.deepEqual(normal, {
    ...rest,
    groups: { ...saved.groups, popups, widgets: true, harmful: true, adult: false },
    lists: { ...saved.lists, 'trackers-hagezi-light': true, 'popups-adguard': true, 'widgets-adguard': true, 'widgets-fanboy-social': true, 'harmful-hagezi-tif': true, 'harmful-badware': true, 'adult-hagezi-nsfw': true },
    allowedSites: [],
    recommendedExceptions: true,
    dataLeak: true,
    statsDaily: true,
    statsTopSites: false,
  });
  assert.deepEqual(wantedRulesets(normal, RULESET_IDS), ['ads', 'iran', 'cpab-own', 'trackers-hagezi-light', 'widgets-adguard', 'widgets-fanboy-social', ...HARMFUL]);
});

// 0.2.3 kept the Popups switch as settings.popups. It becomes the Popups group's switch, and the
// AdGuard Popups list comes in on.
test('settings saved by 0.2.3 move the Popups switch onto the Popups group', () => {
  const saved = {
    master: true,
    groups: { ads: true, trackers: true },
    lists: { ads: true, 'ads-adguard-base': true, iran: true, 'cpab-own': true, trackers: true, 'trackers-hagezi-light': true },
    popups: false,
    pausedSites: [],
    blockedSites: [],
    allowedSites: [],
    recommendedExceptions: true,
    language: 'en',
    theme: 'dark',
    badge: true,
  };
  const off = normalizeSettings(saved);
  assert.equal(off.groups.popups, false);
  assert.equal(off.lists['popups-adguard'], true);
  assert.ok(!('popups' in off));
  assert.ok(!wantedRulesets(off, RULESET_IDS).includes('popups-adguard'));
  assert.deepEqual(normalizeSettings(off), off);

  const on = normalizeSettings({ ...saved, popups: true });
  assert.equal(on.groups.popups, true);
  assert.ok(wantedRulesets(on, RULESET_IDS).includes('popups-adguard'));
  assert.equal(normalizeSettings({ popups: 'yes' }).groups.popups, true);
});

// What 0.2.4 wrote: Popups is a group, and there is no Widgets group or list yet.
test('settings saved by 0.2.4 keep every choice and gain the Widgets group and lists, on', () => {
  const saved = {
    master: true,
    groups: { ads: true, trackers: false, popups: false },
    lists: { ads: true, 'ads-adguard-base': false, iran: true, 'cpab-own': true, trackers: true, 'trackers-hagezi-light': true, 'popups-adguard': true },
    pausedSites: ['a.com'],
    blockedSites: [],
    allowedSites: ['b.ir'],
    recommendedExceptions: false,
    language: 'fa',
    theme: 'light',
    badge: false,
  };
  const normal = normalizeSettings(saved);
  assert.deepEqual(normal, {
    ...saved,
    groups: { ...saved.groups, widgets: true, harmful: true, adult: false },
    lists: { ...saved.lists, 'widgets-adguard': true, 'widgets-fanboy-social': true, 'harmful-hagezi-tif': true, 'harmful-badware': true, 'adult-hagezi-nsfw': true },
    dataLeak: true,
    statsDaily: true,
    statsTopSites: false,
  });
  assert.deepEqual(wantedRulesets(normal, RULESET_IDS), ['ads', 'iran', 'cpab-own', 'widgets-adguard', 'widgets-fanboy-social', ...HARMFUL]);
  assert.deepEqual(normalizeSettings(normal), normal);
  assert.deepEqual(wantedRulesets(normalizeSettings({ ...normal, groups: { ...normal.groups, widgets: false } }), RULESET_IDS), ['ads', 'iran', 'cpab-own', ...HARMFUL]);
  assert.deepEqual(wantedRulesets(normalizeSettings({ ...normal, lists: { ...normal.lists, 'widgets-fanboy-social': false } }), RULESET_IDS), ['ads', 'iran', 'cpab-own', 'widgets-adguard', ...HARMFUL]);
  assert.deepEqual(wantedRulesets(normalizeSettings({ ...normal, master: false }), RULESET_IDS), HARMFUL);
});

// What 0.2.7 wrote: every switch there is today but the data-leak notice.
test('settings saved by 0.2.7 keep every choice and gain the data-leak notice, on', () => {
  const saved = {
    master: false,
    groups: { ads: true, trackers: false, popups: true, widgets: false, harmful: false, adult: true },
    lists: { ...ALL_LISTS_ON, 'ads-adguard-base': false },
    pausedSites: ['a.com'],
    blockedSites: ['c.com'],
    allowedSites: ['b.ir'],
    recommendedExceptions: false,
    language: 'fa',
    theme: 'light',
    badge: false,
  };
  const normal = normalizeSettings(saved);
  assert.deepEqual(normal, { ...saved, dataLeak: true, statsDaily: true, statsTopSites: false });
  assert.deepEqual(wantedRulesets(normal, RULESET_IDS), wantedRulesets(normalizeSettings({ ...saved, dataLeak: false }), RULESET_IDS));
  assert.equal(normalizeSettings({ ...saved, dataLeak: false }).dataLeak, false);
});

// What 0.2.9 wrote: every switch there is today but the two for Statistics.
test('settings saved by 0.2.9 gain daily totals, on, and Top 5, off', () => {
  const saved = { ...normalizeSettings({ master: false, pausedSites: ['a.com'], dataLeak: false, theme: 'light' }) };
  delete saved.statsDaily;
  delete saved.statsTopSites;
  const normal = normalizeSettings(saved);
  assert.deepEqual(normal, { ...saved, statsDaily: true, statsTopSites: false });
  assert.deepEqual(wantedRulesets(normal, RULESET_IDS), wantedRulesets(normalizeSettings({ ...saved, statsDaily: false, statsTopSites: true }), RULESET_IDS));
});

test('after an update from 0.1.4 a list runs when its group was on', () => {
  assert.deepEqual(wantedRulesets(normalizeSettings(SAVED_BY_0_1_4), RULESET_IDS), ['ads', 'ads-adguard-base', 'cpab-own', 'popups-adguard', 'widgets-adguard', 'widgets-fanboy-social', ...HARMFUL]);
  const adsOff = { ...SAVED_BY_0_1_4, groups: { ads: false, trackers: true, iran: true } };
  assert.deepEqual(wantedRulesets(normalizeSettings(adsOff), RULESET_IDS), ['iran', 'trackers', 'trackers-hagezi-light', 'popups-adguard', 'widgets-adguard', 'widgets-fanboy-social', ...HARMFUL]);
});

test('a saved 0.1.6 Iran group off becomes the PersianBlocker list off, and the field goes', () => {
  const normal = normalizeSettings({ ...SAVED_BY_0_1_6, groups: { ads: true, trackers: true, iran: false } });
  assert.deepEqual(normal.groups, { ads: true, trackers: true, popups: true, widgets: true, harmful: true, adult: false });
  assert.equal(normal.lists.iran, false);
  assert.equal(normal.lists['ads-adguard-base'], false);
  assert.deepEqual(normalizeSettings(normal), normal);
});

test('a saved 0.1.6 Iran group on changes nothing, and its list keeps its own off', () => {
  assert.equal(normalizeSettings(SAVED_BY_0_1_6).lists.iran, true);
  assert.deepEqual(normalizeSettings(SAVED_BY_0_1_6).groups, { ads: true, trackers: true, popups: true, widgets: true, harmful: true, adult: false });
  const listOff = { ...SAVED_BY_0_1_6, lists: { ...SAVED_BY_0_1_6.lists, iran: false } };
  assert.equal(normalizeSettings(listOff).lists.iran, false);
});

test('a saved 0.1.6 with Ads off and Iran on keeps PersianBlocker running and the other lists stopped', () => {
  const saved = { ...SAVED_BY_0_1_6, groups: { ads: false, trackers: true, iran: true } };
  const normal = normalizeSettings(saved);
  assert.equal(normal.groups.ads, true);
  assert.deepEqual(wantedRulesets(normal, RULESET_IDS), ['iran', 'trackers', 'trackers-hagezi-light', 'popups-adguard', 'widgets-adguard', 'widgets-fanboy-social', ...HARMFUL]);
  assert.deepEqual(normalizeSettings(normal), normal);
});

test('a save keeps its shape, so normalizing twice changes nothing', () => {
  const once = normalizeSettings({ lists: { 'ads-adguard-base': false } });
  assert.deepEqual(normalizeSettings(once), once);
});

test('a non-object lists value falls back to every list on', () => {
  assert.deepEqual(normalizeSettings({ lists: 'junk' }).lists, ALL_LISTS_ON);
  assert.deepEqual(normalizeSettings({ lists: null }).lists, ALL_LISTS_ON);
});
