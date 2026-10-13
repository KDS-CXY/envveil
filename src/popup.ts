import './popup.css';
import {
  DEFAULT_RULE_VALUES,
  findConfiguredRule,
  findMatchingRule,
  getDomainOrigins,
  normalizeDomain,
  type DomainRule,
  type WatermarkMode
} from './types';
import { readRules, writeRules } from './storage';

const elements = {
  activeSite: document.querySelector<HTMLParagraphElement>('#active-site')!,
  addCurrent: document.querySelector<HTMLButtonElement>('#add-current')!,
  domainInput: document.querySelector<HTMLInputElement>('#domain-input')!,
  addDomain: document.querySelector<HTMLButtonElement>('#add-domain')!,
  domainList: document.querySelector<HTMLDivElement>('#domain-list')!,
  editor: document.querySelector<HTMLElement>('#rule-editor')!,
  permissionStatus: document.querySelector<HTMLParagraphElement>('#permission-status')!,
  grantPermission: document.querySelector<HTMLButtonElement>('#grant-permission')!,
  enabled: document.querySelector<HTMLInputElement>('#rule-enabled')!,
  text: document.querySelector<HTMLInputElement>('#watermark-text')!,
  color: document.querySelector<HTMLInputElement>('#watermark-color')!,
  opacity: document.querySelector<HTMLInputElement>('#watermark-opacity')!,
  opacityOutput: document.querySelector<HTMLOutputElement>('#opacity-output')!,
  fixedOptions: document.querySelector<HTMLDivElement>('#fixed-options')!,
  tileOptions: document.querySelector<HTMLDivElement>('#tile-options')!,
  fixedFontSize: document.querySelector<HTMLInputElement>('#fixed-font-size')!,
  fixedMargin: document.querySelector<HTMLInputElement>('#fixed-margin')!,
  tileFontSize: document.querySelector<HTMLInputElement>('#tile-font-size')!,
  tileColumns: document.querySelector<HTMLInputElement>('#tile-columns')!,
  tileRotation: document.querySelector<HTMLInputElement>('#tile-rotation')!,
  tileRowGap: document.querySelector<HTMLInputElement>('#tile-row-gap')!,
  removeRule: document.querySelector<HTMLButtonElement>('#remove-rule')!,
  saveStatus: document.querySelector<HTMLSpanElement>('#save-status')!,
  toast: document.querySelector<HTMLDivElement>('#toast')!
};

let rules: DomainRule[] = [];
let selectedId: string | null = null;
let activeTab: chrome.tabs.Tab | null = null;
let saveTimer: number | undefined;
let toastTimer: number | undefined;

function selectedRule(): DomainRule | undefined {
  return rules.find((rule) => rule.id === selectedId);
}

function toast(message: string): void {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2600);
}

function setNumericInput(input: HTMLInputElement, value: number): void {
  input.value = String(value);
}

async function isPermitted(rule: DomainRule): Promise<boolean> {
  return chrome.permissions.contains({ origins: getDomainOrigins(rule.domain) });
}

function renderDomainList(): void {
  elements.domainList.replaceChildren();
  if (rules.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '还没有网站规则';
    elements.domainList.append(empty);
    return;
  }

  for (const rule of rules) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `domain-item${rule.id === selectedId ? ' selected' : ''}`;
    button.setAttribute('aria-pressed', String(rule.id === selectedId));

    const name = document.createElement('span');
    name.className = 'domain-name';
    name.textContent = rule.domain;
    const state = document.createElement('span');
    state.className = `domain-state${rule.enabled ? ' enabled' : ''}`;
    state.textContent = rule.enabled ? '开启' : '停用';
    button.append(name, state);
    button.addEventListener('click', () => {
      selectedId = rule.id;
      render();
    });
    elements.domainList.append(button);
  }
}

