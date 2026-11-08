// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { WELCOME_PAGE, opensWelcome } from '../src/shared/welcome.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the welcome page opens on a first install only', () => {
  assert.equal(opensWelcome({ reason: 'install' }), true);
  for (const reason of ['update', 'chrome_update', 'shared_module_update', undefined]) {
    assert.equal(opensWelcome({ reason, previousVersion: '0.2.8' }), false, String(reason));
  }
  assert.equal(opensWelcome(undefined), false);
});

function fakeChrome(inIncognitoContext) {
  const listeners = [];
  const opened = [];
  globalThis.chrome = {
    extension: { inIncognitoContext },
    runtime: { onInstalled: { addListener: (listener) => listeners.push(listener) }, getURL: (path) => `chrome-extension://id/${path}` },
    tabs: { create: async (properties) => opened.push(properties) },
  };
  return { listeners, opened };
}

test('the worker opens one tab on install and none on any other reason', async () => {
  const { listeners, opened } = fakeChrome(false);
  try {
    await import('../src/background/welcome.js?regular');
    assert.equal(listeners.length, 1);
    for (const reason of ['update', 'chrome_update', 'shared_module_update']) listeners[0]({ reason });
    assert.deepEqual(opened, []);
    listeners[0]({ reason: 'install' });
    assert.deepEqual(opened, [{ url: `chrome-extension://id/${WELCOME_PAGE}` }]);
  } finally {
    delete globalThis.chrome;
  }
});

test('the incognito copy of the worker never opens it', async () => {
  const { listeners } = fakeChrome(true);
  try {
    await import('../src/background/welcome.js?incognito');
    assert.equal(listeners.length, 0);
  } finally {
    delete globalThis.chrome;
  }
});

test('the worker registers the welcome listener', () => {
  assert.match(read('background/worker.js'), /^import '\.\/welcome\.js';$/m);
});

test('the welcome page loads nothing from outside the package', () => {
  const html = read(WELCOME_PAGE);
  for (const [, attribute, url] of html.matchAll(/\b(src|href)="([^"]+)"/g)) {
    if (/^https?:/.test(url)) assert.match(html, new RegExp(`<a [^>]*href="${url}"`), `${attribute}="${url}" is not a link`);
  }
  assert.doesNotMatch(read('welcome/welcome.js'), /fetch\(|XMLHttpRequest|sendBeacon/);
  assert.doesNotMatch(read('welcome/welcome.css'), /url\(/);
});

test('the welcome page shows the brand lines from the string table', () => {
  const html = read(WELCOME_PAGE);
  assert.match(html, /data-t="tagline"/);
  assert.match(html, /data-t="motto"/);
  assert.match(html, /<img[^>]*data-logo/);
});
