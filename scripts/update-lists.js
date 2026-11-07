// SPDX-License-Identifier: GPL-3.0-or-later
// Fetches the list snapshots into lists/ and records each one. Usage: npm run lists
// An old snapshot stays in place unless the new one passes every check.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostsToFilters } from './convert.js';
import { AGPL_TEXT, LISTS } from './lists.config.js';

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
  if (!title?.startsWith(list.title)) throw new Error(`${source}: the file's title is "${title}"`);
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

async function downloadList(list) {
  if (list.repository) return downloadRepository(list);
  const text = await download(list.url);
  checkTitle(list, text, list.url);
  return list.commitApi ? { text, commit: await latestCommit(list.commitApi) } : { text };
}

function record(list, { text, commit, files }, snapshotDate) {
  const { name, group, ruleset, listFile, rulesFile, metaFile, required, url, repository, commitApi, ...details } = list;
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
    },
  };
}

function noticeEntry(meta) {
  const lines = [
    `## ${meta.title}`,
    '',
    `- **Title:** ${meta.title}`,
    `- **Attribution:** ${meta.attribution}`,
    `- **Homepage:** ${meta.homepage}`,
    `- **Source:** ${meta.sourceUrl}`,
    `- **Licence of the converted file:** ${meta.licence.name}, SPDX \`${meta.licence.spdx}\`, ${meta.licence.url}`,
    `- **Licence of the list:** ${meta.licence.source}`,
    `- **Snapshot:** ${[meta.snapshot.date, meta.snapshot.listVersion && `version ${meta.snapshot.listVersion}`, meta.snapshot.listCommit && `commit ${meta.snapshot.listCommit}`].filter(Boolean).join(', ')}`,
    '- **Changes:** converted to declarativeNetRequest form, CSS and popup data by CPAB\'s build',
  ];
  if (meta.snapshot.files) lines.push(`- **Files used:** ${meta.snapshot.files.map(({ name }) => `\`${name}\``).join(', ')}, joined in that order`);
  if (meta.licence.copy) lines.push(`- **Copy in the package:** \`rules/${meta.licence.copy}\`, beside the rule file`);
  if (meta.name === 'persianblocker') lines.push('- **Where it lives:** `lists/persianblocker.txt`, with its licence in `lists/LICENSE.AGPL-3.0.txt`.');
  return lines.join('\n');
}

function updateNotices(metas) {
  const text = readFileSync(NOTICES, 'utf8');
  const start = text.indexOf(NOTICES_START);
  const end = text.indexOf(NOTICES_END);
  if (start < 0 || end < 0) throw new Error('THIRD-PARTY-NOTICES.md has lost its list markers');
  const entries = metas.map(noticeEntry).join('\n\n');
  writeFileSync(NOTICES, `${text.slice(0, start)}${NOTICES_START}\n${entries}\n${text.slice(end)}`);
}

const snapshots = [];
for (const list of LISTS.filter(({ url, repository }) => url || repository)) {
  const snapshot = await downloadList(list);
  checkSnapshot(list, snapshot.text);
  snapshots.push({ list, snapshot });
}
const agpl = await download(AGPL_TEXT.url);
if (!agpl.includes('GNU AFFERO GENERAL PUBLIC LICENSE')) throw new Error(`${AGPL_TEXT.url} is not the AGPL text`);

mkdirSync(listsDir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const metas = snapshots.map(({ list, snapshot }) => {
  const meta = record(list, snapshot, today);
  writeFileSync(join(listsDir, list.listFile), snapshot.text);
  writeFileSync(join(listsDir, list.metaFile), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`${list.title}: ${snapshot.text.length} bytes, snapshot ${today}, version ${meta.snapshot.listVersion ?? 'not stated'}`);
  return meta;
});
writeFileSync(join(listsDir, AGPL_TEXT.file), agpl);
updateNotices(metas);
