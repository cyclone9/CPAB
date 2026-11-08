// SPDX-License-Identifier: GPL-3.0-or-later
// Fetches the list snapshots into lists/ and records each one. Usage: npm run lists [-- name ...]
// With names, only those lists are fetched and the others keep their snapshots.
// An old snapshot stays in place unless the new one passes every check.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertBreaches, newestAdded } from './convert-breaches.js';
import { hostsToFilters } from './convert.js';
import { AGPL_TEXT, DATALEAK_LISTS, LISTS } from './lists.config.js';
import { noticeEntry } from './notices.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const listsDir = join(root, 'lists');
const NOTICES = join(root, 'THIRD-PARTY-NOTICES.md');
const NOTICES_START = '<!-- lists:start -->';
const NOTICES_END = '<!-- lists:end -->';
const MIN_LIST_BYTES = 100000;

const headerValue = (text, name) => text.match(new RegExp(`^! ${name}: *(.+)$`, 'm'))?.[1].trim() ?? null;

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

async function download(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  // Git stores line endings as LF here, so the recorded hash has to describe LF text.
  return (await response.text()).replace(/\r\n/g, '\n');
}

// Parts of one list carry titles such as PersianBlockerAds, and a host file writes # for !.
function checkTitle(list, text, source) {
  const title = text.match(/^[!#] Title: *(.+)$/m)?.[1].trim();
  if (!title?.startsWith(list.fileTitle ?? list.title)) throw new Error(`${source}: the file's title is "${title}"`);
}

function checkSnapshot(list, text) {
  if (text.length < MIN_LIST_BYTES) throw new Error(`${list.title}: only ${text.length} bytes, expected a full list`);
}

async function latestCommit(commitApi) {
  const commit = (await download(commitApi, { accept: 'application/vnd.github.sha' })).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`${commitApi}: "${commit}" is not a commit`);
  return commit;
}

// Every part comes from one commit, the one recorded, so main can't move between two downloads.
async function downloadRepository(list) {
  const { commitApi, raw, files } = list.repository;
  const commit = await latestCommit(commitApi);
  const parts = [];
  for (const { name, format } of files) {
    const text = await download(`${raw}/${commit}/${name}`);
    checkTitle(list, text, name);
    parts.push({ name, sha256: sha256(text), text: format === 'hosts' ? hostsToFilters(text) : text });
  }
  return {
    text: parts.map(({ name, text }) => `! ==== ${name} ====\n${text.trimEnd()}\n`).join('\n'),
    commit,
    files: parts.map(({ name, sha256: hash }) => ({ name, sha256: hash })),
  };
}

// The commit list for one path, newest first, so the file can be fetched at exactly that commit.
async function downloadPinned(list) {
  const { commitsApi, raw, path } = list.pinned;
  const commits = JSON.parse(await download(commitsApi, { accept: 'application/vnd.github+json' }));
  const commit = Array.isArray(commits) ? commits[0]?.sha : undefined;
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error(`${commitsApi}: no commit in the answer`);
  const text = await download(`${raw}/${commit}/${path}`);
  checkTitle(list, text, path);
  return { text, commit };
}

// A JSON catalogue with no title line, version or commit: the counts and the newest entry identify it.
async function downloadCatalogue(list) {
  const text = await download(list.url, list.fetchHeaders);
  const catalogue = JSON.parse(text);
  const { read, kept } = convertBreaches(catalogue);
  if (kept === 0) throw new Error(`${list.url}: no breach in the answer passes the filter`);
  return { text, catalogue: { total: read, kept, newestAddedDate: newestAdded(catalogue) } };
}

async function downloadList(list) {
  if (list.group === 'dataleak') return downloadCatalogue(list);
  if (list.repository) return downloadRepository(list);
  if (list.pinned) return downloadPinned(list);
  const text = await download(list.url);
  checkTitle(list, text, list.url);
  return list.commitApi ? { text, commit: await latestCommit(list.commitApi) } : { text };
}

function record(list, { text, commit, files, catalogue }, snapshotDate) {
  const { name, group, ruleset, listFile, rulesFile, metaFile, required, url, repository, commitApi, pinned, fileTitle, cssStyles, harmful, adult, plainRules, fetchHeaders, ...details } = list;
  return {
    name,
    group,
    ...details,
    sourceUrl: url,
    snapshot: {
      date: snapshotDate,
      sha256: sha256(text),
      listVersion: headerValue(text, 'Version'),
      listCommit: commit ?? headerValue(text, 'Commit'),
      ...(files ? { files } : {}),
      ...(catalogue ?? {}),
    },
  };
}

function updateNotices(metas) {
  const text = readFileSync(NOTICES, 'utf8');
  const start = text.indexOf(NOTICES_START);
  const end = text.indexOf(NOTICES_END);
  if (start < 0 || end < 0) throw new Error('THIRD-PARTY-NOTICES.md has lost its list markers');
  const entries = metas.map(noticeEntry).join('\n\n');
  writeFileSync(NOTICES, `${text.slice(0, start)}${NOTICES_START}\n${entries}\n${text.slice(end)}`);
}

const fetchable = [...LISTS, ...DATALEAK_LISTS].filter(({ url, repository }) => url || repository);
const only = process.argv.slice(2);
const unknown = only.filter((name) => !fetchable.some((list) => list.name === name));
if (unknown.length) throw new Error(`no fetched list is called ${unknown.join(', ')}`);
const chosen = only.length ? fetchable.filter((list) => only.includes(list.name)) : fetchable;

const snapshots = [];
for (const list of chosen) {
  const snapshot = await downloadList(list);
  checkSnapshot(list, snapshot.text);
  snapshots.push({ list, snapshot });
}
const needsAgpl = chosen.some((list) => list.licence.copy === AGPL_TEXT.file);
const agpl = needsAgpl ? await download(AGPL_TEXT.url) : null;
if (agpl !== null && !agpl.includes('GNU AFFERO GENERAL PUBLIC LICENSE')) throw new Error(`${AGPL_TEXT.url} is not the AGPL text`);

mkdirSync(listsDir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const fresh = new Map(snapshots.map(({ list, snapshot }) => {
  const meta = record(list, snapshot, today);
  writeFileSync(join(listsDir, list.listFile), snapshot.text);
  writeFileSync(join(listsDir, list.metaFile), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`${list.title}: ${snapshot.text.length} bytes, snapshot ${today}, version ${meta.snapshot.listVersion ?? 'not stated'}`);
  return [list, meta];
}));
if (agpl !== null) writeFileSync(join(listsDir, AGPL_TEXT.file), agpl);
// The notices cover every list on disk, fetched now or before.
const onDisk = (list) => existsSync(join(listsDir, list.metaFile)) && existsSync(join(listsDir, list.listFile));
updateNotices(fetchable.filter((list) => fresh.has(list) || onDisk(list))
  .map((list) => fresh.get(list) ?? JSON.parse(readFileSync(join(listsDir, list.metaFile), 'utf8'))));
