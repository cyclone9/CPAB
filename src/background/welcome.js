// SPDX-License-Identifier: GPL-3.0-or-later
import { WELCOME_PAGE, opensWelcome } from '../shared/welcome.js';

// The incognito copy of the worker leaves it to the regular one, so the page never opens twice.
if (!chrome.extension.inIncognitoContext) {
  chrome.runtime.onInstalled.addListener((details) => {
    if (!opensWelcome(details)) return;
    chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE) })
      .catch((error) => console.error('CPAB could not open its welcome page:', error.message));
  });
}
