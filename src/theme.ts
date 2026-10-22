import textmate from 'vscode-textmate'
import type { IOnigLib, IRawTheme, Registry } from 'vscode-textmate'

/** Empty grammars never evaluate regular expressions. Fail if that invariant changes. */
export const emptyGrammarEngine: IOnigLib = {
  createOnigString: content => ({ content }),
  createOnigScanner: patterns => {
    if (patterns.length) throw new Error('Theme probes must not contain regular expressions')
    return { findNextMatchSync: () => null }
  }
}

export function isColor(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)
}

/** Install collision-free defaults so unmatched tokens inherit the surrounding UI. */
export function applyTheme(registry: Registry, theme: IRawTheme) {
  const used = new Set<string>()
  for (const rule of theme.settings) {
    for (const value of [rule.settings.foreground, rule.settings.background]) {
      if (!isColor(value)) continue
      let hex = value.slice(1).toUpperCase()
      if (hex.length === 3 || hex.length === 4) hex = [...hex].map(c => c + c).join('')
      used.add(`#${hex.slice(0, 6)}`)
    }
  }
  let candidate = 1
  const next = () => {
    let value: string
    do {
      value = `#${(candidate++).toString(16).padStart(6, '0')}`.toUpperCase()
    } while (used.has(value))
    used.add(value)
    return value
  }
  const foreground = next()
  const background = next()
  registry.setTheme({
    name: theme.name,
    settings: [
      { settings: { foreground, background } },
      ...theme.settings
        .filter(rule => rule.scope)
        .map(rule => ({
          scope: rule.scope,
          settings: {
            ...(isColor(rule.settings.foreground) && { foreground: rule.settings.foreground }),
            ...(isColor(rule.settings.background) && { background: rule.settings.background }),
            ...(typeof rule.settings.fontStyle === 'string' && {
              fontStyle: rule.settings.fontStyle
            })
          }
        }))
    ]
  })
  return { foreground, background }
}

/** Public tokenizeLine2 metadata layout; covered by real-engine regression tests on upgrades. */
export function tokenStyle(
  metadata: number,
  colors: string[],
  defaults: { foreground: string; background: string }
) {
  const color = colors[(metadata & 0x00ff8000) >>> 15]
  const background = colors[(metadata & 0xff000000) >>> 24]
  const font = (metadata & 0x00007800) >>> 11
  const style: string[] = []
  if (color !== defaults.foreground && isColor(color)) style.push(`color:${color}`)
  if (background !== defaults.background && isColor(background))
    style.push(`background-color:${background}`)
  if (font & 1) style.push('font-style:italic')
  if (font & 2) style.push('font-weight:700')
  const decorations = [font & 4 ? 'underline' : '', font & 8 ? 'line-through' : ''].filter(Boolean)
  if (decorations.length) style.push(`text-decoration:${decorations.join(' ')}`)
  return style.join(';')
}

/** Resolve representative single scopes through the official engine, without WASM or private APIs. */
export async function createScopeStyles(
  theme: IRawTheme,
  scopes: string[]
): Promise<Map<string, string>> {
  const registry = new textmate.Registry({
    onigLib: Promise.resolve(emptyGrammarEngine),
    loadGrammar: async () => null
  })
  try {
    const defaults = applyTheme(registry, theme)
    const result = new Map<string, string>()
    for (const scope of new Set(scopes)) {
      if (!/^[\w.-]+$/.test(scope)) throw new Error(`Invalid representative scope: ${scope}`)
      const grammar = await registry.addGrammar({
        scopeName: scope,
        patterns: [],
        repository: { $self: { patterns: [] }, $base: { patterns: [] } }
      })
      const tokens = grammar.tokenizeLine2('x', textmate.INITIAL)
      if (tokens.stoppedEarly || tokens.tokens.length !== 2)
        throw new Error('Unexpected theme probe output')
      result.set(scope, tokenStyle(tokens.tokens[1], registry.getColorMap(), defaults))
    }
    return result
  } finally {
    registry.dispose()
  }
}
