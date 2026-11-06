// SPDX-License-Identifier: GPL-3.0-or-later
// Builds the loadable extension into a clean dist/, with one rule file per list. Usage: npm run build
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertList, formatReport } from './convert.js';
import { exceptedSelectors, finishCss, formatCssReport, readCss } from './convert-css.js';
import { AGPL_TEXT, LISTS } from './lists.config.js';
import { CSS_INDEX, seedEntries, storedBytes } from '../src/shared/css.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// storage.local holds 10 MiB. Settings and the rest need little, so this is where a build stops
// rather than leave a seed that fails on someone's machine.
const SITE_CSS_BUDGET = 9 * 1024 * 1024;

const pkg = readJson(join(root, 'package.json'));
const manifest = readJson(join(root, 'src/manifest.json'));
if (manifest.version !== pkg.version) {
  throw new Error(`src/manifest.json says ${manifest.version}, package.json says ${pkg.version}`);
}

function convertInto(rulesDir, list, css) {
  const source = join(root, 'lists', list.listFile);
  if (!existsSync(source)) {
    if (list.required) throw new Error(`lists/${list.listFile} is missing. Run npm run lists.`);
    console.log(`${list.title}: no snapshot in lists/, so this build leaves the ${list.ruleset} ruleset out`);
    return { group: list.group, ruleset: list.ruleset, title: list.title, available: false };
  }

  const meta = readJson(join(root, 'lists', list.metaFile));
  const result = convertList(readFileSync(source, 'utf8'));
  writeFileSync(join(rulesDir, list.rulesFile), JSON.stringify(result.rules));
  if (meta.licence.copy) cpSync(join(root, 'lists', AGPL_TEXT.file), join(rulesDir, meta.licence.copy));
  console.log(formatReport(list.title, result));

  const stem = list.rulesFile.replace(/\.json$/, '');
  writeFileSync(join(rulesDir, `${stem}.generic.css`), css.genericCss);
  writeFileSync(join(rulesDir, `${stem}.sites.json`), JSON.stringify(css.sites));
  console.log(formatCssReport(list.title, css));

  return {
    group: list.group,
    ruleset: list.ruleset,
    available: true,
    listed: list.listed !== false,
    descriptionKey: list.descriptionKey ?? null,
    title: meta.title,
    attribution: meta.attribution,
    homepage: meta.homepage,
    sourceLink: list.sourceLink ?? null,
    licence: { name: meta.licence.name, url: meta.licence.url, copy: meta.licence.copy ?? null },
    snapshotDate: meta.snapshot.date,
    read: result.read,
    converted: result.converted + css.stats.converted,
    dropped: result.dropped,
    rules: result.rules.length,
    domains: result.domains,
    cssGeneric: css.stats.generic,
    cssSiteDomains: css.stats.siteDomains,
  };
}

// Read before writing, because an exception in one list can name a selector from another.
function convertCss(lists) {
  const read = new Map(lists.map((list) => [list, readCss(readFileSync(join(root, 'lists', list.listFile), 'utf8'))]));
  const excepted = exceptedSelectors([...read.values()]);
  const selectors = (css) => [...css.generic, ...[...css.site.values()].flatMap((set) => [...set])];
  const hiddenBy = new Map(lists.map((list) => [list, new Set(selectors(read.get(list)))]));
  return new Map(lists.map((list) => {
    const others = new Set(lists.filter((other) => other !== list).flatMap((other) => [...hiddenBy.get(other)]));
    return [list, finishCss(read.get(list), others, excepted)];
  }));
}

function writeCssIndex(lists, css) {
  const entries = lists.map((list) => ({ list, stem: list.rulesFile.replace(/\.json$/, ''), output: css.get(list) }));
  const seed = createHash('sha256');
  for (const { output } of entries) seed.update(JSON.stringify(output.sites));
  const index = {
    seed: seed.digest('hex'),
    lists: entries.map(({ list, stem, output }) => ({
      id: list.ruleset,
      sites: `rules/${stem}.sites.json`,
      generic: output.stats.generic ? `rules/${stem}.generic.css` : null,
      genericOff: output.genericOff,
    })),
  };
  writeFileSync(join(dist, CSS_INDEX), JSON.stringify(index));

  const bytes = entries.reduce((total, { list, output }) => total + storedBytes(seedEntries(list.ruleset, output.sites)), 0);
  console.log(`site CSS in storage: ${(bytes / 1024 / 1024).toFixed(2)} MiB of the ${SITE_CSS_BUDGET / 1024 / 1024} MiB budget`);
  if (bytes > SITE_CSS_BUDGET) throw new Error(`site CSS needs ${bytes} bytes of storage, over the ${SITE_CSS_BUDGET} byte budget`);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'src'), dist, { recursive: true });
for (const file of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.md']) {
  cpSync(join(root, file), join(dist, file));
}

const rulesDir = join(dist, 'rules');
mkdirSync(rulesDir);
const present = LISTS.filter((list) => existsSync(join(root, 'lists', list.listFile)));
const css = convertCss(present);
const lists = LISTS.map((list) => convertInto(rulesDir, list, css.get(list)));
writeCssIndex(present, css);
writeFileSync(join(rulesDir, 'summary.json'), JSON.stringify({ lists }));

// Chrome won't load an extension whose manifest names a rule file that isn't there.
const built = new Set(lists.filter((list) => list.available).map((list) => list.ruleset));
manifest.declarative_net_request.rule_resources = manifest.declarative_net_request.rule_resources
  .filter((ruleset) => built.has(ruleset.id));
writeFileSync(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`built ${dist} (version ${manifest.version})`);
