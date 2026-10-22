import { describe, it, expect } from 'vitest'
import core from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import { decodeHTML } from 'entities'
import { createHighlightJsHighlighter } from '../src/highlightjs.js'
import { createScopeStyles, emptyGrammarEngine } from '../src/theme.js'

function instance() {
  const hljs = core.newInstance()
  hljs.registerLanguage('javascript', javascript)
  hljs.registerLanguage('json', json)
  return hljs
}
const theme = {
  settings: [
    { scope: 'keyword', settings: { foreground: '#112233' } },
    { scope: 'string', settings: { foreground: '#aabbcc' } },
    {
      scope: 'entity.name.function',
      settings: { foreground: '#123456', fontStyle: 'bold italic underline strikethrough' }
    }
  ]
}

describe('highlight.js with official theme matching', () => {
  it('renders escaped HTML and maps nested highlight.js classes to theme scopes', async () => {
    const engine = await createHighlightJsHighlighter({ hljs: instance(), theme })
    try {
      const source = 'function greet() { return "<img onerror=alert(1)>"; }\r\n'
      const result = await engine.highlight(source, { language: 'js' })
      expect(result.highlighted).toBe(true)
      expect(result.html).toContain('hljs-keyword')
      expect(result.html).not.toContain('<img')
      expect(decodeHTML(result.html.replace(/<[^>]*>/g, ''))).toBe(source)
      expect(engine.getStyleSheet()).toContain(`.${result.className} .hljs-keyword{color:#112233}`)
      expect(engine.getStyleSheet()).toContain(
        '.hljs-title.function_{color:#123456;font-style:italic;font-weight:700;text-decoration:underline line-through}'
      )
    } finally {
      engine.dispose()
    }
  })
  it('uses automatic language detection only when no language was supplied', async () => {
    const engine = await createHighlightJsHighlighter({
      hljs: instance(),
      detectLanguages: ['json']
    })
    try {
      expect((await engine.highlight('{"hello": true}')).language).toBe('json')
      for (const options of [
        { language: 'unknown' },
        { language: 'plaintext' },
        { autoDetect: false }
      ]) {
        const result = await engine.highlight('<script>&', options)
        expect(result.highlighted).toBe(false)
        expect(result.html).toBe('&lt;script&gt;&amp;')
      }
    } finally {
      engine.dispose()
    }
  })
  it('replaces CSS after a theme switch and keeps the latest concurrent update', async () => {
    const engine = await createHighlightJsHighlighter({ hljs: instance(), theme })
    try {
      await Promise.all([
        engine.setTheme({ settings: [{ scope: 'keyword', settings: { foreground: '#654321' } }] }),
        engine.setTheme({ settings: [{ scope: 'string', settings: { foreground: '#fedcba' } }] })
      ])
      const css = engine.getStyleSheet()
      expect(css).toContain('#FEDCBA')
      expect(css).not.toContain('#654321')
      expect(css).not.toContain('#112233')
    } finally {
      engine.dispose()
    }
  })
  it('enforces length limits and rejects use after disposal', async () => {
    const engine = await createHighlightJsHighlighter({ hljs: instance(), maxCodeLength: 3 })
    expect((await engine.highlight('<script>')).highlighted).toBe(false)
    engine.dispose()
    await expect(engine.highlight('x')).rejects.toThrow('disposed')
    await expect(engine.setTheme(theme)).rejects.toThrow('disposed')
  })
  it('rejects injected CSS selectors and ignores unsafe theme colors', async () => {
    await expect(
      createHighlightJsHighlighter({
        hljs: instance(),
        theme,
        scopeMap: { 'bad}body': ['keyword'] }
      })
    ).rejects.toThrow('Invalid highlight.js scope')
    const engine = await createHighlightJsHighlighter({
      hljs: instance(),
      theme: {
        settings: [
          {
            scope: 'keyword',
            settings: { foreground: 'red; background:url(x)', fontStyle: 'bold; color:red' }
          }
        ]
      }
    })
    expect(engine.getStyleSheet()).not.toMatch(/url\(|color:red/)
    engine.dispose()
  })
  it('uses official specificity and rule ordering for representative scopes', async () => {
    const styles = await createScopeStyles(
      {
        settings: [
          { scope: 'keyword', settings: { foreground: '#111111' } },
          { scope: 'keyword.control', settings: { foreground: '#222222', fontStyle: 'italic' } },
          { scope: 'keyword.control', settings: { foreground: '#333333' } }
        ]
      },
      ['keyword.control', 'string']
    )
    expect(styles.get('keyword.control')).toBe('color:#333333;font-style:italic')
    expect(styles.get('string')).toBe('')
    expect(() => emptyGrammarEngine.createOnigScanner(['x'])).toThrow('must not contain')
  })
  it('does not pretend a language-specific parent rule matches a single representative scope', async () => {
    const styles = await createScopeStyles(
      { settings: [{ scope: 'source.js keyword', settings: { foreground: '#123456' } }] },
      ['keyword']
    )
    expect(styles.get('keyword')).toBe('')
  })
})

it('isolates different themes in separate instances and accepts a custom CSS class', async () => {
  const a = await createHighlightJsHighlighter({ hljs: instance(), theme })
  const other = await createHighlightJsHighlighter({ hljs: instance(), theme })
  const b = await createHighlightJsHighlighter({
    hljs: instance(),
    theme,
    className: 'my-highlight'
  })
  try {
    const first = await a.highlight('const x = 1', { language: 'js' })
    const second = await b.highlight('const x = 1', { language: 'js' })
    expect(first.className).not.toBe((await other.highlight('x', { language: 'js' })).className)
    expect(first.className).not.toBe(second.className)
    expect(second.className).toBe('my-highlight')
    expect(a.getStyleSheet()).not.toContain('.my-highlight ')
    expect(b.getStyleSheet()).toContain('.my-highlight ')
  } finally {
    a.dispose()
    b.dispose()
    other.dispose()
  }
  await expect(
    createHighlightJsHighlighter({ hljs: instance(), className: 'bad}body' })
  ).rejects.toThrow('className')
})
it('rejects a render disposed during an asynchronous theme update', async () => {
  const engine = await createHighlightJsHighlighter({ hljs: instance(), theme })
  const updating = engine.setTheme(theme)
  const rendering = engine.highlight('const x = 1', { language: 'js' })
  engine.dispose()
  await updating
  await expect(rendering).rejects.toThrow('disposed')
})
it('preserves the last successful theme and rendering after an invalid theme update', async () => {
  const engine = await createHighlightJsHighlighter({ hljs: instance(), theme })
  try {
    const css = engine.getStyleSheet()
    await expect(engine.setTheme({ settings: null } as unknown as typeof theme)).rejects.toThrow()
    expect(engine.getStyleSheet()).toBe(css)
    expect((await engine.highlight('const x = 1', { language: 'js' })).highlighted).toBe(true)
  } finally {
    engine.dispose()
  }
})
