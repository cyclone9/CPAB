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

const LOCALES = { en: 'en', fa: 'fa-IR' };

export function formatNumber(language, value) {
  return new Intl.NumberFormat(LOCALES[language]).format(value);
}

// A YYYY-MM-DD date. Persian uses the Solar Hijri calendar, the fa-IR default.
export function formatDate(language, date) {
  return new Intl.DateTimeFormat(LOCALES[language], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export function format(language, key, params = {}) {
  return t(language, key).replace(/\{(\w+)\}/g, (_, name) => params[name]);
}
