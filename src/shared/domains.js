// SPDX-License-Identifier: GPL-3.0-or-later
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// Chrome keeps extensions out of these even though they are ordinary https pages.
function isWebStore(url) {
  return url.hostname === 'chromewebstore.google.com'
    || (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'));
}

function withoutWww(host) {
  const rest = host.replace(/^www\./, '');
  return rest.includes('.') ? rest : host;
}

function isValidHost(host) {
  if (host.length > 253) return false;
  if (host === 'localhost' || IPV4.test(host)) return true;
  const labels = host.split('.');
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return false;
  return /^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/.test(labels.at(-1));
}

// The site a tab belongs to, or null where an extension can't run.
export function siteFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.hostname.startsWith('[') || isWebStore(parsed)) return null;
  return withoutWww(parsed.hostname);
}

// What a person typed or pasted, as a bare ASCII host, or null if it isn't one.
export function normalizeDomain(input) {
  const text = String(input ?? '').trim().toLowerCase();
  if (!text) return null;
  let parsed;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(text) ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname.replace(/\.$/, '');
  // The URL parser turns "1234" into 0.0.4.210, which nobody meant.
  if (IPV4.test(host) && !text.includes(host)) return null;
  return isValidHost(host) ? withoutWww(host) : null;
}

// The list entry that covers a host: the host itself or one of its parent domains.
export function findSiteEntry(host, sites) {
  return sites.find((entry) => host === entry || host.endsWith(`.${entry}`)) ?? null;
}

// The list entry that touches a domain either way: the same site, a parent, or a subdomain of it.
export function findOverlap(domain, sites) {
  return findSiteEntry(domain, sites) ?? sites.find((entry) => entry.endsWith(`.${domain}`)) ?? null;
}

export function addSite(sites, domain) {
  if (sites.includes(domain)) return { status: 'duplicate', sites };
  const parent = findSiteEntry(domain, sites);
  if (parent) return { status: 'covered', parent, sites };
  const kept = sites.filter((entry) => !entry.endsWith(`.${domain}`));
  return { status: 'added', sites: [...kept, domain].sort() };
}
