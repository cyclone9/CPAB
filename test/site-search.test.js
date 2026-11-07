// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAGE_SIZE, searchSites } from '../src/shared/site-search.js';

const many = Array.from({ length: 340 }, (_, index) => `site${index}.example`);

test('an empty search shows the first page of every site', () => {
  const result = searchSites(many, '');
  assert.equal(PAGE_SIZE, 50);
  assert.deepEqual(result.shown, many.slice(0, 50));
  assert.equal(result.matched, 340);
  assert.equal(result.total, 340);
  assert.equal(result.more, 50);
  assert.deepEqual(searchSites(many, '   ').shown, many.slice(0, 50));
});

test('the search matches any part of the name, in any case', () => {
  const domains = ['news.example.com', 'shop.example.org', 'Mixed.Case.ir', 'other.net'];
  assert.deepEqual(searchSites(domains, 'example').shown, ['news.example.com', 'shop.example.org']);
  assert.deepEqual(searchSites(domains, 'EXAMPLE.C').shown, ['news.example.com']);
  assert.deepEqual(searchSites(domains, 'case').shown, ['Mixed.Case.ir']);
  assert.deepEqual(searchSites(domains, ' .net ').shown, ['other.net']);
  const none = searchSites(domains, 'nothing');
  assert.deepEqual(none, { shown: [], matched: 0, total: 4, more: 0 });
});

test('the cap grows by one page, and the last page offers only what is left', () => {
  assert.equal(searchSites(many, '', 100).shown.length, 100);
  assert.equal(searchSites(many, '', 300).more, 40);
  const all = searchSites(many, '', 350);
  assert.equal(all.shown.length, 340);
  assert.equal(all.more, 0);
  // site1, site10 to site19, site100 to site199: 111 names
  const ones = searchSites(many, 'site1', 100);
  assert.equal(ones.matched, 111);
  assert.equal(ones.shown.length, 100);
  assert.equal(ones.more, 11);
});

test('a short list has no paging, and the order stays as stored', () => {
  const domains = ['b.com', 'a.com', 'c.com'];
  assert.deepEqual(searchSites(domains, ''), { shown: domains, matched: 3, total: 3, more: 0 });
  assert.deepEqual(searchSites([], 'a'), { shown: [], matched: 0, total: 0, more: 0 });
});
