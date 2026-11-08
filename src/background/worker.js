// SPDX-License-Identifier: GPL-3.0-or-later
// Keeps Chrome's rule state in line with the saved settings. Chrome can stop this worker at any time
// and the rules keep working without it, so nothing here lives in memory between events.
import {
  ALLOWED_RULE_ID,
  BADGE_COLORS,
  BLOCKED_PAGE_RULE_ID,
  BLOCKED_RULE_ID,
  EXCEPTIONS_FILE,
  EXCEPTIONS_RULE_ID,
  PAUSED_RULE_ID,
  allowedRules,
  blockedRules,
  pausedRules,
  wantedRulesets,
} from '../shared/blocking.js';
import { CSS_INDEX, SEED_KEY, scriptChanges, scriptList, seedEntries, siteKey, staleKeys, wantedScripts } from '../shared/css.js';
import { ownBlockedRedirect } from '../shared/harmful.js';
import { loadSettings, onSettingsChange, saveRulesetProblems, updateSettings } from '../shared/settings.js';
import {
  DYNAMIC_APPLIED_KEY,
  SITES_APPLIED_KEY,
  UPDATE_KEY,
  droppedRecord,
  fileKey,
  genericOffOverrides,
  listRules,
  liveSha,
  ruleKind,
} from '../shared/updates.js';
import './dataleak.js';
import './harmful.js';
import './popups.js';
import './stats.js';
import { startUpdates, storedUpdateKeys } from './updates.js';
import './welcome.js';

const dnr = chrome.declarativeNetRequest;

const declaredRulesets = () => chrome.runtime.getManifest().declarative_net_request.rule_resources.map(({ id }) => id);

const storedValue = async (key) => (await chrome.storage.local.get(key))[key];

// Takes one list's update out of use after Chrome refused it: its static ruleset comes back, and
// settings names the list until the next update.
async function dropList(list, reason) {
  const record = await storedValue(UPDATE_KEY);
  if (record?.lists?.[list]) {
    const { [list]: dropped, ...lists } = record.lists;
    await chrome.storage.local.set({ [UPDATE_KEY]: { ...record, lists, problems: { ...record.problems, [list]: reason } } });
    await chrome.storage.local.remove(Object.keys(dropped.files).map((kind) => fileKey(list, kind)));
  }
}

// A new build drops the stored update, so the lists it ships always win at install. The dynamic copies
// go at the next step, because DYNAMIC_APPLIED_KEY still names them.
async function dropUpdateOnNewBuild() {
  const build = chrome.runtime.getManifest().version;
  const record = await storedValue(UPDATE_KEY);
  if (!record || record.build === build) return;
  await chrome.storage.local.remove(await storedUpdateKeys());
  if (Object.keys(await storedValue(SITES_APPLIED_KEY) ?? {}).length) await chrome.storage.local.remove([SEED_KEY, SITES_APPLIED_KEY]);
  await chrome.storage.local.set({ [UPDATE_KEY]: droppedRecord(record, build) });
}

// Each wanted list runs from its static ruleset, or from a dynamic copy when an update changed it. One
// call at a time: Chrome rejects a whole call if any part of it fails, and settings has to name the
// list that was refused. A copy goes in before its static ruleset goes off, and the static ruleset
// comes back before a copy goes, so a list never has a gap.
async function applyRulesets(settings) {
  const wanted = wantedRulesets(settings, declaredRulesets());
  const record = await storedValue(UPDATE_KEY);
  const applied = { ...(await storedValue(DYNAMIC_APPLIED_KEY) ?? {}) };
  const enabled = await dnr.getEnabledRulesets();
  const problems = {};
  const saveApplied = () => chrome.storage.local.set({ [DYNAMIC_APPLIED_KEY]: applied });
  for (const id of new Set([...declaredRulesets(), ...Object.keys(applied)])) {
    const live = wanted.includes(id) ? liveSha(record, id, ruleKind(id)) : null;
    let dynamic = Boolean(live);
    if (live && applied[id]?.sha256 !== live) {
      try {
        const stored = await storedValue(fileKey(id, ruleKind(id)));
        if (stored?.sha256 !== live) throw new Error('the downloaded list is missing');
        const rules = listRules(id, stored.data, chrome.runtime.id);
        const ids = rules.map((rule) => rule.id);
        // The new ids too: a worker stopped before the record below was written left them in place.
        await dnr.updateDynamicRules({ removeRuleIds: [...new Set([...(applied[id]?.ids ?? []), ...ids])], addRules: rules });
        applied[id] = { sha256: live, ids };
        await saveApplied();
      } catch (error) {
        problems[id] = error.message;
        dynamic = false;
        await dropList(id, error.message);
        // Its site CSS, popup and genericOff data went with it, and the next run puts the build's back.
        scheduleApply();
      }
    }
    if (declaredRulesets().includes(id)) {
      const on = wanted.includes(id) && !dynamic;
      if (on !== enabled.includes(id)) {
        try {
          await dnr.updateEnabledRulesets(on ? { enableRulesetIds: [id] } : { disableRulesetIds: [id] });
        } catch (error) {
          problems[id] = error.message;
        }
      }
    }
    if (!dynamic && applied[id]) {
      try {
        await dnr.updateDynamicRules({ removeRuleIds: applied[id].ids });
        delete applied[id];
        await saveApplied();
      } catch (error) {
        problems[id] = error.message;
      }
    }
  }
  return problems;
}

const packageJson = (path) => fetch(chrome.runtime.getURL(path)).then((response) => response.json());

