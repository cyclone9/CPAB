// SPDX-License-Identifier: GPL-3.0-or-later
import { t } from '../i18n/i18n.js';
import { fillWithDomains, applyPage } from '../shared/page.js';
import { findPausedEntry, addPausedSite, siteFromUrl } from '../shared/domains.js';
import { loadSettings, normalizeSettings, onSettingsChange, updateSettings } from '../shared/settings.js';

const byId = (id) => document.getElementById(id);

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
// activeTab shows the URL only where the extension may run; elsewhere tab.url is missing.
const site = tab?.url ? siteFromUrl(tab.url) : null;

let settings = await loadSettings().catch(() => normalizeSettings());
const opened = { master: settings.master, paused: site ? findPausedEntry(site, settings.pausedSites) : null };

function render() {
  const language = applyPage(settings);
  byId('master').checked = settings.master;
  byId('site').hidden = !site;
  byId('restricted').hidden = Boolean(site);
  if (!site) return;

  const entry = findPausedEntry(site, settings.pausedSites);
  byId('domain').textContent = site;
  byId('pause').textContent = t(language, entry ? 'resume' : 'pause');

  const state = byId('state');
  state.hidden = !entry && settings.master;
  if (entry && entry !== site) fillWithDomains(state, t(language, 'statePausedVia'), { domain: entry });
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
  const entry = findPausedEntry(site, current.pausedSites);
  return {
    pausedSites: entry
      ? current.pausedSites.filter((domain) => domain !== entry)
      : addPausedSite(current.pausedSites, site).pausedSites,
  };
}));

byId('reload').addEventListener('click', async () => {
  await chrome.tabs.reload(tab.id);
  window.close();
});

byId('open-settings').addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
  window.close();
});

onSettingsChange((next) => {
  settings = next;
  render();
});

render();
