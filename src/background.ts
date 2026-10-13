import { getDomainOrigins, RULES_STORAGE_KEY, type DomainRule } from './types';
import { readRules } from './storage';

const SCRIPT_PREFIX = 'envveil-rule-';
let syncQueue: Promise<void> = Promise.resolve();

async function hasRulePermission(domain: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: getDomainOrigins(domain) });
}

async function syncRegisteredScripts(): Promise<void> {
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const envveilScripts = registered.filter((script) => script.id.startsWith(SCRIPT_PREFIX));
  const rules = await readRules();
  const permittedRules = await Promise.all(
    rules
      .filter((rule) => rule.enabled)
      .map(async (rule) => ({ rule, permitted: await hasRulePermission(rule.domain) }))
  );
  const desiredRules = permittedRules.filter((item) => item.permitted).map((item) => item.rule);
  const desiredById = new Map(desiredRules.map((rule) => [`${SCRIPT_PREFIX}${rule.id}`, rule]));
  const registeredById = new Map(envveilScripts.map((script) => [script.id, script]));

  const staleIds = envveilScripts
    .filter((script) => {
      const rule = desiredById.get(script.id);
      return !rule || JSON.stringify(script.matches) !== JSON.stringify(getDomainOrigins(rule.domain));
    })
    .map((script) => script.id);

  if (staleIds.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: staleIds });
  }

  for (const rule of desiredRules) {
    const id = `${SCRIPT_PREFIX}${rule.id}`;
    const current = registeredById.get(id);
    const currentMatchesDesired = current && !staleIds.includes(id);
    if (currentMatchesDesired) continue;
    try {
      await chrome.scripting.registerContentScripts([
        {
          id,
          matches: getDomainOrigins(rule.domain),
          js: ['content.js'],
          runAt: 'document_start',
          allFrames: false,
          persistAcrossSessions: true
        }
      ]);
    } catch (error) {
      console.error(`Unable to register Envveil rule for ${rule.domain}`, error);
    }
  }
}

function scheduleScriptSync(): void {
  syncQueue = syncQueue.then(syncRegisteredScripts).catch((error) => {
    console.error('Unable to synchronize Envveil content scripts', error);
  });
}

async function refreshTabsAfterPermissionRemoval(removedOrigins: string[]): Promise<void> {
  if (removedOrigins.length === 0) return;

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      void chrome.tabs.sendMessage(tab.id, { type: 'permissions-changed', origins: removedOrigins }).catch(() => undefined);
    }
  }
}

async function getPermittedRule(urlValue?: string): Promise<DomainRule | null> {
  if (!urlValue) return null;
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const rules = (await readRules())
    .filter((rule) => {
      if (!rule.enabled) return false;
      const domain = rule.domain.toLowerCase().replace(/\.$/, '');
      const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
      return hostname === domain || hostname.endsWith(`.${domain}`);
    })
    .sort((left, right) => right.domain.length - left.domain.length);

  for (const rule of rules) {
    if (await hasRulePermission(rule.domain)) return rule;
  }
  return null;
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleScriptSync();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleScriptSync();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[RULES_STORAGE_KEY]) {
    scheduleScriptSync();
  }
});

chrome.permissions.onRemoved.addListener((permissions) => {
  void refreshTabsAfterPermissionRemoval(permissions.origins ?? []);
  scheduleScriptSync();
});

chrome.permissions.onAdded.addListener(() => {
  scheduleScriptSync();
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0) return;
  void chrome.tabs.sendMessage(details.tabId, { type: 'route-changed' }).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message: { type?: string }, sender, sendResponse) => {
  if (message.type === 'resolve-current-rule') {
    void getPermittedRule(sender.url)
      .then((rule) => sendResponse({ rule }))
      .catch(() => sendResponse({ rule: null }));
    return true;
  }
  return false;
});