async function renderEditor(): Promise<void> {
  const rule = selectedRule();
  elements.editor.hidden = !rule;
  if (!rule) return;

  elements.enabled.checked = rule.enabled;
  elements.text.value = rule.text;
  elements.color.value = rule.color;
  elements.opacity.value = String(rule.opacity);
  elements.opacityOutput.value = `${rule.opacity}%`;
  setNumericInput(elements.fixedFontSize, rule.fixedFontSize);
  setNumericInput(elements.fixedMargin, rule.fixedMargin);
  setNumericInput(elements.tileFontSize, rule.tileFontSize);
  setNumericInput(elements.tileColumns, rule.tileColumns);
  setNumericInput(elements.tileRotation, rule.tileRotation);
  setNumericInput(elements.tileRowGap, rule.tileRowGap);
  document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((input) => {
    input.checked = input.value === rule.mode;
  });
  elements.fixedOptions.hidden = rule.mode === 'tile';
  elements.tileOptions.hidden = rule.mode !== 'tile';

  const permitted = await isPermitted(rule);
  elements.grantPermission.hidden = permitted;
  elements.permissionStatus.textContent = permitted
    ? `已授权 · ${rule.domain} 及其子域名`
    : `尚未授权 · ${rule.domain} 及其子域名`;
  elements.permissionStatus.classList.toggle('permission-missing', !permitted);
  elements.saveStatus.textContent = '';
}

function renderCurrentSite(): void {
  let hostname: string | null = null;
  if (activeTab?.url) {
    try {
      const url = new URL(activeTab.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') hostname = url.hostname;
    } catch {
      hostname = null;
    }
  }

  if (!hostname) {
    elements.activeSite.textContent = '此页面不支持水印';
    elements.addCurrent.disabled = true;
    return;
  }

  elements.activeSite.textContent = `当前网站：${hostname}`;
  elements.addCurrent.disabled = false;
  const currentRule = findConfiguredRule(rules, hostname);
  elements.addCurrent.textContent = currentRule ? '查看当前规则' : '添加当前网站';
}

async function render(): Promise<void> {
  renderCurrentSite();
  renderDomainList();
  await renderEditor();
}

async function saveRule(rule: DomainRule): Promise<void> {
  rules = rules.map((item) => (item.id === rule.id ? { ...rule } : item));
  await writeRules(rules);
  elements.saveStatus.textContent = '已保存';
  renderDomainList();
  renderCurrentSite();
}

function readBoundedNumber(input: HTMLInputElement, min: number, max: number, fallback: number): number {
  const value = Number(input.value);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readRuleFromForm(rule: DomainRule): DomainRule {
  const checkedMode = document.querySelector<HTMLInputElement>('input[name="mode"]:checked');
  return {
    ...rule,
    enabled: elements.enabled.checked,
    text: elements.text.value.slice(0, 80),
    mode: (checkedMode?.value as WatermarkMode | undefined) ?? rule.mode,
    color: elements.color.value,
    opacity: readBoundedNumber(elements.opacity, 5, 100, rule.opacity),
    fixedFontSize: readBoundedNumber(elements.fixedFontSize, 8, 96, rule.fixedFontSize),
    fixedMargin: readBoundedNumber(elements.fixedMargin, 0, 240, rule.fixedMargin),
    tileFontSize: readBoundedNumber(elements.tileFontSize, 8, 96, rule.tileFontSize),
    tileColumns: Math.round(readBoundedNumber(elements.tileColumns, 1, 12, rule.tileColumns)),
    tileRotation: readBoundedNumber(elements.tileRotation, -90, 90, rule.tileRotation),
    tileRowGap: readBoundedNumber(elements.tileRowGap, 0, 600, rule.tileRowGap)
  };
}

function scheduleSave(): void {
  const rule = selectedRule();
  if (!rule) return;
  const nextRule = readRuleFromForm(rule);
  elements.opacityOutput.value = `${nextRule.opacity}%`;
  elements.fixedFontSize.value = String(nextRule.fixedFontSize);
  elements.fixedMargin.value = String(nextRule.fixedMargin);
  elements.tileFontSize.value = String(nextRule.tileFontSize);
  elements.tileColumns.value = String(nextRule.tileColumns);
  elements.tileRotation.value = String(nextRule.tileRotation);
  elements.tileRowGap.value = String(nextRule.tileRowGap);
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void saveRule(nextRule).catch(() => {
      elements.saveStatus.textContent = '保存失败';
    });
  }, 120);
}

