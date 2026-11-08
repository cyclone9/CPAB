// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { exportLists } from '../scripts/export-lists.js';
import { LISTS } from '../scripts/lists.config.js';

const root = new URL('..', import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), 'cpab-export-'));
const readmeDir = join(work, 'readmes');
const target = join(work, 'out');
const sources = LISTS.filter((list) => !list.ownFormat);
const read = (path) => readFileSync(path);
const tree = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory()
  ? tree(join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`])).sort();

before(() => {
  mkdirSync(readmeDir);
  writeFileSync(join(readmeDir, 'README.md'), '# CPAB-Lists\n');
  writeFileSync(join(readmeDir, 'README.fa.md'), '# CPAB-Lists\n');
  exportLists(target, { readmeDir });
});
after(() => rmSync(work, { recursive: true, force: true }));

test('the export has the top files and one folder per source list', () => {
  for (const name of ['README.md', 'README.fa.md', 'LICENSE', 'SOURCES.md', 'cpab-own.txt', 'cpab-exceptions.txt']) {
    assert.ok(existsSync(join(target, name)), name);
  }
  assert.deepEqual(readdirSync(join(target, 'sources')).sort(), sources.map(({ name }) => name).sort());
});

test('snapshots, records and CPAB\'s own files are byte-identical copies', () => {
  for (const list of sources) {
    assert.ok(read(join(target, 'sources', list.name, `${list.name}.txt`)).equals(read(join(root, 'lists', list.listFile))), list.name);
    assert.ok(read(join(target, 'sources', list.name, 'meta.json')).equals(read(join(root, 'lists', list.metaFile))), list.name);
  }
  for (const name of ['cpab-own.txt', 'cpab-exceptions.txt']) assert.ok(read(join(target, name)).equals(read(join(root, 'lists', name))), name);
  assert.ok(read(join(target, 'LICENSE')).equals(read(join(root, 'LICENSE'))));
});

test('GPL and AGPL lists carry their licence text, CC lists don\'t', () => {
  const gpl = read(join(root, 'LICENSE'));
  const agpl = read(join(root, 'lists', 'LICENSE.AGPL-3.0.txt'));
  for (const list of sources) {
    const file = join(target, 'sources', list.name, 'LICENSE.txt');
    const { spdx } = list.licence;
    if (spdx.startsWith('CC-BY')) assert.ok(!existsSync(file), list.name);
    else if (spdx.startsWith('AGPL-3.0')) assert.ok(read(file).equals(agpl), list.name);
    else if (spdx.startsWith('GPL-3.0')) assert.ok(read(file).equals(gpl), list.name);
    else assert.fail(`${list.name}: unexpected licence ${spdx}`);
  }
  assert.ok(existsSync(join(target, 'sources', 'persianblocker', 'LICENSE.txt')));
  assert.ok(!existsSync(join(target, 'sources', 'easylist', 'LICENSE.txt')));
});

test('the breach catalogue and CPAB\'s own list stay out of sources', () => {
  const files = tree(target);
  assert.ok(!files.some((path) => path.includes('hibp')), files.join(', '));
  assert.ok(!existsSync(join(target, 'sources', 'cpab-own')));
  assert.ok(!readFileSync(join(target, 'SOURCES.md'), 'utf8').includes('Have I Been Pwned'));
});

test('SOURCES.md describes every list with its licence, snapshot and hash', () => {
  const text = readFileSync(join(target, 'SOURCES.md'), 'utf8');
  for (const list of sources) {
    const meta = JSON.parse(readFileSync(join(root, 'lists', list.metaFile), 'utf8'));
    assert.ok(text.includes(`## ${meta.title}\n`), list.name);
    for (const fact of [meta.attribution, meta.homepage, meta.sourceUrl, meta.licence.spdx, meta.snapshot.date, meta.snapshot.sha256]) {
      assert.ok(text.includes(fact), `${list.name}: ${fact}`);
    }
  }
  assert.ok(text.includes('The EasyList authors (https://easylist.to/)'));
  assert.ok(text.includes('https://creativecommons.org/licenses/by-sa/4.0/'));
  assert.ok(text.includes('rewritten from host-file lines'), 'the PersianBlocker change is recorded');
});

test('a second run gives the same files and keeps what else is in the target', () => {
  const before = new Map(tree(target).map((path) => [path, read(join(target, path))]));
  mkdirSync(join(target, '.git'), { recursive: true });
  writeFileSync(join(target, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(join(target, 'sources', 'stale.txt'), 'left from an older export\n');
  exportLists(target, { readmeDir });
  const now = tree(target).filter((path) => !path.startsWith('.git/'));
  assert.deepEqual(now, [...before.keys()]);
  for (const path of now) assert.ok(read(join(target, path)).equals(before.get(path)), path);
  assert.equal(readFileSync(join(target, '.git', 'HEAD'), 'utf8'), 'ref: refs/heads/main\n');
});

test('targets inside the repository or a hidden folder are refused', () => {
  for (const inside of [root, join(root, 'export'), join(root, 'lists', 'out'), join(work, '.hidden', 'out')]) {
    assert.throws(() => exportLists(inside, { readmeDir }), /refusing/, inside);
  }
  assert.ok(!existsSync(join(root, 'export')));
  assert.ok(!existsSync(join(work, '.hidden')));
});

test('a folder that holds other files is refused', () => {
  const other = join(work, 'other');
  mkdirSync(join(other, 'sources'), { recursive: true });
  writeFileSync(join(other, 'notes.txt'), 'mine\n');
  assert.throws(() => exportLists(other, { readmeDir }), /refusing/);
  assert.ok(existsSync(join(other, 'sources')));
});

test('a missing README, snapshot or licence stops the export before it writes', () => {
  const fresh = join(work, 'fresh');
  assert.throws(() => exportLists(fresh, { readmeDir: join(work, 'none') }), /README\.md is missing/);
  const lists = join(work, 'lists');
  mkdirSync(lists);
  copyFileSync(join(root, 'lists', 'easylist.meta.json'), join(lists, 'easylist.meta.json'));
  assert.throws(() => exportLists(fresh, { readmeDir, listsDir: lists }), /easylist: its snapshot easylist\.txt is missing/);
  copyFileSync(join(root, 'lists', 'easylist.txt'), join(lists, 'easylist.txt'));
  const meta = JSON.parse(readFileSync(join(lists, 'easylist.meta.json'), 'utf8'));
  delete meta.licence.spdx;
  writeFileSync(join(lists, 'easylist.meta.json'), JSON.stringify(meta));
  assert.throws(() => exportLists(fresh, { readmeDir, listsDir: lists }), /names no licence/);
  assert.ok(!existsSync(fresh));
});
