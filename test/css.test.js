// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import {
  allowCss,
  exceptedSelectors,
  finishCss,
  formatCssReport,
  hideCss,
  parseDeclarations,
  parseHidingDomains,
  parseHidingLine,
  readCss,
  selectorProblem,
} from '../scripts/convert-css.js';
import { LISTS } from '../scripts/lists.config.js';
import { scriptChanges, scriptList, seedEntries, siteKey, staleKeys, storedBytes, wantedScripts } from '../src/shared/css.js';
import { GROUP_RULESETS, normalizeSettings } from '../src/shared/settings.js';

const finish = (text, others = new Set()) => {
  const css = readCss(text);
  return finishCss(css, others, exceptedSelectors([css]));
};
const HIDE = '{display:none!important}';

test('a plain selector passes, whatever its shape', () => {
  for (const selector of [
    '.ad', '#ad-box', 'div.a > span + b ~ i', 'a[href^="https://x.com/?a=1;b"]', '[style*="float:left; width:320px;"]',
    'div:has(> a.ad)', '.ad:not(.keep):first-child', ':is(aside, section) > .ad', '.\\[100px\\]\\:hidden', '.ad::before',
    'div:nth-of-type(-n+2)', 'div:has(> div > button[aria-label="بستن تبلیغ"])', '.a:not(html,body)',
  ]) assert.equal(selectorProblem(selector), null, selector);
});

test('a selector that could escape its rule is refused, with its reason', () => {
  assert.equal(selectorProblem('.a{display:block}.b'), 'refused: brace');
  assert.equal(selectorProblem('.a}body{color:red'), 'refused: brace');
  assert.equal(selectorProblem('[title="{"]'), 'refused: brace');
  assert.equal(selectorProblem('@import "x"'), 'refused: @');
  assert.equal(selectorProblem('a[href="mailto:a@b.c"]'), 'refused: @');
  assert.equal(selectorProblem('[style*="URL(x)"]'), 'refused: url(');
  assert.equal(selectorProblem('[style*="expression(1)"]'), 'refused: expression(');
  assert.equal(selectorProblem('.a/*'), 'refused: comment');
  assert.equal(selectorProblem('.a\n.b'), 'refused: control character');
});

test('a selector that would swallow what follows it is refused', () => {
  for (const selector of ['a[href="x', 'a[href="x"', 'div:not(.a', '.a)', '.a]', '.a\\', "[a='b"]) {
    assert.equal(selectorProblem(selector), 'unbalanced selector', selector);
  }
  assert.equal(selectorProblem('.a;b'), 'invalid character');
  assert.equal(selectorProblem('<b>'), 'invalid character');
  assert.equal(selectorProblem(''), 'invalid selector');
  assert.equal(selectorProblem('> .a'), 'invalid selector');
  assert.equal(selectorProblem('.a,'), 'invalid selector');
});

test('procedural selectors are named, and only outside strings and attributes', () => {
  assert.equal(selectorProblem('.a:has-text(Ad)'), 'procedural :has-text');
  assert.equal(selectorProblem('.a:upward(2)'), 'procedural :upward');
  assert.equal(selectorProblem('.a:style(color:red)'), 'procedural :style');
  assert.equal(selectorProblem('.a:not(.b:matches-css(after, content: x))'), 'procedural :matches-css');
  assert.equal(selectorProblem('.a:xpath(//b)'), 'procedural :xpath');
  assert.equal(selectorProblem('.a:-abp-has(.b)'), 'procedural :-abp-has');
  assert.equal(selectorProblem('.a:bogus'), 'unsupported :bogus');
  assert.equal(selectorProblem('.a[title=":has-text("]'), null);
  assert.equal(selectorProblem('.lg\\:style'), null);
});

test(':has() inside :has() is refused, because Chrome voids it, and two side by side are not', () => {
  assert.equal(selectorProblem('a:has(b:has(c))'), 'nested :has()');
  assert.equal(selectorProblem('a:has(b):has(c)'), null);
  assert.equal(selectorProblem('a:not(:has(b)):has(c)'), null);
});

