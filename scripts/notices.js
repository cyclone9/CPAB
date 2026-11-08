// SPDX-License-Identifier: GPL-3.0-or-later
// Describes one list from its lists/<name>.meta.json record, for THIRD-PARTY-NOTICES.md (the package)
// and SOURCES.md (the lists repository), so the two never say different things about a list.

export function listLines(meta, licenceLabel) {
  return [
    `## ${meta.title}`,
    '',
    `- **Title:** ${meta.title}`,
    `- **Attribution:** ${meta.attribution}`,
    `- **Homepage:** ${meta.homepage}`,
    `- **Source:** ${meta.sourceUrl}`,
    `- **${licenceLabel}:** ${meta.licence.name}, SPDX \`${meta.licence.spdx}\`, ${meta.licence.url}`,
    `- **Licence of the list:** ${meta.licence.source}`,
  ];
}

export const snapshotParts = (snapshot) => [snapshot.date, snapshot.listVersion && `version ${snapshot.listVersion}`,
  snapshot.listCommit && `commit ${snapshot.listCommit}`];

export function noticeEntry(meta) {
  const lines = [
    ...listLines(meta, 'Licence of the converted file'),
    `- **Snapshot:** ${[...snapshotParts(meta.snapshot),
      !meta.snapshot.listVersion && !meta.snapshot.listCommit && `SHA-256 ${meta.snapshot.sha256}`].filter(Boolean).join(', ')}`,
    meta.changes ? `- **Changes:** ${meta.changes}, by CPAB's build` : {
      harmful: '- **Changes:** converted to declarativeNetRequest warning and block rules by CPAB\'s build',
      adult: '- **Changes:** converted to a declarativeNetRequest rule that sends listed sites to a blocked page, by CPAB\'s build',
    }[meta.group] ?? '- **Changes:** converted to declarativeNetRequest form, CSS and popup data by CPAB\'s build',
  ];
  if (meta.snapshot.files) lines.push(`- **Files used:** ${meta.snapshot.files.map(({ name }) => `\`${name}\``).join(', ')}, joined in that order`);
  if (meta.licence.copy) lines.push(`- **Copy in the package:** \`rules/${meta.licence.copy}\`, beside the rule file`);
  if (meta.name === 'persianblocker') lines.push('- **Where it lives:** `lists/persianblocker.txt`, with its licence in `lists/LICENSE.AGPL-3.0.txt`.');
  return lines.join('\n');
}
