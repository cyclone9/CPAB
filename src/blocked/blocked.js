// SPDX-License-Identifier: GPL-3.0-or-later
// Shown in place of a site on an adult-sites list while that switch is on, and of a site the person put
// in Blocked sites. It knows only the host, loads nothing from the blocked site and never logs the host.
import { t } from '../i18n/i18n.js';
import { OWN_BLOCKED_LIST, readBlocked } from '../shared/harmful.js';
import { applyPage, fillWithDomains } from '../shared/page.js';
import { loadSettings, normalizeSettings } from '../shared/settings.js';

// Chrome carries the blocked address's #fragment over to this page. Dropped, so the tab keeps the host only.
if (location.hash) history.replaceState(null, '', `${location.pathname}${location.search}`);

const byId = (id) => document.getElementById(id);

const { list, host } = readBlocked(location.search);
const own = list === OWN_BLOCKED_LIST;
const settings = await loadSettings().catch(() => normalizeSettings());
const lists = await fetch('../rules/summary.json').then((response) => response.json()).then((summary) => summary.lists).catch(() => []);
const listTitle = lists.find((entry) => entry.ruleset === list && entry.group === 'adult')?.title ?? null;

function render() {
  const language = applyPage(settings);
  byId('domain').textContent = host ?? '';
  byId('domain').parentElement.hidden = !host;
  byId('eyebrow').textContent = t(language, own ? 'sectionBlockedSites' : 'adult');
  const reason = byId('reason');
  if (!host) reason.textContent = t(language, 'blockedPageNoAddress');
  else if (own) reason.textContent = t(language, 'blockedPageReasonOwn');
  else if (listTitle) fillWithDomains(reason, t(language, 'blockedPageReason'), { list: listTitle });
  else reason.textContent = t(language, 'blockedPageReasonUnnamed');
  byId('note').textContent = t(language, own ? 'blockedPageNoteOwn' : 'blockedPageNote');
  byId('note').hidden = !host;
}

// With nothing to go back to, as in a tab opened for this address, the tab closes instead.
byId('back').addEventListener('click', async () => {
  if (history.length > 1) {
    history.back();
    return;
  }
  const tab = await chrome.tabs.getCurrent();
  if (tab) await chrome.tabs.remove(tab.id);
});

render();
