// SPDX-License-Identifier: GPL-3.0-or-later
import { format, formatDate, formatNumber, t } from '../i18n/i18n.js';
import { recentChangelog } from '../shared/changelog.js';
import { addSite, findOverlap, normalizeDomain } from '../shared/domains.js';
import { applyPage, fillWithDomains, fillWithLatin } from '../shared/page.js';
import { PAGE_SIZE, searchSites } from '../shared/site-search.js';
import {
  GROUP_IDS,
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
    search: byId('paused-search'),
    searchLabel: 'searchPausedLabel',
    none: byId('paused-none'),
    more: byId('paused-more'),
    count: byId('paused-count'),
    showMore: byId('paused-show-more'),
    limit: PAGE_SIZE,
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
    search: byId('blocked-site-search'),
    searchLabel: 'searchBlockedLabel',
    none: byId('blocked-site-none'),
    more: byId('blocked-site-more'),
    count: byId('blocked-site-count'),
    showMore: byId('blocked-site-show-more'),
    limit: PAGE_SIZE,
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
  const { shown, matched, total, more } = searchSites(domains, sites.search.value, sites.limit);
  sites.list.replaceChildren(...shown.map((domain) => {
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
  sites.empty.hidden = total > 0;
  sites.search.closest('.search').hidden = total === 0;
  sites.search.setAttribute('aria-label', t(language, sites.searchLabel));
  sites.search.placeholder = t(language, 'searchPlaceholder');
  sites.none.hidden = total === 0 || matched > 0;
  sites.more.hidden = shown.length === total || matched === 0;
  sites.count.textContent = format(language, 'searchCount', { shown: formatNumber(language, shown.length), total: formatNumber(language, total) });
  sites.showMore.hidden = more === 0;
  sites.showMore.textContent = format(language, 'searchShowMore', { count: formatNumber(language, more) });
}

const inGroup = (group) => (lists ?? []).filter((list) => list.group === group);
const listsOf = (group) => inGroup(group).filter((list) => list.listed !== false);

function fillMeta(element, parts) {
  element.replaceChildren(...parts.map((text) => Object.assign(document.createElement('span'), { textContent: text })));
}

function listFacts(list) {
  if (!list.available) return [t(language, 'groupUnavailable')];
  return [format(language, 'metaRules', { count: formatNumber(language, list.converted) }),
    format(language, 'metaSnapshot', { date: formatDate(language, list.snapshotDate) })];
}

// The group's own line, once it has several lists. It counts what really runs, so a group that is on
// with every list off doesn't read as working.
function groupFacts(group, members) {
  const running = settings.groups[group] ? members.filter((list) => list.available && settings.lists[list.ruleset]) : [];
  const count = running.reduce((total, list) => total + list.converted, 0);
  return [
    format(language, 'metaListsOn', { on: formatNumber(language, running.length), total: formatNumber(language, members.length) }),
    ...(count ? [format(language, 'metaRules', { count: formatNumber(language, count) })] : []),
  ];
}

// On the group's row, not the list's: a refusal has to show while the group is closed.
function renderProblems(group, members) {
  const refused = inGroup(group).filter((list) => problems[list.ruleset]);
  const problem = document.querySelector(`[data-problem="${group}"]`);
  problem.hidden = !refused.length;
  problem.replaceChildren(...refused.map((list) => {
    const line = document.createElement('span');
    fillWithDomains(line, t(language, members.length > 1 ? 'rulesetRefusedNamed' : 'rulesetRefused'), {
      list: list.title,
      count: formatNumber(language, list.converted),
      reason: problems[list.ruleset],
    });
    return line;
  }));
}

function renderGroups() {
  for (const group of GROUP_IDS) {
    const members = listsOf(group);
    if (!members.length) continue;
    const anyAvailable = members.some((list) => list.available);
    const toggle = document.querySelector(`[data-group="${group}"]`);
    fillMeta(document.querySelector(`[data-meta="${group}"]`), members.length > 1 ? groupFacts(group, members) : listFacts(members[0]));
    toggle.disabled = !anyAvailable;
    if (!anyAvailable) toggle.checked = false;
    toggle.closest('.row').classList.toggle('is-later', !anyAvailable);
    renderProblems(group, members);
  }
}

function listRow(list) {
  const row = Object.assign(document.createElement('label'), { className: 'row row-list' });
  const text = Object.assign(document.createElement('span'), { className: 'row-text' });
  const title = Object.assign(document.createElement('bdi'), { className: 'row-title', id: `list-${list.ruleset}-title`, dir: 'ltr', textContent: list.title });
  const meta = Object.assign(document.createElement('span'), { className: 'row-meta' });
  meta.dataset.listMeta = list.ruleset;
  text.append(title);
  if (list.descriptionKey) {
    const description = Object.assign(document.createElement('span'), { className: 'row-desc', id: `list-${list.ruleset}-desc` });
    description.dataset.t = list.descriptionKey;
    text.append(description);
  }
  text.append(meta);

  const toggle = Object.assign(document.createElement('input'), { className: 'switch', type: 'checkbox' });
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-labelledby', title.id);
  if (list.descriptionKey) toggle.setAttribute('aria-describedby', `list-${list.ruleset}-desc`);
  toggle.dataset.list = list.ruleset;
  toggle.addEventListener('change', () => save((current) => ({
    lists: { ...current.lists, [list.ruleset]: toggle.checked },
  })));

  row.append(text, toggle);
  return row;
}

// Built once and only updated after that, so a switch keeps keyboard focus when it is pressed.
function buildListRows() {
  for (const panel of document.querySelectorAll('[data-lists]')) {
    const members = listsOf(panel.dataset.lists);
    if (members.length < 2) continue;
    panel.append(...members.map(listRow));
    document.querySelector(`[data-opens-lists="${panel.dataset.lists}"]`).hidden = false;
  }
}

function renderListRows() {
  for (const list of lists ?? []) {
    const toggle = document.querySelector(`[data-list="${list.ruleset}"]`);
    if (!toggle) continue;
    toggle.checked = list.available && settings.lists[list.ruleset];
    toggle.disabled = !list.available || !settings.groups[list.group];
    toggle.closest('.row').classList.toggle('is-later', toggle.disabled);
    fillMeta(document.querySelector(`[data-list-meta="${list.ruleset}"]`), listFacts(list));
  }
  for (const note of document.querySelectorAll('[data-lists-note]')) {
    note.hidden = settings.groups[note.dataset.listsNote];
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

function renderChangelog() {
  const running = chrome.runtime.getManifest().version;
  byId('changelog-list').replaceChildren(...recentChangelog().map(({ version, date, ...changes }) => {
    const item = document.createElement('li');
    const heading = Object.assign(document.createElement('h3'), { className: 'changelog-heading' });
    const number = Object.assign(document.createElement('bdi'), { dir: 'ltr', textContent: version });
    heading.append(number, Object.assign(document.createElement('span'), { className: 'small muted', textContent: formatDate(language, date) }));
    if (version === running) {
      heading.append(Object.assign(document.createElement('span'), { className: 'tag', textContent: t(language, 'changelogCurrent') }));
    }
    const lines = changes[language].map((change) => {
      const line = document.createElement('li');
      if (language === 'fa') fillWithLatin(line, change);
      else line.textContent = change;
      return line;
    });
    const list = Object.assign(document.createElement('ul'), { className: 'changelog-lines' });
    list.append(...lines);
    item.append(heading, list);
    return item;
  }));
}

function render() {
  language = applyPage(settings);
  nav.setAttribute('aria-label', t(language, nav.dataset.labelKey));
  byId('master').checked = settings.master;
  byId('master-note').hidden = settings.master;
  byId('badge').checked = settings.badge;
  byId('popups').checked = settings.popups;
  for (const toggle of document.querySelectorAll('[data-group]')) {
    toggle.checked = settings.groups[toggle.dataset.group];
  }
  for (const name of ['language', 'theme']) {
    document.querySelector(`input[name="${name}"][value="${settings[name]}"]`).checked = true;
  }
  renderGroups();
  renderListRows();
  renderCredits();
  renderChangelog();
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
byId('popups').addEventListener('change', (event) => save({ popups: event.target.checked }));

for (const toggle of document.querySelectorAll('[data-group]')) {
  toggle.addEventListener('change', () => save((current) => ({
    groups: { ...current.groups, [toggle.dataset.group]: toggle.checked },
  })));
}

for (const opener of document.querySelectorAll('[data-opens-lists]')) {
  opener.addEventListener('click', () => {
    const panel = byId(opener.getAttribute('aria-controls'));
    panel.hidden = !panel.hidden;
    opener.setAttribute('aria-expanded', String(!panel.hidden));
  });
}

for (const radio of document.querySelectorAll('input[type="radio"]')) {
  radio.addEventListener('change', () => save({ [radio.name]: radio.value }));
}

for (const sites of SITE_LISTS) {
  const { key, other, form, input, list, duplicate, conflict, search, showMore } = sites;

  search.addEventListener('input', () => {
    sites.limit = PAGE_SIZE;
    renderSiteList(sites);
  });
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !search.value) return;
    event.preventDefault();
    search.value = '';
    sites.limit = PAGE_SIZE;
    renderSiteList(sites);
  });
  showMore.addEventListener('click', () => {
    const before = list.children.length;
    sites.limit += PAGE_SIZE;
    renderSiteList(sites);
    // Focus goes to the first new row, so the next Tab doesn't jump back over the page just added.
    list.children[before]?.querySelector('button')?.focus();
  });

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
    const index = [...list.querySelectorAll('button')].indexOf(button);
    await save((current) => ({ [key]: current[key].filter((entry) => entry !== domain) }));
    // The pressed button is gone, so keyboard focus moves to its neighbour or back to the field.
    const buttons = list.querySelectorAll('button');
    (buttons[Math.min(index, buttons.length - 1)] ?? (search.closest('.search').hidden ? input : search)).focus();
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

buildListRows();

onSettingsChange((next) => {
  settings = next;
  render();
});

onRulesetProblemsChange((next) => {
  problems = next;
  render();
});

render();
