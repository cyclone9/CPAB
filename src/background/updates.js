// SPDX-License-Identifier: GPL-3.0-or-later
// Daily list updates (F22, F23). Once a day this fetches version.json and its signature from
// cpab.cyclone9.dev, checks the signature, the schema and every file's hash, and keeps the lists that
// changed in storage.local. worker.js applies them. Data only: nothing fetched ever runs.
//
// Which files are fetched depends on what the server changed, never on the person's switches, so the
// requests can't tell anyone which lists are on. Adult sites included (privacy.md).
import { loadSettings, onSettingsChange } from '../shared/settings.js';
import { LIMITS, checkFile, checkTotals, checkVersion } from '../shared/update-schema.js';
import { UPDATE_BASE, UPDATE_PUBLIC_KEY } from '../shared/update-source.js';
import {
  ALARM,
  CHECK_NOW_EVERY_MS,
  DAY_MINUTES,
  FETCH_TIMEOUT_MS,
  RETRY_ALARM,
  STARTUP_CHECK_AFTER_MS,
  UPDATE_KEY,
  compareGenerated,
  fileKey,
  fitsDynamicRules,
  isFileKey,
  retryDelay,
  wantedFiles,
} from '../shared/updates.js';

const SUMMARY = 'rules/summary.json';
const HEARTBEAT_KEY = 'updateHeartbeat';

// A failure to reach the server: tried again later. Anything else that stops a check is a refusal.
class Offline extends Error {}
class Refused extends Error {}

const build = () => chrome.runtime.getManifest().version;
const declaredRulesets = () => chrome.runtime.getManifest().declarative_net_request.rule_resources.map(({ id }) => id);
const packageJson = (path) => fetch(chrome.runtime.getURL(path)).then((response) => response.json());

export async function loadRecord() {
  const { [UPDATE_KEY]: record } = await chrome.storage.local.get(UPDATE_KEY);
  return record && typeof record === 'object' ? record : null;
}

const saveRecord = (record) => chrome.storage.local.set({ [UPDATE_KEY]: record });

// The body, read up to `limit` bytes and no further.
async function readLimited(response, limit) {
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new Refused('a file is longer than version.json says');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

// A plain GET that carries nothing about the person: no cookies, no referrer, no query, no header of
// its own, and no cached copy.
async function get(path, limit) {
  let response;
  try {
    response = await fetch(new URL(path, UPDATE_BASE).href, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new Offline('no connection');
  }
  if (!response.ok) throw new Offline(`HTTP ${response.status}`);
  if (!response.url.startsWith(UPDATE_BASE)) throw new Refused('served from another address');
  try {
    return await readLimited(response, limit);
  } catch (error) {
    if (error instanceof Refused) throw error;
    throw new Offline('the download stopped');
  }
}

const bytesFromBase64 = (text) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

async function verifySignature(versionBytes, signatureText) {
  let signature;
  try {
    signature = bytesFromBase64(signatureText.trim());
  } catch {
    return false;
  }
  if (signature.length !== 64) return false;
  const key = await crypto.subtle.importKey('raw', bytesFromBase64(UPDATE_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'Ed25519' }, key, signature, versionBytes);
}

const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes) => hex(await crypto.subtle.digest('SHA-256', bytes));

function utf8(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Refused('not UTF-8 text');
  }
}

// An API call resets the worker's idle timer, so a long download isn't cut off halfway.
const heartbeat = () => chrome.storage.session.set({ [HEARTBEAT_KEY]: Date.now() });

// One file, checked against what the signed version.json says about it.
async function fetchFile(list, kind, file) {
  const bytes = await get(file.path, Math.min(file.bytes, LIMITS.fileBytes));
  await heartbeat();
  if (bytes.length !== file.bytes || await sha256(bytes) !== file.sha256) throw new Refused(`${list} ${kind}: the file differs from version.json`);
  const text = utf8(bytes);
  const { problems, count } = checkFile(kind, text);
  if (problems.length) throw new Refused(`${list} ${kind}: ${problems[0]}`);
  if ('count' in file && count !== file.count) throw new Refused(`${list} ${kind}: holds ${count}, version.json says ${file.count}`);
  return { kind, bytes: bytes.length, count: count ?? 0, data: JSON.parse(text) };
}

