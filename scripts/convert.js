// SPDX-License-Identifier: GPL-3.0-or-later
// Turns a filter list into declarativeNetRequest rules: ||domain^ rules merged into requestDomains,
// and path rules as one urlFilter each, with their @@ exceptions, domain= conditions and $document
// exceptions. Everything else is counted by reason and dropped. Our own code, no dependencies.
import { domainToASCII } from 'node:url';
import { ALLOW_RULE_ID_BASE } from '../src/shared/blocking.js';

const BLOCK_PRIORITY = 1;
const ALLOW_PRIORITY = 2;

const RESOURCE_TYPES = {
  script: 'script',
  image: 'image',
  stylesheet: 'stylesheet',
  xmlhttprequest: 'xmlhttprequest',
  subdocument: 'sub_frame',
  font: 'font',
  media: 'media',
  object: 'object',
  ping: 'ping',
  websocket: 'websocket',
  other: 'other',
};

const PARTY = {
  'third-party': 'thirdParty',
  '~first-party': 'thirdParty',
  'first-party': 'firstParty',
  '~third-party': 'firstParty',
};

const DROPPED_OPTIONS = new Set(['popup', 'document', 'all', 'to']);

// Other names some lists use for these options.
const ALIASES = {
  '3p': 'third-party',
  '1p': 'first-party',
  xhr: 'xmlhttprequest',
  css: 'stylesheet',
  frame: 'subdocument',
  doc: 'document',
  from: 'domain',
};

