// SPDX-License-Identifier: GPL-3.0-or-later
import { STRINGS } from './strings.js';

export function resolveLanguage(preference, uiLanguage) {
  if (preference === 'en' || preference === 'fa') return preference;
  return String(uiLanguage ?? '').toLowerCase().startsWith('fa') ? 'fa' : 'en';
}

export function t(language, key) {
  const text = STRINGS[language][key];
  if (text === undefined) throw new Error(`no string "${key}" in ${language}`);
  return text;
}

export function format(language, key, params = {}) {
  return t(language, key).replace(/\{(\w+)\}/g, (_, name) => params[name]);
}
