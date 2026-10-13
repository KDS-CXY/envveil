import { RULES_STORAGE_KEY, type DomainRule } from './types';

export async function readRules(): Promise<DomainRule[]> {
  const stored = await chrome.storage.local.get(RULES_STORAGE_KEY);
  const rules = stored[RULES_STORAGE_KEY];
  return Array.isArray(rules) ? (rules as DomainRule[]) : [];
}

export async function writeRules(rules: DomainRule[]): Promise<void> {
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: rules });
}
