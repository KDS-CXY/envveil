(function envveilContent(): void {
const envveilWindow = window as Window & { __envveilContentActive?: boolean };
if (envveilWindow.__envveilContentActive) return;
envveilWindow.__envveilContentActive = true;

interface Rule {
  id: string;
  domain: string;
  enabled: boolean;
  text: string;
  mode: 'tile' | 'top-center' | 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left' | 'bottom-center';
  color: string;
  opacity: number;
  fixedFontSize: number;
  fixedMargin: number;
  tileFontSize: number;
  tileColumns: number;
  tileRotation: number;
  tileRowGap: number;
}

const ROOT_ID = 'envveil-watermark-root';
const STYLE_TEXT = `
  :host {
    all: initial !important;
    position: fixed !important;
    inset: 0 !important;
    z-index: 2147483647 !important;
    display: block !important;
    width: 100vw !important;
    height: 100vh !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    pointer-events: none !important;
    overflow: hidden !important;
    contain: strict !important;
    font-family: Arial, "Microsoft YaHei", sans-serif !important;
  }
  .layer {
    position: absolute;
    inset: 0;
    display: flex;
    box-sizing: border-box;
    color: var(--wm-color);
    opacity: var(--wm-opacity);
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, .14);
    font-weight: 600;
    line-height: 1.2;
  }
  .label {
    max-width: 92vw;
    overflow-wrap: anywhere;
    text-align: center;
  }
  .top-center { justify-content: center; align-items: flex-start; padding: var(--wm-margin) 4vw 0; }
  .top-right { justify-content: flex-end; align-items: flex-start; padding: var(--wm-margin); }
  .bottom-right { justify-content: flex-end; align-items: flex-end; padding: var(--wm-margin); }
  .bottom-left { justify-content: flex-start; align-items: flex-end; padding: var(--wm-margin); }
  .top-left { justify-content: flex-start; align-items: flex-start; padding: var(--wm-margin); }
  .bottom-center { justify-content: center; align-items: flex-end; padding: 0 4vw var(--wm-margin); }
  .tile {
    display: grid;
    width: 100%;
    height: 100%;
    grid-template-columns: repeat(var(--wm-columns), minmax(0, 1fr));
    grid-template-rows: repeat(var(--wm-rows), minmax(0, 1fr));
    align-items: center;
    justify-items: center;
    row-gap: var(--wm-row-gap);
  }
  .tile .label { max-width: 94%; white-space: nowrap; }
`;

let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let layer: HTMLDivElement | null = null;
let currentRule: Rule | null = null;

function matchesDomain(hostname: string, domain: string): boolean {
  const hostName = hostname.toLowerCase().replace(/\.$/, '');
  const root = domain.toLowerCase().replace(/\.$/, '');
  return hostName === root || hostName.endsWith(`.${root}`);
}

function findRule(rules: Rule[]): Rule | null {
  return (
    rules
      .filter((rule) => rule.enabled && matchesDomain(location.hostname, rule.domain))
      .sort((left, right) => right.domain.length - left.domain.length)[0] ?? null
  );
}

function matchesRemovedOrigin(origin: string): boolean {
  try {
    const parsedOrigin = new URL(origin.replace('*.', 'placeholder.'));
    const wildcardSubdomains = origin.includes('*.');
    const patternHost = parsedOrigin.hostname.replace(/^placeholder\./, '');
    const hostname = location.hostname.toLowerCase().replace(/\.$/, '');
    const hostMatches = wildcardSubdomains
      ? hostname === patternHost || hostname.endsWith(`.${patternHost}`)
      : hostname === patternHost;
    return location.protocol === parsedOrigin.protocol && hostMatches;
  } catch {
    return false;
  }
}

function getParent(): Element {
  const fullscreenElement = document.fullscreenElement;
  if (fullscreenElement && fullscreenElement.tagName.toLowerCase() !== 'video') {
    return fullscreenElement;
  }
  return document.documentElement;
}

function ensureHost(): void {
  if (!document.documentElement) return;
  if (!host) {
    host = document.createElement('div');
    host.id = ROOT_ID;
    shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE_TEXT;
    layer = document.createElement('div');
    layer.className = 'layer';
    shadow.append(style, layer);
  }

  const parent = getParent();
  if (host.parentElement !== parent) {
    parent.append(host);
  }
}

function clearWatermark(): void {
  host?.remove();
}

function applyRule(rule: Rule | null): void {
  currentRule = rule;
  if (!rule || !rule.text.trim() || !document.documentElement) {
    clearWatermark();
    return;
  }

  ensureHost();
  if (!layer || !shadow) return;

  const tiled = rule.mode === 'tile';
  const fontSize = tiled ? clamp(rule.tileFontSize, 8, 96) : clamp(rule.fixedFontSize, 8, 96);
  const columns = clamp(Math.round(rule.tileColumns), 1, 12);
  const rowGap = clamp(rule.tileRowGap, 0, 600);
  const rows = Math.max(1, Math.ceil((window.innerHeight + rowGap) / (fontSize * 1.2 + rowGap)));
  const rotation = clamp(rule.tileRotation, -90, 90);

  host?.style.setProperty('--wm-color', rule.color);
  host?.style.setProperty('--wm-opacity', String(clamp(rule.opacity, 5, 100) / 100));
  host?.style.setProperty('--wm-margin', `${clamp(rule.fixedMargin, 0, 240)}px`);
  host?.style.setProperty('--wm-columns', String(columns));
  host?.style.setProperty('--wm-rows', String(rows));
  host?.style.setProperty('--wm-row-gap', `${rowGap}px`);

  layer.className = tiled ? 'layer tile' : `layer ${rule.mode}`;
  layer.replaceChildren();

  if (tiled) {
    for (let index = 0; index < columns * rows; index += 1) {
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = rule.text;
      label.style.fontSize = `${fontSize}px`;
      label.style.transform = `rotate(${rotation}deg)`;
      layer.append(label);
    }
    return;
  }

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = rule.text;
  label.style.fontSize = `${fontSize}px`;
  layer.append(label);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : minimum;
}

async function refreshRule(): Promise<void> {
  const stored = await chrome.storage.local.get('domainRules');
  const rules = Array.isArray(stored.domainRules) ? (stored.domainRules as Rule[]) : [];
  applyRule(findRule(rules));
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.domainRules) {
    void refreshRule();
  }
});

