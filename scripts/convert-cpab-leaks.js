// SPDX-License-Identifier: GPL-3.0-or-later
// Reads CPAB's own data-leak list, lists/cpab-leaks.txt, written by hand. One entry per line:
//   domain | English name | Persian name | YYYY-MM | https source
// The source is a public page about the incident, never the leaked data. Lines starting with ! are comments.
import { breachHost } from './convert-breaches.js';
import { cleanName } from './convert-leakfa.js';

const FIRST_YEAR = 2000;
const MAX_SOURCE = 300;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

// An https address on a named host, with nothing that could hide where it goes.
export function sourceUrl(text) {
  if (typeof text !== 'string' || text.length > MAX_SOURCE || /[\s\u0000-\u001f\u007f-\u009f<>"]/.test(text)) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !breachHost(url.hostname)) return null;
  return url.href;
}

// A month no earlier than 2000 and no later than the month the build runs in.
function validMonth(text, now) {
  const match = MONTH.exec(text);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const latest = now.getUTCFullYear() * 12 + now.getUTCMonth();
  return year >= FIRST_YEAR && year * 12 + month - 1 <= latest;
}

// One reason per dropped line, the first that applies.
function dropReason(fields, now, seen) {
  if (fields.length !== 5) return 'not five fields';
  const [domain, nameEn, nameFa, month, source] = fields;
  const host = breachHost(domain);
  if (!host) return 'domain not a site host';
  if (!cleanName(nameEn) || !cleanName(nameFa)) return 'name missing or not plain text';
  if (!validMonth(month, now)) return 'month not YYYY-MM up to now';
  if (!sourceUrl(source)) return 'source not an https address';
  if (seen.has(host)) return 'site listed twice';
  return null;
}

export function convertCpabLeaks(text, { now = new Date() } = {}) {
  const dropped = {};
  const domains = new Map();
  let read = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('!')) continue;
    read += 1;
    const fields = line.split('|').map((field) => field.trim());
    const reason = dropReason(fields, now, domains);
    if (reason) {
      dropped[reason] = (dropped[reason] ?? 0) + 1;
      continue;
    }
    const [domain, nameEn, nameFa, month, source] = fields;
    domains.set(breachHost(domain), [cleanName(nameEn), cleanName(nameFa), month, sourceUrl(source)]);
  }
  const sorted = [...domains.keys()].sort().map((host) => [host, domains.get(host)]);
  return { read, kept: domains.size, dropped, data: { domains: Object.fromEntries(sorted) } };
}
