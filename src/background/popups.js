// SPDX-License-Identifier: GPL-3.0-or-later
// Closes new tabs that $popup rules name. Everything between two events lives in storage.session, which
// stays in memory on this device, because Chrome can stop this worker while a tab is still loading.
import { EXCEPTIONS_FILE, allowedDomains } from '../shared/blocking.js';
import { POPUP_INDEX, isAllowedTarget, isBlank, isPaused, isPopupAd, isWebPage, popupLists } from '../shared/popups.js';
import { loadSettings } from '../shared/settings.js';
import { UPDATE_KEY, fileKey, isFileKey } from '../shared/updates.js';

const WATCH_PREFIX = 'popupWatch:';
// A tab still blank after this is no popup in the making, and a person may be using it.
const WATCH_MS = 30000;

const watchKey = (tabId) => `${WATCH_PREFIX}${tabId}`;

const packageJson = (path) => fetch(chrome.runtime.getURL(path)).then((response) => response.json());

// Kept while this worker lives, so a burst of tabs parses the data once. A list update empties it.
const loaded = new Map();
function cached(key, read) {
  if (!loaded.has(key)) loaded.set(key, read().catch((error) => {
    loaded.delete(key);
    throw error;
  }));
  return loaded.get(key);
}
const cachedFile = (path) => cached(path, () => packageJson(path));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.keys(changes).some((key) => key === UPDATE_KEY || isFileKey(key))) loaded.clear();
});

// A list's popup data: from its update when there is one, which both workers see in storage.local,
// else as it shipped.
async function popupData(id, file) {
  const key = fileKey(id, 'popup');
  const { [key]: stored } = await chrome.storage.local.get(key);
  return stored?.data ?? (file ? packageJson(file) : null);
}

// The build's lists with popup data, and any list an update gave popup data to.
async function popupIndex() {
  const index = await cachedFile(POPUP_INDEX);
  const { [UPDATE_KEY]: record } = await chrome.storage.local.get(UPDATE_KEY);
  const updated = Object.keys(record?.lists ?? {}).filter((id) => record.lists[id].files.popup && !index.lists.some((list) => list.id === id));
  return { lists: [...index.lists, ...updated.map((id) => ({ id, file: null }))] };
}

async function isAd(url, pageUrl) {
  const settings = await loadSettings();
  if (isPaused(settings, pageUrl)) return false;
  const exceptions = settings.recommendedExceptions ? (await cachedFile(EXCEPTIONS_FILE)).domains : [];
  if (isAllowedTarget(allowedDomains(settings, exceptions), url)) return false;
  const index = await cached('index', popupIndex);
  const on = popupLists(settings, index);
  const lists = (await Promise.all(index.lists.filter(({ id }) => on.includes(id)).map(({ id, file }) => cached(id, () => popupData(id, file)))))
    .filter(Boolean);
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
