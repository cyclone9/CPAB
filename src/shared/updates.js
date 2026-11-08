// SPDX-License-Identifier: GPL-3.0-or-later
// Daily list updates: which served lists replace the bundled ones, how their rules are numbered, and
// what the service worker keeps about them. Free of chrome.* calls so it can be tested.
import { GROUP_RULESETS } from './settings.js';
import { dynamicRuleId } from './blocking.js';
import { hostRules } from './harmful.js';

export const UPDATE_KEY = 'update';
// What Chrome holds as dynamic copies of lists: { [list]: { sha256, ids } }. It describes Chrome's
// state, not the update, so it outlives a dropped update until the copies are gone.
export const DYNAMIC_APPLIED_KEY = 'dynamicApplied';
// Site CSS each list has in storage from an update: { [list]: sha256 }.
export const SITES_APPLIED_KEY = 'sitesApplied';
const FILE_PREFIX = 'update:file:';
export const fileKey = (list, kind) => `${FILE_PREFIX}${list}:${kind}`;
export const isFileKey = (key) => key.startsWith(FILE_PREFIX);

export const ALARM = 'cpab-update';
export const RETRY_ALARM = 'cpab-update-retry';
export const DAY_MINUTES = 1440;
// A browser that was closed when the alarm was due checks at its next start once this much has passed.
export const STARTUP_CHECK_AFTER_MS = 20 * 60 * 60 * 1000;
// After a network or server failure: once at 2 hours, once at 6, then the daily alarm.
export const RETRY_MINUTES = Object.freeze([120, 360]);
export const CHECK_NOW_EVERY_MS = 10 * 60 * 1000;
export const FETCH_TIMEOUT_MS = 60000;
// Kept free for the person's own rules when deciding whether served lists fit Chrome's dynamic rules.
export const OWN_RULES_RESERVE = 1000;

// The kinds the extension applies. Generic CSS waits for a new version: registered content scripts
// take files only. Licence texts stay as they shipped.
export const HOST_KINDS = Object.freeze(['domains']);
export const LIST_KINDS = Object.freeze(['rules', 'sites', 'popup', 'genericOff']);

export const isHostList = (list) => GROUP_RULESETS.harmful.includes(list) || GROUP_RULESETS.adult.includes(list);
export const isAdultList = (list) => GROUP_RULESETS.adult.includes(list);

const parts = (version) => version.split('.').map(Number);

// Below zero when a is older than b, above when newer, part by part as numbers.
export function compareVersions(a, b) {
  const [left, right] = [parts(a), parts(b)];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

// The version to announce, or null when the running one is as new.
export function newerVersion(record, running) {
  const version = record?.extension;
  return typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version) && compareVersions(version, running) > 0 ? version : null;
}

// 'older' refuses a version.json that would roll the data back, 'same' means nothing new.
export function compareGenerated(generated, record) {
  const floor = record?.floor;
  if (floor && generated < floor) return 'older';
  if (record?.generated && generated === record.generated) return 'same';
  return 'newer';
}

// A served list replaces the bundled one only when its source differs and isn't older, so a build
// fresher than the server is never downgraded.
export function qualifies(served, bundled) {
  if (!served?.snapshot || !bundled?.available) return false;
  return served.snapshot.sha256 !== bundled.snapshotSha256 && served.snapshot.date >= bundled.snapshotDate;
}

// The files to keep for each list that qualifies: { list: { kind: file } }. A list whose files don't
// have the form its group needs is a refusal, not a skip.
export function wantedFiles(version, summary, declared) {
  const bundled = new Map(summary.lists.filter(({ ruleset }) => ruleset).map((list) => [list.ruleset, list]));
  const lists = {};
  const problems = [];
  for (const [id, entry] of Object.entries(version.lists)) {
    if (!declared.includes(id) || !qualifies(entry, bundled.get(id))) continue;
    const kinds = isHostList(id) ? HOST_KINDS : LIST_KINDS;
    const wrong = isHostList(id) ? 'rules' : 'domains';
    if (entry.files[wrong]) {
      problems.push(`${id}: served with ${wrong}`);
      continue;
    }
    const files = Object.fromEntries(Object.entries(entry.files).filter(([kind]) => kinds.includes(kind)));
    if (Object.keys(files).length) lists[id] = { snapshot: entry.snapshot, files };
  }
  return { lists, problems };
}

// The dynamic rules every updated list would take, as Chrome counts them.
export function dynamicRuleCount(lists) {
  return Object.entries(lists).reduce((total, [id, { files }]) => total + (isHostList(id) ? (files.domains ? 2 : 0) : (files.rules?.count ?? 0)), 0);
}

export function fitsDynamicRules(lists, max) {
  return dynamicRuleCount(lists) + OWN_RULES_RESERVE <= max;
}

// A list's served rules in its own id range.
export function renumberRules(list, rules) {
  return rules.map((rule) => ({ ...rule, id: dynamicRuleId(list, rule.id) }));
}

// The rules a list's dynamic copy holds, from its stored data.
export function listRules(list, data, extensionId) {
  if (isHostList(list)) return renumberRules(list, hostRules({ listId: list, extensionId, adult: isAdultList(list), ...data }));
  return renumberRules(list, data);
}

// The genericOff lists from updates, by list, for wantedScripts().
export function genericOffOverrides(record, stored) {
  return Object.fromEntries(Object.keys(record?.lists ?? {})
    .filter((list) => record.lists[list].files.genericOff && stored[fileKey(list, 'genericOff')]?.sha256 === record.lists[list].files.genericOff.sha256)
    .map((list) => [list, stored[fileKey(list, 'genericOff')].data]));
}

// The sha256 of a list's live copy of one kind, or null.
export const liveSha = (record, list, kind) => record?.lists?.[list]?.files?.[kind]?.sha256 ?? null;

// The list's live rules or domains, whichever its group uses.
export const ruleKind = (list) => (isHostList(list) ? 'domains' : 'rules');

// What the next retry waits, or null when it is the daily alarm's turn.
export const retryDelay = (retries) => RETRY_MINUTES[retries] ?? null;

// The record after a new build: the update itself goes, and only the anti-rollback floor stays.
export function droppedRecord(record, build) {
  return {
    build,
    floor: [record?.floor, record?.generated].filter(Boolean).sort().at(-1) ?? null,
    checkedAt: record?.checkedAt ?? null,
    status: null,
  };
}
