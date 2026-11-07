// SPDX-License-Identifier: GPL-3.0-or-later
// Harmful and Adult sites: where their rules send a page, how the warning and blocked pages read it back,
// and the Continue once rule. Free of chrome.* calls so it can be tested.
import { CONTINUE_PRIORITY } from './blocking.js';

export const WARNING_PAGE = 'warning/warning.html';
export const BLOCKED_PAGE = 'blocked/blocked.html';

// A Continue once still held after this, by a tab left open on the site or one the worker missed
// leaving, is taken back at the worker's next start.
export const CONTINUE_STALE_MS = 60 * 60 * 1000;
export const CONTINUE_PREFIX = 'harmfulContinue:';

const LIST_ID = /^[a-z0-9-]+$/;

// What a warning rule does. The build writes the destination, so no list can choose where a page goes.
// \0 is the whole address the rule matched, and it goes last and unencoded: everything after u= is it.
export function warningRedirect(extensionId, listId) {
  if (!/^[a-p]{32}$/.test(extensionId)) throw new Error(`"${extensionId}" is not an extension ID`);
  if (!LIST_ID.test(listId)) throw new Error(`"${listId}" is not a ruleset ID`);
  return { regexSubstitution: `chrome-extension://${extensionId}/${WARNING_PAGE}?list=${listId}&u=\\0` };
}

// What an adult-sites rule does. \1 is the host alone, so no path or query from the stopped address is
// kept in the tab or its history.
export function adultRedirect(extensionId, listId) {
  if (!/^[a-p]{32}$/.test(extensionId)) throw new Error(`"${extensionId}" is not an extension ID`);
  if (!LIST_ID.test(listId)) throw new Error(`"${listId}" is not a ruleset ID`);
  return { regexSubstitution: `chrome-extension://${extensionId}/${BLOCKED_PAGE}?list=${listId}&h=\\1` };
}

// The list and the blocked host, from the blocked page's own location. Anything that isn't a plain host
// name reads as no host.
export function readBlocked(search) {
  const match = String(search).match(/^\?list=([a-z0-9-]+)&h=([a-z0-9-]+(?:\.[a-z0-9-]+)*)$/);
  if (!match) return { list: null, host: null };
  const host = webAddress(`http://${match[2]}/`)?.hostname;
  return { list: match[1], host: host === match[2] ? host : null };
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

// Lets one tab's pages on this host past the warning until the tab leaves the host. `allow`, not
// `allowAllRequests`: the ad lists still apply on the page.
export function continueRule(tabId, host) {
  return {
    id: continueRuleId(tabId),
    priority: CONTINUE_PRIORITY,
    action: { type: 'allow' },
    condition: { requestDomains: [host], resourceTypes: ['main_frame'], tabIds: [tabId] },
  };
}

// What storage.session keeps for a tab's Continue once: the host it opened, and when.
export const continueRecord = (host, now) => ({ host, since: now });

const isRecord = (record) => typeof record?.host === 'string' && Number.isFinite(record?.since);

// The tabs whose Continue once has run out, from everything in storage.session. A record in any other
// shape counts as run out.
export function staleContinues(stored, now) {
  return Object.entries(stored)
    .filter(([key, record]) => key.startsWith(CONTINUE_PREFIX) && !(isRecord(record) && now - record.since < CONTINUE_STALE_MS))
    .map(([key]) => Number(key.slice(CONTINUE_PREFIX.length)));
}

// True when a page the tab committed is still on the host Continue once opened, or under it. A reload,
// a link inside the site, a redirect or an error page for the same address all stay; anything else leaves.
export function staysOnHost(record, address) {
  const host = webAddress(address)?.hostname;
  return isRecord(record) && Boolean(host) && (host === record.host || host.endsWith(`.${record.host}`));
}
