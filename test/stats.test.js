// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  STATS_DAYS,
  STATS_SITES_PER_DAY,
  dayBefore,
  dayKey,
  mergeStats,
  normalizeStats,
  pruneStats,
  statsTotals,
  topSites,
} from '../src/shared/stats.js';

// Local time, as the worker stamps it: 8 November 2026, 00:30.
const today = new Date(2026, 10, 8, 0, 30);

test('the day key is the local calendar day', () => {
  assert.equal(dayKey(today), '2026-11-08');
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(dayBefore(today, 0), '2026-11-08');
  assert.equal(dayBefore(today, 8), '2026-10-31');
  assert.equal(dayBefore(new Date(2026, 2, 1), 1), '2026-02-28');
  assert.equal(dayBefore(new Date(2027, 0, 1), 1), '2026-12-31');
});

test('merging adds the counts and the sites, day by day', () => {
  const stored = { days: { '2026-11-07': { blocked: 4, sites: { 'a.com': 3, 'b.ir': 1 } } } };
  const merged = mergeStats(stored, {
    '2026-11-07': { blocked: 2, sites: { 'a.com': 2 } },
    '2026-11-08': { blocked: 5, sites: { 'c.com': 1 } },
  });
  assert.deepEqual(merged, { days: {
    '2026-11-07': { blocked: 6, sites: { 'a.com': 5, 'b.ir': 1 } },
    '2026-11-08': { blocked: 5, sites: { 'c.com': 1 } },
  } });
  assert.deepEqual(stored.days['2026-11-07'], { blocked: 4, sites: { 'a.com': 3, 'b.ir': 1 } }, 'what was stored is left alone');
  assert.deepEqual(mergeStats(undefined, { '2026-11-08': { blocked: 1 } }), { days: { '2026-11-08': { blocked: 1 } } });
});

test('damaged stored data is read field by field', () => {
  assert.deepEqual(normalizeStats('junk'), { days: {} });
  assert.deepEqual(normalizeStats({ days: {
    '2026-11-08': { blocked: -3, sites: { 'a.com': 2, 'b.com': 'x', 'c.com': 0 } },
    yesterday: { blocked: 9 },
    '2026-11-07': null,
  } }), { days: { '2026-11-08': { blocked: 0, sites: { 'a.com': 2 } } } });
});

test('pruning keeps the last 14 days and the 100 largest sites of a day', () => {
  const days = {};
  for (let back = 0; back < 20; back += 1) days[dayBefore(today, back)] = { blocked: back + 1 };
  const sites = Object.fromEntries(Array.from({ length: 150 }, (_, index) => [`s${String(index).padStart(3, '0')}.com`, index + 1]));
  days['2026-11-08'] = { blocked: 1, sites };
  const pruned = pruneStats({ days }, today, true);
  const keys = Object.keys(pruned.days);
  assert.equal(keys.length, STATS_DAYS);
  assert.equal(keys[0], dayBefore(today, 13));
  assert.equal(keys.at(-1), '2026-11-08');
  const kept = Object.keys(pruned.days['2026-11-08'].sites);
  assert.equal(kept.length, STATS_SITES_PER_DAY);
  assert.ok(kept.includes('s149.com') && !kept.includes('s049.com'), 'the largest stay');
});

test('a day left over from weeks ago is dropped, even with fewer than 14 days stored', () => {
  const pruned = pruneStats({ days: { '2026-10-01': { blocked: 9 }, '2026-11-08': { blocked: 1 } } }, today, true);
  assert.deepEqual(pruned, { days: { '2026-11-08': { blocked: 1 } } });
});

test('with Top 5 off no day keeps its sites', () => {
  const stored = { days: { '2026-11-07': { blocked: 6, sites: { 'a.com': 5 } }, '2026-11-08': { blocked: 2, sites: { 'b.ir': 2 } } } };
  assert.deepEqual(pruneStats(stored, today, false), { days: { '2026-11-07': { blocked: 6 }, '2026-11-08': { blocked: 2 } } });
});

test('totals: today, yesterday, the last 7 days and the 7 before', () => {
  const days = {};
  for (let back = 0; back < 14; back += 1) days[dayBefore(today, back)] = { blocked: 10 ** Math.floor(back / 7) * (back + 1) };
  // Days 0 to 6 hold 1..7, days 7 to 13 hold 80..140.
  assert.deepEqual(statsTotals({ days }, today), { today: 1, yesterday: 2, thisWeek: 28, lastWeek: 770 });
  assert.deepEqual(statsTotals({ days: {} }, today), { today: 0, yesterday: 0, thisWeek: 0, lastWeek: 0 });
});

test('Top 5 adds every stored day, largest first, ties by name', () => {
  const stats = { days: {
    '2026-11-07': { blocked: 30, sites: { 'a.com': 10, 'b.com': 4, 'c.com': 4, 'd.com': 1 } },
    '2026-11-08': { blocked: 20, sites: { 'b.com': 7, 'e.com': 3, 'f.com': 2 } },
    '2026-11-06': { blocked: 5 },
  } };
  assert.deepEqual(topSites(stats), [['b.com', 11], ['a.com', 10], ['c.com', 4], ['e.com', 3], ['f.com', 2]]);
  assert.deepEqual(topSites({ days: {} }), []);
});

