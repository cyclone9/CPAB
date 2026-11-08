// SPDX-License-Identifier: GPL-3.0-or-later
// Writes the site for cpab.cyclone9.dev from a finished build: every list's data under data/v1/lists/,
// the snapshots it was built from under data/v1/sources/, and data/v1/version.json with a detached
// Ed25519 signature in data/v1/version.sig. Run after npm run build.
//
// Usage: node scripts/publish-data.js --out <folder> (--baseline <summary.json> | --no-baseline) [--unsigned] [--generated <time>]
//   CPAB_DATA_SIGNING_KEY  the signing key: base64 of the 32-byte Ed25519 seed, or a PKCS#8 PEM
//   --baseline             summary.json of the build that ships; a list that lost over a fifth of its
//                          rules, domains or CSS against it stops the run
//   --unsigned             no key and no version.sig, for local tests only
//   --test-key             sign with a key other than the one in src/shared/update-source.js, for local tests
//                          only; refused on GitHub Actions
//   --generated            the time written into version.json (default: now), as 2026-11-08T03:17:00Z
// It reads only local files and makes no request.
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { canonicalJson, servedFiles, sha256 } from './data-files.js';
import { ExportError, prepareSources, writeSources } from './export-lists.js';
import { LISTS } from './lists.config.js';
import { CSS_INDEX } from '../src/shared/css.js';
import { UPDATE_PUBLIC_KEY } from '../src/shared/update-source.js';
import { SCHEMA, checkVersion } from '../src/shared/update-schema.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const HOST = 'cpab.cyclone9.dev';
export const DATA_DIR = 'data/v1';
const KEY_ENV = 'CPAB_DATA_SIGNING_KEY';

// A list may shrink, but losing more than this much in one day means its source broke.
export const MIN_SHARE = 0.8;
// Below this a count is too small for a share to mean anything.
const MIN_BASELINE = 50;
const MEASURES = ['rules', 'domains', 'cssGeneric', 'cssSiteDomains'];

// DER headers that turn 32 raw Ed25519 bytes into a PKCS#8 private key or an SPKI public key.
const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');

class PublishError extends Error {}
const fail = (message) => { throw new PublishError(message); };

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

function rawBase64(text, bytes, what) {
  const raw = Buffer.from(text, 'base64');
  if (raw.length !== bytes || raw.toString('base64') !== text) fail(`${what} is not base64 of ${bytes} bytes`);
  return raw;
}

// The seed format is what the owner's key tools read; a PEM is taken too.
export function loadSigningKey(text) {
  const value = String(text ?? '').trim();
  const key = value.startsWith('-----BEGIN')
    ? createPrivateKey(value)
    : createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, rawBase64(value, 32, 'the signing key')]), format: 'der', type: 'pkcs8' });
  if (key.asymmetricKeyType !== 'ed25519') fail('the signing key is not an Ed25519 key');
  return key;
}

export function publicKeyFromBase64(text) {
  return createPublicKey({ key: Buffer.concat([SPKI_ED25519, rawBase64(String(text).trim(), 32, 'the public key')]), format: 'der', type: 'spki' });
}

export const publicKeyBase64 = (key) => (key.type === 'public' ? key : createPublicKey(key)).export({ format: 'der', type: 'spki' }).subarray(SPKI_ED25519.length).toString('base64');

export const signText = (text, key) => sign(null, Buffer.from(text), key).toString('base64');

export function verifySignature(text, signature, publicKey) {
  const raw = Buffer.from(String(signature).trim(), 'base64');
  return raw.length === 64 && verify(null, Buffer.from(text), publicKey, raw);
}

// The lists that lost too much against the shipped build, as readable lines.
export function shrunk(summary, baseline) {
  const before = new Map(baseline.lists.filter((list) => list.ruleset && list.available).map((list) => [list.ruleset, list]));
  const now = new Map(summary.lists.filter((list) => list.ruleset && list.available).map((list) => [list.ruleset, list]));
  const problems = [];
  for (const [id, old] of before) {
    const fresh = now.get(id);
    if (!fresh) {
      problems.push(`${id}: in the shipped build, missing now`);
      continue;
    }
    for (const measure of MEASURES) {
      const was = old[measure] ?? 0;
      const is = fresh[measure] ?? 0;
      if (was >= MIN_BASELINE && is < was * MIN_SHARE) problems.push(`${id}: ${measure} fell from ${was} to ${is}`);
    }
  }
  return problems;
}

function snapshotOf(meta, sourceSha256) {
  const { date, listVersion, listCommit } = meta.snapshot;
  return {
    date,
    ...(listVersion ? { version: String(listVersion) } : {}),
    ...(listCommit ? { commit: String(listCommit) } : {}),
    sha256: sourceSha256,
  };
}