async function injectCurrentTab(): Promise<void> {
  if (!activeTab?.id || !activeTab.url) return;
  try {
    const url = new URL(activeTab.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    const rule = findMatchingRule(rules, url.hostname);
    if (!rule || !(await isPermitted(rule))) return;
    try {
      await chrome.tabs.sendMessage(activeTab.id, { type: 'refresh-rule' });
      return;
    } catch {
      // 当前标签页还没有内容脚本时，执行首次注入。
    }
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['content.js']
    });
  } catch (error) {
    console.warn('Could not update the active page', error);
  }
}

async function createRule(input: string): Promise<void> {
  let domain: string;
  try {
    domain = normalizeDomain(input);
  } catch (error) {
    toast(error instanceof Error ? error.message : '域名无效');
    return;
  }

  const existing = rules.find((rule) => rule.domain === domain);
  if (existing) {
    selectedId = existing.id;
    await render();
    toast('该域名已有规则');
    return;
  }

  let permitted = false;
  try {
    permitted = await chrome.permissions.request({ origins: getDomainOrigins(domain) });
  } catch {
    permitted = false;
  }

  const rule: DomainRule = {
    id: crypto.randomUUID(),
    domain,
    ...DEFAULT_RULE_VALUES
  };
  rules = [...rules, rule];
  selectedId = rule.id;
  await writeRules(rules);
  elements.domainInput.value = '';
  await render();
  if (permitted) {
    await injectCurrentTab();
    toast('规则已添加并授权');
  } else {
    toast('规则已保存；授权后才会在网页中显示');
  }
}

async function requestRulePermission(): Promise<void> {
  const rule = selectedRule();
  if (!rule) return;
  try {
    const granted = await chrome.permissions.request({ origins: getDomainOrigins(rule.domain) });
    if (!granted) {
      toast('未获得网站权限');
      return;
    }
    await renderEditor();
    await injectCurrentTab();
    toast('网站权限已授予');
  } catch {
    toast('无法申请网站权限');
  }
}

async function removeSelectedRule(): Promise<void> {
  const rule = selectedRule();
  if (!rule) return;
  rules = rules.filter((item) => item.id !== rule.id);
  selectedId = null;
  await writeRules(rules);
  await render();
  toast(`已删除 ${rule.domain}`);
}

elements.addCurrent.addEventListener('click', () => {
  if (!activeTab?.url) return;
  try {
    const url = new URL(activeTab.url);
    const existingRule = findConfiguredRule(rules, url.hostname);
    if (existingRule) {
      selectedId = existingRule.id;
      void render();
    } else {
      void createRule(url.hostname);
    }
  } catch {
    toast('当前页面不支持水印');
  }
});

elements.addDomain.addEventListener('click', () => void createRule(elements.domainInput.value));
elements.domainInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') void createRule(elements.domainInput.value);
});
elements.grantPermission.addEventListener('click', () => void requestRulePermission());
elements.removeRule.addEventListener('click', () => void removeSelectedRule());

const formInputs = [
  elements.enabled,
  elements.text,
  elements.color,
  elements.opacity,
  elements.fixedFontSize,
  elements.fixedMargin,
  elements.tileFontSize,
  elements.tileColumns,
  elements.tileRotation,
  elements.tileRowGap
];
for (const input of formInputs) {
  input.addEventListener(input.type === 'range' || input.type === 'color' ? 'input' : 'change', () => {
    const rule = selectedRule();
    if (rule) {
      const nextRule = readRuleFromForm(rule);
      elements.fixedOptions.hidden = nextRule.mode === 'tile';
      elements.tileOptions.hidden = nextRule.mode !== 'tile';
    }
    scheduleSave();
  });
  if (input.type === 'text' || input.type === 'number') input.addEventListener('input', scheduleSave);
}

document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((input) => {
  input.addEventListener('change', () => {
    elements.fixedOptions.hidden = input.value === 'tile';
    elements.tileOptions.hidden = input.value !== 'tile';
    scheduleSave();
  });
});

async function initialize(): Promise<void> {
  [rules, activeTab] = await Promise.all([
    readRules(),
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0] ?? null)
  ]);
  const hostname = activeTab?.url ? new URL(activeTab.url).hostname : null;
  selectedId = hostname ? findMatchingRule(rules, hostname)?.id ?? null : null;
  if (hostname) elements.domainInput.value = hostname;
  await render();
}

void initialize().catch(() => toast('Envveil 初始化失败'));
