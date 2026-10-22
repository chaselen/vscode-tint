import type { IRawTheme } from 'vscode-textmate'

/** TextMate 主题规则，直接复用官方契约 */
export type TokenColorRule = IRawTheme['settings'][number]

/** 仅允许主题契约中的十六进制颜色 */
export function isTokenColor(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)
}

/** 校验外部规则，只传递颜色与字体样式，匹配逻辑交给官方 TextMate */
export function readTokenColorRules(value: unknown): TokenColorRule[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(rule => {
    if (!isRecord(rule) || !isRecord(rule.settings)) return []
    const scope = rule.scope
    if (
      typeof scope !== 'string' &&
      !(Array.isArray(scope) && scope.every(item => typeof item === 'string'))
    )
      return []
    const settings: TokenColorRule['settings'] = {
      ...(isTokenColor(rule.settings.foreground) && { foreground: rule.settings.foreground }),
      ...(isTokenColor(rule.settings.background) && { background: rule.settings.background }),
      ...(typeof rule.settings.fontStyle === 'string' && { fontStyle: rule.settings.fontStyle })
    }
    return [{ scope, settings }]
  })
}

/** 判断外部 JSON 值是否为对象 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const customizationScopes: Record<string, string[]> = {
  comments: ['comment', 'punctuation.definition.comment'],
  strings: ['string', 'meta.embedded.assembly'],
  keywords: ['keyword - keyword.operator', 'keyword.control', 'storage', 'storage.type'],
  numbers: ['constant.numeric'],
  types: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
  functions: ['entity.name.function', 'support.function'],
  variables: ['variable', 'entity.name.variable']
}

/** 读取全局与 [主题名称] 自定义，支持 VS Code 的 * 通配及多个主题选择器 */
export function getCustomTokenColorRules(value: unknown, themeName: string): TokenColorRule[] {
  if (!isRecord(value)) return []
  const blocks = [value]
  for (const [selector, settings] of Object.entries(value)) {
    if (!isRecord(settings) || !/^(?:\[[^\]]+\])+$/.test(selector)) continue
    const matches = [...selector.matchAll(/\[([^\]]+)\]/g)].some(([, pattern]) => {
      const escaped = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      return new RegExp(`^${escaped.join('.*')}$`).test(themeName)
    })
    if (matches) blocks.push(settings)
  }
  return blocks.flatMap(block => {
    const rules: TokenColorRule[] = []
    for (const [group, scopes] of Object.entries(customizationScopes)) {
      const setting = block[group]
      const foreground = isRecord(setting) ? setting.foreground : setting
      rules.push(
        ...readTokenColorRules([
          { scope: scopes, settings: typeof setting === 'string' ? { foreground } : setting }
        ])
      )
    }
    return [...rules, ...readTokenColorRules(block.textMateRules)]
  })
}
