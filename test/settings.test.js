// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS, normalizeSettings } from '../src/shared/settings.js';

test('the defaults are on, dark, automatic and empty', () => {
  assert.deepEqual(normalizeSettings(undefined), {
    master: true,
    groups: { ads: true, trackers: true, iran: true },
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
    groups: { ads: false, trackers: true, iran: false },
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
