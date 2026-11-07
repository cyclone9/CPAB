// SPDX-License-Identifier: GPL-3.0-or-later
// Closes new tabs that $popup rules name. Everything between two events lives in storage.session, which
// stays in memory on this device, because Chrome can stop this worker while a tab is still loading.
import { POPUP_INDEX, isBlank, isPaused, isPopupAd, isWebPage, popupLists } from '../shared/popups.js';
import { loadSettings } from '../shared/settings.js';

const WATCH_PREFIX = 'popupWatch:';
// A tab still blank after this is no popup in the making, and a person may be using it.
const WATCH_MS = 30000;

const watchKey = (tabId) => `${WATCH_PREFIX}${tabId}`;

const packageJson = (path) => fetch(chrome.runtime.getURL(path)).then((response) => response.json());

// Kept while this worker lives, so a burst of tabs parses the data once.
const loaded = new Map();
function cached(path) {
  if (!loaded.has(path)) loaded.set(path, packageJson(path).catch((error) => {
    loaded.delete(path);
    throw error;
  }));
  return loaded.get(path);
}

async function isAd(url, pageUrl) {
  const settings = await loadSettings();
  if (isPaused(settings, pageUrl)) return false;
  const index = await cached(POPUP_INDEX);
  const on = popupLists(settings, index);
  const lists = await Promise.all(index.lists.filter(({ id }) => on.includes(id)).map(({ file }) => cached(file)));
  return isPopupAd(lists, url, pageUrl);
}

// Ctrl+click and middle-click open in the background, and Shift+click in a new normal window, which a
// page can't do. Ctrl+Shift+click looks the same as <a target="_blank"> on every event, and stays judged.
async function openedByPerson(tab, opener) {
  if (!tab.active) return true;
  if (tab.windowId === opener.windowId) return false;
  return (await chrome.windows.get(tab.windowId)).type === 'normal';
}

async function watch(tabId, url, page) {
  const now = Date.now();
  const stored = await chrome.storage.session.get(null);
  const stale = Object.keys(stored).filter((key) => key.startsWith(WATCH_PREFIX) && now - stored[key].since > WATCH_MS);
  if (stale.length) await chrome.storage.session.remove(stale);
  await chrome.storage.session.set({ [watchKey(tabId)]: { url, page, since: now } });
}

async function checkNewTab({ tabId, sourceTabId, url }) {
  const [tab, opener] = await Promise.all([chrome.tabs.get(tabId), chrome.tabs.get(sourceTabId)]);
  if (!isWebPage(opener.url) || await openedByPerson(tab, opener)) return;
  if (!isBlank(url) && await isAd(url, opener.url)) await chrome.tabs.remove(tabId);
  else await watch(tabId, url, opener.url);
}

// The address a watched tab settles on first: a server redirect, or what a script sent a blank tab to.
// Only a page's own navigation counts: "link" leaves out what a person typed or picked from a bookmark.
async function checkFirstCommit({ tabId, url, transitionType }) {
  const key = watchKey(tabId);
  const { [key]: watched } = await chrome.storage.session.get(key);
  if (!watched) return;
  await chrome.storage.session.remove(key);
  const fresh = Date.now() - watched.since <= WATCH_MS;
  if (fresh && transitionType === 'link' && url !== watched.url && await isAd(url, watched.page)) await chrome.tabs.remove(tabId);
}

// Chrome sends a tab's creation before its first commit. Checks run one at a time so a slow first one
// can't let the commit look for a watch not yet written.
let queue = Promise.resolve();
const inOrder = (check) => (details) => {
  queue = queue.then(() => check(details)).catch((error) => console.error('CPAB could not check a new tab:', error.message));
};

chrome.webNavigation.onCreatedNavigationTarget.addListener(inOrder(checkNewTab));

// Blank commits are filtered out by Chrome, and those never wake the worker.
const firstCommit = inOrder(checkFirstCommit);
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) firstCommit(details);
}, { url: [{ schemes: ['http', 'https'] }] });
