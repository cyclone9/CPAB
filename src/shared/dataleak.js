// SPDX-License-Identifier: GPL-3.0-or-later
// The data-leak notice (PRD F31): whether the open site is on Have I Been Pwned's breach list or Leakfa's
// list of breached Iranian sites or CPAB's own leak list. The check runs against files in the package, so no
// address leaves the device. Each source keeps a line of its own, in that order, with its own attribution.
import { format, formatMonth, formatYears } from '../i18n/i18n.js';

export const DATALEAK_FILE = 'rules/hibp-breaches.json';
export const BREACH_SOURCE = 'Have I Been Pwned';
const BREACH_PAGE = 'https://haveibeenpwned.com/PwnedWebsites';
export const LEAKFA_FILE = 'rules/leakfa-breaches.json';
export const LEAKFA_PAGE = 'https://github.com/Leakfarsi/Leakfa-Alert/tree/domains';
export const CPAB_LEAKS_FILE = 'rules/cpab-leaks.json';

// The host and its parent domains that have an entry, the host's own first.
function listedDomains(host, domains) {
  if (!host || !domains) return [];
  const labels = host.split('.');
  const found = [];
  for (let start = 0; start < labels.length - 1; start += 1) {
    const domain = labels.slice(start).join('.');
    if (Object.hasOwn(domains, domain)) found.push(domain);
  }
  return found;
}

// The breaches listed against a host and its parent domains, the host's own first. An entry for a
// subdomain covers that subdomain and what sits under it, never its parent site.
export function findBreaches(host, domains) {
  return listedDomains(host, domains).flatMap((domain) => domains[domain].map(([name, title, year]) => ({ domain, name, title, year })));
}

// Leakfa's entry for the host, or its nearest listed parent, with the name in the interface's language;
// null when nothing is listed. Leakfa gives no dates, so the line has no years.
export function leakfaNotice(language, host, domains) {
  const [domain] = listedDomains(host, domains);
  if (!domain) return null;
  const [nameEn, nameFa] = domains[domain];
  return { label: language === 'fa' ? nameFa : nameEn, link: LEAKFA_PAGE };
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

// CPAB's own entry for the host or its nearest listed parent: the name in the interface's language, the
// month as words, and the entry's own source page. The build let only https sources through.
export function cpabLeakNotice(language, host, domains) {
  const [domain] = listedDomains(host, domains);
  if (!domain) return null;
  const [nameEn, nameFa, month, source] = domains[domain];
  return { label: language === 'fa' ? nameFa : nameEn, date: formatMonth(language, month), link: source };
}

// The toolbar tooltip: the action's own title, then a line for each source that lists the site. Names are
// isolated so a Latin title keeps its order inside Persian text, where the tooltip has no markup to do it.
export function noticeTitle(language, defaultTitle, notice, leakfa = null, own = null) {
  const lines = [defaultTitle];
  if (notice) lines.push(format(language, 'dataLeakLine', { breach: `⁨${notice.label}⁩`, years: formatYears(language, notice.years) }));
  if (leakfa) lines.push(format(language, 'leakfaLine', { breach: `⁨${leakfa.label}⁩` }));
  if (own) lines.push(format(language, 'cpabLeakLine', { breach: `⁨${own.label}⁩`, date: own.date }));
  return lines.join('\n');
}
