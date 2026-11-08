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

const YEAR_SEPARATORS = { en: ', ', fa: '، ' };

// Years as written in a sentence, with no thousands separator: "2012, 2021".
export function formatYears(language, years) {
  const number = new Intl.NumberFormat(LOCALES[language], { useGrouping: false });
  return years.map((year) => number.format(year)).join(YEAR_SEPARATORS[language]);
}

// A YYYY-MM-DD date. Persian uses the Solar Hijri calendar, the fa-IR default.
export function formatDate(language, date) {
  return new Intl.DateTimeFormat(LOCALES[language], { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

// A moment, such as a check's time, as a date and time on this device's clock.
export function formatDateTime(language, time) {
  return new Intl.DateTimeFormat(LOCALES[language], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time));
}

export function format(language, key, params = {}) {
  return t(language, key).replace(/\{(\w+)\}/g, (_, name) => params[name]);
}
