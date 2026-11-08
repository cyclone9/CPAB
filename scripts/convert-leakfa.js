// SPDX-License-Identifier: GPL-3.0-or-later
// Turns Leakfa's catalogue of breached Iranian sites into its data-leak file: for each site, its English
// and Persian names. The descriptions, related links and company-response ratings stay out.
import { UNSAFE_TITLE, breachHost } from './convert-breaches.js';

const MAX_NAME = 80;

// Scrapes or dumps of users of a worldwide service, not breaches of an Iranian site. Facebook and Instagram
// are in HIBP's catalogue already, and a line on every telegram.org or x.com page, for everyone, would say
// far more than Leakfa documents.
export const GLOBAL_PLATFORMS = new Set(['telegram.org', 'facebook.com', 'instagram.com', 'x.com']);

export function cleanName(name) {
  if (typeof name !== 'string') return null;
  const text = name.trim();
  return text && text.length <= MAX_NAME && !UNSAFE_TITLE.test(text) ? text : null;
}

// One reason per dropped entry, the first that applies.
function dropReason(domain, entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'not a record';
  const host = breachHost(domain);
  if (!host) return 'domain not a site host';
  if (!cleanName(entry.name_en) || !cleanName(entry.name_fa)) return 'name missing or not plain text';
  if (GLOBAL_PLATFORMS.has(host)) return 'global platform';
  return null;
}

export function convertLeakfa(catalogue) {
  const source = catalogue?.domains;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('the Leakfa catalogue has no domains object');
  const dropped = {};
  const domains = new Map();
  const entries = Object.entries(source);
  for (const [domain, entry] of entries) {
    const reason = dropReason(domain, entry);
    if (reason) {
      dropped[reason] = (dropped[reason] ?? 0) + 1;
      continue;
    }
    domains.set(breachHost(domain), [cleanName(entry.name_en), cleanName(entry.name_fa)]);
  }
  const sorted = [...domains.keys()].sort().map((host) => [host, domains.get(host)]);
  return { read: entries.length, kept: domains.size, dropped, data: { domains: Object.fromEntries(sorted) } };
}

export function formatLeakfaReport(title, { read, kept, dropped }) {
  const reasons = Object.entries(dropped).map(([reason, count]) => `  dropped, ${reason}: ${count}`);
  return [`${title}: read ${read}, kept ${kept}`, ...reasons].join('\n');
}
