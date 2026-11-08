// SPDX-License-Identifier: GPL-3.0-or-later
// Turns a filter list's element hiding rules into CSS: generic selectors for a registered sheet, and
// site selectors keyed by domain for storage. A list only ever contributes selectors, and each one
// is checked here, because it ends up inside a stylesheet. Our own code, no dependencies.
import { createHash } from 'node:crypto';
import { parseDeclarations, selectorProblem } from '../src/shared/css-safety.js';
import { PRIVATE_ADDRESS, hasBadfilter, isIgnorable, normalizeRuleDomain, optionNames, parseLine, ruleKey, wholePageProblem } from './convert.js';

const SCRIPTLET = /^[^#]*(?:#@?#\+js\(|#@?%#)/;
const CSS_INJECTION = /^[^#]*#@?\$\??#/;
const HTML_FILTER = /^[^#]*#@?#\^|^[a-z0-9.,~*-]*\$@?\$/i;
const HIDING = /^([^#]*)#(@?)\??#(.*)$/;

const HIDE_OPTION = /\$.*\b(?:generichide|ghide|elemhide|ehide|specifichide|shide|document|doc)\b/;
const HIDE_OPTIONS = new Set(['generichide', 'elemhide', 'specifichide', 'document', 'subdocument', 'genericblock', 'badfilter']);

// A page's script can force display back with an inline !important, which no stylesheet rule of the
// same strength can beat. These are properties such a script leaves alone. The marks mean something
// only in CPAB's own list, and the declarations are fixed here: a line brings a selector, never CSS.
// Anywhere else a mark is an unsupported pseudo-class, so the rule is dropped.
export const COLLAPSE_MARK = ':cpab-collapse';
const COLLAPSE = 'min-height:0!important;max-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important';
// For a page that checks its ad boxes: the box leaves the flow and the view, but keeps its size, an
// offsetParent, a non-zero offsetLeft and its images. Overflow above the page never scrolls, in LTR or
// RTL. inert keeps keyboard focus out of the links left there; older Chrome ignores the property.
export const OFFSCREEN_MARK = ':cpab-offscreen';
const OFFSCREEN = 'position:absolute!important;top:-100000px!important;bottom:auto!important;left:auto!important;right:0!important;interactivity:inert!important';
const MARKS = new Map([[COLLAPSE_MARK, COLLAPSE], [OFFSCREEN_MARK, OFFSCREEN]]);

const STYLE = ':style(';

export { parseDeclarations, selectorProblem };

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
export function parseHidingLine(line, ownFormat = false, styles = false) {
  if (SCRIPTLET.test(line)) return { dropped: 'scriptlet' };
  if (CSS_INJECTION.test(line)) return { dropped: 'CSS injection' };
  if (HTML_FILTER.test(line)) return { dropped: 'HTML filter' };
  const match = line.match(HIDING);
  if (!match) return null;
  const [, domains, at, raw] = match;
  const allow = at === '@';
  const written = raw.trim();
  if (styles && written.endsWith(')') && written.includes(STYLE)) return parseStyleRule(domains, allow, written);
  const mark = ownFormat ? [...MARKS.keys()].find((name) => written.endsWith(name)) : undefined;
  const selector = mark ? written.slice(0, -mark.length) : written;
  const problem = selectorProblem(selector);
  if (problem) return { dropped: problem, allow };
  const parsed = parseHidingDomains(domains);
  if (parsed.dropped) return { dropped: parsed.dropped, allow };
  if (mark && (allow || !parsed.included.length)) return { dropped: `${mark.slice(':cpab-'.length)} needs a site`, allow };
  return { allow, selector, ...(mark ? { mark } : {}), ...parsed };
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


const isUnder = (domain, parent) => domain === parent || domain.endsWith(`.${parent}`);

// A style rule applies on the sites it names and nowhere else, so it never joins the generic sheet.
function parseStyleRule(domainText, allow, written) {
  const at = written.lastIndexOf(STYLE);
  const selector = written.slice(0, at).trim();
  const problem = selectorProblem(selector);
  const wholePage = problem === 'hides the whole page';
  if (problem && !wholePage) return { dropped: problem, allow };
  if (allow) return { dropped: 'style exception', allow };
  const declarations = parseDeclarations(written.slice(at + STYLE.length, -1), wholePage);
  if (declarations.dropped) return { dropped: declarations.dropped, allow };
  const parsed = parseHidingDomains(domainText);
  if (parsed.dropped) return { dropped: parsed.dropped, allow };
  if (!parsed.included.length) return { dropped: 'style needs a site', allow };
  if (parsed.excluded.some((domain) => parsed.included.some((parent) => isUnder(domain, parent)))) {
    return { dropped: 'style with a site left out', allow };
  }
  return { allow, selector, style: declarations.style, included: parsed.included, excluded: [], partly: parsed.partly };
}

// Everything hiding-related in one list, before exceptions are settled. Those can name a selector
// from another list, so they wait until every list has been read.
export function readCss(text, { ownFormat = false, styles = false } = {}) {
  const css = {
    generic: new Set(),
    site: new Map(),
    styled: new Map(),
    marked: new Map(),
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
    const rule = parseHidingLine(line, ownFormat, styles);
    if (!rule) continue;
    css.read += 1;
    if (rule.dropped) {
      drop(rule.dropped);
      continue;
    }
    css.converted += 1;
    if (rule.partly) css.partly += 1;
    if (rule.style) {
      for (const domain of rule.included) {
        if (!css.styled.has(domain)) css.styled.set(domain, new Set());
        css.styled.get(domain).add(`${rule.selector}{${rule.style}}`);
      }
      continue;
    }
    const { allow, selector, mark, included, excluded } = rule;
    if (mark) css.marked.set(selector, MARKS.get(mark));
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
export const hideCss = (selector, excepted, marked = new Map()) => {
  const rule = `${selector}{${marked.get(selector) ?? 'display:none!important'}}`;
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

function parents(domain) {
  const labels = domain.split('.');
  return labels.slice(1, -1).map((_, index) => labels.slice(index + 1).join('.'));
}

// Settles a list's exceptions and writes its output. `others` is what the other lists hide, because
// an exception here can lift a rule there, and each list's output holds only its own lines.
export function finishCss(css, others, excepted) {
  const { generic, site, marked, styled } = css;
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

  for (const map of [site, styled]) {
    for (const domain of map.keys()) {
      if ([...css.specificOff].some((off) => isUnder(domain, off))) map.delete(domain);
    }
  }

  const domains = [...new Set([...site.keys(), ...allowed.keys(), ...styled.keys()])].sort();
  const sites = {};
  for (const domain of domains) {
    const css = [...(site.get(domain) ?? [])].map((selector) => hideCss(selector, excepted, marked)).join('')
      + allowCss([...(allowed.get(domain) ?? [])])
      + [...(styled.get(domain) ?? [])].join('');
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
      styles: [...styled.values()].reduce((total, rules) => total + rules.size, 0),
      styleDomains: styled.size,
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
    `    ${stats.partly} rules kept with some domains left out, ${stats.unmatched} exceptions matched no rule in any list, ${stats.styles} style rules on ${stats.styleDomains} domains`,
    ...reasons,
  ].join('\n');
}
