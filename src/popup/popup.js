// SPDX-License-Identifier: GPL-3.0-or-later
import { formatNumber, t } from '../i18n/i18n.js';
import { countBlocked, splitBlocked } from '../shared/blocking.js';
import { fillWithDomains, applyPage } from '../shared/page.js';
import { addSite, findSiteEntry, siteFromUrl } from '../shared/domains.js';
import { loadSettings, normalizeSettings, onSettingsChange, updateSettings } from '../shared/settings.js';

const byId = (id) => document.getElementById(id);

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
// activeTab shows the URL only where the extension may run; elsewhere tab.url is missing.
const site = tab?.url ? siteFromUrl(tab.url) : null;

let settings = await loadSettings().catch(() => normalizeSettings());
const opened = { master: settings.master, paused: site ? findSiteEntry(site, settings.pausedSites) : null };

// getBadgeText can't give this number: without declarativeNetRequestFeedback it returns a placeholder.
// getMatchedRules can, through activeTab, and fails on pages where the popup holds no grant.
async function readBlocked() {
  if (!site) return null;
  try {
    const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules({ tabId: tab.id });
    return { total: countBlocked(rulesMatchedInfo), groups: splitBlocked(rulesMatchedInfo) };
  } catch {
    return null;
  }
}

const blocked = await readBlocked();

function renderBlocked(language) {
  const total = byId('blocked');
  total.textContent = blocked ? formatNumber(language, blocked.total) : t(language, 'blockedEmpty');
  total.classList.toggle('muted', !blocked);

  const groups = blocked?.groups ?? [];
  byId('blocked-groups').hidden = !groups.length;
  byId('blocked-groups').replaceChildren(...groups.map(({ label, count }) => {
    const line = document.createElement('li');
    const name = Object.assign(document.createElement('span'), { textContent: t(language, label) });
    const number = Object.assign(document.createElement('span'), { textContent: formatNumber(language, count) });
    line.append(name, number);
    return line;
  }));
}

function render() {
  const language = applyPage(settings);
  byId('master').checked = settings.master;
  byId('site').hidden = !site;
  byId('restricted').hidden = Boolean(site);
  if (!site) return;

  const entry = findSiteEntry(site, settings.pausedSites);
  const blockedHere = Boolean(findSiteEntry(site, settings.blockedSites));
  byId('domain').textContent = site;
  renderBlocked(language);
  byId('pause').textContent = t(language, entry ? 'resume' : 'pause');
  // No pause reaches a person's own blocked sites, so the button would do nothing.
  byId('pause').hidden = blockedHere;

  const state = byId('state');
  state.hidden = !entry && settings.master && !blockedHere;
  if (blockedHere && settings.master) state.textContent = t(language, 'stateBlockedSite');
  else if (entry && entry !== site) fillWithDomains(state, t(language, 'statePausedVia'), { domain: entry });
  else if (entry) state.textContent = t(language, 'statePaused');
  else state.textContent = t(language, 'stateOff');

  byId('reload-offer').hidden = settings.master === opened.master && entry === opened.paused;
}

async function save(change) {
  try {
    settings = await updateSettings(change);
    byId('error').hidden = true;
  } catch {
    byId('error').hidden = false;
  }
  render();
}

byId('master').addEventListener('change', (event) => save({ master: event.target.checked }));

byId('pause').addEventListener('click', () => save((current) => {
  const entry = findSiteEntry(site, current.pausedSites);
  return {
    pausedSites: entry
      ? current.pausedSites.filter((domain) => domain !== entry)
      : addSite(current.pausedSites, site).sites,
  };
}));

byId('reload').addEventListener('click', async () => {
  await chrome.tabs.reload(tab.id);
  window.close();
});

byId('open-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

onSettingsChange((next) => {
  settings = next;
  render();
});

render();
