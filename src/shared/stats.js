// SPDX-License-Identifier: GPL-3.0-or-later
// Statistics (PRD D16): how much was blocked each day, and with Top 5 on, on which sites. Kept in
// storage.local under its own key, so writing it never looks like a settings change. Nothing else is
// kept: no addresses, request types or rule IDs. The functions here are free of chrome.* calls so
// they can be tested, apart from the three at the end.

export const STATS_KEY = 'stats';
export const STATS_DAYS = 14;
export const STATS_SITES_PER_DAY = 100;
export const TOP_SITES = 5;

const pad = (value) => String(value).padStart(2, '0');

// The local calendar day, so a day ends at the person's midnight, not UTC's.
export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The day `days` before the given one. Date counts calendar days, so a DST change can't skip one.
export function dayBefore(date, days) {
  return dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - days));
}

const isCount = (value) => Number.isSafeInteger(value) && value > 0;

// Stored data may come from an older version or be damaged, so it is read field by field.
export function normalizeStats(stored) {
  const days = {};
  for (const [key, day] of Object.entries(stored?.days ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day || typeof day !== 'object') continue;
    const sites = Object.entries(day.sites && typeof day.sites === 'object' ? day.sites : {}).filter(([, count]) => isCount(count));
    days[key] = { blocked: isCount(day.blocked) ? day.blocked : 0, ...(sites.length ? { sites: Object.fromEntries(sites) } : {}) };
  }
  return { days };
}

// Adds counts in the same shape as stored days: { 'YYYY-MM-DD': { blocked, sites? } }.
export function mergeStats(stats, pending) {
  const days = structuredClone(normalizeStats(stats).days);
  for (const [key, add] of Object.entries(pending)) {
    const day = days[key] ?? { blocked: 0 };
    day.blocked += add.blocked;
    for (const [site, count] of Object.entries(add.sites ?? {})) {
      day.sites ??= {};
      day.sites[site] = (day.sites[site] ?? 0) + count;
    }
    days[key] = day;
  }
  return { days };
}

const largest = (sites, limit) => Object.entries(sites)
  .sort(([siteA, a], [siteB, b]) => b - a || (siteA < siteB ? -1 : 1))
  .slice(0, limit);

// Keeps the 14 newest days that are still inside the last 14 days, and the 100 largest sites of each,
// or no sites at all while Top 5 is off.
export function pruneStats(stats, today, keepSites) {
  const oldest = dayBefore(today, STATS_DAYS - 1);
  const keys = Object.keys(stats.days).filter((key) => key >= oldest).sort().reverse().slice(0, STATS_DAYS);
  const days = {};
  for (const key of keys.sort()) {
    const { blocked, sites } = stats.days[key];
    days[key] = keepSites && sites ? { blocked, sites: Object.fromEntries(largest(sites, STATS_SITES_PER_DAY)) } : { blocked };
  }
  return { days };
}

const blockedOn = (stats, key) => stats.days[key]?.blocked ?? 0;
const sumDays = (stats, today, from, count) => Array.from({ length: count }, (_, index) => blockedOn(stats, dayBefore(today, from + index)))
  .reduce((total, blocked) => total + blocked, 0);

// "This week" is the last 7 days with today, and "last week" the 7 days before those, not calendar
// weeks: weeks start on different days in Iran and elsewhere, and 14 stored days cover exactly these.
export function statsTotals(stats, today) {
  return {
    today: blockedOn(stats, dayKey(today)),
    yesterday: blockedOn(stats, dayBefore(today, 1)),
    thisWeek: sumDays(stats, today, 0, 7),
    lastWeek: sumDays(stats, today, 7, 7),
  };
}

// The sites with the most blocked over every stored day, largest first, as [site, count].
export function topSites(stats, limit = TOP_SITES) {
  const total = {};
  for (const { sites } of Object.values(stats.days)) {
    for (const [site, count] of Object.entries(sites ?? {})) total[site] = (total[site] ?? 0) + count;
  }
  return largest(total, limit);
}

export async function loadStats() {
  const stored = await chrome.storage.local.get(STATS_KEY);
  return normalizeStats(stored[STATS_KEY]);
}

export function onStatsChange(listener) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STATS_KEY]) listener(normalizeStats(changes[STATS_KEY].newValue));
  });
}
