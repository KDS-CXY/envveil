export type WatermarkMode =
  | 'tile'
  | 'top-center'
  | 'top-right'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-left'
  | 'bottom-center';

export interface DomainRule {
  id: string;
  domain: string;
  enabled: boolean;
  text: string;
  mode: WatermarkMode;
  color: string;
  opacity: number;
  fixedFontSize: number;
  fixedMargin: number;
  tileFontSize: number;
  tileColumns: number;
  tileRotation: number;
  tileRowGap: number;
}

export const DEFAULT_RULE_VALUES: Omit<DomainRule, 'id' | 'domain'> = {
  enabled: true,
  text: '测试环境',
  mode: 'tile',
  color: '#d22f27',
  opacity: 22,
  fixedFontSize: 18,
  fixedMargin: 24,
  tileFontSize: 25,
  tileColumns: 3,
  tileRotation: -24,
  tileRowGap: 110
};

export const RULES_STORAGE_KEY = 'domainRules';

export function matchesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const root = domain.toLowerCase().replace(/\.$/, '');
  return host === root || host.endsWith(`.${root}`);
}

export function findMatchingRule(rules: DomainRule[], hostname: string): DomainRule | undefined {
  return rules
    .filter((rule) => rule.enabled && matchesDomain(hostname, rule.domain))
    .sort((left, right) => right.domain.length - left.domain.length)[0];
}

export function findConfiguredRule(rules: DomainRule[], hostname: string): DomainRule | undefined {
  return rules
    .filter((rule) => matchesDomain(hostname, rule.domain))
    .sort((left, right) => right.domain.length - left.domain.length)[0];
}

export function getDomainOrigins(domain: string): string[] {
  return [`http://*.${domain}/*`, `https://*.${domain}/*`];
}

export function normalizeDomain(input: string): string {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) {
    throw new Error('请输入有效域名');
  }

  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw);
  const candidate = hasScheme ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('请输入有效域名，例如 example.com');
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('请只输入域名，不要包含端口、路径或查询参数');
  }

  const domain = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!domain || domain.includes('*')) {
    throw new Error('请输入有效域名');
  }
  return domain;
}
