// SPDX-License-Identifier: GPL-3.0-or-later
// Builds the loadable extension into a clean dist/, with one rule file per list. Usage: npm run build
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertBreaches, formatBreachReport } from './convert-breaches.js';
import { convertList, formatReport } from './convert.js';
import { exceptedSelectors, finishCss, formatCssReport, readCss } from './convert-css.js';
import { parseExceptions } from './convert-exceptions.js';
import { convertHarmful, extensionId, formatHarmfulReport } from './convert-harmful.js';
import { convertPopups, formatPopupReport, hasPopupRules, popupBadfilters } from './convert-popup.js';
import { AGPL_TEXT, DATALEAK_LISTS, LISTS } from './lists.config.js';
import { EXCEPTIONS_FILE } from '../src/shared/blocking.js';
import { CSS_INDEX, seedEntries, storedBytes } from '../src/shared/css.js';
import { DATALEAK_FILE } from '../src/shared/dataleak.js';
import { POPUP_INDEX } from '../src/shared/popups.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// storage.local holds 10 MiB. Settings and the rest need little, so this is where a build stops
// rather than leave a seed that fails on someone's machine.
const SITE_CSS_BUDGET = 9 * 1024 * 1024;

// Chrome's limit on regex rules across the static rulesets.
const MAX_REGEX_RULES = 1000;

const pkg = readJson(join(root, 'package.json'));
const manifest = readJson(join(root, 'src/manifest.json'));
if (manifest.version !== pkg.version) {
  throw new Error(`src/manifest.json says ${manifest.version}, package.json says ${pkg.version}`);
}
// The warning and adult rules name their pages by this ID, which the manifest key keeps stable.
const ownId = extensionId(manifest.key);