// The worker module, against a fake chrome that keeps storage.local in memory.
function fakeChrome({ incognito = false, settings = {}, tabs = {} } = {}) {
  const listeners = { committed: [] };
  const on = (name) => ({ addListener: (listener) => { listeners[name] = listener; } });
  const local = new Map([['settings', settings]]);
  const changed = [];
  const chrome = {
    extension: { inIncognitoContext: incognito },
    runtime: { id: 'self', getURL: (path) => `chrome-extension://self/${path}`, onMessage: on('message') },
    webRequest: { ResourceType: { MAIN_FRAME: 'main_frame', IMAGE: 'image', SCRIPT: 'script' }, onErrorOccurred: on('error') },
    webNavigation: { onCommitted: { addListener: (listener, filter) => listeners.committed.push({ listener, filter }) }, onTabReplaced: on('replaced') },
    tabs: { onRemoved: on('removed'), get: async (tabId) => (tabId in tabs ? { id: tabId, url: tabs[tabId] } : Promise.reject(new Error('no tab'))) },
    storage: {
      local: {
        get: async (key) => (local.has(key) ? { [key]: structuredClone(local.get(key)) } : {}),
        set: async (items) => {
          for (const [key, value] of Object.entries(items)) {
            const oldValue = local.get(key);
            local.set(key, structuredClone(value));
            for (const listener of changed) listener({ [key]: { oldValue, newValue: value } }, 'local');
          }
        },
        remove: async (key) => { local.delete(key); },
      },
      onChanged: { addListener: (listener) => changed.push(listener) },
    },
  };
  return { chrome, listeners, local };
}

const blocked = (tabId, extra = {}) => ({ error: 'net::ERR_BLOCKED_BY_CLIENT', tabId, initiator: 'http://page.example', ...extra });
const settle = (ms = 20) => new Promise((done) => setTimeout(done, ms));

test('the worker counts CPAB\'s own blocks per day, with sites only while Top 5 is on', async () => {
  const fake = fakeChrome({ tabs: { 3: 'https://www.news.example/a?b=c', 4: 'https://paused.example/' } });
  fake.local.set('settings', { pausedSites: ['paused.example'] });
  globalThis.chrome = fake.chrome;
  await import(`../src/background/stats.js?${Date.now()}`);
  const [pages, warnings] = fake.listeners.committed;
  assert.deepEqual(pages.filter, { url: [{ schemes: ['http', 'https'] }] });
  assert.deepEqual(warnings.filter, { url: [{ urlPrefix: 'chrome-extension://self/warning/warning.html' }] });

  fake.listeners.error(blocked(3));
  fake.listeners.error(blocked(3, { error: 'net::ERR_FAILED' }));
  fake.listeners.error(blocked(-1));
  fake.listeners.error(blocked(3, { initiator: 'chrome-extension://self' }));
  fake.listeners.error(blocked(4));
  fake.listeners.error(blocked(99));
  warnings.listener({ frameId: 0, transitionType: 'typed', transitionQualifiers: ['server_redirect'] });
  warnings.listener({ frameId: 0, transitionType: 'reload', transitionQualifiers: [] });
  warnings.listener({ frameId: 0, transitionType: 'link', transitionQualifiers: ['client_redirect'] });
  warnings.listener({ frameId: 0, transitionType: 'link', transitionQualifiers: ['forward_back'] });
  warnings.listener({ frameId: 3, transitionType: 'auto_subframe', transitionQualifiers: ['server_redirect'] });
  await settle(2200);
  const key = dayKey(new Date());
  assert.deepEqual(fake.local.get('stats'), { days: { [key]: { blocked: 2 } } }, 'one block and one warning, no site');

  await fake.chrome.storage.local.set({ settings: { pausedSites: ['paused.example'], statsTopSites: true } });
  pages.listener({ tabId: 3, frameId: 0, url: 'https://shop.example/', documentLifecycle: 'active' });
  pages.listener({ tabId: 3, frameId: 0, url: 'https://prerendered.example/', documentLifecycle: 'prerender' });
  for (let index = 0; index < 50; index += 1) fake.listeners.error(blocked(3));
  await settle();
  assert.deepEqual(fake.local.get('stats'), { days: { [key]: { blocked: 52, sites: { 'shop.example': 50 } } } }, 'fifty events write at once');

  await fake.chrome.storage.local.set({ settings: { pausedSites: ['paused.example'], statsTopSites: false } });
  await settle();
  assert.deepEqual(fake.local.get('stats'), { days: { [key]: { blocked: 52 } } }, 'Top 5 off drops every site');

  await fake.chrome.storage.local.set({ settings: { master: false } });
  fake.listeners.error(blocked(3));
  await fake.chrome.storage.local.set({ settings: { statsDaily: false } });
  fake.listeners.error(blocked(3));
  warnings.listener({ frameId: 0, transitionType: 'link', transitionQualifiers: ['server_redirect'] });
  await settle(2200);
  assert.deepEqual(fake.local.get('stats'), { days: { [key]: { blocked: 52 } } }, 'nothing counts with blocking or daily totals off');

  const ask = (message, sender) => new Promise((done) => {
    if (!fake.listeners.message(message, sender, done)) done('ignored');
  });
  assert.equal(await ask({ type: 'statsClear' }, { id: 'self', url: 'https://evil.example/' }), 'ignored');
  assert.deepEqual(await ask({ type: 'statsClear' }, { id: 'self', url: 'chrome-extension://self/settings/settings.html' }), { ok: true });
  assert.equal(fake.local.has('stats'), false);
});

test('an incognito worker registers nothing, so incognito tabs are never counted', async () => {
  const fake = fakeChrome({ incognito: true });
  globalThis.chrome = fake.chrome;
  await import(`../src/background/stats.js?incognito-${Date.now()}`);
  assert.deepEqual(fake.listeners, { committed: [] });
});