async function storedSha(list, kind) {
  const key = fileKey(list, kind);
  const { [key]: stored } = await chrome.storage.local.get(key);
  return stored?.sha256 ?? null;
}

// Everything that can refuse happens here, before anything is written.
async function download(record) {
  const signature = utf8(await get('version.sig', 1024));
  const versionBytes = await get('version.json', LIMITS.versionBytes);
  if (!await verifySignature(versionBytes, signature)) throw new Refused('the signature does not match');
  const { problems, version } = checkVersion(utf8(versionBytes));
  if (!version) throw new Refused(problems[0] ?? 'version.json fails its check');

  const order = compareGenerated(version.generated, record);
  if (order === 'older') throw new Refused('older than the data in use');
  if (order === 'same') return { version, same: true };

  const summary = await packageJson(SUMMARY);
  const wanted = wantedFiles(version, summary, declaredRulesets());
  if (wanted.problems.length) throw new Refused(wanted.problems[0]);
  if (!fitsDynamicRules(wanted.lists, chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES)) throw new Refused('the lists would not fit in Chrome\'s dynamic rules');

  const fetched = {};
  const described = [];
  for (const [list, { files }] of Object.entries(wanted.lists)) {
    for (const [kind, file] of Object.entries(files)) {
      described.push({ kind, bytes: file.bytes, count: file.count ?? 0 });
      const known = record?.lists?.[list]?.files?.[kind]?.sha256 === file.sha256 || await storedSha(list, kind) === file.sha256;
      if (known) continue;
      fetched[fileKey(list, kind)] = { sha256: file.sha256, ...(await fetchFile(list, kind, file)) };
    }
  }
  const totals = checkTotals(described);
  if (totals.problems.length) throw new Refused(totals.problems[0]);
  return { version, lists: wanted.lists, fetched };
}

function finished(record, patch) {
  return { ...record, build: build(), checkedAt: Date.now(), ...patch };
}

// Runs the steps that write through `serial`, the worker's queue, so a check and an apply never
// interleave. Returns the status it left.
async function check({ serial, scheduleApply }) {
  const settings = await loadSettings();
  if (!settings.updates) return 'off';
  const before = await loadRecord();
  try {
    const result = await download(before);
    await serial(async () => {
      const record = await loadRecord();
      const common = { status: 'ok', error: null, retries: 0, okAt: Date.now(), extension: result.version.extension?.version ?? null };
      if (result.same) {
        await saveRecord(finished(record, common));
        return;
      }
      // Files first, then the record that names them, then whatever the record no longer names.
      for (const [key, value] of Object.entries(result.fetched)) await chrome.storage.local.set({ [key]: value });
      const lists = Object.fromEntries(Object.entries(result.lists).map(([list, { snapshot, files }]) => [list, {
        snapshot,
        files: Object.fromEntries(Object.entries(files).map(([kind, { sha256: hash, bytes, count }]) => [kind, { sha256: hash, bytes, count: count ?? null }])),
      }]));
      await saveRecord(finished(record, {
        ...common,
        generated: result.version.generated,
        problems: {},
        floor: [record?.floor, result.version.generated].filter(Boolean).sort().at(-1),
        source: result.version.source,
        lists,
      }));
      const keep = new Set(Object.entries(lists).flatMap(([list, { files }]) => Object.keys(files).map((kind) => fileKey(list, kind))));
      const stale = (await chrome.storage.local.getKeys()).filter((key) => isFileKey(key) && !keep.has(key));
      if (stale.length) await chrome.storage.local.remove(stale);
    });
    await chrome.alarms.clear(RETRY_ALARM);
    if (!result.same) scheduleApply();
    return 'ok';
  } catch (error) {
    if (!(error instanceof Offline) && !(error instanceof Refused)) throw error;
    const offline = error instanceof Offline;
    let retries = 0;
    await serial(async () => {
      const record = await loadRecord();
      retries = offline ? (record?.retries ?? 0) : 0;
      await saveRecord(finished(record, { status: offline ? 'offline' : 'refused', error: error.message, retries: offline ? retries + 1 : 0 }));
    });
    // A bad signature won't fix itself, so a refusal waits for the daily alarm.
    const delay = offline ? retryDelay(retries) : null;
    if (delay) await chrome.alarms.create(RETRY_ALARM, { delayInMinutes: delay });
    else await chrome.alarms.clear(RETRY_ALARM);
    return offline ? 'offline' : 'refused';
  }
}

