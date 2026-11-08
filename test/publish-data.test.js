// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { convertList } from '../scripts/convert.js';
import { exceptedSelectors, finishCss, readCss } from '../scripts/convert-css.js';
import { convertHarmful } from '../scripts/convert-harmful.js';
import { convertPopups } from '../scripts/convert-popup.js';
import { canonicalJson, describeFiles, hostDomains, servedFiles } from '../scripts/data-files.js';
import { buildVersion, loadSigningKey, publicKeyBase64, publicKeyFromBase64, shrunk, signText, verifySignature } from '../scripts/publish-data.js';
import { checkVersion } from '../src/shared/update-schema.js';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

const LIST_TEXT = [
  '! Title: Test list',
  '||ads.example^',
  '||track.example^$third-party',
  '/banner/*$script,domain=site.example',
  '@@||cdn.example/ad.js$script',
  '##.ad-box',
  'site.example##.sponsor',
  '||pop.example^$popup',
].join('\n');
const HARMFUL_TEXT = '||evil.example^$all\n||phish.example^$doc\n@@||ok.evil.example^\n';

const list = { name: 'test', group: 'ads', ruleset: 'ads-test', listFile: 'test.txt', metaFile: 'test.meta.json', rulesFile: 'ads-test.json' };
const harmful = { name: 'bad', group: 'harmful', ruleset: 'harmful-test', listFile: 'bad.txt', metaFile: 'bad.meta.json', rulesFile: 'harmful-test.json', harmful: true };

function convertAll() {
  const css = finishCss(readCss(LIST_TEXT), new Set(), exceptedSelectors([]));
  return {
    rules: JSON.stringify(convertList(LIST_TEXT).rules),
    generic: css.genericCss,
    sites: JSON.stringify(css.sites),
    popup: JSON.stringify(convertPopups(LIST_TEXT).data),
    harmful: JSON.stringify(convertHarmful(HARMFUL_TEXT, { listId: 'harmful-test', extensionId: 'a'.repeat(32), plainRules: 'block' }).rules),
    genericOff: css.genericOff,
  };
}

test('the converters give the same bytes for the same list', () => {
  assert.deepEqual(convertAll(), convertAll());
});

// A small dist/ and lists/ as the build leaves them.
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'cpab-publish-'));
  const rulesDir = join(dir, 'dist', 'rules');
  const listsDir = join(dir, 'lists');
  mkdirSync(rulesDir, { recursive: true });
  mkdirSync(listsDir);
  const out = convertAll();
  writeFileSync(join(rulesDir, 'ads-test.json'), out.rules);
  writeFileSync(join(rulesDir, 'ads-test.generic.css'), out.generic);
  writeFileSync(join(rulesDir, 'ads-test.sites.json'), out.sites);
  writeFileSync(join(rulesDir, 'ads-test.popup.json'), out.popup);
  writeFileSync(join(rulesDir, 'harmful-test.json'), out.harmful);
  const cssIndex = { seed: 'x', lists: [{ id: 'ads-test', sites: 'rules/ads-test.sites.json', generic: 'rules/ads-test.generic.css', genericOff: out.genericOff }] };
  writeFileSync(join(rulesDir, 'css-index.json'), JSON.stringify(cssIndex));
  writeFileSync(join(listsDir, 'test.txt'), LIST_TEXT);
  writeFileSync(join(listsDir, 'bad.txt'), HARMFUL_TEXT);
  const meta = (title, spdx) => JSON.stringify({ title, licence: { spdx }, snapshot: { date: '2026-11-08', listVersion: '202611080000', listCommit: null } });
  writeFileSync(join(listsDir, 'test.meta.json'), meta('Test list', 'GPL-3.0-only'));
  writeFileSync(join(listsDir, 'bad.meta.json'), meta('Bad list', 'GPL-3.0-only'));
  const entry = (config, text) => {
    const files = describeFiles(config.ruleset, servedFiles(rulesDir, config, cssIndex));
    return {
      ruleset: config.ruleset, available: true, licence: { copy: null }, snapshotSha256: sha256(text), rules: 10, domains: 100,
      files: Object.fromEntries(files.map(({ kind, name, ...rest }) => [kind, { path: name, ...rest }])),
    };
  };
  writeFileSync(join(rulesDir, 'summary.json'), JSON.stringify({ lists: [entry(list, LIST_TEXT), entry(harmful, HARMFUL_TEXT)] }));
  return { dir, distDir: join(dir, 'dist'), listsDir };
}

const options = (fix) => ({ distDir: fix.distDir, listsDir: fix.listsDir, generated: '2026-11-08T03:17:00Z', source: 'local', lists: [list, harmful] });