chrome.runtime.onMessage.addListener((message: { type?: string; origins?: string[] }) => {
  if (message.type === 'route-changed') {
    if (!host?.isConnected && currentRule) ensureHost();
    void refreshRule();
  } else if (message.type === 'refresh-rule') {
    void refreshRule();
  } else if (
    message.type === 'permissions-changed' &&
    (message.origins ?? []).some(matchesRemovedOrigin)
  ) {
    void chrome.runtime
      .sendMessage({ type: 'resolve-current-rule' })
      .then((response: { rule?: Rule | null } | undefined) => applyRule(response?.rule ?? null))
      .catch(() => applyRule(null));
  }
});

document.addEventListener('fullscreenchange', () => {
  if (currentRule) {
    ensureHost();
    applyRule(currentRule);
  }
});

window.addEventListener('resize', () => {
  if (currentRule?.mode === 'tile') applyRule(currentRule);
});

const documentObserver = new MutationObserver(() => {
  if (currentRule && (!host?.isConnected || host.parentElement !== getParent())) {
    ensureHost();
  }
});

function startDocumentObserver(): void {
  if (document.documentElement) {
    documentObserver.observe(document.documentElement, { childList: true });
  }
  void refreshRule();
}

if (document.documentElement) {
  startDocumentObserver();
} else {
  document.addEventListener('DOMContentLoaded', startDocumentObserver, { once: true });
}
})();
