// SPDX-License-Identifier: GPL-3.0-or-later
// Builds the loadable extension into a clean dist/, with one rule file per list. Usage: npm run build
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertList, formatReport } from './convert.js';
import { AGPL_TEXT, LISTS } from './lists.config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const pkg = readJson(join(root, 'package.json'));
const manifest = readJson(join(root, 'src/manifest.json'));
if (manifest.version !== pkg.version) {
  throw new Error(`src/manifest.json says ${manifest.version}, package.json says ${pkg.version}`);
}

function convertInto(rulesDir, list) {
  const source = join(root, 'lists', list.listFile);
  if (!existsSync(source)) {
    if (list.required) throw new Error(`lists/${list.listFile} is missing. Run npm run lists.`);
    console.log(`${list.title}: no snapshot in lists/, so this build leaves the ${list.group} ruleset out`);
    return { group: list.group, available: false };
  }

  const meta = readJson(join(root, 'lists', list.metaFile));
  const result = convertList(readFileSync(source, 'utf8'));
  writeFileSync(join(rulesDir, list.rulesFile), JSON.stringify(result.rules));
  if (meta.licence.copy) cpSync(join(root, 'lists', AGPL_TEXT.file), join(rulesDir, meta.licence.copy));
  console.log(formatReport(list.title, result));

  return {
    group: list.group,
    available: true,
    title: meta.title,
    attribution: meta.attribution,
    homepage: meta.homepage,
    sourceLink: list.sourceLink ?? null,
    licence: { name: meta.licence.name, url: meta.licence.url, copy: meta.licence.copy ?? null },
    snapshotDate: meta.snapshot.date,
    read: result.read,
    converted: result.converted,
    dropped: result.dropped,
    rules: result.rules.length,
    domains: result.domains,
  };
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'src'), dist, { recursive: true });
for (const file of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.md']) {
  cpSync(join(root, file), join(dist, file));
}

const rulesDir = join(dist, 'rules');
mkdirSync(rulesDir);
const lists = LISTS.map((list) => convertInto(rulesDir, list));
writeFileSync(join(rulesDir, 'summary.json'), JSON.stringify({ lists }));

// Chrome won't load an extension whose manifest names a rule file that isn't there.
const built = new Set(lists.filter((list) => list.available).map((list) => list.group));
manifest.declarative_net_request.rule_resources = manifest.declarative_net_request.rule_resources
  .filter((ruleset) => built.has(ruleset.id));
writeFileSync(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`built ${dist} (version ${manifest.version})`);
