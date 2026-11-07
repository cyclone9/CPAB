// SPDX-License-Identifier: GPL-3.0-or-later
// Shown in place of a page on a harmful-sites list. It loads nothing from the stopped site and never
// logs its address.
import { t } from '../i18n/i18n.js';
import { readWarning } from '../shared/harmful.js';
import { applyPage, fillWithDomains } from '../shared/page.js';
import { loadSettings, normalizeSettings } from '../shared/settings.js';

const byId = (id) => document.getElementById(id);

const { list, url } = readWarning(location.search, location.hash);
const settings = await loadSettings().catch(() => normalizeSettings());
const lists = await fetch('../rules/summary.json').then((response) => response.json()).then((summary) => summary.lists).catch(() => []);
const listTitle = lists.find((entry) => entry.ruleset === list && entry.group === 'harmful')?.title ?? null;

function render() {
  const language = applyPage(settings);
  byId('domain').textContent = url?.hostname ?? '';
  byId('domain').parentElement.hidden = !url;
  const reason = byId('reason');
  if (url && listTitle) fillWithDomains(reason, t(language, 'warningReason'), { list: listTitle });
  else reason.textContent = t(language, url ? 'warningReasonUnnamed' : 'warningNoAddress');
  byId('continue').hidden = !url;
  byId('note').hidden = !url;
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

// replace(), so Back from the page skips the warning instead of showing it again.
byId('continue').addEventListener('click', async () => {
  const button = byId('continue');
  button.disabled = true;
  const reply = await chrome.runtime.sendMessage({ type: 'harmfulContinue', url: url.href }).catch(() => null);
  if (reply?.ok) {
    location.replace(url.href);
    return;
  }
  button.disabled = false;
  byId('error').hidden = false;
});

render();
