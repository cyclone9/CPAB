// SPDX-License-Identifier: GPL-3.0-or-later
// Harmful and Adult sites: where their rules send a page, how the warning and blocked pages read it back,
// and the Continue once rule. Free of chrome.* calls so it can be tested.
import { ADULT_PRIORITY, CONTINUE_PRIORITY, HARMFUL_PRIORITY, HOST_OF_ADDRESS } from './blocking.js';

export const WARNING_PAGE = 'warning/warning.html';
export const BLOCKED_PAGE = 'blocked/blocked.html';

// A Continue once still held after this, by a tab left open on the site or one the worker missed
// leaving, is taken back at the worker's next start.
export const CONTINUE_STALE_MS = 60 * 60 * 1000;
export const CONTINUE_PREFIX = 'harmfulContinue:';

const LIST_ID = /^[a-z0-9-]+$/;

// The blocked page's list for the person's own Blocked sites. No ruleset has this ID.
export const OWN_BLOCKED_LIST = 'own';

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

export const WARN_RULE_ID = 1;
export const BLOCK_RULE_ID = 2;

// Matches every web address. requestDomains does the choosing; the regex is only there so the
// redirect can hand the whole address to the warning page.
export const ANY_WEB_ADDRESS = '^https?://.*';

// A harmful-sites or adult-sites list as rules, from its plain domains: one rule that sends whole hosts
// to the warning or blocked page before they open, and, for harmful sites, one that blocks what other
// pages load from listed hosts. scripts/convert-harmful.js builds the shipped rules with it, and the
// extension builds an updated list's rules with it, so where a page goes is always this code's choice.
export function hostRules({ listId, extensionId, adult = false, warn, block, excluded }) {
  const exceptions = new Set(excluded);
  // Chrome lets excludedRequestDomains win over requestDomains, subdomains included, as an exception does.
  const condition = (domains, rest) => ({
    requestDomains: [...domains].filter((domain) => !exceptions.has(domain)).sort(),
    ...(exceptions.size ? { excludedRequestDomains: [...exceptions].sort() } : {}),
    ...rest,
  });
  const rules = [];
  const warnCondition = condition(warn, { regexFilter: adult ? HOST_OF_ADDRESS : ANY_WEB_ADDRESS, resourceTypes: ['main_frame'] });
  if (warnCondition.requestDomains.length) {
    rules.push({
      id: WARN_RULE_ID,
      priority: adult ? ADULT_PRIORITY : HARMFUL_PRIORITY,
      action: { type: 'redirect', redirect: adult ? adultRedirect(extensionId, listId) : warningRedirect(extensionId, listId) },
      condition: warnCondition,
    });
  }
  // Adult sites stop whole pages only: a block on what other pages load would show in their counts
  // and let a page find out the switch is on.
  const blockCondition = condition(adult ? [] : block, { excludedResourceTypes: ['main_frame'] });
  if (blockCondition.requestDomains.length) {
    rules.push({ id: BLOCK_RULE_ID, priority: HARMFUL_PRIORITY, action: { type: 'block' }, condition: blockCondition });
  }
  return rules;
}

// Where a person's own blocked site goes: the same page and the same host-only address as Adult sites.
export function ownBlockedRedirect(extensionId) {
  return adultRedirect(extensionId, OWN_BLOCKED_LIST);
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
