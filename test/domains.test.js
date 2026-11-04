// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addPausedSite, findPausedEntry, normalizeDomain, siteFromUrl } from '../src/shared/domains.js';

test('normalizeDomain accepts what people type or paste', () => {
  assert.equal(normalizeDomain('example.com'), 'example.com');
  assert.equal(normalizeDomain('  Example.COM  '), 'example.com');
  assert.equal(normalizeDomain('www.example.com'), 'example.com');
  assert.equal(normalizeDomain('www.com'), 'www.com');
  assert.equal(normalizeDomain('https://www.example.com/a/page?x=1#top'), 'example.com');
  assert.equal(normalizeDomain('sub.example.co.uk'), 'sub.example.co.uk');
  assert.equal(normalizeDomain('example.com.'), 'example.com');
  assert.equal(normalizeDomain('example.com:8080'), 'example.com');
  assert.equal(normalizeDomain('192.168.1.1'), '192.168.1.1');
  assert.equal(normalizeDomain('localhost'), 'localhost');
  assert.equal(normalizeDomain('site.localhost'), 'site.localhost');
});

test('normalizeDomain turns a Persian domain into its ASCII form', () => {
  assert.match(normalizeDomain('سایت.ir'), /^xn--[a-z0-9-]+\.ir$/);
});

test('normalizeDomain refuses what is not a domain', () => {
  for (const bad of [
    '', '   ', 'example', 'not a domain', 'exa mple.com', 'example..com', '-example.com',
    'example-.com', 'example.c', '.com', 'chrome://settings', 'ftp://example.com',
    'user@example.com', 'http://[::1]/', '1234', '0x7f.1', null, undefined,
    `${'a'.repeat(64)}.com`, `${'a.'.repeat(130)}com`,
  ]) {
    assert.equal(normalizeDomain(bad), null, String(bad));
  }
});

test('siteFromUrl gives the site of an ordinary page', () => {
  assert.equal(siteFromUrl('https://www.example.com/page'), 'example.com');
  assert.equal(siteFromUrl('http://news.example.ir/'), 'news.example.ir');
  assert.equal(siteFromUrl('http://localhost:8733/'), 'localhost');
});

test('siteFromUrl gives null where an extension cannot run', () => {
  for (const url of [
    'chrome://extensions/', 'chrome-extension://abc/popup.html', 'about:blank', 'file:///tmp/a.html',
    'view-source:https://example.com/', 'https://chromewebstore.google.com/detail/x',
    'https://chrome.google.com/webstore/category/extensions', 'http://[::1]/', 'not a url',
  ]) {
    assert.equal(siteFromUrl(url), null, url);
  }
  assert.equal(siteFromUrl('https://chrome.google.com/other'), 'chrome.google.com');
});

test('findPausedEntry matches a site and its subdomains, not lookalikes', () => {
  const paused = ['example.com'];
  assert.equal(findPausedEntry('example.com', paused), 'example.com');
  assert.equal(findPausedEntry('a.b.example.com', paused), 'example.com');
  assert.equal(findPausedEntry('notexample.com', paused), null);
  assert.equal(findPausedEntry('example.com.evil.net', paused), null);
});

test('addPausedSite reports duplicates and domains a parent already covers', () => {
  assert.deepEqual(addPausedSite(['b.com'], 'a.com'), { status: 'added', pausedSites: ['a.com', 'b.com'] });
  assert.equal(addPausedSite(['a.com'], 'a.com').status, 'duplicate');
  const covered = addPausedSite(['a.com'], 'x.a.com');
  assert.equal(covered.status, 'covered');
  assert.equal(covered.parent, 'a.com');
});

test('addPausedSite drops subdomains the new parent replaces', () => {
  assert.deepEqual(addPausedSite(['x.a.com', 'b.com'], 'a.com').pausedSites, ['a.com', 'b.com']);
});
