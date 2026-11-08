// SPDX-License-Identifier: GPL-3.0-or-later
// The data-leak notice on the toolbar: the action's tooltip for one tab, set when that tab commits a page
// on a listed site. Chrome clears a tab's own action values each time the tab commits a new page, so
// nothing needs undoing when it moves on. The badge stays the blocked count.
import { resolveLanguage } from '../i18n/i18n.js';
import { CPAB_LEAKS_FILE, DATALEAK_FILE, LEAKFA_FILE, breachNotice, cpabLeakNotice, findBreaches, leakfaNotice, noticeTitle } from '../shared/dataleak.js';
import { siteFromUrl } from '../shared/domains.js';
import { loadSettings, onSettingsChange } from '../shared/settings.js';

// Kept while this worker lives, so a run of page loads parses each file once.
const loaded = new Map();
function domainsIn(file) {
  if (!loaded.has(file)) {
    loaded.set(file, fetch(chrome.runtime.getURL(file)).then((response) => response.json()).then(({ domains }) => domains)
      .catch((error) => {
        loaded.delete(file);
        throw error;
      }));
  }
  return loaded.get(file);
}

async function noticeFor(url, settings) {
  const site = url ? siteFromUrl(url) : null;
  if (!settings.dataLeak || !site) return null;
  // A build without Leakfa's snapshot still has the other lines.
  const [breaches, leakfa, own] = await Promise.all([
    domainsIn(DATALEAK_FILE), domainsIn(LEAKFA_FILE).catch(() => null), domainsIn(CPAB_LEAKS_FILE),
  ]);
  const language = resolveLanguage(settings.language, chrome.i18n.getUILanguage());
  const notice = breachNotice(findBreaches(site, breaches));
  const leak = leakfaNotice(language, site, leakfa);
  const ownLeak = cpabLeakNotice(language, site, own);
  if (!notice && !leak && !ownLeak) return null;
  return noticeTitle(language, await chrome.action.getTitle({}), notice, leak, ownLeak);
}

async function markTab(tabId, url) {
  const title = await noticeFor(url, await loadSettings());
  if (!title) return;
  // A tab that reached another site while the file loaded gets its own event for that page. A tab that closed,
  // or was swapped for another one, in the meantime has nothing left to mark.
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || siteFromUrl(tab.url ?? '') !== siteFromUrl(url)) return;
  await chrome.action.setTitle({ tabId, title }).catch(() => {});
}

// After the switch or the language changes, and after an update, which drops every tab's title.
async function markAllTabs(settings) {
  const plain = await chrome.action.getTitle({});
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    const title = (await noticeFor(tab.url, settings)) ?? plain;
    // A tab can close in the meantime.
    await chrome.action.setTitle({ tabId: tab.id, title }).catch(() => {});
  }));
}

// The reason only, never the page's address.
const onError = (error) => console.error('CPAB could not update the data-leak notice:', error?.message ?? String(error));

// A page prerendered in the background isn't the page the tab shows.
chrome.webNavigation.onCommitted.addListener(({ tabId, frameId, url, documentLifecycle }) => {
  if (frameId === 0 && documentLifecycle !== 'prerender') markTab(tabId, url).catch(onError);
}, { url: [{ schemes: ['http', 'https'] }] });

onSettingsChange((next, previous) => {
  if (next.dataLeak !== previous.dataLeak || next.language !== previous.language) markAllTabs(next).catch(onError);
});

chrome.runtime.onInstalled.addListener(() => {
  loadSettings().then(markAllTabs).catch(onError);
});
