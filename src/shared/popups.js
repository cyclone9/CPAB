// SPDX-License-Identifier: GPL-3.0-or-later
// Decides whether a new tab is an ad, from the $popup data the build writes. Kept free of chrome.* calls
// so it can be tested. Chrome has no declarativeNetRequest form for popups, so filters are matched here,
// with the meaning Chrome gives urlFilter.
import { wantedRulesets } from './blocking.js';

export const POPUP_INDEX = 'rules/popup-index.json';

const NO_TOKEN = '';
// Enough for any rule to match. A data: address can run to megabytes.
const LONGEST_URL = 16384;
const NOT_SEPARATOR = /[a-z0-9_.%-]/i;

export const isBlank = (url) => !url || url.startsWith('about:');

export const isWebPage = (url) => /^https?:/i.test(url ?? '');

const isUnder = (host, domain) => host === domain || host.endsWith(`.${domain}`);

// Where a segment of a filter ends when placed at `at`, or -1. ^ also matches the end of the address.
function endOfSegment(segment, url, at) {
  let position = at;
  for (const character of segment) {
    if (character === '^') {
      if (position === url.length) continue;
      if (NOT_SEPARATOR.test(url[position])) return -1;
      position += 1;
    } else {
      if (url[position] !== character) return -1;
      position += 1;
    }
  }
  return position;
}

function firstEnd(segment, url, from) {
  for (let at = from; at <= url.length; at += 1) {
    const end = endOfSegment(segment, url, at);
    if (end >= 0) return end;
  }
  return -1;
}

function restMatches(segments, url, from, toEnd) {
  let position = from;
  const last = segments.length - 1;
  for (const [index, segment] of segments.entries()) {
    if (index === last && toEnd) {
      for (let at = position; at <= url.length; at += 1) {
        if (endOfSegment(segment, url, at) === url.length) return true;
      }
      return false;
    }
    position = firstEnd(segment, url, position);
    if (position < 0) return false;
  }
  return !toEnd || position === url.length;
}

// `hostStarts` holds where the host and each of its parent domains begin in the address.
export function matchesFilter(filter, url, hostStarts) {
  const atDomain = filter.startsWith('||');
  const atStart = !atDomain && filter.startsWith('|');
  const toEnd = filter.length > 1 && filter.endsWith('|');
  const body = filter.slice(atDomain ? 2 : atStart ? 1 : 0, toEnd ? -1 : undefined);
  const [first, ...others] = body.split('*');
  const allStarts = () => Array.from({ length: url.length + 1 }, (_, index) => index);
  const starts = atDomain ? hostStarts : atStart ? [0] : allStarts();
  return starts.some((start) => {
    const end = endOfSegment(first, url, start);
    return end >= 0 && restMatches(others, url, end, toEnd);
  });
}

function addressOf(fullUrl) {
  const url = fullUrl.slice(0, LONGEST_URL);
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  const lower = url.toLowerCase();
  const hostAt = host ? lower.indexOf(host, lower.indexOf('://') + 3) : -1;
  const hostStarts = [];
  if (hostAt >= 0) {
    hostStarts.push(hostAt);
    for (let dot = host.indexOf('.'); dot >= 0; dot = host.indexOf('.', dot + 1)) hostStarts.push(hostAt + dot + 1);
  }
  return { url, lower, host, hostStarts, tokens: [...new Set(lower.match(/[a-z0-9]+/g))] };
}

// There is no public suffix list here. Comparing the last two labels never calls one site two sites:
// at worst two sites under co.uk count as one, and a third-party rule then leaves their tab open.
const siteOf = (host) => host.split('.').slice(-2).join('.');

function ruleApplies(rule, target, page) {
  if (rule.on && !rule.on.some((domain) => isUnder(page.host, domain))) return false;
  if (rule.off?.some((domain) => isUnder(page.host, domain))) return false;
  if (rule.party && (siteOf(target.host) !== siteOf(page.host)) !== (rule.party === 'thirdParty')) return false;
  return matchesFilter(rule.url, rule.case ? target.url : target.lower, target.hostStarts);
}

function anyRule(buckets, target, page) {
  return [NO_TOKEN, ...target.tokens].some((token) => Object.hasOwn(buckets, token)
    && buckets[token].some((rule) => ruleApplies(rule, target, page)));
}

// Every list's exceptions count against every list's rules, as allow rules do across rulesets.
export function isPopupAd(lists, targetUrl, pageUrl) {
  const target = addressOf(targetUrl);
  const page = addressOf(pageUrl);
  if (!target || !page) return false;
  return lists.some(({ block }) => anyRule(block, target, page))
    && !lists.some(({ allow, pages }) => anyRule(allow, target, page) || anyRule(pages, page, page));
}

export function isPaused(settings, pageUrl) {
  const page = addressOf(pageUrl);
  return !page || settings.pausedSites.some((site) => isUnder(page.host, site));
}

// A tab sent to an allowed address stays open: what is never blocked isn't closed either.
export function isAllowedTarget(allowed, targetUrl) {
  const target = addressOf(targetUrl);
  return Boolean(target?.host) && allowed.some((domain) => isUnder(target.host, domain));
}

// The lists to check, as ids: the same master, group and list switches as the rulesets, under the Popups
// switch, which closes ad tabs for every list's $popup rules.
export function popupLists(settings, index) {
  return settings.groups.popups ? wantedRulesets(settings, index.lists.map(({ id }) => id)) : [];
}