async function applySiteRules(settings) {
  const { domains: exceptions } = await packageJson(EXCEPTIONS_FILE);
  await dnr.updateDynamicRules({
    removeRuleIds: [PAUSED_RULE_ID, BLOCKED_RULE_ID, BLOCKED_PAGE_RULE_ID, ALLOWED_RULE_ID, EXCEPTIONS_RULE_ID],
    addRules: [...pausedRules(settings.pausedSites), ...blockedRules(settings, ownBlockedRedirect(chrome.runtime.id)), ...allowedRules(settings, exceptions)],
  });
}

async function applyBadge(settings) {
  await chrome.action.setBadgeTextColor({ color: BADGE_COLORS.text });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLORS.background });
  await dnr.setExtensionActionOptions({ displayActionCountAsBadgeText: settings.badge });
}

// Puts this build's site CSS into storage, once. The mark goes in last, so a worker stopped halfway
// starts over at the next event. True when it seeded.
async function seedSiteCss(index, problems) {
  const { [SEED_KEY]: seeded } = await chrome.storage.local.get(SEED_KEY);
  if (seeded === index.seed) return false;
  const seeds = await Promise.all(index.lists.map(async ({ id, sites }) => ({ id, entries: seedEntries(id, await packageJson(sites)) })));
  const wanted = new Set(seeds.flatMap(({ entries }) => Object.keys(entries)));
  await chrome.storage.local.remove(staleKeys(await chrome.storage.local.getKeys(), wanted));
  for (const { id, entries } of seeds) {
    try {
      await chrome.storage.local.set(entries);
    } catch (error) {
      problems[id] = error.message;
    }
  }
  if (!seeds.some(({ id }) => problems[id])) await chrome.storage.local.set({ [SEED_KEY]: index.seed });
  return true;
}

async function replaceSiteCss(list, sites) {
  const prefix = siteKey(list, '');
  await chrome.storage.local.remove((await chrome.storage.local.getKeys()).filter((key) => key.startsWith(prefix)));
  await chrome.storage.local.set(seedEntries(list, sites));
}

// An updated list's site CSS replaces the build's for that list; a list whose update went gets the
// build's back. A fresh seed wrote the build's for every list, so then every update goes in again.
async function applyUpdatedSites(index, record, reseeded, problems) {
  const applied = reseeded ? {} : { ...(await storedValue(SITES_APPLIED_KEY) ?? {}) };
  const save = () => chrome.storage.local.set({ [SITES_APPLIED_KEY]: applied });
  if (reseeded) await save();
  for (const { id, sites } of index.lists) {
    const live = liveSha(record, id, 'sites');
    if (live === (applied[id] ?? null)) continue;
    try {
      const stored = live ? await storedValue(fileKey(id, 'sites')) : null;
      if (live && stored?.sha256 !== live) continue;
      await replaceSiteCss(id, live ? stored.data : await packageJson(sites));
      if (live) applied[id] = live;
      else delete applied[id];
      await save();
    } catch (error) {
      problems[id] = error.message;
    }
  }
}

// Works from what Chrome has registered, not from what the last run did, so it can run any number of
// times, after an update or a restart. One call per script: Chrome rejects a whole call if any part fails.
async function applyGenericCss(settings, index, genericOff, problems) {
  const { add, update, remove } = scriptChanges(wantedScripts(settings, index, genericOff), await chrome.scripting.getRegisteredContentScripts());
  const change = async (id, call) => {
    try {
      await call();
    } catch (error) {
      problems[scriptList(id)] = error.message;
    }
  };
  if (remove.length) await chrome.scripting.unregisterContentScripts({ ids: remove });
  for (const script of add) await change(script.id, () => chrome.scripting.registerContentScripts([script]));
  for (const script of update) await change(script.id, () => chrome.scripting.updateContentScripts([script]));
}

async function applyCss(settings) {
  const problems = {};
  const index = await packageJson(CSS_INDEX);
  const record = await storedValue(UPDATE_KEY);
  const reseeded = await seedSiteCss(index, problems);
  await applyUpdatedSites(index, record, reseeded, problems);
  const offKeys = index.lists.filter(({ id }) => liveSha(record, id, 'genericOff')).map(({ id }) => fileKey(id, 'genericOff'));
  const genericOff = genericOffOverrides(record, offKeys.length ? await chrome.storage.local.get(offKeys) : {});
  await applyGenericCss(settings, index, genericOff, problems);
  return problems;
}

async function applyState() {
  await dropUpdateOnNewBuild();
  const settings = await loadSettings();
  const results = await Promise.allSettled([applyRulesets(settings), applySiteRules(settings), applyBadge(settings), applyCss(settings)]);
  for (const { reason } of results.filter(({ status }) => status === 'rejected')) {
    console.error('CPAB could not apply its settings:', reason.message);
  }
  const { problems: refusedUpdates } = await storedValue(UPDATE_KEY) ?? {};
  await saveRulesetProblems(Object.assign({}, refusedUpdates, ...results.map(({ value }) => value)));
}

// Runs one at a time and always reads the latest settings, so quick changes settle on the last one.
// A list update writes through the same queue, so it never lands in the middle of an apply.
let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}
function scheduleApply() {
  serial(applyState).catch((error) => console.error('CPAB could not read its settings:', error.message));
}

// An incognito window runs a second copy of this worker ("incognito": "split", so CPAB's own pages can open
// in incognito tabs). Storage, rules and registered scripts are shared with the regular one, so only the
// regular worker applies settings: two at once would race to register the same scripts.
if (!chrome.extension.inIncognitoContext) {
  // The content script reads settings as stored, so an update has to leave them in today's shape.
  chrome.runtime.onInstalled.addListener(() => {
    updateSettings({}).catch((error) => console.error('CPAB could not save its settings:', error.message)).finally(scheduleApply);
  });
  chrome.runtime.onStartup.addListener(scheduleApply);
  onSettingsChange(scheduleApply);
  startUpdates({ serial, scheduleApply });
}
