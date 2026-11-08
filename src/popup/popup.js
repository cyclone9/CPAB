// SPDX-License-Identifier: GPL-3.0-or-later
import { formatNumber, formatYears, t } from '../i18n/i18n.js';
import { adultRunning, countBlocked, harmfulRunning, splitBlocked } from '../shared/blocking.js';
import { BREACH_SOURCE, CPAB_LEAKS_FILE, DATALEAK_FILE, LEAKFA_FILE, breachNotice, cpabLeakNotice, findBreaches, leakfaNotice } from '../shared/dataleak.js';
import { fillWithDomains, applyPage } from '../shared/page.js';
import { addSite, findSiteEntry, siteFromUrl } from '../shared/domains.js';
import { BLOCKED_PAGE, OWN_BLOCKED_LIST, readBlocked as readBlockedPage } from '../shared/harmful.js';
import { loadSettings, normalizeSettings, onSettingsChange, updateSettings } from '../shared/settings.js';
import { UPDATE_KEY, newerVersion } from '../shared/updates.js';

const byId = (id) => document.getElementById(id);

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
// CPAB's blocked page stands in for a site the person blocked, so the popup speaks for that site.
function siteOf(url) {
  if (!url.startsWith(`${chrome.runtime.getURL(BLOCKED_PAGE)}?`)) return siteFromUrl(url);
  const { list, host } = readBlockedPage(new URL(url).search);
  return list === OWN_BLOCKED_LIST && host ? siteFromUrl(`http://${host}/`) : null;
}

// activeTab shows the URL only where the extension may run; elsewhere tab.url is missing.
const site = tab?.url ? siteOf(tab.url) : null;

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

// The files are in the package and read only while the switch is on. Nothing loads from a source's
// site unless its link is pressed.
async function readDomains(file) {
  if (!site || !settings.dataLeak) return null;
  try {
    return (await fetch(`../${file}`).then((response) => response.json())).domains;
  } catch {
    return null;
  }
}

const [breachDomains, leakfaDomains, ownDomains] = await Promise.all([readDomains(DATALEAK_FILE), readDomains(LEAKFA_FILE), readDomains(CPAB_LEAKS_FILE)]);
const notice = breachNotice(findBreaches(site, breachDomains));

// The new-version notice (F21), from the last daily check. It follows the updates switch.
const update = await chrome.storage.local.get(UPDATE_KEY).then((stored) => stored[UPDATE_KEY] ?? null, () => null);

function renderNewVersion(language) {
  const version = settings.updates ? newerVersion(update, chrome.runtime.getManifest().version) : null;
  byId('new-version').hidden = !version;
  if (version) fillWithDomains(byId('new-version-link'), t(language, 'popupNewVersion'), { version });
}

// HIBP's line first, then Leakfa's, then CPAB's own, never merged: each keeps its own source link.
function renderNotice(language) {
  const leakfa = leakfaNotice(language, site, leakfaDomains);
  const own = cpabLeakNotice(language, site, ownDomains);
  const box = byId('dataleak');
  box.hidden = !settings.dataLeak || (!notice && !leakfa && !own);
  if (box.hidden) return;
  byId('dataleak-hibp').hidden = !notice;
  if (notice) {
    // The years go in first as plain text, so only the breach's name is set apart left to right.
    const line = t(language, 'dataLeakLine').replace('{years}', () => formatYears(language, notice.years));
    fillWithDomains(byId('dataleak-line'), line, { breach: notice.label });
    const source = byId('dataleak-source');
    source.href = notice.link;
    fillWithDomains(source, t(language, 'dataLeakSource'), { source: BREACH_SOURCE });
  }
  byId('dataleak-leakfa').hidden = !leakfa;
  if (leakfa) {
    const line = byId('dataleak-leakfa-line');
    fillWithDomains(line, t(language, 'leakfaLine'), { breach: leakfa.label });
    // Leakfa's Persian names are Persian, so the name takes the direction of its own text.
    line.querySelector('bdi').dir = 'auto';
    byId('dataleak-leakfa-source').href = leakfa.link;
  }
  byId('dataleak-cpab').hidden = !own;
  if (own) {
    // The month goes in as plain text, so only the name is set apart.
    const line = byId('dataleak-cpab-line');
    fillWithDomains(line, t(language, 'cpabLeakLine').replace('{date}', () => own.date), { breach: own.label });
    line.querySelector('bdi').dir = 'auto';
    const source = byId('dataleak-cpab-source');
    source.href = own.link;
    fillWithDomains(source, t(language, 'dataLeakSource'), { source: new URL(own.link).hostname });
  }
}

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
  renderNewVersion(language);
  byId('site').hidden = !site;
  byId('restricted').hidden = Boolean(site);
  if (!site) return;

  const entry = findSiteEntry(site, settings.pausedSites);
  const blockedHere = Boolean(findSiteEntry(site, settings.blockedSites));
  byId('domain').textContent = site;
  renderNotice(language);
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
  // Pausing and the master switch leave Harmful and Adult sites on (PRD D10), and the popup says so.
  // The Adult part shows only while that switch is on.
  const harmful = harmfulRunning(settings);
  const adult = adultRunning(settings);
  const stays = byId('stays');
  stays.hidden = !(entry || !settings.master) || !(harmful || adult);
  if (harmful || adult) stays.textContent = t(language, harmful && adult ? 'stateProtectionStays' : harmful ? 'stateHarmfulStays' : 'stateAdultStays');

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

byId('new-version-link').addEventListener('click', async (event) => {
  event.preventDefault();
  await chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html#about') });
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
