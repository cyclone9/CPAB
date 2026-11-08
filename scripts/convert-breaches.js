// SPDX-License-Identifier: GPL-3.0-or-later
// Turns the Have I Been Pwned breach catalogue into the data-leak notice's file: for each site, the
// breaches listed against it, as [Name, Title, year]. Nothing else from a breach is kept, Description
// least of all: it is HTML from outside.
import { normalizeDomain } from '../src/shared/domains.js';

// Names are PascalCase, and seven of them hold a hyphen (7-Eleven, Pi-hole). The name ends up in a link's fragment.
const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const MAX_TITLE = 80;
// Control characters, markup and the bidi controls that could reorder the popup line around a title.
export const UNSAFE_TITLE = /[\u0000-\u001f\u007f-\u009f<>‎‏‪-‮⁦-⁩]/;
const FIRST_YEAR = 2000;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// The public suffix list isn't in the package, so this catches the shapes that would match every site
// under a country's registry (co.uk, com.au) and a few hosting suffixes where each subdomain is a stranger's site.
const SECOND_LEVEL = new Set(['ac', 'co', 'com', 'edu', 'gob', 'go', 'gov', 'mil', 'ne', 'net', 'or', 'org']);
const SHARED_HOSTS = new Set([
  'appspot.com', 'blogspot.com', 'ddns.net', 'duckdns.org', 'firebaseapp.com', 'github.io', 'herokuapp.com',
  'netlify.app', 'no-ip.org', 'pages.dev', 'vercel.app', 'web.app', 'workers.dev',
]);

// Which flags drop a breach, in the order the report prints them. Sensitive breaches stay (owner, 2026-11-07).
const DROP_FLAGS = [
  ['unverified', (breach) => breach.IsVerified !== true],
  ['fabricated', (breach) => breach.IsFabricated === true],
  ['spam list', (breach) => breach.IsSpamList === true],
  ['malware', (breach) => breach.IsMalware === true],
  ['stealer log', (breach) => breach.IsStealerLog === true],
  ['retired', (breach) => breach.IsRetired === true],
];

export function isPublicSuffixLike(host) {
  const labels = host.split('.');
  if (labels.length < 2) return true;
  if (labels.length === 2 && labels[1].length === 2 && SECOND_LEVEL.has(labels[0])) return true;
  return SHARED_HOSTS.has(host);
}

// A bare ASCII host with at least two labels, lower case and without www, or null.
export function breachHost(domain) {
  if (typeof domain !== 'string' || !/^[A-Za-z0-9.-]+$/.test(domain)) return null;
  const host = normalizeDomain(domain);
  if (!host || IPV4.test(host) || isPublicSuffixLike(host)) return null;
  return host;
}

function breachYear(date, now) {
  const year = Number(/^(\d{4})-\d{2}-\d{2}/.exec(String(date ?? ''))?.[1]);
  return year >= FIRST_YEAR && year <= now.getUTCFullYear() + 1 ? year : null;
}

function cleanTitle(title) {
  if (typeof title !== 'string') return null;
  const text = title.trim();
  return text && text.length <= MAX_TITLE && !UNSAFE_TITLE.test(text) ? text : null;
}

// One reason per dropped breach, the first that applies.
function dropReason(breach, now) {
  if (!breach || typeof breach !== 'object') return 'not a breach record';
  if (typeof breach.Domain !== 'string' || !breach.Domain.trim()) return 'no domain';
  for (const [reason, applies] of DROP_FLAGS) if (applies(breach)) return reason;
  if (typeof breach.Name !== 'string' || !NAME.test(breach.Name)) return 'name not letters, digits and hyphens';
  if (!cleanTitle(breach.Title)) return 'title not plain text up to 80 characters';
  if (breachYear(breach.BreachDate, now) === null) return 'breach year out of range';
  if (!breachHost(breach.Domain.trim())) return 'domain not a site host';
  return null;
}

export function convertBreaches(catalogue, { now = new Date() } = {}) {
  if (!Array.isArray(catalogue)) throw new Error('the breach catalogue is not a JSON array');
  const dropped = {};
  const domains = new Map();
  let kept = 0;
  for (const breach of catalogue) {
    const reason = dropReason(breach, now);
    if (reason) {
      dropped[reason] = (dropped[reason] ?? 0) + 1;
      continue;
    }
    const host = breachHost(breach.Domain.trim());
    if (!domains.has(host)) domains.set(host, []);
    domains.get(host).push([breach.Name, cleanTitle(breach.Title), breachYear(breach.BreachDate, now)]);
    kept += 1;
  }
  const sorted = [...domains.keys()].sort().map((host) => [
    host,
    domains.get(host).sort((a, b) => a[2] - b[2] || a[0].localeCompare(b[0])),
  ]);
  return { read: catalogue.length, kept, dropped, data: { domains: Object.fromEntries(sorted) } };
}

export function formatBreachReport(title, { read, kept, dropped, data }) {
  const reasons = Object.entries(dropped).map(([reason, count]) => `  dropped, ${reason}: ${count}`);
  return [`${title}: read ${read}, kept ${kept} breaches on ${Object.keys(data.domains).length} sites`, ...reasons].join('\n');
}

// The newest AddedDate, which is how a snapshot of a catalogue without versions is told apart.
export function newestAdded(catalogue) {
  return catalogue.reduce((newest, breach) => {
    const added = typeof breach?.AddedDate === 'string' ? breach.AddedDate : '';
    return added > newest ? added : newest;
  }, '') || null;
}
