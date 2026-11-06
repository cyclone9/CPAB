// SPDX-License-Identifier: GPL-3.0-or-later
// What the service worker asks of Chrome for CSS rules, kept free of chrome.* calls so it can be tested.
import { wantedRulesets } from './blocking.js';

export const CSS_INDEX = 'rules/css-index.json';
export const SEED_KEY = 'cssSeed';

const SITE_KEY_PREFIX = 'css:';
const SCRIPT_ID_PREFIX = 'generic-css-';

export const siteKey = (list, domain) => `${SITE_KEY_PREFIX}${list}:${domain}`;

export const scriptList = (id) => id.slice(SCRIPT_ID_PREFIX.length);

const excludePattern = (domain) => `*://*.${domain}/*`;

// One registered script per list that has generic rules and is switched on.
export function wantedScripts(settings, index) {
  const on = wantedRulesets(settings, index.lists.map(({ id }) => id));
  const paused = settings.pausedSites.map(excludePattern);
  return index.lists.filter(({ id, generic }) => generic && on.includes(id)).map(({ id, generic, genericOff }) => ({
    id: `${SCRIPT_ID_PREFIX}${id}`,
    css: [generic],
    matches: ['<all_urls>'],
    excludeMatches: [...new Set([...genericOff.map(excludePattern), ...paused])].sort(),
    runAt: 'document_start',
    allFrames: true,
    persistAcrossSessions: true,
  }));
}

const sameList = (a = [], b = []) => [...a].sort().join('\n') === [...b].sort().join('\n');

// What turns `registered` into `wanted`, so running this twice changes nothing the second time.
export function scriptChanges(wanted, registered) {
  const current = new Map(registered.map((script) => [script.id, script]));
  const wantedIds = new Set(wanted.map(({ id }) => id));
  return {
    remove: registered.map(({ id }) => id).filter((id) => id.startsWith(SCRIPT_ID_PREFIX) && !wantedIds.has(id)),
    add: wanted.filter(({ id }) => !current.has(id)),
    update: wanted
      .filter(({ id, css, excludeMatches }) => current.has(id)
        && !(sameList(current.get(id).excludeMatches, excludeMatches) && sameList(current.get(id).css, css)))
      .map(({ id, css, excludeMatches }) => ({ id, css, excludeMatches })),
  };
}

// One storage entry per domain, per list.
export const seedEntries = (list, sites) => Object.fromEntries(
  Object.entries(sites).map(([domain, css]) => [siteKey(list, domain), css]),
);

// Stored site keys no list in this build wants any more.
export function staleKeys(storedKeys, wantedKeys) {
  return storedKeys.filter((key) => key.startsWith(SITE_KEY_PREFIX) && !wantedKeys.has(key));
}

// Bytes in storage.local as Chrome counts them: each key plus its value as JSON.
export function storedBytes(entries) {
  const size = (text) => new TextEncoder().encode(text).length;
  return Object.entries(entries).reduce((total, [key, value]) => total + size(key) + size(JSON.stringify(value)), 0);
}
