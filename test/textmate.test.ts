import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import textmate from 'vscode-textmate'
import oniguruma from 'vscode-oniguruma'
import { decodeHTML } from 'entities'
import { createOnigurumaLib } from '../src/oniguruma.js'
import { createTextmateHighlighter } from '../src/textmate.js'
import { resolveCodeLanguage, getCodeLanguageScope, loadCodeGrammar } from '../src/languages.js'

beforeAll(async () => {
  const require = createRequire(import.meta.url)
  const data = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'))
  await oniguruma.loadWASM(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
})

/** 使用真正的官方分词器和 WASM，而非模拟 token 输出 */
async function createHighlighter() {
  const highlighter = await createTextmateHighlighter({
    onigLib: createOnigurumaLib(),
    loadGrammar: loadCodeGrammar,
    resolveLanguage: resolveCodeLanguage,
    getScope: getCodeLanguageScope
  })
  highlighter.setTheme({
    settings: [
      { scope: 'comment', settings: { foreground: '#11aa11' } },
      { scope: 'string', settings: { foreground: '#aabbcc' } },
      { scope: 'storage', settings: { foreground: '#cc2233' } },
      {
        scope: 'source.js entity.name.function',
        settings: { foreground: '#123456', fontStyle: 'italic bold' }
      }
    ]
  })
  return {
    ...highlighter,
    async render(source: string, language: string) {
      const result = await highlighter.highlight(source, { language })
      return result.highlighted ? result.html : undefined
    }
  }
}

describe('TextMate token rendering', () => {
  it.each([false, true])('冷启动超时会有界重试，持续超时最终回退：%s', async alwaysTimeout => {
    const loadGrammar = textmate.Registry.prototype.loadGrammar
    const tokenizers: ReturnType<typeof vi.fn>[] = []
    const spy = vi
      .spyOn(textmate.Registry.prototype, 'loadGrammar')
      .mockImplementation(async function (this: InstanceType<typeof textmate.Registry>, scope) {
        const grammar = await loadGrammar.call(this, scope)
        if (!grammar) return grammar
        const tokenize = grammar.tokenizeLine2.bind(grammar)
        const interrupted = {
          tokens: new Uint32Array(),
          fonts: [],
          ruleStack: textmate.INITIAL,
          stoppedEarly: true
        }
        // 重试次数测试使用可控的超时序列，避免把真实冷编译耗时当作确定行为
        const completed = tokenize('const title = "V2EX";', textmate.INITIAL, 0)
        const tokenizer = vi.fn(() => completed).mockReturnValueOnce(interrupted)
        if (alwaysTimeout) tokenizer.mockReturnValue(interrupted)
        grammar.tokenizeLine2 = tokenizer
        tokenizers.push(tokenizer)
        return grammar
      })
    const highlighter = await createHighlighter()
    try {
      const html = await highlighter.render('const title = "V2EX";', 'javascript')
      if (alwaysTimeout) {
        expect(html).toBeUndefined()
        expect(tokenizers[0]).toHaveBeenCalledTimes(3)
      } else {
        expect(html).toContain('color:#AABBCC')
        expect(tokenizers[0]).toHaveBeenCalledTimes(2)
      }
    } finally {
      highlighter.dispose()
      spy.mockRestore()
    }
  })
  it('两个官方包的正则锚点选项能正确转换', () => {
    const lib = createOnigurumaLib()
    for (const [pattern, flag] of [
      ['\\A.', 1],
      ['\\z', 2],
      ['\\G.', 4]
    ] as const) {
      const scanner = lib.createOnigScanner([pattern])
      try {
        expect(scanner.findNextMatchSync('x', 0, 0)).not.toBeNull()
        expect(scanner.findNextMatchSync('x', 0, flag)).toBeNull()
      } finally {
        scanner.dispose?.()
      }
    }
  })

  it('大颜色表及字体位不会破坏前景色索引解码', async () => {
    const highlighter = await createHighlighter()
    try {
      highlighter.setTheme({
        settings: [
          ...Array.from({ length: 300 }, (_, index) => ({
            scope: `dummy.token${index}`,
            settings: { foreground: `#${(index + 10).toString(16).padStart(6, '0')}` }
          })),
          {
            scope: 'entity.name.function',
            settings: { foreground: '#123456', fontStyle: 'italic bold underline strikethrough' }
          }
        ]
      })
      const html = await highlighter.render('function greet() {}', 'javascript')
      expect(html).toContain(
        'color:#123456;font-style:italic;font-weight:700;text-decoration:underline line-through'
      )
    } finally {
      highlighter.dispose()
    }
  })
  it('匹配真实语言上下文，主题变更后重新分词且不残留旧颜色', async () => {
    const highlighter = await createHighlighter()
    try {
      const source = 'function greet() { return "hello"; }'
      const first = await highlighter.render(source, 'javascript')
      expect(first).toContain('color:#123456;font-style:italic;font-weight:700')
      expect(first).toContain('color:#AABBCC')
      highlighter.setTheme({
        settings: [{ scope: 'entity.name.function', settings: { foreground: '#654321' } }]
      })
      const second = await highlighter.render(source, 'javascript')
      expect(second).toContain('color:#654321')
      expect(second).not.toContain('#123456')
      expect(second).not.toContain('#AABBCC')
    } finally {
      highlighter.dispose()
    }
  })

  it('跨行保留 grammar 状态，并完整保留换行和代码中的 HTML', async () => {
    const highlighter = await createHighlighter()
    try {
      const source =
        '/* first\r\nsecond <script>& */\r\nconst text = "<img src=x onerror=alert(1)>";\r\n'
      const html = await highlighter.render(source, 'javascript')
      expect(html).toContain('color:#11AA11">second &lt;script&gt;&amp; */')
      expect(html).not.toContain('<img')
      expect(decodeHTML(html!.replace(/<[^>]*>/g, ''))).toBe(source)
    } finally {
      highlighter.dispose()
    }
  })

  it('HTML grammar 加载 JavaScript 嵌入依赖', async () => {
    const highlighter = await createHighlighter()
    try {
      const source = '<script>const value = "test";</script>'
      const html = await highlighter.render(source, 'html')
      expect(html).toContain('color:#CC2233')
      expect(html).toContain('color:#AABBCC')
      expect(decodeHTML(html!.replace(/<[^>]*>/g, ''))).toBe(source)
    } finally {
      highlighter.dispose()
    }
  })

  it.each([
    'bash',
    'c',
    'cpp',
    'csharp',
    'css',
    'diff',
    'dockerfile',
    'go',
    'ini',
    'java',
    'javascript',
    'json',
    'kotlin',
    'markdown',
    'objc',
    'php',
    'python',
    'ruby',
    'rust',
    'sql',
    'ts',
    'xml',
    'html',
    'yaml',
    'toml',
    'tsx'
  ])('加载 %s grammar 及已支持的依赖', async alias => {
    const highlighter = await createHighlighter()
    try {
      expect(await highlighter.render('value = 1', resolveCodeLanguage(alias)!)).toBeTypeOf(
        'string'
      )
    } finally {
      highlighter.dispose()
    }
  })

  it('未知语言和超长输入回退，避免生成不完整的高亮 HTML', async () => {
    const highlighter = await createHighlighter()
    try {
      expect(await highlighter.render('hello', 'unknown')).toBeUndefined()
      expect(await highlighter.render('x'.repeat(100001), 'javascript')).toBeUndefined()
      expect(await highlighter.render('x'.repeat(10001), 'javascript')).toBeUndefined()
    } finally {
      highlighter.dispose()
    }
  })
})
