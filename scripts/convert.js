// SPDX-License-Identifier: GPL-3.0-or-later
// Turns a filter list into declarativeNetRequest rules. Only ||domain^ rules and their @@ exceptions
// are converted; everything else is counted by reason and dropped. Our own code, no dependencies.
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

const DROPPED_OPTIONS = new Set(['popup', 'document', 'all']);

// Short names some lists use for the options above.
const ALIASES = {
  '3p': 'third-party',
  '1p': 'first-party',
  xhr: 'xmlhttprequest',
  css: 'stylesheet',
  frame: 'subdocument',
  doc: 'document',
};

const COMMENT = /^(?:!|\[.*\]$)/;
const SCRIPTLET = /(?:#@?#\+js\(|#@?%#)/;
const COSMETIC = /(?:#@?#|#@?\?#|#@?\$#|\$@?\$)/;
const REGEX_RULE = /^(?:@@)?\/.+\/(?:\$.*)?$/;
const DOMAIN_RULE = /^(@@)?\|\|([^/^$*|]+)\^(?:\$(.*))?$/;
const HOST_ADDRESS = /^(?:0\.0\.0\.0|127\.0\.0\.1|::1?)$/;
const ASCII_ONLY = /^[\x00-\x7f]*$/;
const VALID_DOMAIN = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/;

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

// Which of the list's rule shapes a line is. A dropped line says why.
export function parseLine(line) {
  if (SCRIPTLET.test(line)) return { dropped: 'scriptlet' };
  if (COSMETIC.test(line)) return { dropped: 'cosmetic' };
  const allow = line.startsWith('@@');
  if (REGEX_RULE.test(line)) return { dropped: 'regex', allow };
  const match = line.match(DOMAIN_RULE);
  if (!match) return { dropped: 'not a ||domain^ rule', allow };
  return { allow, host: match[2], options: match[3] ? match[3].split(',') : [] };
}

// One rule's options as a declarativeNetRequest condition, or the reason it can't be one.
export function parseOptions(options) {
  const names = options.map((option) => {
    const name = option.trim().toLowerCase();
    const negated = name.startsWith('~');
    const plain = negated ? name.slice(1) : name;
    return `${negated ? '~' : ''}${ALIASES[plain] ?? plain}`;
  });
  if (names.some((name) => name === 'domain' || name.startsWith('domain='))) return { dropped: 'domain=' };

  const included = new Set();
  const excluded = new Set();
  const parties = new Set();
  for (const name of names) {
    if (DROPPED_OPTIONS.has(name)) return { dropped: `$${name}` };
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

  const condition = parties.size ? { domainType: [...parties][0] } : {};
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
  for (const { allow, domain, condition } of entries) {
    const key = JSON.stringify([allow, condition]);
    if (!groups.has(key)) groups.set(key, { allow, condition, domains: new Set() });
    groups.get(key).domains.add(domain);
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
  return sorted.map(({ allow, condition, domains }) => ({
    id: allow ? ++allowId : ++blockId,
    priority: allow ? ALLOW_PRIORITY : BLOCK_PRIORITY,
    action: { type: allow ? 'allow' : 'block' },
    condition: { requestDomains: [...domains].sort(), ...condition },
  }));
}

export function convertList(text) {
  const dropped = {};
  let read = 0;
  let droppedExceptions = 0;
  const entries = [];
  const drop = (reason, allow) => {
    dropped[reason] = (dropped[reason] ?? 0) + 1;
    if (allow) droppedExceptions += 1;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (isIgnorable(line)) continue;
    read += 1;
    const parsed = parseLine(line);
    if (parsed.dropped) {
      drop(parsed.dropped, parsed.allow);
      continue;
    }
    const { allow, host, options } = parsed;
    const { condition, dropped: reason } = parseOptions(options);
    if (reason) {
      drop(reason, allow);
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
    entries.push({ allow, domain, condition });
  }

  const rules = buildRules(groupByOptions(entries));
  return {
    read,
    converted: entries.length,
    dropped,
    droppedExceptions,
    domains: rules.reduce((total, rule) => total + rule.condition.requestDomains.length, 0),
    rules,
  };
}

export function formatReport(title, result) {
  const reasons = Object.entries(result.dropped)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => `    ${String(count).padStart(7)}  ${reason}`);
  const total = Object.values(result.dropped).reduce((sum, count) => sum + count, 0);
  return [
    `${title}: read ${result.read}, converted ${result.converted}, dropped ${total} (exceptions among them: ${result.droppedExceptions}), output ${result.rules.length} rules holding ${result.domains} domains`,
    ...reasons,
  ].join('\n');
}
