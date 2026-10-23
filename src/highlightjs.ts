import type { HLJSApi } from 'highlight.js'
import { escapeHtml } from './index.js'
import type { CodeHighlighter, FallbackReason, HighlightOptions, SyntaxTheme } from './index.js'
import { createScopeStyles } from './theme.js'

/** Representative scopes approximate TextMate colors; language and parent-scope context are unavailable. */
export const defaultScopeMap: Readonly<Record<string, readonly string[]>> = {
  keyword: ['keyword.control', 'keyword', 'storage.type'],
  'title.function': ['entity.name.function'],
  'title.function.invoke': ['entity.name.function', 'support.function'],
  'title.class': ['entity.name.type.class', 'entity.name.type', 'support.class'],
  'title.class.inherited': ['entity.other.inherited-class', 'entity.name.type'],
  title: ['entity.name'],
  string: ['string.quoted', 'string'],
  comment: ['comment'],
  number: ['constant.numeric'],
  literal: ['constant.language'],
  built_in: ['support.function', 'support.type'],
  type: ['entity.name.type', 'support.type'],
  variable: ['variable'],
  'variable.language': ['variable.language'],
  'variable.constant': ['variable.other.constant', 'constant'],
  params: ['variable.parameter'],
  property: ['variable.other.property'],
  attr: ['entity.other.attribute-name'],
  attribute: ['entity.other.attribute-name'],
  tag: ['entity.name.tag'],
  name: ['entity.name.tag'],
  meta: ['meta.preprocessor'],
  'meta.keyword': ['keyword.control'],
  'meta.string': ['string.quoted'],
  regexp: ['string.regexp'],
  symbol: ['constant.other'],
  subst: ['variable'],
  operator: ['keyword.operator'],
  punctuation: ['punctuation'],
  'selector-tag': ['entity.name.tag'],
  'selector-class': ['entity.other.attribute-name.class.css'],
  'selector-id': ['entity.other.attribute-name.id.css'],
  'selector-attr': ['entity.other.attribute-name'],
  'selector-pseudo': ['entity.other.attribute-name.pseudo-class.css'],
  section: ['markup.heading'],
  bullet: ['punctuation.definition.list'],
  link: ['markup.underline.link'],
  quote: ['markup.quote'],
  addition: ['markup.inserted'],
  deletion: ['markup.deleted'],
  emphasis: ['markup.italic'],
  strong: ['markup.bold'],
  doctag: ['keyword.other.documentation']
}

let nextInstanceId = 0

/** Supply an isolated highlight.js instance so the caller controls registered languages and bundle size. */
export interface HighlightJsOptions {
  hljs: HLJSApi
  /** 独立 CSS 作用域，默认按实例生成；自定义值须为单个 CSS 类名 */
  className?: string
  theme?: SyntaxTheme
  scopeMap?: Record<string, readonly string[]>
  detectLanguages?: string[]
  maxCodeLength?: number
  maxDetectionLength?: number
}

function selector(scope: string): string {
  if (!/^[a-zA-Z_][\w-]*(?:\.[a-zA-Z_][\w-]*)*$/.test(scope))
    throw new Error(`Invalid highlight.js scope: ${scope}`)
  return scope
    .split('.')
    .map((part, index) => (index ? `.${part}${'_'.repeat(index)}` : `.hljs-${part}`))
    .join('')
}

/** Create the lightweight engine: highlight.js HTML plus theme colors resolved by vscode-textmate. */
export async function createHighlightJsHighlighter(
  options: HighlightJsOptions
): Promise<CodeHighlighter> {
  let disposed = false
  let revision = 0
  let css = ''
  let pending = Promise.resolve()
  const mapping = { ...defaultScopeMap, ...options.scopeMap }
  const className = options.className ?? `vsch-highlightjs-${++nextInstanceId}`
  if (!/^[a-zA-Z_][\w-]*$/.test(className)) throw new Error('Invalid highlighter className')
  // 类别在创建时校验，不依赖当前主题是否恰好匹配该类别
  for (const scope of Object.keys(mapping)) selector(scope)
  async function update(theme: SyntaxTheme) {
    if (disposed) throw new Error('Highlighter disposed')
    const version = ++revision
    const styles = await createScopeStyles(theme, Object.values(mapping).flat())
    const rules: string[] = []
    for (const [scope, candidates] of Object.entries(mapping)) {
      const style = candidates.map(candidate => styles.get(candidate)).find(Boolean)
      if (style) rules.push(`.${className} ${selector(scope)}{${style}}`)
    }
    if (!disposed && version === revision) css = rules.join('\n')
  }
  const highlighter: CodeHighlighter = {
    setTheme(theme) {
      const updating = update(theme)
      // 失败仍向调用方报告，但保留上一次成功的 CSS，不让后续高亮永久拒绝
      pending = updating.catch(() => {})
      return updating
    },
    getStyleSheet: () => css,
    async highlight(source: string, request: HighlightOptions = {}) {
      if (disposed) throw new Error('Highlighter disposed')
      await pending
      if (disposed) throw new Error('Highlighter disposed')
      const plain = (reason: FallbackReason) => ({
        html: escapeHtml(source),
        className,
        highlighted: false,
        reason
      })
      if (source.length > (options.maxCodeLength ?? 100000)) return plain('code-too-long')
      const language = request.language?.toLowerCase()
      if (
        language === 'plaintext' ||
        language === 'text' ||
        language === 'txt' ||
        language === 'plain'
      )
        return plain('plaintext')
      if (language && !options.hljs.getLanguage(language)) return plain('unsupported-language')
      let selected = language
      if (!selected && request.autoDetect !== false) {
        const sample = source.slice(0, options.maxDetectionLength ?? 12000)
        selected = options.hljs.highlightAuto(sample, options.detectLanguages).language
      }
      if (!selected)
        return plain(
          request.autoDetect === false ? 'language-not-specified' : 'language-not-detected'
        )
      const result = options.hljs.highlight(source, { language: selected, ignoreIllegals: true })
      return { html: result.value, language: selected, highlighted: true, className }
    },
    dispose() {
      disposed = true
      revision++
      css = ''
    }
  }
  await highlighter.setTheme(options.theme ?? { settings: [] })
  return highlighter
}
