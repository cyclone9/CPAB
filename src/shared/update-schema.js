// SPDX-License-Identifier: GPL-3.0-or-later
// Checks list data published on cpab.cyclone9.dev before anything uses it, and the build's own output
// before it ships. Data may only block, allow and hide: no redirect, no header change, no regex, nothing
// that runs. Pure functions with no chrome.* or node: calls, so the extension and the scripts share them.
import { parseDeclarations, selectorProblem } from './css-safety.js';
import { isRuleDomain } from './domains.js';

export const SCHEMA = 1;

const MIB = 1024 * 1024;
export const LIMITS = Object.freeze({
  // Dynamic rules allow 30,000; the rest is kept for the person's own rules, which merge into a few
  // rules each (owner, 2026-11-08: 28,000, after 25,000 left under 500 to spare).
  rules: 28000,
  domainsPerRule: 300000,
  // Site CSS is copied into storage.local, which holds 10 MiB.
  siteCssBytes: 9 * MIB,
  fileBytes: 8 * MIB,
  versionBytes: 64 * 1024,
  urlFilterLength: 2048,
});

// What each kind of file holds, and the name it is served under next to version.json.
export const KINDS = Object.freeze(['rules', 'sites', 'generic', 'popup', 'domains', 'genericOff', 'licence']);
const FILE_PATH = /^lists\/[A-Za-z0-9][A-Za-z0-9.-]*\.(?:json|css|txt)$/;
const LIST_ID = /^[a-z0-9][a-z0-9-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SOURCE = /^(?:[0-9a-f]{40}|local)$/;
const GENERATED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const VERSION = /^\d+\.\d+\.\d+$/;

// Rule ids as scripts/convert.js numbers them: block rules from 1, allow rules from 1,000,001. The
// extension moves each list into an id range of its own (shared/blocking.js), which these bounds keep apart.
export const RULE_IDS = Object.freeze({ blockMax: 49999, allowMin: 1000001, allowMax: 1049999 });

// The rule shapes scripts/convert.js writes, and nothing else. Block and allow rules stay off main_frame,
// so served data can never stop a page from opening, and their priorities stay below the Harmful sites
// and Adult sites rules, so no served exception can lift those.
const ACTIONS = new Map([['block', 1], ['allow', 2], ['allowAllRequests', 2]]);
const RULE_KEYS = new Set(['id', 'priority', 'action', 'condition']);
const CONDITION_KEYS = new Set([
  'urlFilter', 'requestDomains', 'initiatorDomains', 'excludedInitiatorDomains', 'domainType',
  'isUrlFilterCaseSensitive', 'resourceTypes', 'excludedResourceTypes',
]);
const DOMAIN_KEYS = ['requestDomains', 'initiatorDomains', 'excludedInitiatorDomains'];
const RESOURCE_TYPES = new Set([
  'main_frame', 'sub_frame', 'script', 'image', 'stylesheet', 'xmlhttprequest', 'font', 'media', 'object',
  'ping', 'websocket', 'other',
]);
const DOMAIN_TYPES = new Set(['firstParty', 'thirdParty']);
// ASCII without spaces or control characters, as the converter's urlFilter check allows.
const URL_FILTER = /^[\x21-\x7e]+$/;

const POPUP_SECTIONS = ['allow', 'block', 'pages'];
const POPUP_KEYS = new Set(['url', 'on', 'off', 'party', 'case']);

const ALLOW_NAME = '--cpab-allow-[0-9a-f]{12}';
const CONTAINER = new RegExp(`@container not style\\(${ALLOW_NAME}:1\\)\\{([^{}@]+)\\{([^{}]*)\\}\\}`, 'y');
const ROOT = new RegExp(`:root\\{${ALLOW_NAME}:1(?:;${ALLOW_NAME}:1)*\\}`, 'y');
const RULE = /([^{}@]+)\{([^{}]*)\}/y;
const HIDE = 'display:none!important';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const byteLength = (text) => new TextEncoder().encode(text).length;

function parseJson(text, problems) {
  try {
    return JSON.parse(text);
  } catch {
    problems.push('not valid JSON');
    return undefined;
  }
}

function checkDomains(domains, where, problems, { site = false } = {}) {
  if (!Array.isArray(domains) || !domains.length) {
    problems.push(`${where}: not a list of domains`);
    return;
  }
  if (domains.length > LIMITS.domainsPerRule) problems.push(`${where}: ${domains.length} domains, over ${LIMITS.domainsPerRule}`);
  const bad = domains.find((domain) => !isRuleDomain(domain) || (site && !domain.includes('.')));
  if (bad !== undefined) problems.push(`${where}: invalid domain ${JSON.stringify(bad)}`);
}

function checkResourceTypes(condition, type, where, problems) {
  const { resourceTypes, excludedResourceTypes } = condition;
  for (const [key, types] of [['resourceTypes', resourceTypes], ['excludedResourceTypes', excludedResourceTypes]]) {
    if (types === undefined) continue;
    if (!Array.isArray(types) || !types.length || types.some((value) => !RESOURCE_TYPES.has(value))) {
      problems.push(`${where}: invalid ${key}`);
      return;
    }
  }
  if (type === 'allowAllRequests') {
    if (!resourceTypes || resourceTypes.some((value) => value !== 'main_frame' && value !== 'sub_frame')) {
      problems.push(`${where}: allowAllRequests must name main_frame or sub_frame only`);
    }
  } else if (resourceTypes ? resourceTypes.includes('main_frame') : !excludedResourceTypes?.includes('main_frame')) {
    problems.push(`${where}: a ${type} rule must stay off main_frame`);
  }
}

function checkRule(rule, index, ids, problems) {
  const where = `rule ${index}`;
  if (!isObject(rule)) {
    problems.push(`${where}: not an object`);
    return;
  }
  const extra = Object.keys(rule).find((key) => !RULE_KEYS.has(key));
  if (extra) problems.push(`${where}: key ${extra} is not allowed`);
  if (!Number.isInteger(rule.id) || rule.id < 1) problems.push(`${where}: invalid id`);
  else if (ids.has(rule.id)) problems.push(`${where}: id ${rule.id} used twice`);
  else ids.add(rule.id);

  const type = rule.action?.type;
  if (!isObject(rule.action) || Object.keys(rule.action).length !== 1 || !ACTIONS.has(type)) {
    problems.push(`${where}: action ${JSON.stringify(type ?? rule.action)} is not allowed`);
    return;
  }
  if (Number.isInteger(rule.id) && (type === 'block'
    ? rule.id > RULE_IDS.blockMax
    : rule.id < RULE_IDS.allowMin || rule.id > RULE_IDS.allowMax)) {
    problems.push(`${where}: id ${rule.id} is outside the ${type === 'block' ? 'block' : 'allow'} range`);
  }
  if (rule.priority !== ACTIONS.get(type)) problems.push(`${where}: priority ${rule.priority} is not allowed for ${type}`);

  const { condition } = rule;
  if (!isObject(condition)) {
    problems.push(`${where}: no condition`);
    return;
  }
  if ('regexFilter' in condition) problems.push(`${where}: regexFilter is not allowed`);
  const unknown = Object.keys(condition).find((key) => key !== 'regexFilter' && !CONDITION_KEYS.has(key));
  if (unknown) problems.push(`${where}: condition key ${unknown} is not allowed`);
  if ('urlFilter' in condition) {
    const filter = condition.urlFilter;
    if (typeof filter !== 'string' || !URL_FILTER.test(filter) || filter.length > LIMITS.urlFilterLength || filter.startsWith('||*')) {
      problems.push(`${where}: invalid urlFilter`);
    }
  } else if (!condition.requestDomains) {
    problems.push(`${where}: names neither a urlFilter nor requestDomains`);
  }
  for (const key of DOMAIN_KEYS) {
    if (key in condition) checkDomains(condition[key], `${where} ${key}`, problems);
  }
  if ('domainType' in condition && !DOMAIN_TYPES.has(condition.domainType)) problems.push(`${where}: invalid domainType`);
  if ('isUrlFilterCaseSensitive' in condition && condition.isUrlFilterCaseSensitive !== true) problems.push(`${where}: invalid isUrlFilterCaseSensitive`);
  checkResourceTypes(condition, type, where, problems);
}

function checkRules(text, problems) {
  const rules = parseJson(text, problems);
  if (rules === undefined) return 0;
  if (!Array.isArray(rules)) {
    problems.push('not a list of rules');
    return 0;
  }
  const ids = new Set();
  rules.forEach((rule, index) => checkRule(rule, index, ids, problems));
  return rules.length;
}

// One hiding or :style() rule, as scripts/convert-css.js writes it. Only a :style() rule may name the
// whole page, and then only to give back scrolling.
function hideRuleProblem(selector, declarations, { generic }) {
  const problem = selectorProblem(selector);
  if (generic) {
    if (problem) return `${problem}: ${selector}`;
    return declarations === HIDE ? null : `declarations other than ${HIDE} in generic CSS`;
  }
  if (problem && problem !== 'hides the whole page') return `${problem}: ${selector}`;
  if (parseDeclarations(declarations, problem !== null).dropped) return `declarations refused: ${declarations}`;
  return null;
}

// Reads a sheet rule by rule from the start. Anything that isn't one of the three forms the converter
// writes, whole, stops the check.
function cssProblem(css, { generic }) {
  let at = 0;
  while (at < css.length) {
    if (generic && at > 0) {
      if (css[at] !== '\n') return `unexpected text at ${at}`;
      at += 1;
    }
    let match;
    CONTAINER.lastIndex = at;
    ROOT.lastIndex = at;
    RULE.lastIndex = at;
    if ((match = CONTAINER.exec(css))) {
      const problem = hideRuleProblem(match[1], match[2], { generic: true });
      if (problem) return problem;
      at = CONTAINER.lastIndex;
    } else if (!generic && (match = ROOT.exec(css))) {
      at = ROOT.lastIndex;
    } else if ((match = RULE.exec(css))) {
      const problem = hideRuleProblem(match[1], match[2], { generic });
      if (problem) return problem;
      at = RULE.lastIndex;
    } else {
      return `unexpected text at ${at}`;
    }
  }
  return null;
}

function checkGeneric(text, problems) {
  if (text === '') return 0;
  const problem = cssProblem(text, { generic: true });
  if (problem) problems.push(problem);
  return text.split('\n').length;
}

function checkSites(text, problems) {
  const sites = parseJson(text, problems);
  if (sites === undefined) return 0;
  if (!isObject(sites)) {
    problems.push('not an object of sites');
    return 0;
  }
  const domains = Object.keys(sites);
  if (domains.length) checkDomains(domains, 'sites', problems, { site: true });
  for (const [domain, css] of Object.entries(sites)) {
    const problem = typeof css === 'string' && css ? cssProblem(css, { generic: false }) : 'no CSS';
    if (problem) {
      problems.push(`${domain}: ${problem}`);
      break;
    }
  }
  return domains.length;
}

function checkPopupEntry(entry, where, problems) {
  if (!isObject(entry)) {
    problems.push(`${where}: not an object`);
    return;
  }
  const extra = Object.keys(entry).find((key) => !POPUP_KEYS.has(key));
  if (extra) problems.push(`${where}: key ${extra} is not allowed`);
  if (typeof entry.url !== 'string' || (entry.url && !URL_FILTER.test(entry.url)) || entry.url.length > LIMITS.urlFilterLength) {
    problems.push(`${where}: invalid url`);
  }
  if ('on' in entry) checkDomains(entry.on, `${where} on`, problems);
  if ('off' in entry) checkDomains(entry.off, `${where} off`, problems);
  if ('party' in entry && !DOMAIN_TYPES.has(entry.party)) problems.push(`${where}: invalid party`);
  if ('case' in entry && entry.case !== true) problems.push(`${where}: invalid case`);
}

function checkPopup(text, problems) {
  const data = parseJson(text, problems);
  if (data === undefined) return 0;
  if (!isObject(data) || Object.keys(data).sort().join() !== POPUP_SECTIONS.join()) {
    problems.push(`popup data must hold exactly ${POPUP_SECTIONS.join(', ')}`);
    return 0;
  }
  let count = 0;
  for (const section of POPUP_SECTIONS) {
    if (!isObject(data[section])) {
      problems.push(`${section}: not an object`);
      continue;
    }
    for (const [token, entries] of Object.entries(data[section])) {
      if (token.length > 256 || !Array.isArray(entries)) {
        problems.push(`${section}: invalid bucket`);
        continue;
      }
      entries.forEach((entry, index) => checkPopupEntry(entry, `${section} ${index}`, problems));
      count += entries.length;
    }
  }
  // A page exception with no address would lift popup blocking everywhere.
  const pages = Object.values(isObject(data.pages) ? data.pages : {}).flat();
  if (pages.some((entry) => entry?.url === '')) problems.push('pages: an empty url would allow popups everywhere');
  return count;
}

function checkSortedDomains(domains, where, problems) {
  if (!Array.isArray(domains)) {
    problems.push(`${where}: not a list`);
    return;
  }
  if (domains.length) checkDomains(domains, where, problems, { site: true });
  if (domains.some((domain, index) => index > 0 && !(domains[index - 1] < domain))) problems.push(`${where}: not sorted or holds a duplicate`);
}

// Harmful sites and Adult sites as plain domains. The extension builds the warning or blocked-page rule
// from them, so the data never chooses where a person is sent.
function checkHostDomains(text, problems) {
  const data = parseJson(text, problems);
  if (data === undefined) return 0;
  if (!isObject(data) || Object.keys(data).sort().join() !== 'block,excluded,warn') {
    problems.push('domain data must hold exactly warn, block and excluded');
    return 0;
  }
  for (const key of ['warn', 'block', 'excluded']) checkSortedDomains(data[key], key, problems);
  if (!Array.isArray(data.warn) || !Array.isArray(data.block)) return 0;
  return new Set([...data.warn, ...data.block]).size;
}

function checkGenericOff(text, problems) {
  const domains = parseJson(text, problems);
  if (domains === undefined) return 0;
  checkSortedDomains(domains, 'genericOff', problems);
  return Array.isArray(domains) ? domains.length : 0;
}

function checkLicence(text, problems) {
  if (!/GNU (?:AFFERO )?GENERAL PUBLIC LICENSE/.test(text)) problems.push('not a GNU licence text');
  return undefined;
}

const CHECKS = {
  rules: checkRules,
  sites: checkSites,
  generic: checkGeneric,
  popup: checkPopup,
  domains: checkHostDomains,
  genericOff: checkGenericOff,
  licence: checkLicence,
};

// One file's problems, and what it holds: rules, sites, CSS rules, popup rules or domains.
export function checkFile(kind, text) {
  if (!CHECKS[kind]) return { problems: [`unknown kind ${kind}`], count: undefined };
  if (typeof text !== 'string') return { problems: ['not text'], count: undefined };
  const bytes = byteLength(text);
  if (bytes > LIMITS.fileBytes) return { problems: [`${bytes} bytes, over ${LIMITS.fileBytes}`], count: undefined, bytes };
  const problems = [];
  const count = CHECKS[kind](text, problems);
  return { problems, count, bytes };
}

// Limits on everything served together: `files` holds { kind, bytes, count } for every file.
export function checkTotals(files) {
  const problems = [];
  const rules = files.filter(({ kind }) => kind === 'rules').reduce((total, { count }) => total + count, 0);
  if (rules > LIMITS.rules) problems.push(`${rules} rules in all, over ${LIMITS.rules}`);
  const siteBytes = files.filter(({ kind }) => kind === 'sites').reduce((total, { bytes }) => total + bytes, 0);
  if (siteBytes > LIMITS.siteCssBytes) problems.push(`${siteBytes} bytes of site CSS, over ${LIMITS.siteCssBytes}`);
  return { problems, rules, siteBytes };
}

function checkSnapshot(snapshot, where, problems) {
  if (!isObject(snapshot) || !DATE.test(snapshot.date ?? '')) {
    problems.push(`${where}: invalid snapshot`);
    return;
  }
  const extra = Object.keys(snapshot).find((key) => !['date', 'version', 'commit', 'sha256'].includes(key));
  if (extra) problems.push(`${where}: snapshot key ${extra} is not allowed`);
  for (const key of ['version', 'commit']) {
    if (key in snapshot && (typeof snapshot[key] !== 'string' || snapshot[key].length > 100)) problems.push(`${where}: invalid snapshot ${key}`);
  }
  if ('sha256' in snapshot && !SHA256.test(snapshot.sha256)) problems.push(`${where}: invalid snapshot sha256`);
}

function checkEntry(id, entry, problems) {
  const where = `list ${id}`;
  if (!LIST_ID.test(id) || !isObject(entry)) {
    problems.push(`${where}: invalid entry`);
    return;
  }
  const extra = Object.keys(entry).find((key) => !['title', 'group', 'licence', 'snapshot', 'files'].includes(key));
  if (extra) problems.push(`${where}: key ${extra} is not allowed`);
  for (const key of ['title', 'group', 'licence']) {
    if (typeof entry[key] !== 'string' || !entry[key] || entry[key].length > 200) problems.push(`${where}: invalid ${key}`);
  }
  checkSnapshot(entry.snapshot, where, problems);
  if (!isObject(entry.files) || !Object.keys(entry.files).length) {
    problems.push(`${where}: no files`);
    return;
  }
  if (entry.files.rules && entry.files.domains) problems.push(`${where}: rules and domains together`);
  for (const [kind, file] of Object.entries(entry.files)) {
    if (!KINDS.includes(kind)) problems.push(`${where}: unknown kind ${kind}`);
    if (!isObject(file) || !FILE_PATH.test(file.path ?? '') || !SHA256.test(file.sha256 ?? '') || !Number.isInteger(file.bytes)
      || file.bytes < 0 || file.bytes > LIMITS.fileBytes || ('count' in file && (!Number.isInteger(file.count) || file.count < 0))) {
      problems.push(`${where}: invalid ${kind} file`);
    }
  }
}

// version.json, before any file it names is fetched. The signature is checked on the same bytes first.
export function checkVersion(text) {
  if (typeof text !== 'string') return { problems: ['not text'] };
  if (byteLength(text) > LIMITS.versionBytes) return { problems: [`version.json is over ${LIMITS.versionBytes} bytes`] };
  const problems = [];
  const version = parseJson(text, problems);
  if (version === undefined) return { problems };
  if (!isObject(version) || version.schema !== SCHEMA) return { problems: [`schema is not ${SCHEMA}`] };
  const extra = Object.keys(version).find((key) => !['schema', 'generated', 'source', 'lists', 'extension'].includes(key));
  if (extra) problems.push(`key ${extra} is not allowed`);
  // The newest version of CPAB, for the new-version notice. A version number only: no link, no text.
  if ('extension' in version && !(isObject(version.extension) && Object.keys(version.extension).join() === 'version'
    && VERSION.test(version.extension.version ?? '') && version.extension.version.length <= 32)) {
    problems.push('invalid extension');
  }
  if (!GENERATED.test(version.generated ?? '') || Number.isNaN(Date.parse(version.generated))) problems.push('invalid generated time');
  if (!SOURCE.test(version.source ?? '')) problems.push('invalid source');
  if (!isObject(version.lists)) {
    problems.push('no lists');
    return { problems };
  }
  for (const [id, entry] of Object.entries(version.lists)) checkEntry(id, entry, problems);
  const paths = Object.values(version.lists).flatMap((entry) => Object.values(entry?.files ?? {}).map((file) => file?.path));
  if (new Set(paths).size !== paths.length) problems.push('two files share a path');
  return { problems, version: problems.length ? undefined : version };
}
