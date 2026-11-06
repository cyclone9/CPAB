// SPDX-License-Identifier: GPL-3.0-or-later
// Turns a filter list's element hiding rules into CSS: generic selectors for a registered sheet, and
// site selectors keyed by domain for storage. A list only ever contributes selectors, and each one
// is checked here, because it ends up inside a stylesheet. Our own code, no dependencies.
import { createHash } from 'node:crypto';
import { PRIVATE_ADDRESS, hasBadfilter, isIgnorable, normalizeRuleDomain, optionNames, parseLine, ruleKey, wholePageProblem } from './convert.js';

const SCRIPTLET = /^[^#]*(?:#@?#\+js\(|#@?%#)/;
const CSS_INJECTION = /^[^#]*#@?\$\??#/;
const HTML_FILTER = /^[^#]*#@?#\^|^[a-z0-9.,~*-]*\$@?\$/i;
const HIDING = /^([^#]*)#(@?)\??#(.*)$/;

const HIDE_OPTION = /\$.*\b(?:generichide|ghide|elemhide|ehide|specifichide|shide|document|doc)\b/;
const HIDE_OPTIONS = new Set(['generichide', 'elemhide', 'specifichide', 'document', 'subdocument', 'genericblock', 'badfilter']);

// Text that could end a rule, open another, or bring in something from outside. Refused wherever it
// sits, even inside a quoted attribute value: no selector worth keeping needs it.
const FORBIDDEN = [
  [/[{}]/, 'refused: brace'],
  [/@/, 'refused: @'],
  [/url\(/i, 'refused: url('],
  [/expression\(/i, 'refused: expression('],
  [/\/\*|\*\//, 'refused: comment'],
  [/<!--|-->/, 'refused: comment'],
  // eslint-disable-next-line no-control-regex
  [/[\x00-\x1f\x7f]/, 'refused: control character'],
];

// What Chrome takes as plain CSS. Anything else after a colon voids the rule, so it never ships.
const PSEUDO_CLASSES = new Set([
  'active', 'any-link', 'checked', 'default', 'defined', 'disabled', 'empty', 'enabled', 'first-child', 'first-of-type',
  'focus', 'focus-visible', 'focus-within', 'has', 'hover', 'in-range', 'indeterminate', 'invalid', 'is', 'lang',
  'last-child', 'last-of-type', 'link', 'not', 'nth-child', 'nth-last-child', 'nth-last-of-type', 'nth-of-type',
  'only-child', 'only-of-type', 'optional', 'out-of-range', 'placeholder-shown', 'read-only', 'read-write', 'required',
  'root', 'target', 'valid', 'visited', 'where',
]);
const PSEUDO_ELEMENTS = new Set(['after', 'before', 'first-letter', 'first-line', 'marker', 'placeholder', 'selection']);

// Run by an ad blocker's own engine, so they mean nothing to Chrome's CSS parser.
const PROCEDURAL = new Set([
  'contains', 'has-text', 'if', 'if-not', 'matches-attr', 'matches-css', 'matches-css-after', 'matches-css-before',
  'matches-media', 'matches-path', 'matches-prop', 'min-text-length', 'nth-ancestor', 'others', 'remove', 'remove-attr',
  'remove-class', 'style', 'upward', 'watch-attr', 'watch-attrs', 'xpath',
]);

// Hiding one of these blanks the whole page.
const WHOLE_PAGE = /^(?:\*|html|body|:root)$/i;

const ALLOWED_OUTSIDE_ATTRIBUTES = /[\w\s.#*>+~,:()|\u0080-￿-]/;

// The next character past an escape, a string or a bracket pair, or the reason there isn't one.
function skipString(selector, start) {
  const quote = selector[start];
  for (let at = start + 1; at < selector.length; at += 1) {
    if (selector[at] === '\\') at += 1;
    else if (selector[at] === quote) return at;
  }
  return -1;
}

function pseudoProblem(selector, at) {
  const [, colons, rawName] = selector.slice(at).match(/^(::?)(-?[a-zA-Z][\w-]*)/) ?? [];
  if (!rawName) return 'invalid selector';
  const name = rawName.toLowerCase();
  if (PROCEDURAL.has(name) || name.startsWith('-abp-')) return `procedural :${name}`;
  if (colons === '::' ? PSEUDO_ELEMENTS.has(name) : PSEUDO_CLASSES.has(name) || PSEUDO_ELEMENTS.has(name)) return null;
  return `unsupported :${name}`;
}

// Walks a selector once, skipping what can't hold structure. An unclosed quote, bracket or trailing
// backslash would swallow the rules after it, not only this one.
function structureProblem(selector) {
  const closers = [];
  const hasDepths = [];
  for (let at = 0; at < selector.length; at += 1) {
    const character = selector[at];
    const inAttribute = closers.at(-1) === ']';
    if (character === '\\') {
      at += 1;
      if (at >= selector.length) return 'unbalanced selector';
    } else if (character === '"' || character === "'") {
      at = skipString(selector, at);
      if (at < 0) return 'unbalanced selector';
    } else if (character === '[' || character === '(') {
      closers.push(character === '[' ? ']' : ')');
    } else if (character === ']' || character === ')') {
      if (closers.pop() !== character) return 'unbalanced selector';
      if (hasDepths.at(-1) > closers.length) hasDepths.pop();
    } else if (inAttribute) {
      continue;
    } else if (character === ':') {
      const problem = pseudoProblem(selector, at);
      if (problem) return problem;
      if (/^:has\(/i.test(selector.slice(at, at + 5))) {
        if (hasDepths.length) return 'nested :has()';
        hasDepths.push(closers.length + 1);
      }
      if (selector[at + 1] === ':') at += 1;
    } else if (!ALLOWED_OUTSIDE_ATTRIBUTES.test(character)) {
      return 'invalid character';
    }
  }
  return closers.length ? 'unbalanced selector' : null;
}

// Why a selector can't go into a stylesheet, or null.
export function selectorProblem(selector) {
  if (!selector) return 'invalid selector';
  for (const [pattern, reason] of FORBIDDEN) {
    if (pattern.test(selector)) return reason;
  }
  const problem = structureProblem(selector);
  if (problem) return problem;
  if (/^[>+~,]|[>+~,]$/.test(selector)) return 'invalid selector';
  // The commas that matter are the top-level ones: :not(html,body) narrows a rule.
  const top = selector.replace(/\([^()]*\)/g, '');
  if (top.split(',').some((part) => WHOLE_PAGE.test(part.trim()))) return 'hides the whole page';
  return null;
}

// A rule's domain part. The usable entries stay and the rest are noted, so a rule naming google.*
// alongside two real sites still works on those two.
export function parseHidingDomains(text) {
  const included = [];
  const excluded = [];
  let listed = 0;
  let reason = null;
  for (const entry of text.split(',').filter(Boolean)) {
    const negated = entry.startsWith('~');
    const name = negated ? entry.slice(1) : entry;
    if (!negated) listed += 1;
    const domain = name.includes('*') || name.startsWith('/') ? null : normalizeRuleDomain(name);
    let problem = null;
    if (name.includes('*')) problem = 'wildcard domain';
    else if (name.startsWith('/')) problem = 'regex domain';
    else if (!domain) problem = 'invalid domain';
    else if (!domain.includes('.')) problem = 'single-label domain';
    else if (!negated && PRIVATE_ADDRESS.test(domain)) problem = 'private address';
    if (!problem) (negated ? excluded : included).push(domain);
    else if (!negated) reason = problem;
  }
  if (listed && !included.length) return { dropped: reason };
  return { included, excluded, partly: listed > included.length };
}

// One line of a list, if it is an element hiding rule: null if it isn't, and a dropped reason if it
// is one that can't ship.
export function parseHidingLine(line) {
  if (SCRIPTLET.test(line)) return { dropped: 'scriptlet' };
  if (CSS_INJECTION.test(line)) return { dropped: 'CSS injection' };
  if (HTML_FILTER.test(line)) return { dropped: 'HTML filter' };
  const match = line.match(HIDING);
  if (!match) return null;
  const [, domains, at, raw] = match;
  const allow = at === '@';
  const selector = raw.trim();
  const problem = selectorProblem(selector);
  if (problem) return { dropped: problem, allow };
  const parsed = parseHidingDomains(domains);
  return parsed.dropped ? { dropped: parsed.dropped, allow } : { allow, selector, ...parsed };
}

// An exception that switches hiding off on a site, as { generic, specific, domains }, or a dropped
// reason, or null if the line is no such rule.
export function parseHideOption(parsed) {
  if (!parsed.allow || !parsed.options) return null;
  const names = optionNames(parsed.options);
  const whole = names.includes('document');
  const generic = whole || names.includes('elemhide') || names.includes('generichide');
  const specific = whole || names.includes('elemhide') || names.includes('specifichide');
  if (!generic && !specific) return null;

  const domainOption = names.find((name) => name.startsWith('domain='));
  const plain = names.filter((name) => !name.startsWith('domain='));
  if (plain.some((name) => !HIDE_OPTIONS.has(name))) return { dropped: 'hide exception with conditions' };

  let entries;
  if (domainOption && !parsed.host && !parsed.pattern) {
    entries = domainOption.slice('domain='.length).split('|');
  } else if (parsed.host && !domainOption) {
    if (whole && wholePageProblem(`||${parsed.host}^`)) return { dropped: 'hide exception too broad' };
    entries = [parsed.host];
  } else {
    return { dropped: 'hide exception with a path' };
  }
  const domains = entries.map((entry) => (entry.startsWith('~') ? null : normalizeRuleDomain(entry)));
  if (domains.includes(null)) return { dropped: 'invalid domain in hide exception' };
  return { generic, specific, domains };
}

// Everything hiding-related in one list, before exceptions are settled. Those can name a selector
// from another list, so they wait until every list has been read.
export function readCss(text) {
  const css = {
    generic: new Set(),
    site: new Map(),
    exceptions: [],
    excludedFrom: [],
    genericOff: new Set(),
    specificOff: new Set(),
    read: 0,
    converted: 0,
    dropped: {},
    partly: 0,
  };
  const drop = (reason) => {
    css.dropped[reason] = (css.dropped[reason] ?? 0) + 1;
  };

  const lines = text.split(/\r?\n/).map((raw) => raw.trim()).filter((line) => !isIgnorable(line));
  const hideOptions = lines.filter((line) => HIDE_OPTION.test(line) && line.startsWith('@@')).map(parseLine);
  const cancelled = new Set(hideOptions.filter(hasBadfilter).map(ruleKey));

  for (const parsed of hideOptions) {
    if (parsed.dropped || hasBadfilter(parsed)) continue;
    const option = parseHideOption(parsed);
    if (!option) continue;
    css.read += 1;
    if (cancelled.has(ruleKey(parsed))) drop('cancelled by $badfilter');
    else if (option.dropped) drop(option.dropped);
    else {
      css.converted += 1;
      for (const domain of option.domains) {
        if (option.generic) css.genericOff.add(domain);
        if (option.specific) css.specificOff.add(domain);
      }
    }
  }

  for (const line of lines) {
    const rule = parseHidingLine(line);
    if (!rule) continue;
    css.read += 1;
    if (rule.dropped) {
      drop(rule.dropped);
      continue;
    }
    css.converted += 1;
    if (rule.partly) css.partly += 1;
    const { allow, selector, included, excluded } = rule;
    if (allow) {
      css.exceptions.push({ selector, included });
      continue;
    }
    if (!included.length) css.generic.add(selector);
    for (const domain of included) {
      if (!css.site.has(domain)) css.site.set(domain, new Set());
      css.site.get(domain).add(selector);
    }
    if (excluded.length) css.excludedFrom.push({ selector, included, excluded });
  }
  return css;
}

const allowName = (selector) => `--cpab-allow-${createHash('sha256').update(selector).digest('hex').slice(0, 12)}`;

// A rule with an exception somewhere waits on a custom property, and the exception's site sets it, so
// the rule simply doesn't apply there. display:revert would lift it too, but it drops the page's own
// value as well: a flex box turns into a block, and a box the page hides itself appears. revert-layer
// does the same under !important in Chrome 156. Every element inherits the property from the root.
export const hideCss = (selector, excepted) => {
  const rule = `${selector}{display:none!important}`;
  return excepted.has(selector) ? `@container not style(${allowName(selector)}:1){${rule}}` : rule;
};

export const allowCss = (selectors) => (selectors.length ? `:root{${selectors.map((selector) => `${allowName(selector)}:1`).join(';')}}` : '');

// Every selector that some list lifts somewhere. Rules need this whichever list they are in.
export function exceptedSelectors(lists) {
  return new Set(lists.flatMap((css) => [
    ...css.exceptions.filter(({ included }) => included.length).map(({ selector }) => selector),
    ...css.excludedFrom.map(({ selector }) => selector),
  ]));
}

const isUnder = (domain, parent) => domain === parent || domain.endsWith(`.${parent}`);

function parents(domain) {
  const labels = domain.split('.');
  return labels.slice(1, -1).map((_, index) => labels.slice(index + 1).join('.'));
}

// Settles a list's exceptions and writes its output. `others` is what the other lists hide, because
// an exception here can lift a rule there, and each list's output holds only its own lines.
export function finishCss(css, others, excepted) {
  const { generic, site } = css;
  const allowed = new Map();
  const allowOn = (domain, selector) => {
    if (!allowed.has(domain)) allowed.set(domain, new Set());
    allowed.get(domain).add(selector);
  };
  const stats = { unmatched: 0 };

  for (const { selector, included, excluded } of css.excludedFrom) {
    for (const domain of excluded) {
      if (!included.length || included.some((parent) => isUnder(domain, parent))) allowOn(domain, selector);
    }
  }

  for (const { selector, included } of css.exceptions) {
    let lifted = false;
    if (!included.length) {
      lifted = generic.delete(selector);
      for (const selectors of site.values()) lifted = selectors.delete(selector) || lifted;
    }
    for (const domain of included) {
      lifted = Boolean(site.get(domain)?.delete(selector)) || lifted;
      const elsewhere = generic.has(selector) || others.has(selector) || parents(domain).some((parent) => site.get(parent)?.has(selector));
      if (elsewhere) {
        allowOn(domain, selector);
        lifted = true;
      }
    }
    if (!lifted) stats.unmatched += 1;
  }

  for (const domain of site.keys()) {
    if ([...css.specificOff].some((off) => isUnder(domain, off))) site.delete(domain);
  }

  const domains = [...new Set([...site.keys(), ...allowed.keys()])].sort();
  const sites = {};
  for (const domain of domains) {
    const css = [...(site.get(domain) ?? [])].map((selector) => hideCss(selector, excepted)).join('') + allowCss([...(allowed.get(domain) ?? [])]);
    if (css) sites[domain] = css;
  }

  return {
    genericCss: [...generic].map((selector) => hideCss(selector, excepted)).join('\n'),
    sites,
    genericOff: [...css.genericOff].sort(),
    stats: {
      read: css.read,
      converted: css.converted,
      dropped: css.dropped,
      partly: css.partly,
      unmatched: stats.unmatched,
      generic: generic.size,
      siteDomains: Object.keys(sites).length,
      siteSelectors: [...site.values()].reduce((total, selectors) => total + selectors.size, 0),
      allows: [...allowed.values()].reduce((total, selectors) => total + selectors.size, 0),
      genericOff: css.genericOff.size,
    },
  };
}

export function formatCssReport(title, { stats }) {
  const reasons = Object.entries(stats.dropped)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => `    ${String(count).padStart(7)}  ${reason}`);
  const total = Object.values(stats.dropped).reduce((sum, count) => sum + count, 0);
  return [
    `${title} CSS: read ${stats.read}, converted ${stats.converted}, dropped ${total}, output ${stats.generic} generic selectors, ${stats.siteSelectors} site selectors on ${stats.siteDomains} domains, ${stats.allows} stored exceptions, generic hiding off on ${stats.genericOff} domains`,
    `    ${stats.partly} rules kept with some domains left out, ${stats.unmatched} exceptions matched no rule in any list`,
    ...reasons,
  ].join('\n');
}
