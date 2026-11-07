// SPDX-License-Identifier: GPL-3.0-or-later
// Turns a harmful-sites list into at most two rules: one that sends whole hosts to the warning page
// before they open, and one that blocks what other pages load from listed hosts. Only whole-host lines
// are used; everything else is counted by reason and dropped. A warning names a whole host, so a line
// that names part of a site is never widened to the host.
import { createHash } from 'node:crypto';
import { HARMFUL_PRIORITY } from '../src/shared/blocking.js';
import { warningRedirect } from '../src/shared/harmful.js';
import { PRIVATE_ADDRESS, hasBadfilter, isIgnorable, normalizeRuleDomain, optionNames, parseLine, ruleKey } from './convert.js';

export const WARN_RULE_ID = 1;
export const BLOCK_RULE_ID = 2;

// Hosts that give out subdomains to anyone. A list naming one whole would warn on every site it holds,
// so only entries below them are kept.
export const SHARED_HOSTING = Object.freeze([
  'github.io', 'pages.dev', 'workers.dev', 'vercel.app', 'netlify.app', 'web.app', 'firebaseapp.com',
  'blogspot.com', 'wordpress.com', 'wixsite.com', 'weebly.com', '000webhostapp.com', 'duckdns.org', 'r2.dev',
  'amazonaws.com', 'cloudfront.net', 'googleapis.com', 'windows.net', 'dropboxusercontent.com',
]);

// Matches every web address. requestDomains does the choosing; the regex is only there so the
// redirect can hand the whole address to the warning page.
export const ANY_WEB_ADDRESS = '^https?://.*';

// The extension ID Chrome derives from the manifest key: the first 128 bits of the key's SHA-256,
// one letter a to p per hex digit.
export function extensionId(key) {
  const hash = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
  return [...hash].map((digit) => String.fromCharCode(97 + parseInt(digit, 16))).join('');
}

// Options a whole-host line may carry: what it does, and uBlock's reason= note for its own warning page.
// plainRules says what a line with neither $doc nor $all does in this list.
function hostAction(options, plainRules) {
  const names = optionNames(options).filter((name) => !name.startsWith('reason='));
  const other = names.find((name) => name !== 'document' && name !== 'all');
  if (other) return { dropped: `$${other.split('=')[0]}` };
  if (names.includes('all')) return { warn: true, block: true };
  if (names.includes('document')) return { warn: true, block: false };
  return plainRules === 'warn' ? { warn: true, block: false } : { warn: false, block: true };
}

export function convertHarmful(text, { listId, extensionId: id, plainRules }) {
  const dropped = {};
  const drop = (reason) => {
    dropped[reason] = (dropped[reason] ?? 0) + 1;
  };
  const warn = new Set();
  const block = new Set();
  const excepted = new Set();

  const lines = text.split(/\r?\n/).map((raw) => raw.trim()).filter((line) => !isIgnorable(line)).map(parseLine);
  const cancelled = new Set(lines.filter(hasBadfilter).map(ruleKey));

  for (const parsed of lines) {
    if (parsed.dropped) {
      drop(parsed.dropped);
      continue;
    }
    if (hasBadfilter(parsed)) {
      drop('$badfilter');
      continue;
    }
    if (cancelled.has(ruleKey(parsed))) {
      drop('cancelled by $badfilter');
      continue;
    }
    if (parsed.pattern !== undefined) {
      drop(parsed.allow ? 'exception for part of a site' : 'part of a site, not a whole host');
      continue;
    }
    const domain = normalizeRuleDomain(parsed.host);
    if (!domain) {
      drop('invalid domain');
      continue;
    }
    if (parsed.allow) {
      // An exception carves its host out of both rules, whatever it says. Dropping one would warn on
      // a host the list means to leave alone.
      excepted.add(domain);
      continue;
    }
    const action = hostAction(parsed.options, plainRules);
    if (action.dropped) {
      drop(action.dropped);
      continue;
    }
    if (PRIVATE_ADDRESS.test(domain)) {
      drop('private address');
      continue;
    }
    if (SHARED_HOSTING.includes(domain)) {
      drop('shared hosting root');
      continue;
    }
    if (action.warn) warn.add(domain);
    if (action.block) block.add(domain);
  }

  // Chrome lets excludedRequestDomains win over requestDomains, subdomains included, as an exception does.
  const withExceptions = (domains, condition) => ({
    requestDomains: [...domains].filter((domain) => !excepted.has(domain)).sort(),
    ...(excepted.size ? { excludedRequestDomains: [...excepted].sort() } : {}),
    ...condition,
  });

  const rules = [];
  const warnCondition = withExceptions(warn, { regexFilter: ANY_WEB_ADDRESS, resourceTypes: ['main_frame'] });
  if (warnCondition.requestDomains.length) {
    rules.push({
      id: WARN_RULE_ID,
      priority: HARMFUL_PRIORITY,
      action: { type: 'redirect', redirect: warningRedirect(id, listId) },
      condition: warnCondition,
    });
  }
  const blockCondition = withExceptions(block, { excludedResourceTypes: ['main_frame'] });
  if (blockCondition.requestDomains.length) {
    rules.push({ id: BLOCK_RULE_ID, priority: HARMFUL_PRIORITY, action: { type: 'block' }, condition: blockCondition });
  }

  const warned = rules.find(({ id: ruleId }) => ruleId === WARN_RULE_ID)?.condition.requestDomains.length ?? 0;
  const blocked = rules.find(({ id: ruleId }) => ruleId === BLOCK_RULE_ID)?.condition.requestDomains.length ?? 0;
  return {
    read: lines.length,
    converted: new Set([...warn, ...block]).size,
    warned,
    blocked,
    exceptions: excepted.size,
    dropped,
    rules,
  };
}

export function formatHarmfulReport(title, result) {
  const reasons = Object.entries(result.dropped)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => `    ${String(count).padStart(7)}  ${reason}`);
  const total = Object.values(result.dropped).reduce((sum, count) => sum + count, 0);
  return [
    `${title}: read ${result.read}, ${result.warned} hosts warned, ${result.blocked} hosts blocked for other pages, ${result.exceptions} exceptions, dropped ${total}, output ${result.rules.length} rules`,
    ...reasons,
  ].join('\n');
}
