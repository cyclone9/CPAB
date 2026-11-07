// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wantedRulesets } from '../src/shared/blocking.js';
import { DEFAULTS, RULESET_IDS, normalizeSettings } from '../src/shared/settings.js';

const ALL_LISTS_ON = { ads: true, 'ads-adguard-base': true, iran: true, 'cpab-own': true, trackers: true };

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
    groups: { ads: true, trackers: true },
    lists: ALL_LISTS_ON,
    popups: true,
    pausedSites: [],
    blockedSites: [],
    language: 'auto',
    theme: 'dark',
    badge: true,
  });
  assert.deepEqual(normalizeSettings(undefined), normalizeSettings(DEFAULTS));
});

test('valid stored values are kept', () => {
  const stored = {
    master: false,
    groups: { ads: false, trackers: true },
    lists: { ads: false, 'ads-adguard-base': true, iran: false, 'cpab-own': true, trackers: true },
    popups: false,
    pausedSites: ['a.com', 'b.ir'],
    blockedSites: ['c.com'],
    language: 'fa',
    theme: 'light',
    badge: false,
  };
  assert.deepEqual(normalizeSettings(stored), stored);
});

test('bad stored values fall back to the defaults', () => {
  const normal = normalizeSettings({
    master: 'yes',
    groups: { ads: 0, adult: true },
    lists: { ads: 'off', unknown: false },
    pausedSites: 'a.com',
    blockedSites: 'b.com',
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

test('settings saved by 0.1.4 keep every choice and gain the per-list switches', () => {
  assert.deepEqual(normalizeSettings(SAVED_BY_0_1_4), {
    ...SAVED_BY_0_1_4,
    groups: { ads: true, trackers: false },
    lists: { ...ALL_LISTS_ON, iran: false },
    popups: true,
  });
});

test('after an update from 0.1.4 a list runs when its group was on', () => {
  assert.deepEqual(wantedRulesets(normalizeSettings(SAVED_BY_0_1_4), RULESET_IDS), ['ads', 'ads-adguard-base', 'cpab-own']);
  const adsOff = { ...SAVED_BY_0_1_4, groups: { ads: false, trackers: true, iran: true } };
  assert.deepEqual(wantedRulesets(normalizeSettings(adsOff), RULESET_IDS), ['iran', 'trackers']);
});

test('a saved 0.1.6 Iran group off becomes the PersianBlocker list off, and the field goes', () => {
  const normal = normalizeSettings({ ...SAVED_BY_0_1_6, groups: { ads: true, trackers: true, iran: false } });
  assert.deepEqual(normal.groups, { ads: true, trackers: true });
  assert.equal(normal.lists.iran, false);
  assert.equal(normal.lists['ads-adguard-base'], false);
  assert.deepEqual(normalizeSettings(normal), normal);
});

test('a saved 0.1.6 Iran group on changes nothing, and its list keeps its own off', () => {
  assert.equal(normalizeSettings(SAVED_BY_0_1_6).lists.iran, true);
  assert.deepEqual(normalizeSettings(SAVED_BY_0_1_6).groups, { ads: true, trackers: true });
  const listOff = { ...SAVED_BY_0_1_6, lists: { ...SAVED_BY_0_1_6.lists, iran: false } };
  assert.equal(normalizeSettings(listOff).lists.iran, false);
});

test('a saved 0.1.6 with Ads off and Iran on keeps PersianBlocker running and the other lists stopped', () => {
  const saved = { ...SAVED_BY_0_1_6, groups: { ads: false, trackers: true, iran: true } };
  const normal = normalizeSettings(saved);
  assert.equal(normal.groups.ads, true);
  assert.deepEqual(wantedRulesets(normal, RULESET_IDS), ['iran', 'trackers']);
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
