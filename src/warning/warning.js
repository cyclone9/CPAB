// SPDX-License-Identifier: GPL-3.0-or-later
// Shown in place of a page on a harmful-sites list. It loads nothing from the stopped site and never
// logs its address.
import { t } from '../i18n/i18n.js';
import { readWarning } from '../shared/harmful.js';
import { applyPage, fillWithDomains, fillWithLatin } from '../shared/page.js';
import { browserLabel, buildReport } from '../shared/report.js';
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
  renderReport(language);
}

// Report a wrong warning: the site's name and the list that warned, never the stopped page's address.
function currentReport() {
  return buildReport({
    kind: 'warning', site: url.href, version: chrome.runtime.getManifest().version, browser: browserLabel(navigator), settings, lists, warnedBy: list,
  });
}

function renderReport(language) {
  let text = null;
  try {
    text = url ? currentReport().text : null;
  } catch {
    // An address with no site to name, such as an IP literal in brackets, can't be reported.
  }
  byId('report').hidden = !text;
  if (!text) return;
  byId('report-text').textContent = text;
  if (language === 'fa') fillWithLatin(byId('report-note'), t(language, 'reportNote'));
  else byId('report-note').textContent = t(language, 'reportNote');
}

const reportStatus = (key) => { byId('report-status').textContent = t(document.documentElement.lang, key); };

byId('report-open').addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: currentReport().url });
  } catch {
    reportStatus('reportOpenError');
  }
});

byId('report-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(currentReport().text);
    reportStatus('reportCopied');
  } catch {
    reportStatus('reportCopyError');
  }
});

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
