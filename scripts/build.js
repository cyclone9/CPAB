// SPDX-License-Identifier: GPL-3.0-or-later
// Builds the loadable extension into a clean dist/. Usage: npm run build
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'src/manifest.json'), 'utf8'));
if (manifest.version !== pkg.version) {
  throw new Error(`src/manifest.json says ${manifest.version}, package.json says ${pkg.version}`);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'src'), dist, { recursive: true });
for (const file of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.md']) {
  cpSync(join(root, file), join(dist, file));
}

console.log(`built ${dist} (version ${manifest.version})`);
