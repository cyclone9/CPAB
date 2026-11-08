// SPDX-License-Identifier: GPL-3.0-or-later
// Report this site (PRD F18, F34): the text a report carries and the GitHub issue address that carries it.
// The preview and the address are built from one set of fields, so what the person reads is exactly what
// leaves. Free of chrome.* calls so it can be tested.
import { GROUP_RULESETS } from './settings.js';
import { findSiteEntry, siteFromUrl } from './domains.js';
import { harmfulRunning, wantedRulesets } from './blocking.js';

export const REPORT_REPO = 'https://github.com/cyclone9/CPAB-Lists';

// The choices the popup offers. 'warning' is the Harmful sites warning page's own kind.
export const REPORT_KINDS = Object.freeze(['broken', 'missed']);

const KINDS = Object.freeze({
  broken: { template: 'broken-site.yml', title: 'Broken site' },
  missed: { template: 'suggest-site.yml', title: 'Suggest a site' },
  warning: { template: 'broken-site.yml', title: 'Wrong warning' },
});

// Adult sites is never named, on or off (privacy rule), so only these groups are listed.
const REPORTED_GROUPS = Object.freeze(['ads', 'trackers', 'popups', 'widgets']);

// "Chrome <major>", from the user-agent brands, else the user-agent string, else plain "Chrome".
// Nothing else from the user agent (no OS, no full version) goes in.
export function browserLabel(nav) {
  const brands = Array.isArray(nav?.userAgentData?.brands) ? nav.userAgentData.brands : [];
  const brand = brands.find(({ brand: name }) => name === 'Google Chrome') ?? brands.find(({ brand: name }) => name === 'Chromium');
  const major = brand?.version ?? String(nav?.userAgent ?? '').match(/Chrome\/(\d+)/)?.[1];
  return /^\d{1,4}$/.test(String(major ?? '')) ? `Chrome ${major}` : 'Chrome';
}

const titleOf = (lists, ruleset) => lists.find((entry) => entry.ruleset === ruleset && entry.available !== false)?.title ?? null;
const onOff = (value) => (value ? 'on' : 'off');

// One line per list that runs here, in settings order, with the switches a report needs to be read.
function listLines({ site, settings, lists }) {
  const lines = [];
  if (!settings.master) lines.push('CPAB is off');
  else if (findSiteEntry(site, settings.pausedSites)) lines.push('CPAB is paused on this site');
  // The person's choice of lists, also while the master switch is off.
  const chosen = wantedRulesets({ ...settings, master: true }, REPORTED_GROUPS.flatMap((group) => GROUP_RULESETS[group]));
  for (const ruleset of chosen) {
    const title = titleOf(lists, ruleset);
    if (title) lines.push(title);
  }
  lines.push(`Harmful sites: ${onOff(harmfulRunning(settings))}`);
  lines.push(`Exceptions for Iranian sites: ${onOff(settings.recommendedExceptions)}`);
  return lines;
}

// kind: 'broken' or 'missed' from the popup, 'warning' from the warning page with `warnedBy` the ruleset
// that warned. `site` may be a host or a whole address; only the host, without www, is kept.
export function buildReport({ kind, site, version, browser, settings, lists = [], warnedBy = null }) {
  const form = KINDS[kind];
  if (!form) throw new Error(`"${kind}" is not a report kind`);
  const host = siteFromUrl(/^[a-z][a-z0-9+.-]*:\/\//i.test(String(site)) ? site : `http://${site}/`);
  if (!host) throw new Error('a report needs a site');
  if (!/^\d+(\.\d+){0,3}$/.test(String(version))) throw new Error(`"${version}" is not a version`);

  const fields = {
    site: host,
    cpab: `CPAB ${version}, ${browser}`,
    lists: (kind === 'warning'
      ? [`Harmful-site warning from: ${(GROUP_RULESETS.harmful.includes(warnedBy) && titleOf(lists, warnedBy)) || 'an unnamed list'}`]
      : listLines({ site: host, settings, lists })).join('\n'),
  };
  const title = `${form.title}: ${host}`;
  const text = [`Title: ${title}`, `Site: ${fields.site}`, `CPAB: ${fields.cpab}`, 'Lists:', fields.lists].join('\n');

  const url = new URL(`${REPORT_REPO}/issues/new`);
  url.searchParams.set('template', form.template);
  url.searchParams.set('title', title);
  for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, value);
  return { fields, title, text, url: url.href };
}