test('a selector that hides the whole page is refused, one narrowed by :not is not', () => {
  for (const selector of ['*', 'body', 'HTML', ':root', '.a, body']) assert.equal(selectorProblem(selector), 'hides the whole page', selector);
  assert.equal(selectorProblem('.ad:not(html,body,article)'), null);
});

test('non-hiding rules are dropped by kind, and nothing else is read as one', () => {
  assert.equal(parseHidingLine('a.com##+js(noop)').dropped, 'scriptlet');
  assert.equal(parseHidingLine('a.com#@#+js(noop)').dropped, 'scriptlet');
  assert.equal(parseHidingLine('a.com#%#//scriptlet("x")').dropped, 'scriptlet');
  assert.equal(parseHidingLine('a.com#$#body { color: red }').dropped, 'CSS injection');
  assert.equal(parseHidingLine('a.com##^script:has-text(x)').dropped, 'HTML filter');
  assert.equal(parseHidingLine('a.com$$script[tag-content="x"]').dropped, 'HTML filter');
  assert.equal(parseHidingLine('||example.com^'), null);
  assert.equal(parseHidingLine('/ads/banner.'), null);
});

test('an extended-syntax marker holding plain CSS still counts as plain CSS', () => {
  assert.deepEqual(parseHidingLine('a.com#?#div:has(> .ad)'), { allow: false, selector: 'div:has(> .ad)', included: ['a.com'], excluded: [], partly: false });
  assert.equal(parseHidingLine('a.com#?#div:has-text(Ad)').dropped, 'procedural :has-text');
});

test('domain lists keep what they can', () => {
  assert.deepEqual(parseHidingDomains('b.com,~x.b.com,تبلیغ.ir').excluded, ['x.b.com']);
  assert.equal(parseHidingDomains('b.com,~x.b.com,تبلیغ.ir').included.length, 2);
  const mixed = parseHidingDomains('google.*,b.com');
  assert.deepEqual(mixed.included, ['b.com']);
  assert.equal(mixed.partly, true);
  assert.equal(parseHidingDomains('google.*').dropped, 'wildcard domain');
  assert.equal(parseHidingDomains('/^foo/').dropped, 'regex domain');
  assert.equal(parseHidingDomains('intranet').dropped, 'single-label domain');
  assert.equal(parseHidingDomains('10.0.0.1').dropped, 'private address');
  assert.deepEqual(parseHidingDomains('').included, []);
});

test('generic and site rules land in their own places, one rule per selector', () => {
  const { genericCss, sites, stats } = finish('##.ad\n###top\nb.com,a.com##.box\na.com##.two\n! comment\n||x.com^\n');
  assert.deepEqual(genericCss.split('\n'), [`.ad${HIDE}`, `#top${HIDE}`]);
  assert.deepEqual(sites, { 'a.com': `.box${HIDE}.two${HIDE}`, 'b.com': `.box${HIDE}` });
  assert.equal(stats.read, 4);
  assert.equal(stats.converted, 4);
});

test('one bad selector costs only itself', () => {
  const { genericCss, stats } = finish('##.good\n##.a{b}\n##.bad:has-text(x)\n##.also-good\n');
  assert.deepEqual(genericCss.split('\n'), [`.good${HIDE}`, `.also-good${HIDE}`]);
  assert.deepEqual(stats.dropped, { 'refused: brace': 1, 'procedural :has-text': 1 });
});

test('an exception on a generic rule gates that rule and sets the gate on its site alone', () => {
  const { genericCss, sites } = finish('##.ad\n##.other\na.com#@#.ad\n');
  const [gated, plain] = genericCss.split('\n');
  const [, name] = gated.match(/^@container not style\((--cpab-allow-[0-9a-f]{12}):1\)\{\.ad\{display:none!important\}\}$/);
  assert.equal(plain, `.other${HIDE}`);
  assert.deepEqual(sites, { 'a.com': `:root{${name}:1}` });
});

