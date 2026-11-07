// SPDX-License-Identifier: GPL-3.0-or-later
// Harmful sites: where a warning rule sends a page, how the warning page reads it back, and the Continue
// once rule. Free of chrome.* calls so it can be tested.
import { CONTINUE_PRIORITY } from './blocking.js';

export const WARNING_PAGE = 'warning/warning.html';

// A Continue once the tab never used is taken back after this.
export const CONTINUE_MS = 30000;
export const CONTINUE_PREFIX = 'harmfulContinue:';

const LIST_ID = /^[a-z0-9-]+$/;

// What a warning rule does. The build writes the destination, so no list can choose where a page goes.
// \0 is the whole address the rule matched, and it goes last and unencoded: everything after u= is it.
export function warningRedirect(extensionId, listId) {
  if (!/^[a-p]{32}$/.test(extensionId)) throw new Error(`"${extensionId}" is not an extension ID`);
  if (!LIST_ID.test(listId)) throw new Error(`"${listId}" is not a ruleset ID`);
  return { regexSubstitution: `chrome-extension://${extensionId}/${WARNING_PAGE}?list=${listId}&u=\\0` };
}

// An http or https URL, or null.
export function webAddress(text) {
  try {
    const url = new URL(text);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname ? url : null;
  } catch {
    return null;
  }
}

// The list and the stopped address, from the warning page's own location. Chrome keeps the stopped
// page's #fragment on the warning page, so it is put back.
export function readWarning(search, hash = '') {
  const match = String(search).match(/^\?list=([a-z0-9-]+)&u=(.+)$/);
  if (!match) return { list: null, url: null };
  return { list: match[1], url: webAddress(`${match[2]}${hash}`) };
}

// One pending Continue once per tab, so the tab's ID gives the rule's.
export const continueRuleId = (tabId) => tabId + 1;

// Lets one tab's next page on this host past the warning. `allow`, not `allowAllRequests`: the ad lists
// still apply on the page.
export function continueRule(tabId, host) {
  return {
    id: continueRuleId(tabId),
    priority: CONTINUE_PRIORITY,
    action: { type: 'allow' },
    condition: { requestDomains: [host], resourceTypes: ['main_frame'], tabIds: [tabId] },
  };
}

// The tabs whose Continue once has run out, from everything in storage.session.
export function staleContinues(stored, now) {
  return Object.entries(stored)
    .filter(([key, since]) => key.startsWith(CONTINUE_PREFIX) && !(now - since < CONTINUE_MS))
    .map(([key]) => Number(key.slice(CONTINUE_PREFIX.length)));
}