function convertInto(rulesDir, list, css, cancelledPopups) {
  const source = join(root, 'lists', list.listFile);
  if (!existsSync(source)) {
    if (list.required) throw new Error(`lists/${list.listFile} is missing. Run npm run lists.`);
    console.log(`${list.title}: no snapshot in lists/, so this build leaves the ${list.ruleset} ruleset out`);
    return { group: list.group, ruleset: list.ruleset, title: list.title, available: false };
  }

  const meta = readJson(join(root, 'lists', list.metaFile));
  const text = readFileSync(source, 'utf8');
  const listed = {
    group: list.group,
    ruleset: list.ruleset,
    available: true,
    listed: list.listed !== false,
    own: list.ownFormat === true,
    descriptionKey: list.descriptionKey ?? null,
    title: meta.title,
    attribution: meta.attribution,
    homepage: meta.homepage,
    sourceLink: list.sourceLink ?? null,
    licence: { name: meta.licence.name, url: meta.licence.url, copy: meta.licence.copy ?? null },
    snapshotDate: meta.snapshot.date,
  };

  if (list.harmful || list.adult) {
    const result = convertHarmful(text, { listId: list.ruleset, extensionId: ownId, plainRules: list.plainRules, adult: Boolean(list.adult) });
    writeFileSync(join(rulesDir, list.rulesFile), JSON.stringify(result.rules));
    console.log(formatHarmfulReport(list.title, result));
    return { ...listed, popupFile: null, read: result.read, converted: result.converted, dropped: result.dropped, rules: result.rules.length, domains: result.converted, rulesList: result.rules };
  }

  const result = convertList(text);
  writeFileSync(join(rulesDir, list.rulesFile), JSON.stringify(result.rules));
  if (meta.licence.copy) cpSync(join(root, 'lists', AGPL_TEXT.file), join(rulesDir, meta.licence.copy));
  console.log(formatReport(list.title, result));

  const stem = list.rulesFile.replace(/\.json$/, '');
  writeFileSync(join(rulesDir, `${stem}.generic.css`), css.genericCss);
  writeFileSync(join(rulesDir, `${stem}.sites.json`), JSON.stringify(css.sites));
  console.log(formatCssReport(list.title, css));

  const popups = convertPopups(text, cancelledPopups);
  const popupFile = `${stem}.popup.json`;
  if (hasPopupRules(popups)) writeFileSync(join(rulesDir, popupFile), JSON.stringify(popups.data));
  console.log(formatPopupReport(list.title, popups));

  return {
    ...listed,
    popupFile: hasPopupRules(popups) ? `rules/${popupFile}` : null,
    rulesList: result.rules,
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
  const read = new Map(lists.map((list) => [list, readCss(readFileSync(join(root, 'lists', list.listFile), 'utf8'), { ownFormat: list.ownFormat, styles: list.cssStyles })]));
  const excepted = exceptedSelectors([...read.values()]);
  const selectors = (css) => [...css.generic, ...[...css.site.values()].flatMap((set) => [...set])];
  const hiddenBy = new Map(lists.map((list) => [list, new Set(selectors(read.get(list)))]));
  return new Map(lists.map((list) => {
    const others = new Set(lists.filter((other) => other !== list).flatMap((other) => [...hiddenBy.get(other)]));
    return [list, finishCss(read.get(list), others, excepted)];
  }));
}

// The data-leak notice's data: no rules, just a file the popup and the worker read.
function convertDataLeak(list) {
  const source = join(root, 'lists', list.listFile);
  if (!existsSync(source)) throw new Error(`lists/${list.listFile} is missing. Run npm run lists -- ${list.name}.`);
  const meta = readJson(join(root, 'lists', list.metaFile));
  const result = convertBreaches(readJson(source), { now: new Date(`${meta.snapshot.date}T00:00:00Z`) });
  writeFileSync(join(dist, DATALEAK_FILE), JSON.stringify(result.data));
  console.log(formatBreachReport(list.title, result));
  return {
    group: list.group,
    available: true,
    listed: false,
    descriptionKey: null,
    title: meta.title,
    attribution: meta.attribution,
    homepage: meta.homepage,
    sourceLink: list.sourceLink ?? null,
    licence: { name: meta.licence.name, url: meta.licence.url, copy: null },
    snapshotDate: meta.snapshot.date,
    read: result.read,
    converted: result.kept,
    domains: Object.keys(result.data.domains).length,
  };
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
// Harmful-sites and adult-sites lists only act on whole hosts: their CSS and popup lines are never used.
const present = LISTS.filter((list) => !list.harmful && !list.adult && existsSync(join(root, 'lists', list.listFile)));
const css = convertCss(present);
const cancelledPopups = new Set(present.flatMap((list) => popupBadfilters(readFileSync(join(root, 'lists', list.listFile), 'utf8'))));
const lists = LISTS.map((list) => convertInto(rulesDir, list, css.get(list), cancelledPopups));
writeCssIndex(present, css);
const dataLeak = DATALEAK_LISTS.map(convertDataLeak);
writeFileSync(join(rulesDir, 'summary.json'), JSON.stringify({ lists: [...lists.map(({ popupFile, rulesList, ...list }) => list), ...dataLeak] }));

const regexRules = lists.reduce((total, { rulesList = [] }) => total + rulesList.filter(({ condition }) => condition.regexFilter).length, 0);
const staticRules = lists.reduce((total, { rulesList = [] }) => total + rulesList.length, 0);
console.log(`static rules: ${staticRules}, of which regex: ${regexRules}`);
if (regexRules > MAX_REGEX_RULES) throw new Error(`${regexRules} regex rules, over Chrome's ${MAX_REGEX_RULES}`);
writeFileSync(join(dist, POPUP_INDEX), JSON.stringify({
  lists: lists.filter(({ popupFile }) => popupFile).map(({ ruleset, popupFile }) => ({ id: ruleset, file: popupFile })),
}));

const exceptions = parseExceptions(readFileSync(join(root, 'lists', 'cpab-exceptions.txt'), 'utf8'));
writeFileSync(join(dist, EXCEPTIONS_FILE), JSON.stringify({ domains: exceptions }));
console.log(`recommended exceptions: ${exceptions.length} domains`);

// Chrome won't load an extension whose manifest names a rule file that isn't there.
const built = new Set(lists.filter((list) => list.available).map((list) => list.ruleset));
manifest.declarative_net_request.rule_resources = manifest.declarative_net_request.rule_resources
  .filter((ruleset) => built.has(ruleset.id));
writeFileSync(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`built ${dist} (version ${manifest.version})`);
