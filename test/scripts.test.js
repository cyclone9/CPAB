// SPDX-License-Identifier: GPL-3.0-or-later
// Some scripts run on import, so they can't be imported here. A syntax check still catches a broken file.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';

for (const file of readdirSync('scripts').filter((name) => name.endsWith('.js'))) {
  test(`scripts/${file} parses`, () => {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', `scripts/${file}`], { stdio: 'pipe' }));
  });
}
