// SPDX-License-Identifier: GPL-3.0-or-later
// The first-run page. Everything it shows ships in the package, so opening it makes no request.
import { t } from '../i18n/i18n.js';
import { applyPage, fillWithDomains } from '../shared/page.js';
import { loadSettings, normalizeSettings, onSettingsChange } from '../shared/settings.js';
import { UPDATE_BASE } from '../shared/update-source.js';

function render(settings) {
  const language = applyPage(settings);
  const line = document.querySelector('[data-t="welcomePrivacyRequests"]');
  fillWithDomains(line, t(language, 'welcomePrivacyRequests'), { host: new URL(UPDATE_BASE).host });
}

render(await loadSettings().catch(() => normalizeSettings()));
onSettingsChange(render);
