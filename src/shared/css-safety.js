// SPDX-License-Identifier: GPL-3.0-or-later
// The checks every CSS selector and :style() declaration passes before it goes into a stylesheet. Shared
// by the converter and by the check on published list data, so both refuse the same things.

// Text that could end a rule, open another, or bring in something from outside. Refused wherever it
// sits, even inside a quoted attribute value: no selector worth keeping needs it.
export const FORBIDDEN = [
  [/[{}]/, 'refused: brace'],
  [/@/, 'refused: @'],
  [/url\(/i, 'refused: url('],
  [/expression\(/i, 'refused: expression('],
  [/\/\*|\*\//, 'refused: comment'],
  [/<!--|-->/, 'refused: comment'],
  // eslint-disable-next-line no-control-regex
  [/[\x00-\x1f\x7f]/, 'refused: control character'],
];

// What Chrome takes as plain CSS. Anything else after a colon voids the rule, so it never ships.
const PSEUDO_CLASSES = new Set([
  'active', 'any-link', 'checked', 'default', 'defined', 'disabled', 'empty', 'enabled', 'first-child', 'first-of-type',
  'focus', 'focus-visible', 'focus-within', 'has', 'hover', 'in-range', 'indeterminate', 'invalid', 'is', 'lang',
  'last-child', 'last-of-type', 'link', 'not', 'nth-child', 'nth-last-child', 'nth-last-of-type', 'nth-of-type',
  'only-child', 'only-of-type', 'optional', 'out-of-range', 'placeholder-shown', 'read-only', 'read-write', 'required',
  'root', 'target', 'valid', 'visited', 'where',
]);
const PSEUDO_ELEMENTS = new Set(['after', 'before', 'first-letter', 'first-line', 'marker', 'placeholder', 'selection']);

// Run by an ad blocker's own engine, so they mean nothing to Chrome's CSS parser.
const PROCEDURAL = new Set([
  'contains', 'has-text', 'if', 'if-not', 'matches-attr', 'matches-css', 'matches-css-after', 'matches-css-before',
  'matches-media', 'matches-path', 'matches-prop', 'min-text-length', 'nth-ancestor', 'others', 'remove', 'remove-attr',
  'remove-class', 'style', 'upward', 'watch-attr', 'watch-attrs', 'xpath',
]);

// selector:style(declarations), only from a list whose config sets cssStyles. Declarations are checked
// as strictly as selectors: no strings, escapes or url(), so nothing can make a request, and no custom
// properties, so a rule can't set the --cpab-allow-* names that lift another list's hiding.
const STYLE_CHARACTERS = /^[\w\s.,%#!+*/():;-]*$/;
const DECLARATION = /^(-?[a-z][a-z-]*)\s*:\s*([^:!]+?)\s*(!\s*important)?$/i;
const STYLE_FUNCTIONS = new Set(['calc', 'min', 'max', 'clamp', 'rgb', 'rgba', 'hsl', 'hsla', 'blur']);
// On html or body a style rule may only give the page back its scrolling and its place: nothing that
// could blank or cover it.
const LENGTH = /^(?:0|auto|-?\d*\.?\d+(?:px|em|rem|%|vh|vw))$/i;
const UNLOCK = new Map([
  ['overflow', /^(?:auto|visible|scroll|unset|initial)$/i],
  ['overflow-x', /^(?:auto|visible|scroll|unset|initial)$/i],
  ['overflow-y', /^(?:auto|visible|scroll|unset|initial)$/i],
  ['position', /^(?:static|relative|unset|initial|inherit)$/i],
  ['top', LENGTH],
  ['padding-right', LENGTH],
  ['padding-top', LENGTH],
  ['margin-right', LENGTH],
  ['margin-top', LENGTH],
  ['height', /^auto$/i],
  ['width', /^auto$/i],
  ['touch-action', /^(?:auto|unset)$/i],
  ['pointer-events', /^auto$/i],
]);

// Hiding one of these blanks the whole page.
const WHOLE_PAGE = /^(?:\*|html|body|:root)$/i;

const ALLOWED_OUTSIDE_ATTRIBUTES = /[\w\s.#*>+~,:()|\u0080-￿-]/;

// The next character past an escape, a string or a bracket pair, or the reason there isn't one.
function skipString(selector, start) {
  const quote = selector[start];
  for (let at = start + 1; at < selector.length; at += 1) {
    if (selector[at] === '\\') at += 1;
    else if (selector[at] === quote) return at;
  }
  return -1;
}

function pseudoProblem(selector, at) {
  const [, colons, rawName] = selector.slice(at).match(/^(::?)(-?[a-zA-Z][\w-]*)/) ?? [];
  if (!rawName) return 'invalid selector';
  const name = rawName.toLowerCase();
  if (PROCEDURAL.has(name) || name.startsWith('-abp-')) return `procedural :${name}`;
  if (colons === '::' ? PSEUDO_ELEMENTS.has(name) : PSEUDO_CLASSES.has(name) || PSEUDO_ELEMENTS.has(name)) return null;
  return `unsupported :${name}`;
}

// Walks a selector once, skipping what can't hold structure. An unclosed quote, bracket or trailing
// backslash would swallow the rules after it, not only this one.
function structureProblem(selector) {
  const closers = [];
  const hasDepths = [];
  for (let at = 0; at < selector.length; at += 1) {
    const character = selector[at];
    const inAttribute = closers.at(-1) === ']';
    if (character === '\\') {
      at += 1;
      if (at >= selector.length) return 'unbalanced selector';
    } else if (character === '"' || character === "'") {
      at = skipString(selector, at);
      if (at < 0) return 'unbalanced selector';
    } else if (character === '[' || character === '(') {
      closers.push(character === '[' ? ']' : ')');
    } else if (character === ']' || character === ')') {
      if (closers.pop() !== character) return 'unbalanced selector';
      if (hasDepths.at(-1) > closers.length) hasDepths.pop();
    } else if (inAttribute) {
      continue;
    } else if (character === ':') {
      const problem = pseudoProblem(selector, at);
      if (problem) return problem;
      if (/^:has\(/i.test(selector.slice(at, at + 5))) {
        if (hasDepths.length) return 'nested :has()';
        hasDepths.push(closers.length + 1);
      }
      if (selector[at + 1] === ':') at += 1;
    } else if (!ALLOWED_OUTSIDE_ATTRIBUTES.test(character)) {
      return 'invalid character';
    }
  }
  return closers.length ? 'unbalanced selector' : null;
}

// Why a selector can't go into a stylesheet, or null.
export function selectorProblem(selector) {
  if (!selector) return 'invalid selector';
  for (const [pattern, reason] of FORBIDDEN) {
    if (pattern.test(selector)) return reason;
  }
  const problem = structureProblem(selector);
  if (problem) return problem;
  if (/^[>+~,]|[>+~,]$/.test(selector)) return 'invalid selector';
  // The commas that matter are the top-level ones: :not(html,body) narrows a rule.
  const top = selector.replace(/\([^()]*\)/g, '');
  if (top.split(',').some((part) => WHOLE_PAGE.test(part.trim()))) return 'hides the whole page';
  return null;
}

// Why a :style() body can't go into a stylesheet, or its declarations rewritten in one plain form.
export function parseDeclarations(text, wholePage) {
  for (const [pattern, reason] of FORBIDDEN) {
    if (pattern.test(text)) return { dropped: reason };
  }
  if (!STYLE_CHARACTERS.test(text)) return { dropped: 'style: invalid character' };
  const declarations = [];
  for (const part of text.split(';').map((entry) => entry.trim()).filter(Boolean)) {
    const [, rawProperty, value, important] = part.match(DECLARATION) ?? [];
    if (!rawProperty) return { dropped: 'style: invalid declaration' };
    const property = rawProperty.toLowerCase();
    let depth = 0;
    for (const [, name, close] of value.matchAll(/([a-z-]*)\(|(\))/gi)) {
      if (close) depth -= 1;
      else if (STYLE_FUNCTIONS.has(name.toLowerCase())) depth += 1;
      else return { dropped: 'style: function' };
      if (depth < 0) return { dropped: 'style: invalid declaration' };
    }
    if (depth) return { dropped: 'style: invalid declaration' };
    if (wholePage && !UNLOCK.get(property)?.test(value)) return { dropped: 'style: not allowed on the whole page' };
    declarations.push(`${property}:${value}${important ? '!important' : ''}`);
  }
  if (!declarations.length) return { dropped: 'style: invalid declaration' };
  return { style: declarations.join(';') };
}
