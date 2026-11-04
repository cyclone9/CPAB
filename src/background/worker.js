// SPDX-License-Identifier: GPL-3.0-or-later
// Keeps Chrome's rule state in line with the saved settings. Chrome can stop this worker at any time
// and the rules keep working without it, so nothing here lives in memory between events.
import { BADGE_COLORS, BLOCKED_RULE_ID, PAUSED_RULE_ID, blockedRules, pausedRules, wantedRulesets } from '../shared/blocking.js';
import { loadSettings, onSettingsChange, saveRulesetProblems } from '../shared/settings.js';

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
  await saveRulesetProblems(problems);
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

async function applyState() {
  const settings = await loadSettings();
  const results = await Promise.allSettled([applyRulesets(settings), applySiteRules(settings), applyBadge(settings)]);
  for (const { reason } of results.filter(({ status }) => status === 'rejected')) {
    console.error('CPAB could not apply its settings:', reason.message);
  }
}

// Runs one at a time and always reads the latest settings, so quick changes settle on the last one.
let queue = Promise.resolve();
function scheduleApply() {
  queue = queue.then(applyState).catch((error) => console.error('CPAB could not read its settings:', error.message));
}

chrome.runtime.onInstalled.addListener(scheduleApply);
chrome.runtime.onStartup.addListener(scheduleApply);
onSettingsChange(scheduleApply);
