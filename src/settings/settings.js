// SPDX-License-Identifier: GPL-3.0-or-later
import { format, formatDate, formatNumber, t } from '../i18n/i18n.js';
import { addSite, findOverlap, normalizeDomain } from '../shared/domains.js';
import { applyPage, fillWithDomains } from '../shared/page.js';
import {
  loadRulesetProblems,
  loadSettings,
  normalizeSettings,
  onRulesetProblemsChange,
  onSettingsChange,
  updateSettings,
} from '../shared/settings.js';

const EXAMPLE_DOMAIN = 'example.com';

const byId = (id) => document.getElementById(id);
const nav = byId('nav');

// Paused sites and Blocked sites are one control with two lists. A site can't sit in both.
const SITE_LISTS = [
  {
    key: 'pausedSites',
    other: 'blockedSites',
    form: byId('add-site'),
    input: byId('site-input'),
    errorLine: byId('site-error'),
    list: byId('paused-list'),
    empty: byId('paused-empty'),
    duplicate: 'errorDuplicate',
    conflict: 'errorConflictBlocked',
    error: null,
  },
  {
    key: 'blockedSites',
    other: 'pausedSites',
    form: byId('add-blocked-site'),
    input: byId('blocked-site-input'),
    errorLine: byId('blocked-site-error'),
    list: byId('blocked-site-list'),
    empty: byId('blocked-site-empty'),
    duplicate: 'errorDuplicateBlocked',
    conflict: 'errorConflictPaused',
    error: null,
  },
];

let settings = await loadSettings().catch(() => normalizeSettings());
let problems = await loadRulesetProblems().catch(() => ({}));
const lists = await fetch('../rules/summary.json').then((response) => response.json()).then((summary) => summary.lists).catch(() => null);
let language = 'en';

function renderError(sites) {
  const { errorLine, input, error } = sites;
  errorLine.hidden = !error;
  input.toggleAttribute('aria-invalid', false);
  if (!error) return;
  input.setAttribute('aria-invalid', 'true');
  fillWithDomains(errorLine, t(language, error.key), error.params);
}

function setError(sites, key, params = {}) {
  sites.error = key ? { key, params } : null;
  renderError(sites);
}

function renderSiteList(sites) {
  const domains = settings[sites.key];
  sites.list.replaceChildren(...domains.map((domain) => {
    const item = document.createElement('li');
    const name = document.createElement('bdi');
    name.dir = 'ltr';
    name.textContent = domain;
    const actions = document.createElement('div');
    actions.className = 'site-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button button-quiet';
    remove.textContent = t(language, 'pausedRemove');
    remove.setAttribute('aria-label', format(language, 'pausedRemoveLabel', { domain }));
    remove.dataset.domain = domain;
    actions.append(remove);
    item.append(name, actions);
    return item;
  }));
  sites.empty.hidden = domains.length > 0;
}

function renderGroups() {
  for (const list of lists ?? []) {
    const meta = document.querySelector(`[data-meta="${list.group}"]`);
    const toggle = document.querySelector(`[data-group="${list.group}"]`);
    const parts = list.available
      ? [format(language, 'metaRules', { count: formatNumber(language, list.converted) }),
        format(language, 'metaSnapshot', { date: formatDate(language, list.snapshotDate) })]
      : [t(language, 'groupUnavailable')];
    meta.replaceChildren(...parts.map((text) => Object.assign(document.createElement('span'), { textContent: text })));
    toggle.disabled = !list.available;
    if (!list.available) toggle.checked = false;
    toggle.closest('.row').classList.toggle('is-later', !list.available);

    const problem = document.querySelector(`[data-problem="${list.group}"]`);
    problem.hidden = !problems[list.group];
    if (problems[list.group]) {
      fillWithDomains(problem, t(language, 'rulesetRefused'), {
        count: formatNumber(language, list.converted),
        reason: problems[list.group],
      });
    }
  }
}

function creditLink(href, text) {
  const link = Object.assign(document.createElement('a'), { href, target: '_blank', rel: 'noopener' });
  const label = document.createElement('bdi');
  label.textContent = text;
  link.append(label);
  return link;
}

function creditText(text, className) {
  const line = document.createElement('p');
  line.className = className;
  const content = document.createElement('bdi');
  content.dir = 'ltr';
  content.textContent = text;
  line.append(content);
  return line;
}

function renderCredits() {
  const shown = (lists ?? []).filter((list) => list.available);
  byId('credits').replaceChildren(...shown.map((list) => {
    const item = document.createElement('li');
    const links = document.createElement('p');
    links.className = 'credit-links small';
    links.append(creditLink(list.homepage, t(language, 'creditsHomepage')));
    const licence = creditLink(list.licence.copy ? `../rules/${list.licence.copy}` : list.licence.url, list.licence.name);
    licence.firstChild.dir = 'ltr';
    links.append(licence);
    if (list.sourceLink) links.append(creditLink(list.sourceLink, t(language, 'creditsSource')));

    const facts = document.createElement('p');
    facts.className = 'small muted';
    facts.textContent = `${format(language, 'metaSnapshot', { date: formatDate(language, list.snapshotDate) })} · ${t(language, 'creditsConverted')}`;

    item.append(creditText(list.title, 'credit-title'), creditText(list.attribution, 'small muted'), links, facts);
    return item;
  }));
  byId('credits-empty').hidden = shown.length > 0;
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
  renderGroups();
  renderCredits();
  byId('name-fa').hidden = language !== 'fa';
  for (const sites of SITE_LISTS) {
    renderSiteList(sites);
    renderError(sites);
  }
}

async function save(change) {
  try {
    settings = await updateSettings(change);
  } catch {
    setError(SITE_LISTS[0], 'saveError');
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

for (const sites of SITE_LISTS) {
  const { key, other, form, input, list, duplicate, conflict } = sites;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!input.value.trim()) return setError(sites, 'errorEmpty', { domain: EXAMPLE_DOMAIN });
    const domain = normalizeDomain(input.value);
    if (!domain) return setError(sites, 'errorInvalid', { domain: EXAMPLE_DOMAIN });

    const result = addSite(settings[key], domain);
    if (result.status === 'duplicate') return setError(sites, duplicate, { domain });
    if (result.status === 'covered') return setError(sites, 'errorCovered', { domain, parent: result.parent });
    const entry = findOverlap(domain, settings[other]);
    if (entry) return setError(sites, conflict, { domain, entry });

    input.value = '';
    setError(sites, null);
    await save((current) => ({ [key]: addSite(current[key], domain).sites }));
  });

  input.addEventListener('input', () => setError(sites, null));

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-domain]');
    if (!button) return;
    const { domain } = button.dataset;
    const index = settings[key].indexOf(domain);
    await save((current) => ({ [key]: current[key].filter((entry) => entry !== domain) }));
    // The pressed button is gone, so keyboard focus moves to its neighbour or back to the field.
    const buttons = list.querySelectorAll('button');
    (buttons[Math.min(index, buttons.length - 1)] ?? input).focus();
  });
}

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

onRulesetProblemsChange((next) => {
  problems = next;
  render();
});

render();
