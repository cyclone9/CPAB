// SPDX-License-Identifier: GPL-3.0-or-later
// The data-leak notice on the toolbar: the action's tooltip for one tab, set when that tab commits a page
// on a listed site. Chrome clears a tab's own action values each time the tab commits a new page, so
// nothing needs undoing when it moves on. The badge stays the blocked count.
import { resolveLanguage } from '../i18n/i18n.js';
import { DATALEAK_FILE, breachNotice, findBreaches, noticeTitle } from '../shared/dataleak.js';
import { siteFromUrl } from '../shared/domains.js';
import { loadSettings, onSettingsChange } from '../shared/settings.js';

// Kept while this worker lives, so a run of page loads parses the file once.
let loaded = null;
function breachDomains() {
  loaded ??= fetch(chrome.runtime.getURL(DATALEAK_FILE)).then((response) => response.json()).then(({ domains }) => domains)
    .catch((error) => {
      loaded = null;
      throw error;
    });
  return loaded;
}

async function noticeFor(url, settings) {
  const site = url ? siteFromUrl(url) : null;
  if (!settings.dataLeak || !site) return null;
  const notice = breachNotice(findBreaches(site, await breachDomains()));
  if (!notice) return null;
  const language = resolveLanguage(settings.language, chrome.i18n.getUILanguage());
  return noticeTitle(language, await chrome.action.getTitle({}), notice);
}

async function markTab(tabId, url) {
  const title = await noticeFor(url, await loadSettings());
  if (!title) return;
  // A tab that reached another site while the file loaded gets its own event for that page.
  const tab = await chrome.tabs.get(tabId);
  if (siteFromUrl(tab.url ?? '') !== siteFromUrl(url)) return;
  await chrome.action.setTitle({ tabId, title });
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

const onError = () => console.error('CPAB could not update the data-leak notice');

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