async function scheduleDaily(delayInMinutes) {
  await chrome.alarms.create(ALARM, { delayInMinutes, periodInMinutes: DAY_MINUTES });
}

// The first check after an install or a new build lands somewhere in the next hour, which spreads the
// requests over the day.
const firstDelay = () => 1 + Math.floor(Math.random() * 61);

// Registers the listeners. The regular worker only: the incognito one shares storage and rules with it.
export function startUpdates({ serial, scheduleApply }) {
  let running = null;
  const run = () => {
    running ??= check({ serial, scheduleApply }).catch((error) => {
      console.error('CPAB could not check for list updates:', error.message);
      return 'refused';
    }).finally(() => {
      running = null;
    });
    return running;
  };

  chrome.runtime.onInstalled.addListener(() => {
    loadSettings().then((settings) => (settings.updates ? scheduleDaily(firstDelay()) : chrome.alarms.clearAll()))
      .catch((error) => console.error('CPAB could not schedule list updates:', error.message));
  });

  // Chrome may drop alarms at a restart, and a browser that was closed when one was due checks now.
  chrome.runtime.onStartup.addListener(async () => {
    const [settings, record, alarm] = await Promise.all([loadSettings(), loadRecord(), chrome.alarms.get(ALARM)]);
    if (!settings.updates) return;
    if (!alarm) await scheduleDaily(firstDelay());
    if (!record?.checkedAt || Date.now() - record.checkedAt > STARTUP_CHECK_AFTER_MS) run();
  });

  chrome.alarms.onAlarm.addListener(({ name }) => {
    if (name === ALARM || name === RETRY_ALARM) run();
  });

  // Off means no request of any kind; what was downloaded stays in use.
  onSettingsChange((next, previous) => {
    if (next.updates === previous.updates) return;
    const change = next.updates
      ? scheduleDaily(1)
      : chrome.alarms.clearAll().then(() => serial(async () => saveRecord({ ...(await loadRecord()), build: build(), status: 'off', retries: 0 })));
    change.catch((error) => console.error('CPAB could not change list updates:', error.message));
  });

  // Check now in Settings, at most once in ten minutes.
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type !== 'updateCheck') return false;
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('settings/'))) return false;
    (async () => {
      const settings = await loadSettings();
      if (!settings.updates) return { status: 'off' };
      let allowed = false;
      await serial(async () => {
        const record = await loadRecord();
        if (record?.manualAt && Date.now() - record.manualAt < CHECK_NOW_EVERY_MS) return;
        allowed = true;
        await saveRecord({ ...record, manualAt: Date.now() });
      });
      if (!allowed) return { status: 'wait' };
      return { status: await run() };
    })().then(reply, () => reply({ status: 'refused' }));
    return true;
  });
}

// Everything an update stored. The worker calls this for a new build, so bundled data always wins at
// install; the next check brings back only lists newer than the build.
export async function storedUpdateKeys() {
  return (await chrome.storage.local.getKeys()).filter(isFileKey);
}
