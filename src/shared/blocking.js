// SPDX-License-Identifier: GPL-3.0-or-later
// What the service worker asks of Chrome, kept free of chrome.* calls so it can be tested.
import { GROUP_RULESETS } from './settings.js';

// chrome.action can't read CSS variables, so these repeat Ink and Citron from tokens.css.
// test/blocking.test.js fails if the two ever differ.
export const BADGE_COLORS = Object.freeze({ text: '#1A1A11', background: '#D4DE3A' });

export const PAUSED_RULE_ID = 1;
const PAUSED_PRIORITY = 3;

// Above the pause rule, so pausing a page can't let a person's own blocked site through it.
export const BLOCKED_RULE_ID = 2;
const BLOCKED_PRIORITY = 4;

// Allowed addresses and the recommended exceptions sit with the lists' own exceptions: above every list
// block and below the pause rule and a person's blocked sites. Harmful and Adult sites must go above
// the pause rule, so these can never lift them either.
export const ALLOWED_RULE_ID = 3;
export const EXCEPTIONS_RULE_ID = 4;
const ALLOWED_PRIORITY = 2;

// The recommended exceptions, as { domains } built from lists/cpab-exceptions.txt.
export const EXCEPTIONS_FILE = 'rules/cpab-exceptions.json';

const ALL_RESOURCE_TYPES = Object.freeze([
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest',
  'ping', 'csp_report', 'media', 'websocket', 'webtransport', 'webbundle', 'other',
]);

const DYNAMIC_RULESET = '_dynamic';

// Block rule ids stay below this and allow rule ids above it, in every static ruleset.
export const ALLOW_RULE_ID_BASE = 1000000;

// Enabled rulesets are worth nothing to a person when the master switch is off, however the groups stand.
// A ruleset runs only with its group and its own list both on.
export function wantedRulesets(settings, declared) {
  if (!settings.master) return [];
  const on = Object.entries(GROUP_RULESETS).flatMap(([group, rulesets]) => (settings.groups[group] ? rulesets : []));
  return declared.filter((id) => on.includes(id) && settings.lists[id]);
}

export function pausedRules(pausedSites) {
  if (!pausedSites.length) return [];
  return [{
    id: PAUSED_RULE_ID,
    priority: PAUSED_PRIORITY,
    action: { type: 'allowAllRequests' },
    condition: { requestDomains: [...pausedSites], resourceTypes: ['main_frame', 'sub_frame'] },
  }];
}

// The person's own list follows the master switch and nothing else.
export function blockedRules(settings) {
  if (!settings.master || !settings.blockedSites.length) return [];
  return [{
    id: BLOCKED_RULE_ID,
    priority: BLOCKED_PRIORITY,
    action: { type: 'block' },
    condition: { requestDomains: [...settings.blockedSites], resourceTypes: [...ALL_RESOURCE_TYPES] },
  }];
}

// The addresses never blocked: the person's own, then the recommended exceptions while their switch is on.
export function allowedDomains(settings, exceptions) {
  return [...settings.allowedSites, ...(settings.recommendedExceptions ? exceptions : [])];
}

// Both follow the master switch, since with it off nothing is blocked for them to lift.
export function allowedRules(settings, exceptions) {
  if (!settings.master) return [];
  const rule = (id, domains) => ({
    id,
    priority: ALLOWED_PRIORITY,
    action: { type: 'allow' },
    condition: { requestDomains: [...domains], resourceTypes: [...ALL_RESOURCE_TYPES] },
  });
  const rules = [];
  if (settings.allowedSites.length) rules.push(rule(ALLOWED_RULE_ID, settings.allowedSites));
  if (settings.recommendedExceptions && exceptions.length) rules.push(rule(EXCEPTIONS_RULE_ID, exceptions));
  return rules;
}

// The popup's split of the count, in display order. A group joins by adding one entry: it lists every
// ruleset it owns, because each list keeps its own ruleset and one switch can cover several lists.
export const BLOCK_GROUPS = Object.freeze([
  Object.freeze({ label: 'groupAds', rulesets: GROUP_RULESETS.ads }),
  Object.freeze({ label: 'groupTrackers', rulesets: GROUP_RULESETS.trackers }),
  Object.freeze({ label: 'groupYourSites', rulesets: Object.freeze([DYNAMIC_RULESET]) }),
]);

// getMatchedRules also reports allow rules and the pause rule, which block nothing.
const isBlock = ({ rule }) => (rule.rulesetId === DYNAMIC_RULESET ? rule.ruleId === BLOCKED_RULE_ID : rule.ruleId <= ALLOW_RULE_ID_BASE);
const blockMatches = (matches) => matches.filter(isBlock);

export function countBlocked(matches) {
  return blockMatches(matches).length;
}

// One { label, count } per group that blocked something. Groups with nothing are left out.
export function splitBlocked(matches, groups = BLOCK_GROUPS) {
  const blocked = blockMatches(matches);
  return groups
    .map(({ label, rulesets }) => ({ label, count: blocked.filter(({ rule }) => rulesets.includes(rule.rulesetId)).length }))
    .filter(({ count }) => count > 0);
}
