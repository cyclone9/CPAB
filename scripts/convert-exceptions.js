// SPDX-License-Identifier: GPL-3.0-or-later
// Reads lists/cpab-exceptions.txt, CPAB's own recommended exceptions, into the domain list the service
// worker turns into one allow rule. A bad line fails the build rather than being dropped: a typo here
// would allow too much, or quietly allow nothing.
import { PRIVATE_ADDRESS, normalizeRuleDomain } from './convert.js';

// A reason starts with its date: "! 2026-11-07, example.ir: why".
const DATED_REASON = /^!\s*\d{4}-\d{2}-\d{2}\b/;

export function parseExceptions(text) {
  const domains = new Set();
  let reasoned = false;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    const fail = (problem) => {
      throw new Error(`cpab-exceptions.txt line ${index + 1}: ${problem}`);
    };
    // A blank line or a bare ! ends a reason, so the next domain needs one of its own.
    if (line === '' || line === '!') {
      reasoned = false;
      continue;
    }
    if (line.startsWith('!')) {
      if (DATED_REASON.test(line)) reasoned = true;
      continue;
    }
    if (!reasoned) fail(`${line} has no dated reason above it`);
    if (normalizeRuleDomain(line) !== line) fail(`${line} isn't a lowercase ASCII domain`);
    // A bare suffix such as ir would let a whole country's addresses through.
    if (!line.includes('.')) fail(`${line} is a suffix, not a site`);
    if (PRIVATE_ADDRESS.test(line)) fail(`${line} is a private address`);
    if (domains.has(line)) fail(`${line} is listed twice`);
    domains.add(line);
  }
  return [...domains].sort();
}
