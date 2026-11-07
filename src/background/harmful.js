// SPDX-License-Identifier: GPL-3.0-or-later
// Continue once, asked for by the warning page: a session rule that lets one tab past one warning, and
// keeps it open while that tab stays on the host. It is taken back when the tab commits a page on another
// host or closes. Chrome can stop this worker at any time, so what is pending lives in storage.session,
// and every start of the worker clears what has run out.
import {
  CONTINUE_PREFIX,
  WARNING_PAGE,
  continueRecord,
  continueRule,
  continueRuleId,
  staleContinues,
  staysOnHost,
  webAddress,
} from '../shared/harmful.js';

const pendingKey = (tabId) => `${CONTINUE_PREFIX}${tabId}`;

async function release(tabIds) {
  if (!tabIds.length) return;
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: tabIds.map(continueRuleId) });
  await chrome.storage.session.remove(tabIds.map(pendingKey));
}

async function releaseStale() {
  await release(staleContinues(await chrome.storage.session.get(null), Date.now()));
}

async function releaseTab(tabId) {
  const key = pendingKey(tabId);
  if (key in await chrome.storage.session.get(key)) await release([tabId]);
}

async function leftHost(tabId, address) {
  const key = pendingKey(tabId);
  const { [key]: record } = await chrome.storage.session.get(key);
  if (record !== undefined && !staysOnHost(record, address)) await release([tabId]);
}

// The page navigates itself once this answers, so the warning leaves the tab's history.
async function continueOnce(tabId, address) {
  const url = webAddress(address);
  if (!url) throw new Error('not a web address');
  await releaseStale();
  await chrome.storage.session.set({ [pendingKey(tabId)]: continueRecord(url.hostname, Date.now()) });
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [continueRuleId(tabId)],
    addRules: [continueRule(tabId, url.hostname)],
  });
}

// Only the warning page itself may ask. The log never names the address.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'harmfulContinue') return false;
  const fromWarning = sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(WARNING_PAGE)) && sender.tab?.id >= 0;
  if (!fromWarning) return false;
  continueOnce(sender.tab.id, message.url).then(() => reply({ ok: true }), () => {
    console.error('CPAB could not let a page past its warning');
    reply({ ok: false });
  });
  return true;
});

const onError = () => console.error('CPAB could not take back a Continue once');

// A page prerendered in the background isn't the tab leaving the site.
chrome.webNavigation.onCommitted.addListener(({ tabId, frameId, url, documentLifecycle }) => {
  if (frameId === 0 && documentLifecycle !== 'prerender') leftHost(tabId, url).catch(onError);
}, { url: [{ schemes: ['http', 'https'] }] });

chrome.tabs.onRemoved.addListener((tabId) => releaseTab(tabId).catch(onError));

releaseStale().catch(onError);
