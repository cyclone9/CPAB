// SPDX-License-Identifier: GPL-3.0-or-later
// Statistics (PRD D16): counts what is blocked in this browser, per day, from webRequest.onErrorOccurred,
// which only observes. Each request's address is read for the site of the tab it came from and then
// dropped. Counts wait in memory for a moment and are written together; Chrome can stop the worker at
// any time, so at worst the last two seconds are lost.
import { WARNING_PAGE } from '../shared/harmful.js';
import { findSiteEntry, siteFromUrl } from '../shared/domains.js';
import { loadSettings, onSettingsChange } from '../shared/settings.js';
import { STATS_KEY, dayKey, mergeStats, pruneStats } from '../shared/stats.js';

const FLUSH_MS = 2000;
const FLUSH_EVENTS = 50;

let settings = null;
const currentSettings = async () => (settings ??= await loadSettings());

// The site of each tab's top page, while this worker lives. tabs.get fills in what it missed.
const tabSites = new Map();

async function siteOfTab(tabId) {
  if (tabSites.has(tabId)) return tabSites.get(tabId);
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const site = siteFromUrl(tab?.url ?? '');
  if (tab) tabSites.set(tabId, site);
  return site;
}

// { 'YYYY-MM-DD': { blocked, sites? } }, waiting to be written.
let pending = {};
let pendingEvents = 0;
let timer = null;
let writes = Promise.resolve();

function count(site) {
  const day = (pending[dayKey(new Date())] ??= { blocked: 0 });
  day.blocked += 1;
  if (site) {
    day.sites ??= {};
    day.sites[site] = (day.sites[site] ?? 0) + 1;
  }
  pendingEvents += 1;
  if (pendingEvents >= FLUSH_EVENTS) flush();
  else timer ??= setTimeout(flush, FLUSH_MS);
}

const onSaveError = (error) => console.error('CPAB could not save its statistics:', error.message);

// Writes run one at a time, so a clear can't land between another write's read and its set.
function queued(write) {
  const done = writes.then(write);
  writes = done.catch(() => {});
  return done;
}

function flush() {
  clearTimeout(timer);
  timer = null;
  const counts = pending;
  pending = {};
  pendingEvents = 0;
  return queued(async () => {
    const keepSites = (await currentSettings()).statsTopSites;
    const { [STATS_KEY]: stored } = await chrome.storage.local.get(STATS_KEY);
    await chrome.storage.local.set({ [STATS_KEY]: pruneStats(mergeStats(stored, counts), new Date(), keepSites) });
  }).catch(onSaveError);
}

// Drops the sites from every stored day when Top 5 goes off.
function dropSites() {
  for (const day of Object.values(pending)) delete day.sites;
  return queued(async () => {
    const { [STATS_KEY]: stored } = await chrome.storage.local.get(STATS_KEY);
    if (stored) await chrome.storage.local.set({ [STATS_KEY]: pruneStats(mergeStats(stored, {}), new Date(), false) });
  }).catch(onSaveError);
}

function clear() {
  clearTimeout(timer);
  timer = null;
  pending = {};
  pendingEvents = 0;
  return queued(() => chrome.storage.local.remove(STATS_KEY));
}

// Only what CPAB itself would block on this page: not with blocking off or the site paused. Another
// extension's block reads the same, so the page says "blocked in this browser".
async function onBlocked({ error, tabId, initiator }) {
  if (error !== 'net::ERR_BLOCKED_BY_CLIENT' || tabId < 0 || initiator?.startsWith('chrome-extension://')) return;
  const current = await currentSettings();
  if (!current.statsDaily || !current.master) return;
  const site = await siteOfTab(tabId);
  if (!site || findSiteEntry(site, current.pausedSites)) return;
  count(current.statsTopSites ? site : null);
}

// A harmful-site warning counts once, with no site. Only a commit that a rule redirected counts: Chrome
// marks it server_redirect, and a reload, a script's reload or going back opens the page directly.
// Adult sites and the person's own Blocked sites open the blocked page instead, which isn't counted.
async function onWarning({ frameId, transitionType, transitionQualifiers }) {
  if (frameId !== 0 || transitionType === 'reload' || !transitionQualifiers.includes('server_redirect')) return;
  if ((await currentSettings()).statsDaily) count(null);
}

const onError = (error) => console.error('CPAB could not count a blocked item:', error.message);

// An incognito window runs its own copy of this worker ("incognito": "split"). Registering nothing
// there is what keeps incognito tabs out of the statistics.
if (!chrome.extension.inIncognitoContext) {
  const types = Object.values(chrome.webRequest.ResourceType).filter((type) => type !== 'main_frame');
  chrome.webRequest.onErrorOccurred.addListener((details) => {
    onBlocked(details).catch(onError);
  }, { urls: ['http://*/*', 'https://*/*'], types });

  // A page prerendered in the background isn't what the tab shows.
  chrome.webNavigation.onCommitted.addListener(({ tabId, frameId, url, documentLifecycle }) => {
    if (frameId === 0 && documentLifecycle !== 'prerender') tabSites.set(tabId, siteFromUrl(url));
  }, { url: [{ schemes: ['http', 'https'] }] });

  chrome.webNavigation.onCommitted.addListener((details) => {
    onWarning(details).catch(onError);
  }, { url: [{ urlPrefix: chrome.runtime.getURL(WARNING_PAGE) }] });

  chrome.webNavigation.onTabReplaced.addListener(({ replacedTabId, tabId }) => {
    tabSites.delete(replacedTabId);
    tabSites.delete(tabId);
  });
  chrome.tabs.onRemoved.addListener((tabId) => tabSites.delete(tabId));

  onSettingsChange((next, previous) => {
    settings = next;
    if (previous.statsTopSites && !next.statsTopSites) dropSites();
  });

  // Only the settings page may ask.
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type !== 'statsClear') return false;
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('settings/'))) return false;
    clear().then(() => reply({ ok: true }), (error) => {
      onSaveError(error);
      reply({ ok: false });
    });
    return true;
  });
}
