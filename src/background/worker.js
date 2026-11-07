// SPDX-License-Identifier: GPL-3.0-or-later
// Keeps Chrome's rule state in line with the saved settings. Chrome can stop this worker at any time
// and the rules keep working without it, so nothing here lives in memory between events.
import { BADGE_COLORS, BLOCKED_RULE_ID, PAUSED_RULE_ID, blockedRules, pausedRules, wantedRulesets } from '../shared/blocking.js';
import { CSS_INDEX, SEED_KEY, scriptChanges, scriptList, seedEntries, staleKeys, wantedScripts } from '../shared/css.js';
import { loadSettings, onSettingsChange, saveRulesetProblems, updateSettings } from '../shared/settings.js';
import './popups.js';

const dnr = chrome.declarativeNetRequest;

const declaredRulesets = () => chrome.runtime.getManifest().declarative_net_request.rule_resources.map(({ id }) => id);

// One ruleset at a time: Chrome rejects a whole call if any part of it fails, and settings has to
// name the one that was refused.
async function applyRulesets(settings) {
  const wanted = wantedRulesets(settings, declaredRulesets());
  const enabled = await dnr.getEnabledRulesets();
  const problems = {};
  const change = async (id, update) => {
    try {
      await dnr.updateEnabledRulesets(update);
    } catch (error) {
      problems[id] = error.message;
    }
  };
  for (const id of enabled.filter((ruleset) => !wanted.includes(ruleset))) {
    await change(id, { disableRulesetIds: [id] });
  }
  for (const id of wanted.filter((ruleset) => !enabled.includes(ruleset))) {
    await change(id, { enableRulesetIds: [id] });
  }
  return problems;
}

function applySiteRules(settings) {
  return dnr.updateDynamicRules({
    removeRuleIds: [PAUSED_RULE_ID, BLOCKED_RULE_ID],
    addRules: [...pausedRules(settings.pausedSites), ...blockedRules(settings)],
  });
}

async function applyBadge(settings) {
  await chrome.action.setBadgeTextColor({ color: BADGE_COLORS.text });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLORS.background });
  await dnr.setExtensionActionOptions({ displayActionCountAsBadgeText: settings.badge });
}

const packageJson = (path) => fetch(chrome.runtime.getURL(path)).then((response) => response.json());

// Puts this build's site CSS into storage, once. The mark goes in last, so a worker stopped halfway
// starts over at the next event. Reading every key happens only here, on a build it hasn't seeded.
async function seedSiteCss(index, problems) {
  const { [SEED_KEY]: seeded } = await chrome.storage.local.get(SEED_KEY);
  if (seeded === index.seed) return;
  const seeds = await Promise.all(index.lists.map(async ({ id, sites }) => ({ id, entries: seedEntries(id, await packageJson(sites)) })));
  const wanted = new Set(seeds.flatMap(({ entries }) => Object.keys(entries)));
  await chrome.storage.local.remove(staleKeys(Object.keys(await chrome.storage.local.get(null)), wanted));
  for (const { id, entries } of seeds) {
    try {
      await chrome.storage.local.set(entries);
    } catch (error) {
      problems[id] = error.message;
    }
  }
  if (!seeds.some(({ id }) => problems[id])) await chrome.storage.local.set({ [SEED_KEY]: index.seed });
}

// Works from what Chrome has registered, not from what the last run did, so it can run any number of
// times, after an update or a restart. One call per script: Chrome rejects a whole call if any part fails.
async function applyGenericCss(settings, index, problems) {
  const { add, update, remove } = scriptChanges(wantedScripts(settings, index), await chrome.scripting.getRegisteredContentScripts());
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
  await seedSiteCss(index, problems);
  await applyGenericCss(settings, index, problems);
  return problems;
}

async function applyState() {
  const settings = await loadSettings();
  const results = await Promise.allSettled([applyRulesets(settings), applySiteRules(settings), applyBadge(settings), applyCss(settings)]);
  for (const { reason } of results.filter(({ status }) => status === 'rejected')) {
    console.error('CPAB could not apply its settings:', reason.message);
  }
  await saveRulesetProblems(Object.assign({}, ...results.map(({ value }) => value)));
}

// Runs one at a time and always reads the latest settings, so quick changes settle on the last one.
let queue = Promise.resolve();
function scheduleApply() {
  queue = queue.then(applyState).catch((error) => console.error('CPAB could not read its settings:', error.message));
}

// The content script reads settings as stored, so an update has to leave them in today's shape.
chrome.runtime.onInstalled.addListener(() => {
  updateSettings({}).catch((error) => console.error('CPAB could not save its settings:', error.message)).finally(scheduleApply);
});
chrome.runtime.onStartup.addListener(scheduleApply);
onSettingsChange(scheduleApply);
