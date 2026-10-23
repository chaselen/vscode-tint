import textmate from 'vscode-textmate'
import { resolveDetectedTextmateLanguage } from './textmateLanguage.js'
import type { IOnigLib, IRawGrammar, RegistryOptions } from 'vscode-textmate'
import { escapeHtml } from './index.js'
import type {
  CodeHighlighter,
  FallbackReason,
  HighlightOptions,
  LanguageDetector,
  SyntaxTheme
} from './index.js'
import { applyTheme, tokenStyle } from './theme.js'

/** Grammar resolution is injected so consumers choose which languages and assets to ship. */
export interface TextmateOptions {
  onigLib: IOnigLib | Promise<IOnigLib>
  loadGrammar: (scope: string) => Promise<IRawGrammar | null>
  /** 官方注入查询接口；返回的 scope 及其依赖须由 loadGrammar 提供，在加载 grammar 前配置 */
  getInjections?: RegistryOptions['getInjections']
  resolveLanguage: (language: string) => string | undefined
  getScope: (language: string) => string | undefined
  detectLanguage?: LanguageDetector
  theme?: SyntaxTheme
  maxCodeLength?: number
  maxLineLength?: number
  maxBlockTime?: number
  maxLineTime?: number
}

/** Create the full grammar engine. Returns escaped plain text when a language is unavailable or exceeds its budget. */
export async function createTextmateHighlighter(
  options: TextmateOptions
): Promise<CodeHighlighter> {
  // 工厂完成时引擎必须已就绪，WASM 加载失败直接由创建调用捕获
  const onigLib = await options.onigLib
  const unavailableScopes = new Set<string>()
  const registry = new textmate.Registry({
    onigLib: Promise.resolve(onigLib),
    loadGrammar: async scope => {
      const grammar = await options.loadGrammar(scope)
      if (!grammar) unavailableScopes.add(scope)
      return grammar
    },
    getInjections: options.getInjections
  })
  let defaults = applyTheme(registry, options.theme ?? { settings: [] })
  let revision = 0
  let disposed = false
  const warmedScopes = new Set<string>()
  const className = 'vsch-textmate'
  return {
    async setTheme(theme: SyntaxTheme) {
      if (disposed) throw new Error('Highlighter disposed')
      defaults = applyTheme(registry, theme)
      revision++
    },
    getStyleSheet: () => '',
    async highlight(source: string, request: HighlightOptions = {}) {
      if (disposed) throw new Error('Highlighter disposed')
      const plain = (reason: FallbackReason) => ({
        html: escapeHtml(source),
        className,
        highlighted: false,
        reason
      })
      if (source.length > (options.maxCodeLength ?? 100000)) return plain('code-too-long')
      const version = revision
      let name = request.language
      if (name && ['plaintext', 'text', 'txt', 'plain'].includes(name.toLowerCase()))
        return plain('plaintext')
      const autoDetected = !name && request.autoDetect !== false && !!options.detectLanguage
      if (autoDetected) name = await options.detectLanguage!(source.slice(0, 12000))
      if (disposed) return plain('disposed')
      if (version !== revision) return plain('theme-changed')
      if (!name) return plain(autoDetected ? 'language-not-detected' : 'language-not-specified')
      const language = name ? options.resolveLanguage(name) : undefined
      if (language === 'plaintext') return plain('plaintext')
      if (!language) return plain('unsupported-language')
      // grammar 可以更具体，但 language 仍用于报告原检测语言；显式声明不走推断
      const grammarLanguage = autoDetected
        ? resolveDetectedTextmateLanguage(language, source.slice(0, 12000))
        : language
      // 自定义语法集合可能只提供原语言，不能因内置适配直接丢失可用高亮
      const scope = grammarLanguage
        ? (options.getScope(grammarLanguage) ??
          (grammarLanguage !== language && language ? options.getScope(language) : undefined))
        : undefined
      if (!scope) return plain('grammar-unavailable')
      const parts = source.split(/(\r\n|\r|\n)/)
      if (
        parts.some(
          (line, index) => index % 2 === 0 && line.length > (options.maxLineLength ?? 10000)
        )
      )
        return plain('line-too-long')
      const grammar = await registry.loadGrammar(scope).catch(error => {
        // 官方 Registry 对根 grammar 缺失会拒绝；只转换 loader 明确返回 null 的情况
        if (unavailableScopes.has(scope)) return null
        throw error
      })
      if (disposed) return plain('disposed')
      if (version !== revision) return plain('theme-changed')
      if (!grammar) return plain('grammar-unavailable')
      const colors = registry.getColorMap()
      // Reuse compiled regexes on a bounded cold-start retry, yielding between attempts.
      const attempts = warmedScopes.has(scope) ? 1 : 3
      for (let attempt = 0; attempt < attempts; attempt++) {
        if (disposed) return plain('disposed')
        if (version !== revision) return plain('theme-changed')
        let state = textmate.INITIAL
        const html: string[] = []
        const started = performance.now()
        let interrupted = false
        for (let lineIndex = 0; lineIndex < parts.length; lineIndex += 2) {
          if (performance.now() - started > (options.maxBlockTime ?? 500)) {
            interrupted = true
            break
          }
          const line = parts[lineIndex]
          const result = grammar.tokenizeLine2(line, state, options.maxLineTime ?? 250)
          if (result.stoppedEarly) {
            interrupted = true
            break
          }
          state = result.ruleStack
          for (let index = 0; index < result.tokens.length; index += 2) {
            const end = index + 2 < result.tokens.length ? result.tokens[index + 2] : line.length
            const text = escapeHtml(line.slice(result.tokens[index], end))
            if (!text) continue
            const style = tokenStyle(result.tokens[index + 1], colors, defaults)
            html.push(style ? `<span style="${style}">${text}</span>` : text)
          }
          html.push(parts[lineIndex + 1] || '')
        }
        if (!interrupted) {
          warmedScopes.add(scope)
          return { html: html.join(''), language, className, highlighted: true }
        }
        if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 0))
      }
      return plain('timeout')
    },
    dispose() {
      disposed = true
      revision++
      warmedScopes.clear()
      registry.dispose()
    }
  }
}
