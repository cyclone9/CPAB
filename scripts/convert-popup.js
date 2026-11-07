// SPDX-License-Identifier: GPL-3.0-or-later
// Turns a filter list's $popup rules into data for the matcher in src/shared/popups.js. Each rule sits
// in a bucket named after one word it needs in the address, so a check reads only a few rules. Our own
// code, no dependencies.
import {
  PRIVATE_ADDRESS, POPUP_OPTIONS, RESOURCE_TYPES, hasBadfilter, isIgnorable, namesSite, normalizeRuleDomain, optionNames,
  parseLine, parseOptions, patternProblem, ruleKey, wholePageProblem,
} from './convert.js';

const POPUP_REGEX = /^(?:@@)?\/.+\/\$(?:.*,)?popup(?:,|$)/;
// A new tab starts blank, so a rule naming about: would close honest tabs.
const BLANK_TARGET = /^\|*about:/i;
const NO_TOKEN = '';

const isPopupRule = (parsed) => !parsed.dropped && optionNames(parsed.options ?? []).includes('popup');

const isPageException = ({ allow, options = [] }) => {
  const names = optionNames(options);
  return Boolean(allow) && names.includes('document') && names.every((name) => name === 'document' || name === 'subdocument');
};

function parsedLines(text) {
  return text.split(/\r?\n/).map((raw) => raw.trim()).filter((line) => !isIgnorable(line))
    .map((line) => ({ line, parsed: parseLine(line) }));
}

// The $badfilter lines a list holds for popup rules. AdGuard Base uses them against EasyList.
export function popupBadfilters(text) {
  return parsedLines(text).map(({ parsed }) => parsed).filter((parsed) => isPopupRule(parsed) && hasBadfilter(parsed)).map(ruleKey);
}

// The words of a filter that are whole in any address it matches. A word touching * or an open end
// could be part of a longer one, so it can't name a bucket.
export function filterTokens(filter) {
  const anchored = filter.startsWith('|');
  const closed = filter.endsWith('|');
  const body = filter.replace(/^\|\|?/, '').replace(/\|$/, '').toLowerCase();
  const tokens = [];
  for (const { 0: word, index } of body.matchAll(/[a-z0-9]+/g)) {
    const before = body[index - 1];
    const after = body[index + word.length];
    const startsWhole = before === undefined ? anchored : before !== '*';
    const endsWhole = after === undefined ? closed : after !== '*';
    if (startsWhole && endsWhole) tokens.push(word);
  }
  return tokens;
}

function popupRule(filter, condition) {
  const { initiatorDomains, excludedInitiatorDomains, domainType, isUrlFilterCaseSensitive } = condition;
  return {
    url: isUrlFilterCaseSensitive ? filter : filter.toLowerCase(),
    ...(initiatorDomains ? { on: initiatorDomains } : {}),
    ...(excludedInitiatorDomains ? { off: excludedInitiatorDomains } : {}),
    ...(domainType ? { party: domainType } : {}),
    ...(isUrlFilterCaseSensitive ? { case: true } : {}),
  };
}

// The filter for a line, or why there can't be one.
function filterOf({ host, pattern }, condition) {
  if (pattern === undefined) {
    const domain = normalizeRuleDomain(host);
    if (!domain) return { dropped: 'invalid domain' };
    return PRIVATE_ADDRESS.test(domain) ? { dropped: 'private address' } : { filter: `||${domain}^` };
  }
  if (BLANK_TARGET.test(pattern)) return { dropped: 'names a blank page' };
  const site = namesSite(condition);
  // An empty pattern tied to a site is every popup there. Nothing else can be that wide.
  if (pattern === '' && site) return { filter: pattern };
  const problem = patternProblem(pattern, site);
  return problem ? { dropped: problem } : { filter: pattern };
}