const COMMENT = /^(?:!|\[.*\]$)/;
const SCRIPTLET = /(?:#@?#\+js\(|#@?%#)/;
const COSMETIC = /(?:#@?#|#@?\?#|#@?\$#|\$@?\$)/;
const REGEX_RULE = /^(?:@@)?\/.+\/(?:\$.*)?$/;
const DOMAIN_RULE = /^(@@)?\|\|([^/^$*|]+)\^(?:\$(.*))?$/;
const HOST_ADDRESS = /^(?:0\.0\.0\.0|127\.0\.0\.1|::1?)$/;
const ASCII_ONLY = /^[\x00-\x7f]*$/;
const VALID_DOMAIN = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/;
// The leftmost $ that starts a well-formed option list. A $ with anything else after it isn't one.
const OPTION_LIST = /\$(~?[\w-]+(?:=[^,]*)?(?:,~?[\w-]+(?:=[^,]*)?)*)$/;

// A host file as filter rules, so it can join a list: one domain to a line, optionally after an
// address, with # comments. Applied file by file, because a bare word in an ordinary list is a
// substring rule (EasyPrivacy has -didomi.js) and not a host.
export function hostsToFilters(text) {
  return text.split(/\r?\n/).flatMap((raw) => {
    const line = raw.trim();
    if (line.startsWith('[')) return [line];
    const [content, ...comment] = line.split('#');
    const tokens = content.trim().split(/\s+/).filter(Boolean);
    if (HOST_ADDRESS.test(tokens[0]) && tokens.length > 1) tokens.shift();
    const rules = tokens.map((host) => `||${host}^`);
    return comment.length ? [`!${comment.join('#')}`, ...rules] : rules;
  }).join('\n');
}

export function isIgnorable(line) {
  return line === '' || COMMENT.test(line);
}

// Option names in one spelling: lowercase, with the short forms written out.
function optionNames(options) {
  return options.map((option) => {
    const name = option.trim().toLowerCase();
    const negated = name.startsWith('~');
    const [plain, ...value] = (negated ? name.slice(1) : name).split('=');
    return `${negated ? '~' : ''}${[ALIASES[plain] ?? plain, ...value].join('=')}`;
  });
}

// Which of the list's rule shapes a line is. A dropped line says why.
export function parseLine(line) {
  if (SCRIPTLET.test(line)) return { dropped: 'scriptlet' };
  if (COSMETIC.test(line)) return { dropped: 'cosmetic' };
  const allow = line.startsWith('@@');
  if (REGEX_RULE.test(line)) return { dropped: 'regex', allow };
  const match = line.match(DOMAIN_RULE);
  if (match) return { allow, host: match[2], options: match[3] ? match[3].split(',') : [] };
  const body = allow ? line.slice(2) : line;
  const list = body.match(OPTION_LIST);
  return { allow, pattern: list ? body.slice(0, list.index) : body, options: list ? list[1].split(',') : [] };
}

// A domain= list as initiator conditions. The lists mean the page or frame making the request, which
// is the initiator: topDomains reads the top page instead, and needs Chrome 145.
export function parseDomains(values) {
  const included = new Set();
  const excluded = new Set();
  for (const value of values) {
    const negated = value.startsWith('~');
    const entry = negated ? value.slice(1) : value;
    // google.* means every public suffix of a name, and no such list exists to expand it from.
    if (entry.includes('*')) return { dropped: 'domain= wildcard' };
    const domain = normalizeRuleDomain(entry);
    if (!domain) return { dropped: 'invalid domain in domain=' };
    // Excluding a private address is fine: that keeps a rule away from it.
    if (!negated && PRIVATE_ADDRESS.test(domain)) return { dropped: 'private address' };
    (negated ? excluded : included).add(domain);
  }
  // In a list the most specific entry wins. Chrome lets the exclusion win, so ~a.com|b.a.com would
  // never match anything.
  const domains = [...included];
  if ([...excluded].some((parent) => domains.some((domain) => domain === parent || domain.endsWith(`.${parent}`)))) {
    return { dropped: 'domain= excludes its own parent' };
  }
  return {
    condition: {
      ...(included.size ? { initiatorDomains: domains.sort() } : {}),
      ...(excluded.size ? { excludedInitiatorDomains: [...excluded].sort() } : {}),
    },
  };
}

// One rule's options as a declarativeNetRequest condition, or the reason it can't be one. Only an
// exception can carry $document: on a block rule it stays dropped.
export function parseOptions(options, allow = false) {
  const names = optionNames(options);
  if (allow && names.includes('document')) {
    if (names.some((name) => name !== 'document' && name !== 'subdocument')) return { dropped: '$document with other options' };
    return { wholePage: true, condition: { resourceTypes: ['main_frame', 'sub_frame'] } };
  }

  const included = new Set();
  const excluded = new Set();
  const parties = new Set();
  const domains = [];
  let caseSensitive = false;
  for (const name of names) {
    const option = name.split('=')[0];
    if (DROPPED_OPTIONS.has(option)) return { dropped: `$${option}` };
    if (name.startsWith('domain=')) {
      domains.push(...name.slice('domain='.length).split('|'));
      continue;
    }
    if (name === 'match-case') {
      caseSensitive = true;
      continue;
    }
    if (name in PARTY) {
      parties.add(PARTY[name]);
      continue;
    }
    const negated = name.startsWith('~');
    const type = RESOURCE_TYPES[negated ? name.slice(1) : name];
    if (!type) return { dropped: `unknown option: ${name.split('=')[0]}` };
    (negated ? excluded : included).add(type);
  }
  if (parties.size > 1) return { dropped: 'both first-party and third-party' };

  const parsedDomains = domains.length ? parseDomains(domains) : { condition: {} };
  if (parsedDomains.dropped) return parsedDomains;

  const condition = { ...parsedDomains.condition, ...(parties.size ? { domainType: [...parties][0] } : {}) };
  if (caseSensitive) condition.isUrlFilterCaseSensitive = true;
  if (included.size) {
    const types = [...included].filter((type) => !excluded.has(type));
    if (!types.length) return { dropped: 'no resource type left' };
    condition.resourceTypes = types.sort();
  } else {
    // Written out, so no rule ever depends on Chrome's default to stay off main_frame.
    condition.excludedResourceTypes = ['main_frame', ...excluded].sort();
  }
  return { condition };
}

// Private addresses aren't ad networks. The 10.x entries in hosts lists can point at a network's own
// infrastructure, including filtering pages, and this extension leaves those alone.
const PRIVATE_ADDRESS = /^(?:10|127)\.\d+\.\d+\.\d+$|^192\.168\.\d+\.\d+$|^172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+$/;

// The same addresses at the host position of a pattern, whole or cut short: ||10.10.34.*^, ://10.1.1.
const PRIVATE_PATTERN = /^\|{0,2}(?:[a-z*]*:\/\/)?(?:(?:10|127)\.[\d*]|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i;

// What's left of a pattern once the parts every address has are gone.
const ADDRESS_START = /^\|{0,2}(?:https?|wss?)?\*?:?\/{0,2}(?:www\.)?/i;
const MIN_PATTERN_CHARACTERS = 4;
const EXTENSION_ONLY = /^\W*\.[a-z]{1,5}\W*$/i;
// A host-file entry with a wildcard, and nothing after the host to narrow it down.
const WILDCARD_HOST = /^\|\|[^/^]*\*[^/^]*\^$/;

// True when every included domain is a site, which is what limits a broad pattern. A bare suffix
// (domain=ir) isn't one, and neither is a rule that only excludes. There is no public suffix list
// here, so a two-label suffix such as co.ir would pass.
export function namesSite({ initiatorDomains }) {
  return initiatorDomains?.every((domain) => domain.includes('.')) ?? false;
}

// Why a pattern can't be a urlFilter, or null. Chrome itself refuses only non-ASCII, a ||* start and
// an empty string; it takes * and ^ alone, which would block nearly everything unless onSite limits it.
export function patternProblem(pattern, onSite = false) {
  if (!ASCII_ONLY.test(pattern)) return 'non-ASCII pattern';
  if (pattern.startsWith('||*')) return 'pattern starts with ||*';
  if (/[\s$#]/.test(pattern)) return 'space, # or $ in pattern';
  if (PRIVATE_PATTERN.test(pattern)) return 'private address';
  const rest = pattern.replace(ADDRESS_START, '');
  const broad = rest.replace(/[^a-z0-9]/gi, '').length < MIN_PATTERN_CHARACTERS || EXTENSION_ONLY.test(rest);
  if (pattern === '' || (broad && !onSite)) return 'pattern too broad';
  if (WILDCARD_HOST.test(pattern)) return 'wildcard host, no path';
  return null;
}

// A $document exception lifts every list on that page, so it has to name one place: a host with a
// path, or a bare host of three labels. There is no public suffix list here, and ||co.uk^ and
// ||github.io^ both look like a site.
export function wholePageProblem(pattern) {
  const [, host, rest] = pattern.match(/^\|\|([^/^*|]+)(.*)$/) ?? [];
  if (!host) return true;
  return host.split('.').length < (/\/\w/.test(rest) ? 2 : 3);
}

// A lowercase ASCII domain, or null. One bad entry could cost Chrome a whole merged rule.
export function normalizeRuleDomain(host) {
  const lower = host.toLowerCase();
  const ascii = domainToASCII(lower);
  // The URL parser completes numeric hosts: 10.10.34. comes back as 10.10.0.34, another address.
  if (ASCII_ONLY.test(lower) && ascii !== lower) return null;
  return VALID_DOMAIN.test(ascii) ? ascii : null;
}

// Rules with the same action and options become one group holding all their domains.
export function groupByOptions(entries) {
  const groups = new Map();
  for (const { allow, wholePage, domain, condition } of entries) {
    const key = JSON.stringify([allow, condition]);
    if (!groups.has(key)) groups.set(key, { allow, wholePage, condition, domains: new Set() });
    groups.get(key).domains.add(domain);
  }
  return [...groups.values()];
}

// One group per path rule. Only the very same pattern with the very same options folds into one.
export function uniquePathRules(entries) {
  const groups = new Map();
  for (const { allow, wholePage, urlFilter, condition } of entries) {
    groups.set(JSON.stringify([allow, urlFilter, condition]), { allow, wholePage, condition: { urlFilter, ...condition } });
  }
  return [...groups.values()];
}

// Ids follow the sorted groups, so the same list always builds the same file. Allow rules start at
// their own base because getMatchedRules gives only an id, and the popup must not count them.
export function buildRules(groups) {
  const sorted = [...groups].sort((a, b) => {
    const left = JSON.stringify(a.condition);
    const right = JSON.stringify(b.condition);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  let blockId = 0;
  let allowId = ALLOW_RULE_ID_BASE;
  return sorted.map(({ allow, wholePage, condition, domains }) => ({
    id: allow ? ++allowId : ++blockId,
    priority: allow ? ALLOW_PRIORITY : BLOCK_PRIORITY,
    action: { type: wholePage ? 'allowAllRequests' : allow ? 'allow' : 'block' },
    condition: domains ? { requestDomains: [...domains].sort(), ...condition } : condition,
  }));
}

const hasBadfilter = ({ options }) => options !== undefined && optionNames(options).includes('badfilter');

// The same rule, with or without $badfilter and whatever order its options come in.
function ruleKey({ allow, host, pattern, options }) {
  const names = optionNames(options).filter((name) => name !== 'badfilter').sort();
  return JSON.stringify([allow, pattern ?? `||${host}^`, names]);
}

export function convertList(text) {
  const dropped = {};
  let droppedExceptions = 0;
  const entries = [];
  const pathEntries = [];
  const drop = (reason, allow) => {
    dropped[reason] = (dropped[reason] ?? 0) + 1;
    if (allow) droppedExceptions += 1;
  };

  const lines = text.split(/\r?\n/).map((raw) => raw.trim()).filter((line) => !isIgnorable(line)).map(parseLine);
  // A $badfilter line can come after the rule it cancels.
  const cancelled = new Set(lines.filter(hasBadfilter).map(ruleKey));

  for (const parsed of lines) {
    if (parsed.dropped) {
      drop(parsed.dropped, parsed.allow);
      continue;
    }
    const { allow, host, pattern, options } = parsed;
    if (hasBadfilter(parsed)) {
      drop('$badfilter', allow);
      continue;
    }
    if (cancelled.has(ruleKey(parsed))) {
      drop('cancelled by $badfilter', allow);
      continue;
    }
    const { condition, wholePage, dropped: reason } = parseOptions(options, allow);
    if (reason) {
      drop(reason, allow);
      continue;
    }
    if (wholePage && wholePageProblem(pattern ?? `||${host}^`)) {
      drop('$document exception too broad', allow);
      continue;
    }
    if (pattern !== undefined) {
      const problem = patternProblem(pattern, namesSite(condition));
      if (problem) drop(problem, allow);
      else pathEntries.push({ allow, wholePage, urlFilter: pattern, condition });
      continue;
    }
    const domain = normalizeRuleDomain(host);
    if (!domain) {
      drop('invalid domain', allow);
      continue;
    }
    if (PRIVATE_ADDRESS.test(domain)) {
      drop('private address', allow);
      continue;
    }
    entries.push({ allow, wholePage, domain, condition });
  }

  const paths = uniquePathRules(pathEntries);
  const rules = buildRules([...groupByOptions(entries), ...paths]);
  return {
    read: lines.length,
    converted: entries.length + pathEntries.length,
    dropped,
    droppedExceptions,
    domains: rules.reduce((total, rule) => total + (rule.condition.requestDomains?.length ?? 0), 0),
    pathRules: paths.length,
    rules,
  };
}

export function formatReport(title, result) {
  const reasons = Object.entries(result.dropped)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => `    ${String(count).padStart(7)}  ${reason}`);
  const total = Object.values(result.dropped).reduce((sum, count) => sum + count, 0);
  return [
    `${title}: read ${result.read}, converted ${result.converted}, dropped ${total} (exceptions among them: ${result.droppedExceptions}), output ${result.rules.length} rules: ${result.pathRules} path rules, the rest holding ${result.domains} domains`,
    ...reasons,
  ].join('\n');
}
