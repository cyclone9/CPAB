// SPDX-License-Identifier: GPL-3.0-or-later
import { format, t } from '../i18n/i18n.js';
import { addPausedSite, normalizeDomain } from '../shared/domains.js';
import { applyPage, fillWithDomains } from '../shared/page.js';
import { loadSettings, normalizeSettings, onSettingsChange, updateSettings } from '../shared/settings.js';

const EXAMPLE_DOMAIN = 'example.com';

const byId = (id) => document.getElementById(id);
const nav = byId('nav');
const input = byId('site-input');
const errorLine = byId('site-error');

let settings = await loadSettings().catch(() => normalizeSettings());
let language = 'en';
let siteError = null;

function renderError() {
  errorLine.hidden = !siteError;
  input.toggleAttribute('aria-invalid', false);
  if (!siteError) return;
  input.setAttribute('aria-invalid', 'true');
  fillWithDomains(errorLine, t(language, siteError.key), siteError.params);
}

function setError(key, params = {}) {
  siteError = key ? { key, params } : null;
  renderError();
}

function renderPausedList() {
  const list = byId('paused-list');
  list.replaceChildren(...settings.pausedSites.map((domain) => {
    const item = document.createElement('li');
    const name = document.createElement('bdi');
    name.dir = 'ltr';
    name.textContent = domain;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button button-quiet';
    remove.textContent = t(language, 'pausedRemove');
    remove.setAttribute('aria-label', format(language, 'pausedRemoveLabel', { domain }));
    remove.dataset.domain = domain;
    item.append(name, remove);
    return item;
  }));
  byId('paused-empty').hidden = settings.pausedSites.length > 0;
}

function render() {
  language = applyPage(settings);
  nav.setAttribute('aria-label', t(language, nav.dataset.labelKey));
  byId('master').checked = settings.master;
  byId('master-note').hidden = settings.master;
  byId('badge').checked = settings.badge;
  for (const toggle of document.querySelectorAll('[data-group]')) {
    toggle.checked = settings.groups[toggle.dataset.group];
  }
  for (const name of ['language', 'theme']) {
    document.querySelector(`input[name="${name}"][value="${settings[name]}"]`).checked = true;
  }
  renderPausedList();
  renderError();
}

async function save(change) {
  try {
    settings = await updateSettings(change);
  } catch {
    setError('saveError');
  }
  render();
}

byId('master').addEventListener('change', (event) => save({ master: event.target.checked }));
byId('badge').addEventListener('change', (event) => save({ badge: event.target.checked }));

for (const toggle of document.querySelectorAll('[data-group]')) {
  toggle.addEventListener('change', () => save((current) => ({
    groups: { ...current.groups, [toggle.dataset.group]: toggle.checked },
  })));
}

for (const radio of document.querySelectorAll('input[type="radio"]')) {
  radio.addEventListener('change', () => save({ [radio.name]: radio.value }));
}

byId('add-site').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!input.value.trim()) return setError('errorEmpty', { domain: EXAMPLE_DOMAIN });
  const domain = normalizeDomain(input.value);
  if (!domain) return setError('errorInvalid', { domain: EXAMPLE_DOMAIN });

  const result = addPausedSite(settings.pausedSites, domain);
  if (result.status === 'duplicate') return setError('errorDuplicate', { domain });
  if (result.status === 'covered') return setError('errorCovered', { domain, parent: result.parent });

  input.value = '';
  setError(null);
  await save((current) => ({ pausedSites: addPausedSite(current.pausedSites, domain).pausedSites }));
});

input.addEventListener('input', () => setError(null));

byId('paused-list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-domain]');
  if (!button) return;
  const { domain } = button.dataset;
  const index = settings.pausedSites.indexOf(domain);
  await save((current) => ({ pausedSites: current.pausedSites.filter((entry) => entry !== domain) }));
  // The pressed button is gone, so keyboard focus moves to its neighbour or back to the field.
  const buttons = byId('paused-list').querySelectorAll('button');
  (buttons[Math.min(index, buttons.length - 1)] ?? input).focus();
});

const links = new Map([...nav.querySelectorAll('a')].map((link) => [link.hash.slice(1), link]));
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    for (const link of links.values()) link.removeAttribute('aria-current');
    links.get(entry.target.id).setAttribute('aria-current', 'true');
  }
}, { rootMargin: '-15% 0px -75% 0px' });
for (const id of links.keys()) observer.observe(byId(id));

byId('version').textContent = chrome.runtime.getManifest().version;

onSettingsChange((next) => {
  settings = next;
  render();
});

render();
