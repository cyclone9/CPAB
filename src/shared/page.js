// SPDX-License-Identifier: GPL-3.0-or-later
import { resolveLanguage, t } from '../i18n/i18n.js';

const logoPath = (language, theme) => `../assets/logo/cpab-lockup-${language === 'fa' ? 'fa-' : ''}on-${theme}.svg`;

// Sets language, direction, theme, logo and every marked string. Returns the language in use.
export function applyPage(settings) {
  const language = resolveLanguage(settings.language, chrome.i18n.getUILanguage());
  const root = document.documentElement;
  root.lang = language;
  root.dir = language === 'fa' ? 'rtl' : 'ltr';
  root.dataset.theme = settings.theme;
  for (const element of document.querySelectorAll('[data-t]')) {
    element.textContent = t(language, element.dataset.t);
  }
  for (const logo of document.querySelectorAll('img[data-logo]')) {
    logo.src = logoPath(language, settings.theme);
    logo.alt = t(language, 'productName');
  }
  root.dataset.ready = '';
  return language;
}

// Fills a template such as "{domain} is already paused." and keeps each domain left to right.
export function fillWithDomains(element, template, params) {
  element.replaceChildren();
  for (const part of template.split(/(\{\w+\})/)) {
    const name = part.match(/^\{(\w+)\}$/)?.[1];
    if (name) {
      const bdi = document.createElement('bdi');
      bdi.dir = 'ltr';
      bdi.textContent = params[name];
      element.append(bdi);
    } else if (part) {
      element.append(part);
    }
  }
}
