import { beforeAll, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createTextmateHighlighter } from '../src/textmate.js'
import { loadOniguruma } from '../src/oniguruma.js'
import { loadCodeGrammar, getCodeLanguageScope, resolveCodeLanguage } from '../src/languages.js'
import type { IOnigLib } from 'vscode-textmate'
let onigLib: IOnigLib
beforeAll(async () => {
  const data = readFileSync(
    createRequire(import.meta.url).resolve('vscode-oniguruma/release/onig.wasm')
  )
  onigLib = await loadOniguruma(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  )
})
it('supports injected language detection and does not guess explicit unknown languages', async () => {
  const detectLanguage = vi.fn(() => 'js')
  const engine = await createTextmateHighlighter({
    onigLib,
    loadGrammar: loadCodeGrammar,
    resolveLanguage: resolveCodeLanguage,
    getScope: getCodeLanguageScope,
    detectLanguage
  })
  expect((await engine.highlight('const x = 1')).language).toBe('javascript')
  expect(detectLanguage).toHaveBeenCalledTimes(1)
  for (const language of ['unknown', 'plaintext'])
    expect((await engine.highlight('<x>', { language })).html).toBe('&lt;x&gt;')
  expect(detectLanguage).toHaveBeenCalledTimes(1)
  engine.dispose()
  await expect(engine.highlight('x')).rejects.toThrow('disposed')
})
it('discards output when a theme changes during grammar loading', async () => {
  let resolve!: () => void
  const waiting = new Promise<void>(done => {
    resolve = done
  })
  const engine = await createTextmateHighlighter({
    onigLib,
    resolveLanguage: resolveCodeLanguage,
    getScope: getCodeLanguageScope,
    loadGrammar: async scope => {
      await waiting
      return loadCodeGrammar(scope)
    }
  })
  const pending = engine.highlight('let x = 1', { language: 'js' })
  await engine.setTheme({ settings: [] })
  resolve()
  expect((await pending).highlighted).toBe(false)
  engine.dispose()
})
it('rejects an unsuccessful WASM response', async () => {
  await expect(loadOniguruma(new Response('', { status: 404 }))).rejects.toThrow('404')
})

it('routes auto-detected HTML through embedded CSS and JavaScript grammars', async () => {
  const { detectCodeLanguage } = await import('../src/detection.js')
  const { samples } = await import('../demo/samples.js')
  const source = samples.find(sample => sample.id === 'html')!.source
  const engine = await createTextmateHighlighter({
    onigLib,
    loadGrammar: loadCodeGrammar,
    resolveLanguage: resolveCodeLanguage,
    getScope: getCodeLanguageScope,
    detectLanguage: detectCodeLanguage,
    maxLineTime: 1000,
    maxBlockTime: 1500,
    theme: {
      settings: [
        { scope: 'source.css', settings: { foreground: '#123456' } },
        { scope: 'source.js', settings: { foreground: '#654321' } }
      ]
    }
  })
  try {
    const result = await engine.highlight(source)
    expect(result.language).toBe('xml')
    expect(result.highlighted).toBe(true)
    expect(result.html).toContain('#123456')
    expect(result.html).toContain('#654321')
    const explicit = await engine.highlight(source, { language: 'xml' })
    expect(explicit.language).toBe('xml')
    expect(explicit.html).not.toContain('#123456')
    expect(explicit.html).not.toContain('#654321')
  } finally {
    engine.dispose()
  }
})

it('falls back to XML when a custom grammar collection has no HTML scope', async () => {
  const getScope = vi.fn((language: string) => (language === 'xml' ? 'text.xml' : undefined))
  const engine = await createTextmateHighlighter({
    onigLib,
    loadGrammar: loadCodeGrammar,
    resolveLanguage: resolveCodeLanguage,
    getScope,
    detectLanguage: () => 'xml'
  })
  try {
    const result = await engine.highlight('<!doctype html><html></html>')
    expect(result.language).toBe('xml')
    expect(result.highlighted).toBe(true)
    expect(getScope.mock.calls.map(([language]) => language)).toEqual(['html', 'xml'])
  } finally {
    engine.dispose()
  }
})
it('keeps detected XML documents on the XML grammar', async () => {
  const getScope = vi.fn(getCodeLanguageScope)
  const engine = await createTextmateHighlighter({
    onigLib,
    loadGrammar: loadCodeGrammar,
    resolveLanguage: resolveCodeLanguage,
    getScope,
    detectLanguage: () => 'xml'
  })
  try {
    const result = await engine.highlight('<?xml version="1.0"?><root/>')
    expect(result.language).toBe('xml')
    expect(result.highlighted).toBe(true)
    expect(getScope).toHaveBeenCalledExactlyOnceWith('xml')
  } finally {
    engine.dispose()
  }
})