// Each rule goes under the word fewest other rules need, so that no bucket grows large.
function bucketed(rules) {
  const seen = new Map(rules.map((rule) => [JSON.stringify(rule), rule]));
  const unique = [...seen.values()];
  const counts = new Map();
  const tokens = new Map(unique.map((rule) => [rule, filterTokens(rule.url)]));
  for (const words of tokens.values()) {
    for (const word of new Set(words)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const buckets = {};
  for (const rule of unique) {
    const best = [...tokens.get(rule)].sort((a, b) => counts.get(a) - counts.get(b) || b.length - a.length)[0] ?? NO_TOKEN;
    (buckets[best] ??= []).push(rule);
  }
  return { buckets, rules: unique.length, unindexed: buckets[NO_TOKEN]?.length ?? 0 };
}

// `cancelledAnywhere` holds every list's popup $badfilter lines. EasyList's file drops a rule AdGuard
// Base cancels even with that list off, which only ever keeps a tab open.
export function convertPopups(text, cancelledAnywhere = new Set()) {
  const dropped = {};
  const block = [];
  const allow = [];
  const pages = [];
  let read = 0;
  const drop = (reason) => {
    dropped[reason] = (dropped[reason] ?? 0) + 1;
  };

  const lines = parsedLines(text);
  const parsedRules = lines.map(({ parsed }) => parsed);
  const cancelled = new Set(parsedRules.filter(hasBadfilter).map(ruleKey));

  for (const { line, parsed } of lines) {
    if (POPUP_REGEX.test(line)) {
      read += 1;
      drop('regex');
      continue;
    }
    const page = !parsed.dropped && isPageException(parsed);
    if (!page && !isPopupRule(parsed)) continue;
    read += 1;
    if (hasBadfilter(parsed)) {
      drop('$badfilter');
    } else if (cancelled.has(ruleKey(parsed))) {
      drop('cancelled by $badfilter');
    } else if (cancelledAnywhere.has(ruleKey(parsed))) {
      drop("cancelled by another list's $badfilter");
    } else if (page) {
      const filter = parsed.pattern ?? `||${parsed.host}^`;
      if (wholePageProblem(filter)) drop('$document exception too broad');
      else pages.push({ url: filter.toLowerCase() });
    } else {
      const names = optionNames(parsed.options);
      if (parsed.allow && names.includes('document')) {
        drop('$document with other options');
        continue;
      }
      const conditions = parsed.options.filter((_, index) => !POPUP_OPTIONS.has(names[index]) && !(names[index] in RESOURCE_TYPES) && names[index] !== 'document');
      const { condition, dropped: reason } = parseOptions(conditions);
      if (reason) {
        drop(reason);
        continue;
      }
      const { filter, dropped: problem } = filterOf(parsed, condition);
      if (problem !== undefined) drop(problem);
      else (parsed.allow ? allow : block).push(popupRule(filter, condition));
    }
  }

  const sections = { block: bucketed(block), allow: bucketed(allow), pages: bucketed(pages) };
  return {
    data: { block: sections.block.buckets, allow: sections.allow.buckets, pages: sections.pages.buckets },
    stats: {
      read,
      block: sections.block.rules,
      allow: sections.allow.rules,
      pages: sections.pages.rules,
      unindexed: sections.block.unindexed + sections.allow.unindexed + sections.pages.unindexed,
      dropped,
    },
  };
}

export const hasPopupRules = ({ stats }) => stats.block + stats.allow + stats.pages > 0;

export function formatPopupReport(title, { stats }) {
  const reasons = Object.entries(stats.dropped)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => `    ${String(count).padStart(7)}  ${reason}`);
  const total = Object.values(stats.dropped).reduce((sum, count) => sum + count, 0);
  return [
    `${title} popups: read ${stats.read}, dropped ${total}, output ${stats.block} rules, ${stats.allow} exceptions and ${stats.pages} page exceptions, ${stats.unindexed} of them read on every check`,
    ...reasons,
  ].join('\n');
}
