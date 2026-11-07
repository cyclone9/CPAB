// SPDX-License-Identifier: GPL-3.0-or-later
// Runs on every page, so it stays this small: one storage read and at most one adopted style sheet.
// Everything it adds is CSS the build checked. It reads the switches itself, so it needs no service worker.
{
  // Each list and its group, as in GROUP_RULESETS: a content script can't import, and
  // test/css.test.js fails if the two differ.
  const LIST_GROUPS = {
    ads: 'ads', 'ads-adguard-base': 'ads', iran: 'ads', 'cpab-own': 'ads',
    trackers: 'trackers', 'trackers-hagezi-light': 'trackers',
    'popups-adguard': 'popups',
    'widgets-adguard': 'widgets', 'widgets-fanboy-social': 'widgets',
  };

  const isOn = (settings, list) => settings?.master !== false
    && settings?.groups?.[LIST_GROUPS[list]] !== false
    && settings?.lists?.[list] !== false;

  const labels = location.hostname.replace(/\.$/, '').split('.');
  // This host and its parents, without the bare top-level name.
  const hosts = labels.slice(0, -1).map((_, index) => labels.slice(index).join('.'));
  const lists = Object.keys(LIST_GROUPS);
  const keyFor = (list, host) => `css:${list}:${host}`;
  const keys = lists.flatMap((list) => hosts.map((host) => keyFor(list, host)));

  if (keys.length) {
    chrome.storage.local.get(['settings', ...keys]).then((stored) => {
      const { settings } = stored;
      const paused = settings?.pausedSites?.some((site) => hosts.some((host) => host === site));
      if (paused) return;
      const css = lists.filter((list) => isOn(settings, list))
        .flatMap((list) => hosts.map((host) => stored[keyFor(list, host)] ?? ''))
        .join('');
      if (!css) return;
      // Adopted, not a <style> element: a page's script can find and remove those, and soft98.ir
      // removes every <style> whose text holds "important".
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    }).catch(() => {});
  }
}
