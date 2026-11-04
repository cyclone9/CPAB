// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addSite, findOverlap, findSiteEntry, normalizeDomain, siteFromUrl } from '../src/shared/domains.js';

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

test('findSiteEntry matches a site and its subdomains, not lookalikes', () => {
  const paused = ['example.com'];
  assert.equal(findSiteEntry('example.com', paused), 'example.com');
  assert.equal(findSiteEntry('a.b.example.com', paused), 'example.com');
  assert.equal(findSiteEntry('notexample.com', paused), null);
  assert.equal(findSiteEntry('example.com.evil.net', paused), null);
});

test('addSite reports duplicates and domains a parent already covers', () => {
  assert.deepEqual(addSite(['b.com'], 'a.com'), { status: 'added', sites: ['a.com', 'b.com'] });
  assert.equal(addSite(['a.com'], 'a.com').status, 'duplicate');
  const covered = addSite(['a.com'], 'x.a.com');
  assert.equal(covered.status, 'covered');
  assert.equal(covered.parent, 'a.com');
});

test('addSite drops subdomains the new parent replaces', () => {
  assert.deepEqual(addSite(['x.a.com', 'b.com'], 'a.com').sites, ['a.com', 'b.com']);
});

test('findOverlap sees the same site, a parent and a subdomain, not lookalikes', () => {
  const sites = ['a.example.com', 'b.org'];
  assert.equal(findOverlap('a.example.com', sites), 'a.example.com');
  assert.equal(findOverlap('x.b.org', sites), 'b.org');
  assert.equal(findOverlap('example.com', sites), 'a.example.com');
  assert.equal(findOverlap('example.org', sites), null);
  assert.equal(findOverlap('notb.org', sites), null);
});