test('version.json is the same bytes for the same inputs, and passes its own check', () => {
  const fix = fixture();
  try {
    const first = buildVersion(options(fix));
    const second = buildVersion(options(fix));
    assert.equal(first.text, second.text);
    assert.deepEqual(checkVersion(first.text).problems, []);
    const version = JSON.parse(first.text);
    assert.deepEqual(Object.keys(version), ['generated', 'lists', 'schema', 'source']);
    assert.deepEqual(Object.keys(version.lists['ads-test'].files), ['generic', 'genericOff', 'popup', 'rules', 'sites']);
    assert.deepEqual(Object.keys(version.lists['harmful-test'].files), ['domains']);
    assert.equal(version.lists['ads-test'].snapshot.sha256, sha256(LIST_TEXT));
    assert.equal(first.text, canonicalJson(version));
  } finally {
    rmSync(fix.dir, { recursive: true, force: true });
  }
});

test('Harmful sites data carries domains only, never the redirect rule', () => {
  const rules = JSON.parse(convertAll().harmful);
  assert.ok(rules.some((rule) => rule.action.type === 'redirect'));
  const domains = JSON.parse(hostDomains(rules));
  assert.deepEqual(domains, { block: ['evil.example'], excluded: ['ok.evil.example'], warn: ['evil.example', 'phish.example'] });
});

test('a snapshot or file that differs from the build stops the run', () => {
  const fix = fixture();
  try {
    writeFileSync(join(fix.listsDir, 'test.txt'), `${LIST_TEXT}\n||more.example^`);
    assert.throws(() => buildVersion(options(fix)), /not the snapshot dist\/ was built from/);
    writeFileSync(join(fix.listsDir, 'test.txt'), LIST_TEXT);
    writeFileSync(join(fix.distDir, 'rules', 'ads-test.sites.json'), '{}');
    assert.throws(() => buildVersion(options(fix)), /differs from what the build recorded/);
  } finally {
    rmSync(fix.dir, { recursive: true, force: true });
  }
});

test('signing takes a base64 seed or a PEM, and a changed byte fails', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(16).toString('base64');
  const pem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  const fromSeed = loadSigningKey(seed);
  const fromPem = loadSigningKey(pem);
  const publicKey = publicKeyFromBase64(publicKeyBase64(fromSeed));
  assert.equal(publicKeyBase64(fromSeed), publicKeyBase64(fromPem));
  assert.equal(publicKeyBase64(fromSeed), publicKeyBase64(createPublicKey(privateKey)));

  const text = '{"schema":1}';
  const signature = signText(text, fromSeed);
  assert.equal(signature, signText(text, fromPem));
  assert.equal(verifySignature(text, signature, publicKey), true);
  assert.equal(verifySignature('{"schema":2}', signature, publicKey), false);
  assert.equal(verifySignature(text, signText(text, loadSigningKey(generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }))), publicKey), false);
  assert.equal(verifySignature(text, 'not a signature', publicKey), false);

  assert.throws(() => loadSigningKey(''), /base64 of 32 bytes/);
  assert.throws(() => loadSigningKey(Buffer.alloc(31).toString('base64')), /base64 of 32 bytes/);
  assert.throws(() => loadSigningKey(generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'pem', type: 'pkcs8' })), /not an Ed25519 key/);
});

test('a list that lost over a fifth against the shipped build is caught', () => {
  const summary = (rules, domains, extra = {}) => ({ lists: [{ ruleset: 'ads', available: true, rules, domains, cssGeneric: 1000, cssSiteDomains: 1000 }, extra] });
  const baseline = summary(1000, 50000, { ruleset: 'trackers', available: true, rules: 1, domains: 100000 });
  assert.deepEqual(shrunk(summary(800, 40000, { ruleset: 'trackers', available: true, rules: 1, domains: 80000 }), baseline), []);
  assert.deepEqual(shrunk(summary(799, 50000, { ruleset: 'trackers', available: true, rules: 1, domains: 100000 }), baseline), ['ads: rules fell from 1000 to 799']);
  assert.deepEqual(shrunk(summary(1000, 50000, { ruleset: 'trackers', available: true, rules: 1, domains: 10 }), baseline), ['trackers: domains fell from 100000 to 10']);
  assert.deepEqual(shrunk(summary(1000, 50000, {}), baseline), ['trackers: in the shipped build, missing now']);
  // Small counts move too much to judge by share.
  assert.deepEqual(shrunk({ lists: [{ ruleset: 'own', available: true, rules: 1 }] }, { lists: [{ ruleset: 'own', available: true, rules: 2 }] }), []);
});
