// SPDX-License-Identifier: GPL-3.0-or-later
import { normalizeDomain } from './domains.js';

const STORAGE_KEY = 'settings';
const PROBLEMS_KEY = 'rulesetProblems';
const LANGUAGES = ['auto', 'en', 'fa'];
const THEMES = ['dark', 'light'];

// The rulesets behind each group, in display order. Each is one source list with its own switch, and
// the group's switch sits above them, so turning a group off leaves every list's own choice stored.
export const GROUP_RULESETS = Object.freeze({
  ads: Object.freeze(['ads', 'ads-adguard-base', 'iran', 'cpab-own']),
  trackers: Object.freeze(['trackers']),
});

export const GROUP_IDS = Object.freeze(Object.keys(GROUP_RULESETS));
export const RULESET_IDS = Object.freeze(Object.values(GROUP_RULESETS).flat());

export const DEFAULTS = Object.freeze({
  master: true,
  groups: Object.freeze({ ads: true, trackers: true }),
  lists: Object.freeze(Object.fromEntries(RULESET_IDS.map((id) => [id, true]))),
  pausedSites: Object.freeze([]),
  blockedSites: Object.freeze([]),
  language: 'auto',
  theme: 'dark',
  badge: true,
});

const flag = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

// Up to 0.1.6 PersianBlocker had a group of its own, and it now sits under Ads. What the old switches
// did carries over: Iran off becomes that list off. Iran on with Ads off keeps it running, by moving
// the off onto the other Ads lists, because the Ads switch would stop it too.
function withoutIranGroup(value) {
  if (typeof value.groups?.iran !== 'boolean') return value;
  const { iran, ...groups } = value.groups;
  const lists = { ...value.lists };
  if (!iran) {
    lists.iran = false;
  } else if (groups.ads === false && lists.iran !== false) {
    groups.ads = true;
    for (const id of GROUP_RULESETS.ads.filter((list) => list !== 'iran')) lists[id] = false;
  }
  return { ...value, groups, lists };
}

// Stored data can come from an older version, so nothing in it is trusted to have the current shape.
export function normalizeSettings(stored) {
  const value = withoutIranGroup(stored && typeof stored === 'object' ? stored : {});
  const siteList = (sites) => [...new Set((Array.isArray(sites) ? sites : []).map(normalizeDomain).filter(Boolean))].sort();
  return {
    master: flag(value.master, DEFAULTS.master),
    groups: Object.fromEntries(GROUP_IDS.map((id) => [id, flag(value.groups?.[id], DEFAULTS.groups[id])])),
    lists: Object.fromEntries(RULESET_IDS.map((id) => [id, flag(value.lists?.[id], DEFAULTS.lists[id])])),
    pausedSites: siteList(value.pausedSites),
    blockedSites: siteList(value.blockedSites),
    language: LANGUAGES.includes(value.language) ? value.language : DEFAULTS.language,
    theme: THEMES.includes(value.theme) ? value.theme : DEFAULTS.theme,
    badge: flag(value.badge, DEFAULTS.badge),
  };
}

export async function loadSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeSettings(stored[STORAGE_KEY]);
}

let writes = Promise.resolve();

// Writes run one at a time so two quick changes can't overwrite each other. `change` is a patch,
// or a function from the current settings to a patch.
export function updateSettings(change) {
  const write = writes.then(async () => {
    const current = await loadSettings();
    const patch = typeof change === 'function' ? change(current) : change;
    const next = normalizeSettings({ ...current, ...patch });
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    return next;
  });
  writes = write.catch(() => {});
  return write;
}

export function onSettingsChange(listener) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) listener(normalizeSettings(changes[STORAGE_KEY].newValue));
  });
}

// Rulesets Chrome refused, as { rulesetId: "Chrome's reason" }, for settings to show.
export function saveRulesetProblems(problems) {
  return chrome.storage.local.set({ [PROBLEMS_KEY]: problems });
}

export async function loadRulesetProblems() {
  const stored = await chrome.storage.local.get(PROBLEMS_KEY);
  return stored[PROBLEMS_KEY] ?? {};
}

export function onRulesetProblemsChange(listener) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[PROBLEMS_KEY]) listener(changes[PROBLEMS_KEY].newValue ?? {});
  });
}
