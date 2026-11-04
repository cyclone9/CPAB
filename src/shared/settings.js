// SPDX-License-Identifier: GPL-3.0-or-later
import { normalizeDomain } from './domains.js';

const STORAGE_KEY = 'settings';
const LANGUAGES = ['auto', 'en', 'fa'];
const THEMES = ['dark', 'light'];

export const GROUP_IDS = ['ads', 'trackers', 'iran'];

export const DEFAULTS = Object.freeze({
  master: true,
  groups: Object.freeze({ ads: true, trackers: true, iran: true }),
  pausedSites: Object.freeze([]),
  language: 'auto',
  theme: 'dark',
  badge: true,
});

const flag = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

// Stored data can come from an older version, so nothing in it is trusted to have the current shape.
export function normalizeSettings(stored) {
  const value = stored && typeof stored === 'object' ? stored : {};
  const paused = Array.isArray(value.pausedSites) ? value.pausedSites : [];
  return {
    master: flag(value.master, DEFAULTS.master),
    groups: Object.fromEntries(GROUP_IDS.map((id) => [id, flag(value.groups?.[id], DEFAULTS.groups[id])])),
    pausedSites: [...new Set(paused.map(normalizeDomain).filter(Boolean))].sort(),
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
