// SPDX-License-Identifier: GPL-3.0-or-later
// The first-run page. Everything it shows ships in the package, so opening it makes no request.
import { applyPage } from '../shared/page.js';
import { loadSettings, normalizeSettings, onSettingsChange } from '../shared/settings.js';

applyPage(await loadSettings().catch(() => normalizeSettings()));
onSettingsChange((settings) => applyPage(settings));
