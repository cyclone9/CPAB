// SPDX-License-Identifier: GPL-3.0-or-later
// The files each list serves on cpab.cyclone9.dev, read from a build's rules/ folder. scripts/build.js
// records their hashes in summary.json and scripts/publish-data.js publishes them, so both describe the
// same bytes. Most are the build's files as they are; two are derived here: the plain domains of a
// Harmful sites or Adult sites list (never its redirect rule), and the sites where a list's generic CSS
// is off.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkFile } from '../src/shared/update-schema.js';
import { BLOCK_RULE_ID, WARN_RULE_ID } from './convert-harmful.js';

export const sha256 = (content) => createHash('sha256').update(content).digest('hex');

// JSON with every object's keys sorted, so the same data always gives the same bytes.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// What scripts/convert-harmful.js put in its rules, as domains only.
export function hostDomains(rules) {
  const domainsOf = (id) => rules.find((rule) => rule.id === id)?.condition.requestDomains ?? [];
  const excluded = new Set(rules.flatMap((rule) => rule.condition.excludedRequestDomains ?? []));
  return JSON.stringify({
    block: [...domainsOf(BLOCK_RULE_ID)].sort(),
    excluded: [...excluded].sort(),
    warn: [...domainsOf(WARN_RULE_ID)].sort(),
  });
}

// One list's served files, in a fixed order: [{ kind, name, content }]. `cssIndex` is the build's
// rules/css-index.json, for the sites where generic CSS is off.
export function servedFiles(rulesDir, list, cssIndex) {
  const stem = list.rulesFile.replace(/\.json$/, '');
  const read = (name) => readFileSync(join(rulesDir, name));
  if (list.harmful || list.adult) {
    const rules = JSON.parse(read(list.rulesFile).toString('utf8'));
    return [{ kind: 'domains', name: `${stem}.domains.json`, content: Buffer.from(hostDomains(rules)) }];
  }
  const files = [
    { kind: 'rules', name: list.rulesFile },
    { kind: 'sites', name: `${stem}.sites.json` },
    { kind: 'generic', name: `${stem}.generic.css` },
    { kind: 'popup', name: `${stem}.popup.json` },
  ].filter(({ name }) => existsSync(join(rulesDir, name))).map((file) => ({ ...file, content: read(file.name) }));
  const css = cssIndex.lists.find(({ id }) => id === list.ruleset);
  if (css) files.push({ kind: 'genericOff', name: `${stem}.generic-off.json`, content: Buffer.from(JSON.stringify(css.genericOff)) });
  if (list.licenceCopy) files.push({ kind: 'licence', name: list.licenceCopy, content: read(list.licenceCopy) });
  return files;
}

// Each file checked, with its hash, size and count. Throws on the first list with a problem.
export function describeFiles(listId, files) {
  return files.map(({ kind, name, content }) => {
    const { problems, count, bytes } = checkFile(kind, content.toString('utf8'));
    if (problems.length) throw new Error(`${listId} ${name}: ${problems.slice(0, 5).join('; ')}`);
    return { kind, name, sha256: sha256(content), bytes, ...(count === undefined ? {} : { count }) };
  });
}