test('an exception on a site rule is subtracted at build, leaving nothing to store', () => {
  const { sites, stats } = finish('a.com##.ad\na.com##.keep\na.com#@#.ad\nb.com##.ad\nb.com#@#.ad\n');
  assert.deepEqual(sites, { 'a.com': `.keep${HIDE}` });
  assert.equal(stats.allows, 0);
});

test('an exception on a subdomain lifts its parent\'s rule there', () => {
  const { sites } = finish('a.com##.ad\nsub.a.com#@#.ad\n');
  assert.match(sites['a.com'], /^@container not style\(--cpab-allow-\w+:1\)\{\.ad\{display:none!important\}\}$/);
  assert.match(sites['sub.a.com'], /^:root\{--cpab-allow-\w+:1\}$/);
});

test('an exception can lift a rule in another list, and one matching nothing is counted', () => {
  const lifted = finish('a.com#@#.theirs\n', new Set(['.theirs']));
  assert.match(lifted.sites['a.com'], /^:root\{/);
  const unmatched = finish('a.com#@#.nowhere\n');
  assert.deepEqual(unmatched.sites, {});
  assert.equal(unmatched.stats.unmatched, 1);
});

test('a rule in one list is gated by an exception in another', () => {
  const ours = readCss('##.ad\n');
  const theirs = readCss('a.com#@#.ad\n');
  const excepted = exceptedSelectors([ours, theirs]);
  assert.match(finishCss(ours, new Set(), excepted).genericCss, /^@container not style/);
  assert.match(finishCss(theirs, new Set(['.ad']), excepted).sites['a.com'], /^:root/);
});

test('a global exception removes the rule from its list', () => {
  const { genericCss, sites } = finish('##.ad\n##.keep\na.com##.ad\n#@#.ad\n');
  assert.equal(genericCss, `.keep${HIDE}`);
  assert.deepEqual(sites, {});
});

test('a negated domain is an exception on that domain', () => {
  const { genericCss, sites } = finish('~a.com##.ad\n');
  assert.match(genericCss, /^@container not style/);
  assert.match(sites['a.com'], /^:root/);
  const narrowed = finish('a.com,~sub.a.com##.ad\n');
  assert.match(narrowed.sites['sub.a.com'], /^:root/);
  assert.deepEqual(finish('a.com,~other.com##.ad\n').sites['other.com'], undefined);
});

test('generichide keeps generic rules off a domain and leaves its site rules', () => {
  const { genericOff, sites, stats } = finish('##.ad\na.com##.box\n@@||a.com^$generichide\n@@||b.com^$ghide\n@@$generichide,domain=c.com|d.com\n');
  assert.deepEqual(genericOff, ['a.com', 'b.com', 'c.com', 'd.com']);
  assert.equal(sites['a.com'], `.box${HIDE}`);
  assert.equal(stats.genericOff, 4);
});

test('elemhide and a whole-page exception take site rules off as well, subdomains included', () => {
  const { genericOff, sites } = finish('a.com##.x\nsub.a.com##.y\nb.com##.z\nwww.c.com##.z\n@@||a.com^$elemhide\n@@||www.c.com^$document\n');
  assert.deepEqual(genericOff, ['a.com', 'www.c.com']);
  assert.deepEqual(Object.keys(sites), ['b.com']);
});

test('a hide exception this build can\'t follow is counted, and $badfilter cancels one', () => {
  const { genericOff, stats } = finish('@@||a.com/path^$generichide\n@@||b.com^$generichide,third-party\n@@||co.uk^$document\n@@||c.com^$generichide\n@@||c.com^$generichide,badfilter\n');
  assert.deepEqual(genericOff, []);
  assert.deepEqual(stats.dropped, {
    'hide exception with a path': 1,
    'hide exception with conditions': 1,
    'hide exception too broad': 1,
    'cancelled by $badfilter': 1,
  });
});

test('hide and allow rules keep to a fixed shape', () => {
  assert.equal(hideCss('.a', new Set()), `.a${HIDE}`);
  assert.equal(allowCss([]), '');
  assert.match(allowCss(['.a', '.b']), /^:root\{--cpab-allow-\w+:1;--cpab-allow-\w+:1\}$/);
});

test('the report gives each reason its count', () => {
  const report = formatCssReport('List', finish('##.a\n##.b:has-text(x)\nx.*##.c\n'));
  assert.match(report, /^List CSS: read 3, converted 1, dropped 2, output 1 generic selectors/);
  assert.match(report, /1 {2}procedural :has-text/);
  assert.match(report, /1 {2}wildcard domain/);
});

const INDEX = {
  seed: 'x',
  lists: [
    { id: 'ads', sites: 's1', generic: 'a.css', genericOff: ['off.com'] },
    { id: 'ads-adguard-base', sites: 's2', generic: 'b.css', genericOff: [] },
    { id: 'cpab-own', sites: 's3', generic: null, genericOff: [] },
    { id: 'iran', sites: 's4', generic: 'c.css', genericOff: [] },
  ],
};

test('each list with generic rules gets one CSS-only script, at document start, in every frame', () => {
  const scripts = wantedScripts(normalizeSettings({}), INDEX);
  assert.deepEqual(scripts.map(({ id }) => id), ['generic-css-ads', 'generic-css-ads-adguard-base', 'generic-css-iran']);
  assert.deepEqual(scripts[0], {
    id: 'generic-css-ads',
    css: ['a.css'],
    matches: ['<all_urls>'],
    excludeMatches: ['*://*.off.com/*'],
    runAt: 'document_start',
    allFrames: true,
    persistAcrossSessions: true,
  });
  assert.equal(scriptList(scripts[1].id), 'ads-adguard-base');
});

test('scripts follow the master switch, the groups, the lists and paused sites', () => {
  const ids = (settings) => wantedScripts(normalizeSettings(settings), INDEX).map(({ id }) => id);
  assert.deepEqual(ids({ master: false }), []);
  assert.deepEqual(ids({ groups: { ads: false } }), []);
  assert.deepEqual(ids({ lists: { ads: false } }), ['generic-css-ads-adguard-base', 'generic-css-iran']);
  const [paused] = wantedScripts(normalizeSettings({ pausedSites: ['a.com', 'off.com'] }), INDEX);
  assert.deepEqual(paused.excludeMatches, ['*://*.a.com/*', '*://*.off.com/*']);
});

test('reconciling twice changes nothing the second time', () => {
  const wanted = wantedScripts(normalizeSettings({}), INDEX);
  const first = scriptChanges(wanted, []);
  assert.deepEqual(first.add.map(({ id }) => id), wanted.map(({ id }) => id));
  assert.deepEqual(scriptChanges(wanted, wanted), { remove: [], add: [], update: [] });
});

test('reconciling removes what is off, leaves other scripts, and updates exclusions in place', () => {
  const wanted = wantedScripts(normalizeSettings({ lists: { iran: false }, pausedSites: ['a.com'] }), INDEX);
  const registered = [...wantedScripts(normalizeSettings({}), INDEX), { id: 'something-else' }];
  const { remove, add, update } = scriptChanges(wanted, registered);
  assert.deepEqual(remove, ['generic-css-iran']);
  assert.deepEqual(add, []);
  assert.deepEqual(update.map(({ id }) => id), ['generic-css-ads', 'generic-css-ads-adguard-base']);
  assert.ok(update[0].excludeMatches.includes('*://*.a.com/*'));
  assert.equal(update[0].matches, undefined);
});

test('the seed keys each domain per list, so lists never share an entry', () => {
  assert.deepEqual(seedEntries('ads', { 'a.com': '.x{}' }), { 'css:ads:a.com': '.x{}' });
  assert.equal(siteKey('iran', 'a.com'), 'css:iran:a.com');
});

test('a reseed removes only site keys this build no longer has', () => {
  const stored = ['settings', 'rulesetProblems', 'cssSeed', 'css:ads:old.com', 'css:ads:kept.com'];
  assert.deepEqual(staleKeys(stored, new Set(['css:ads:kept.com'])), ['css:ads:old.com']);
});

test('stored bytes count each key and its value as JSON, as Chrome does', () => {
  assert.equal(storedBytes({ ab: 'c"d' }), 2 + JSON.stringify('c"d').length);
  assert.equal(storedBytes({ a: 'ی' }), 1 + 4);
});

const hideSource = readFileSync(new URL('../src/content/hide.js', import.meta.url), 'utf8');

// Runs the real content script against a stub page.
async function runHide(hostname, stored) {
  const requests = [];
  const chrome = {
    storage: {
      local: {
        get: async (keys) => {
          requests.push(keys);
          return Object.fromEntries(keys.filter((key) => key in stored).map((key) => [key, stored[key]]));
        },
      },
    },
  };
  class CSSStyleSheet {
    replaceSync(text) { this.text = text; }
  }
  const pageSheet = new CSSStyleSheet();
  const document = { adoptedStyleSheets: [pageSheet] };
  vm.runInNewContext(hideSource, { chrome, document, location: { hostname }, CSSStyleSheet });
  await new Promise((done) => setTimeout(done));
  assert.equal(document.adoptedStyleSheets[0], pageSheet, 'the page\'s own adopted sheets stay');
  return { css: Array.from(document.adoptedStyleSheets.slice(1), ({ text }) => text), requests };
}

test('the content script knows every list, in its group', () => {
  const [, table] = hideSource.match(/LIST_GROUPS = (\{[\s\S]*?\});/);
  const groups = vm.runInNewContext(`(${table})`);
  const expected = Object.fromEntries(Object.entries(GROUP_RULESETS).flatMap(([group, lists]) => lists.map((list) => [list, group])));
  assert.deepEqual({ ...groups }, expected);
});

test('the content script reads once, and adopts one sheet with the host\'s and its parents\' rules', async () => {
  const { css, requests } = await runHide('www.a.com', {
    'css:ads:a.com': '.p{}', 'css:iran:www.a.com': '.q{}', 'css:ads:b.com': '.other{}',
  });
  assert.equal(requests.length, 1);
  assert.ok(requests[0].includes('settings'));
  assert.deepEqual(css, ['.p{}.q{}']);
});

test('the content script follows the switches with no worker, and adds nothing when off', async () => {
  const stored = { 'css:ads:a.com': '.a{}', 'css:iran:a.com': '.i{}' };
  const on = async (settings) => (await runHide('a.com', { ...stored, settings })).css;
  assert.deepEqual(await on(undefined), ['.a{}.i{}']);
  assert.deepEqual(await on({ master: false }), []);
  assert.deepEqual(await on({ groups: { ads: false } }), []);
  assert.deepEqual(await on({ groups: { trackers: false } }), ['.a{}.i{}']);
  assert.deepEqual(await on({ lists: { iran: false } }), ['.a{}']);
  assert.deepEqual(await on({ pausedSites: ['a.com'] }), []);
  assert.deepEqual((await runHide('www.a.com', { ...stored, settings: { pausedSites: ['a.com'] } })).css, []);
  assert.deepEqual((await runHide('nota.com', { ...stored, 'css:ads:nota.com': '.n{}', settings: { pausedSites: ['a.com'] } })).css, ['.n{}']);
});

test('the content script does nothing on a host with no name to look up', async () => {
  for (const hostname of ['', 'localhost']) {
    const { css, requests } = await runHide(hostname, {});
    assert.deepEqual(css, []);
    assert.deepEqual(requests, []);
  }
});

test('the content script never logs and runs nothing from a list', () => {
  assert.ok(!/console\.|eval\(|new Function|innerHTML|\.src\b/.test(hideSource));
});

test('the real lists give selectors that all pass the check, and the own list hides the kojaro banner', () => {
  const available = LISTS.filter((list) => existsSync(new URL(`../lists/${list.listFile}`, import.meta.url)));
  for (const list of available) {
    const css = readCss(readFileSync(new URL(`../lists/${list.listFile}`, import.meta.url), 'utf8'), { ownFormat: list.ownFormat, styles: list.cssStyles });
    const dropped = Object.values(css.dropped).reduce((sum, count) => sum + count, 0);
    assert.equal(css.read, css.converted + dropped, list.title);
    for (const selector of css.generic) assert.equal(selectorProblem(selector), null, selector);
    if (!list.cssStyles) assert.equal(css.styled.size, 0, list.title);
    for (const rule of [...css.styled.values()].flatMap((rules) => [...rules])) {
      assert.equal(rule.match(/[{}]/g).join(''), '{}', rule);
      assert.doesNotMatch(rule.slice(rule.indexOf('{')), /url\(|["'\\@]|--|\/\*/, rule);
    }
  }
  const own = finishCss(readCss(readFileSync(new URL('../lists/cpab-own.txt', import.meta.url), 'utf8'), { ownFormat: true }), new Set(), new Set());
  assert.deepEqual(own.stats.dropped, {});
  assert.deepEqual(Object.keys(own.sites), ['kojaro.com', 'soft98.ir']);
  assert.ok(own.sites['kojaro.com'].includes('button[aria-label="بستن تبلیغ"]'));
  // Each of these holds the site's real software list, so no rule may end on one of them.
  assert.doesNotMatch(own.sites['soft98.ir'], /(?:#sbd|#tbdl|\.tbdl|\.cbddh)\{/);
});

test('only the own list can collapse a box, only on a named site, and the CSS comes from here', () => {
  const line = 'a.com##.box:cpab-collapse';
  assert.deepEqual(parseHidingLine(line), { dropped: 'unsupported :cpab-collapse', allow: false });
  assert.deepEqual(parseHidingLine('##.box:cpab-collapse', true), { dropped: 'collapse needs a site', allow: false });
  assert.deepEqual(parseHidingLine('a.com#@#.box:cpab-collapse', true), { dropped: 'collapse needs a site', allow: true });
  assert.deepEqual(parseHidingLine('a.com##.box{color:red}:cpab-collapse', true), { dropped: 'refused: brace', allow: false });
  assert.equal(parseHidingLine('a.com##html:cpab-collapse', true).dropped, 'hides the whole page');

  const own = finishCss(readCss(`${line}\na.com##.plain\n`, { ownFormat: true }), new Set(), new Set());
  assert.equal(
    own.sites['a.com'],
    '.box{min-height:0!important;max-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}.plain{display:none!important}',
  );
  assert.deepEqual(finishCss(readCss(line), new Set(), new Set()).sites, {});
});

test('only the own list can move a box offscreen, only on a named site, and the CSS comes from here', () => {
  const line = 'a.com##.box:cpab-offscreen';
  assert.deepEqual(parseHidingLine(line), { dropped: 'unsupported :cpab-offscreen', allow: false });
  assert.deepEqual(parseHidingLine('##.box:cpab-offscreen', true), { dropped: 'offscreen needs a site', allow: false });
  assert.deepEqual(parseHidingLine('a.com#@#.box:cpab-offscreen', true), { dropped: 'offscreen needs a site', allow: true });
  assert.equal(parseHidingLine('a.com##.box:cpab-offscreen:cpab-collapse', true).dropped, 'unsupported :cpab-offscreen');
  assert.equal(parseHidingLine('a.com##body:cpab-offscreen', true).dropped, 'hides the whole page');

  const own = finishCss(readCss(`${line}\na.com##.shut:cpab-collapse\na.com##.plain\n`, { ownFormat: true }), new Set(), new Set());
  const site = own.sites['a.com'];
  assert.match(site, /^\.box\{position:absolute!important;top:-100000px!important;[^}]*\}\.shut\{min-height:0!important;[^}]*\}\.plain\{display:none!important\}$/);
  // The page forces these two back, so the box must never depend on them.
  assert.doesNotMatch(site.match(/^\.box\{[^}]*\}/)[0], /display|clip-path|visibility|height|width/);
  const other = readCss(line);
  assert.deepEqual(other.dropped, { 'unsupported :cpab-offscreen': 1 });
  assert.deepEqual(finishCss(other, new Set(), new Set()).sites, {});
});

test('a :style() body passes only as plain declarations that can\'t fetch or lift anything', () => {
  assert.deepEqual(parseDeclarations('overflow: auto !important;', false), { style: 'overflow:auto!important' });
  assert.deepEqual(parseDeclarations('Height:0!important; width: calc(100% - 2px)', false), { style: 'height:0!important;width:calc(100% - 2px)' });
  assert.deepEqual(parseDeclarations('filter: blur(0) !important; color: #fff', false), { style: 'filter:blur(0)!important;color:#fff' });
  assert.equal(parseDeclarations('background: url(https://x.com/a.png)', false).dropped, 'refused: url(');
  assert.equal(parseDeclarations('background: image-set(a 1x)', false).dropped, 'style: function');
  assert.equal(parseDeclarations('background-image: src(x)', false).dropped, 'style: function');
  assert.equal(parseDeclarations('content: "x"', false).dropped, 'style: invalid character');
  assert.equal(parseDeclarations('background: u\\72l(x)', false).dropped, 'style: invalid character');
  assert.equal(parseDeclarations('--cpab-allow-0123456789ab: 1', false).dropped, 'style: invalid declaration');
  assert.equal(parseDeclarations('color: red} body{display:none', false).dropped, 'refused: brace');
  assert.equal(parseDeclarations('width: calc(1px', false).dropped, 'style: invalid declaration');
  assert.equal(parseDeclarations('width: 1px)', false).dropped, 'style: invalid declaration');
  assert.equal(parseDeclarations('', false).dropped, 'style: invalid declaration');
});

test('on html or body a :style() rule may only give back scrolling', () => {
  assert.deepEqual(parseDeclarations('overflow: visible !important; padding-right: 0 !important', true), { style: 'overflow:visible!important;padding-right:0!important' });
  assert.deepEqual(parseDeclarations('position: static!important; top: auto', true), { style: 'position:static!important;top:auto' });
  for (const body of ['display: none', 'visibility: hidden', 'opacity: 0', 'position: fixed', 'height: 0', 'background-color: inherit', 'overflow: hidden']) {
    assert.equal(parseDeclarations(body, true).dropped, 'style: not allowed on the whole page', body);
  }
});

test('a :style() rule is converted only for a list that asks, only on named sites, never as an exception', () => {
  assert.deepEqual(parseHidingLine('a.com##body:style(overflow: auto !important;)'), { dropped: 'procedural :style', allow: false });
  assert.deepEqual(parseHidingLine('a.com,b.com##html, body:style(overflow: auto !important;)', false, true), {
    allow: false, selector: 'html, body', style: 'overflow:auto!important', included: ['a.com', 'b.com'], excluded: [], partly: false,
  });
  assert.deepEqual(parseHidingLine('##body:style(overflow: auto)', false, true), { dropped: 'style needs a site', allow: false });
  assert.deepEqual(parseHidingLine('a.com#@#body:style(overflow: auto)', false, true), { dropped: 'style exception', allow: true });
  assert.equal(parseHidingLine('a.com##body:style(display: none)', false, true).dropped, 'style: not allowed on the whole page');
  assert.equal(parseHidingLine('a.com##.x:has-text(Ad):style(display: none)', false, true).dropped, 'procedural :has-text');
  assert.equal(parseHidingLine('a.com,~b.a.com##.x:style(display: none)', false, true).dropped, 'style with a site left out');
  assert.equal(parseHidingLine('a.com,~b.com##.x:style(display: none)', false, true).style, 'display:none');
  // A hiding rule in the same list still hides.
  assert.deepEqual(parseHidingLine('a.com##.modal', false, true).selector, '.modal');
});

test('style rules join their sites\' stored CSS after the hiding rules, and $specifichide removes them', () => {
  const text = 'a.com##.modal\na.com##body.locked:style(overflow: auto !important)\nb.com##html:style(overflow-y: visible)\n@@||b.com^$specifichide\n';
  const css = readCss(text, { styles: true });
  const output = finishCss(css, new Set(), exceptedSelectors([css]));
  assert.deepEqual(output.sites, { 'a.com': `.modal${HIDE}body.locked{overflow:auto!important}` });
  assert.equal(output.genericCss, '');
  assert.equal(output.stats.styles, 1);
  assert.match(formatCssReport('List', output), /1 style rules on 1 domains/);
});
