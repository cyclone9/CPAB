// SPDX-License-Identifier: GPL-3.0-or-later
// Search and paging for the site lists in settings. A list can hold hundreds of sites, so only the
// first rows that match are drawn.

export const PAGE_SIZE = 50;

// The sites matching a search, any part of the name and any case, up to `limit` of them.
export function searchSites(domains, query, limit = PAGE_SIZE) {
  const needle = query.trim().toLowerCase();
  const matches = needle ? domains.filter((domain) => domain.toLowerCase().includes(needle)) : domains;
  const shown = matches.slice(0, Math.max(0, limit));
  return {
    shown,
    matched: matches.length,
    total: domains.length,
    more: Math.min(PAGE_SIZE, matches.length - shown.length),
  };
}
