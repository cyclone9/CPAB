// SPDX-License-Identifier: GPL-3.0-or-later
// The data-leak notice (PRD F31): whether the open site is on Have I Been Pwned's breach list. The check
// runs against a file in the package, so no address leaves the device.
import { format, formatYears } from '../i18n/i18n.js';

export const DATALEAK_FILE = 'rules/hibp-breaches.json';
export const BREACH_SOURCE = 'Have I Been Pwned';
const BREACH_PAGE = 'https://haveibeenpwned.com/PwnedWebsites';

// The breaches listed against a host and its parent domains, the host's own first. An entry for a
// subdomain covers that subdomain and what sits under it, never its parent site.
export function findBreaches(host, domains) {
  if (!host || !domains) return [];
  const labels = host.split('.');
  const found = [];
  for (let start = 0; start < labels.length - 1; start += 1) {
    const domain = labels.slice(start).join('.');
    if (!Object.hasOwn(domains, domain)) continue;
    for (const [name, title, year] of domains[domain]) found.push({ domain, name, title, year });
  }
  return found;
}

// Titles of a site's second breach often carry its date, as in "LinkedIn Scraped Data (2021)" or
// "Bell (2017 breach)". The line shows the years on their own, so the date comes off the name.
export function siteLabel(title) {
  return title.replace(/\s*\((?:[A-Za-z]+ )?\d{4}(?: [A-Za-z]+)?\)$/, '') || title;
}

// One name, every year, and the first breach to link to; null when nothing is listed.
export function breachNotice(breaches) {
  if (!breaches.length) return null;
  const [first] = breaches;
  return {
    label: siteLabel(first.title),
    years: [...new Set(breaches.map(({ year }) => year))].sort((a, b) => a - b),
    link: `${BREACH_PAGE}#${encodeURIComponent(first.name)}`,
  };
}

// The toolbar tooltip: the action's own title, then the notice. The name is isolated so a Latin title
// keeps its order inside Persian text, where the tooltip has no markup to do it.
export function noticeTitle(language, defaultTitle, notice) {
  const line = format(language, 'dataLeakLine', { breach: `⁨${notice.label}⁩`, years: formatYears(language, notice.years) });
  return `${defaultTitle}\n${line}`;
}