// version.json and the files it names, from a build's dist/ and the lists/ it was built from. The same
// inputs always give the same bytes.
// `extension` is the newest version of CPAB, for the new-version notice: package.json where this runs.
export function buildVersion({ distDir, listsDir, generated, source, extension, lists = LISTS }) {
  const rulesDir = join(distDir, 'rules');
  const summary = readJson(join(rulesDir, 'summary.json'));
  const cssIndex = readJson(join(distDir, CSS_INDEX));
  const entries = {};
  const files = [];
  for (const list of lists) {
    const built = summary.lists.find((entry) => entry.ruleset === list.ruleset);
    if (!built?.available) continue;
    if (!built.files) fail(`${list.ruleset}: summary.json has no file hashes; build again with this version`);
    const snapshotPath = join(listsDir, list.listFile);
    if (!existsSync(snapshotPath) || sha256(readFileSync(snapshotPath)) !== built.snapshotSha256) {
      fail(`${list.ruleset}: lists/${list.listFile} is not the snapshot dist/ was built from`);
    }
    const meta = readJson(join(listsDir, list.metaFile));
    const served = servedFiles(rulesDir, { ...list, licenceCopy: built.licence.copy }, cssIndex);
    const described = {};
    for (const { kind, name, content } of served) {
      const recorded = built.files[kind];
      if (!recorded || recorded.path !== name || recorded.sha256 !== sha256(content)) fail(`${list.ruleset}: ${name} differs from what the build recorded`);
      described[kind] = { path: `lists/${name}`, sha256: recorded.sha256, bytes: recorded.bytes, ...('count' in recorded ? { count: recorded.count } : {}) };
      files.push({ name, content });
    }
    if (Object.keys(described).length !== Object.keys(built.files).length) fail(`${list.ruleset}: summary.json names files the build folder doesn't have`);
    entries[list.ruleset] = {
      title: meta.title,
      group: list.group,
      licence: meta.licence.spdx,
      snapshot: snapshotOf(meta, built.snapshotSha256),
      files: described,
    };
  }
  const text = canonicalJson({ schema: SCHEMA, generated, source, ...(extension ? { extension: { version: extension } } : {}), lists: entries });
  const { problems } = checkVersion(text);
  if (problems.length) fail(`version.json fails its check: ${problems.slice(0, 5).join('; ')}`);
  return { text, files, summary };
}

// Only an empty folder or an earlier output is replaced, so a wrong --out never empties anything else.
function prepareOut(out) {
  const target = resolve(out);
  const repo = realpathSync(root);
  if (repo === target || repo.startsWith(target + sep)) fail(`refusing ${out}: it holds the CPAB repository`);
  if (existsSync(target)) {
    const earlier = existsSync(join(target, 'CNAME')) && existsSync(join(target, DATA_DIR, 'version.json'));
    if (!earlier && readdirSync(target).length) fail(`refusing ${out}: the folder holds other files and no earlier output`);
    rmSync(target, { recursive: true, force: true });
  }
  mkdirSync(join(target, DATA_DIR, 'lists'), { recursive: true });
  return target;
}

export function publish({ out, baseline, unsigned = false, testKey = false, generated, source, keyText, distDir = join(root, 'dist'), listsDir = join(root, 'lists') }) {
  if (!out) fail('--out is required');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(generated)) fail(`--generated ${generated} is not a time like 2026-11-08T03:17:00Z`);
  let key = null;
  if (!unsigned) {
    if (!keyText) fail(`${KEY_ENV} is not set; pass --unsigned for a local test`);
    key = loadSigningKey(keyText);
    if (!testKey && publicKeyBase64(key) !== UPDATE_PUBLIC_KEY) fail('the signing key doesn\'t match UPDATE_PUBLIC_KEY in src/shared/update-source.js');
  }

  const extension = readJson(join(root, 'package.json')).version;
  const { text, files, summary } = buildVersion({ distDir, listsDir, generated, source, extension });
  if (baseline) {
    const problems = shrunk(summary, baseline);
    if (problems.length) fail(`a list shrank too far against the shipped build, so nothing is published:\n  ${problems.join('\n  ')}`);
  }
  const prepared = prepareSources({ repoRoot: root, listsDir });

  const target = prepareOut(out);
  const data = join(target, DATA_DIR);
  for (const { name, content } of files) writeFileSync(join(data, 'lists', name), content);
  writeSources(data, prepared);
  cpSync(join(root, 'site', 'index.html'), join(target, 'index.html'));
  writeFileSync(join(target, 'CNAME'), `${HOST}\n`);
  writeFileSync(join(data, 'version.json'), text);
  if (key) {
    const signature = signText(text, key);
    if (!verifySignature(text, signature, createPublicKey(key))) fail('the new signature does not verify');
    writeFileSync(join(data, 'version.sig'), signature);
  }
  return { target, lists: Object.keys(JSON.parse(text).lists).length, files: files.length, signed: Boolean(key), version: text };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { values } = parseArgs({
      options: {
        out: { type: 'string' },
        baseline: { type: 'string' },
        'no-baseline': { type: 'boolean', default: false },
        unsigned: { type: 'boolean', default: false },
        'test-key': { type: 'boolean', default: false },
        generated: { type: 'string' },
      },
    });
    if (!values.baseline === !values['no-baseline']) fail('pass either --baseline <summary.json> or --no-baseline');
    if ((values['test-key'] || values.unsigned) && process.env.GITHUB_ACTIONS) fail('--test-key and --unsigned are for local tests, not GitHub Actions');
    const result = publish({
      out: values.out,
      baseline: values.baseline ? readJson(values.baseline) : null,
      unsigned: values.unsigned,
      testKey: values['test-key'],
      generated: values.generated ?? `${new Date().toISOString().slice(0, 19)}Z`,
      source: /^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? '') ? process.env.GITHUB_SHA : 'local',
      keyText: process.env[KEY_ENV],
    });
    if (!values.baseline) console.log('publish-data: no baseline, so a list that shrank was not caught');
    console.log(`Wrote ${result.lists} lists in ${result.files} files to ${result.target}, ${result.signed ? 'signed' : 'UNSIGNED'}`);
  } catch (error) {
    if (!(error instanceof PublishError) && !(error instanceof ExportError)) throw error;
    console.error(`publish-data: ${error.message}`);
    process.exitCode = 1;
  }
}