it('requires explicit TSX when detection only identifies TypeScript, but JavaScript already supports JSX', async () => {
  const getScope = vi.fn(getCodeLanguageScope)
  const engine = await createTextmateHighlighter({
    onigLib,
    loadGrammar: loadCodeGrammar,
    resolveLanguage: resolveCodeLanguage,
    getScope,
    detectLanguage: () => 'typescript',
    maxLineTime: 1000,
    maxBlockTime: 1500,
    theme: { settings: [{ scope: 'entity.name.tag', settings: { foreground: '#123456' } }] }
  })
  try {
    const source =
      'interface Props { name: string }\nexport const View = (props: Props) => <div>{props.name}</div>;'
    const detected = await engine.highlight(source)
    expect(detected.language).toBe('typescript')
    expect(getScope).toHaveBeenLastCalledWith('typescript')
    const tsx = await engine.highlight(source, { language: 'tsx' })
    expect(tsx.language).toBe('tsx')
    expect(tsx.highlighted).toBe(true)
    expect(tsx.html).toContain('color:#123456')
    const jsx = await engine.highlight('const view = <div>Hello</div>;', { language: 'jsx' })
    expect(jsx.language).toBe('javascript')
    expect(jsx.html).toContain('color:#123456')
  } finally {
    engine.dispose()
  }
})

it.each([
  { language: 'yaml', source: 'name: <%= user.name %>', embedded: 'ruby', scope: 'source.ruby' },
  {
    language: 'javascript',
    source: 'const view = html`<div>Hello</div>`;',
    embedded: 'xml',
    scope: 'text.html.basic'
  },
  {
    language: 'javascript',
    source: 'const style = css`.title { color: red; }`;',
    embedded: 'css',
    scope: 'source.css'
  }
])(
  'documents embedded grammar differences without optional injections for $language / $embedded',
  async ({ language, source, embedded, scope }) => {
    const { commonHighlightJs } = await import('../src/detection.js')
    const light = commonHighlightJs.highlight(source, { language, ignoreIllegals: true })
    expect(light.value).toContain(`language-${embedded}`)
    const engine = await createTextmateHighlighter({
      onigLib,
      loadGrammar: loadCodeGrammar,
      resolveLanguage: resolveCodeLanguage,
      getScope: getCodeLanguageScope,
      maxLineTime: 1000,
      maxBlockTime: 1500,
      theme: { settings: [{ scope, settings: { foreground: '#123456' } }] }
    })
    try {
      const result = await engine.highlight(source, { language })
      expect(result.highlighted).toBe(true)
      expect(result.language).toBe(language)
      expect(result.html).not.toContain('#123456')
    } finally {
      engine.dispose()
    }
  }
)

it('rejects factory initialization when the supplied WASM engine fails', async () => {
  await expect(
    createTextmateHighlighter({
      onigLib: Promise.reject(new Error('WASM initialization failed')),
      loadGrammar: loadCodeGrammar,
      resolveLanguage: resolveCodeLanguage,
      getScope: getCodeLanguageScope
    })
  ).rejects.toThrow('WASM initialization failed')
})
it('loads WASM from a Buffer view without reading unrelated bytes', async () => {
  const data = readFileSync(
    createRequire(import.meta.url).resolve('vscode-oniguruma/release/onig.wasm')
  )
  const padded = Buffer.concat([Buffer.from([0, 1]), data, Buffer.from([2, 3])])
  expect(await loadOniguruma(padded.subarray(2, padded.length - 2))).toHaveProperty(
    'createOnigScanner'
  )
})
