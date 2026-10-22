import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { beforeAll, expect, it } from 'vitest'
import { decodeHTML } from 'entities'
import type { IOnigLib, IRawGrammar } from 'vscode-textmate'
import { loadOniguruma } from '../src/oniguruma.js'
import { createTextmateHighlighter } from '../src/textmate.js'
import {
  getCodeInjections,
  getCodeLanguageScope,
  loadCodeGrammar,
  resolveCodeLanguage
} from '../src/languages.js'
import { samples } from '../demo/samples.js'

let onigLib: IOnigLib
beforeAll(async () => {
  const bytes = readFileSync(
    createRequire(import.meta.url).resolve('vscode-oniguruma/release/onig.wasm')
  )
  onigLib = await loadOniguruma(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  )
})
const theme = {
  settings: [
    { scope: 'entity.name.tag.html', settings: { foreground: '#112233' } },
    { scope: 'support.type.property-name.css', settings: { foreground: '#445566' } },
    { scope: 'variable.other.readwrite', settings: { foreground: '#778899' } }
  ]
}
function createEngine(enabled = true) {
  return createTextmateHighlighter({
    onigLib,
    loadGrammar: loadCodeGrammar,
    getScope: getCodeLanguageScope,
    resolveLanguage: resolveCodeLanguage,
    getInjections: enabled ? getCodeInjections : undefined,
    maxLineTime: 1000,
    maxBlockTime: 1500,
    theme
  })
}

it.each(['javascript', 'typescript', 'tsx'])(
  'reuses HTML/CSS injections and preserves interpolation in %s',
  async language => {
    const engine = await createEngine()
    try {
      const source = samples.find(sample => sample.id === 'tagged-templates')!.source
      const result = await engine.highlight(source, { language })
      expect(result.highlighted).toBe(true)
      expect(result.language).toBe(language)
      expect(result.html).toContain('color:#112233')
      expect(result.html).toContain('color:#445566')
      expect(result.html).toContain('color:#778899')
      expect(decodeHTML(result.html.replace(/<[^>]*>/g, ''))).toBe(source)
    } finally {
      engine.dispose()
    }
  }
)

it('only injects when enabled and leaves ordinary templates and comments alone', async () => {
  const engine = await createEngine()
  const disabled = await createEngine(false)
  try {
    const source =
      'const view = html`<div title="<img onerror=alert(1)>">Hello</div>`;\r\nconst style = css`.x { color: red; }`;'
    const result = await engine.highlight(source, { language: 'js' })
    expect(result.html).not.toContain('<img')
    expect(decodeHTML(result.html.replace(/<[^>]*>/g, ''))).toBe(source)
    const plain = await disabled.highlight(source, { language: 'js' })
    expect(plain.html).not.toContain('#112233')
    expect(plain.html).not.toContain('#445566')
    const ordinary = await engine.highlight(
      '// html`<div>comment</div>`\nconst value = `<div>text</div>`;',
      { language: 'js' }
    )
    expect(ordinary.html).not.toContain('#112233')
  } finally {
    engine.dispose()
    disabled.dispose()
  }
})

it('updates injected token colors on theme changes', async () => {
  const engine = await createEngine()
  try {
    const source = 'const view = html`<div>Hello</div>`;'
    expect((await engine.highlight(source, { language: 'js' })).html).toContain('#112233')
    await engine.setTheme({
      settings: [
        { scope: 'entity.name.tag.html', settings: { foreground: '#ABCDEF', fontStyle: 'italic' } }
      ]
    })
    const updated = await engine.highlight(source, { language: 'js' })
    expect(updated.html).toContain('color:#ABCDEF;font-style:italic')
    expect(updated.html).not.toContain('#112233')
  } finally {
    engine.dispose()
  }
})

it('supports consumer injections composed with the preset through public callbacks', async () => {
  const custom: IRawGrammar = {
    scopeName: 'custom.injection',
    injectionSelector: 'L:source.js -comment -string',
    patterns: [{ match: '\\bCUSTOM\\b', name: 'constant.custom' }],
    repository: { $self: { patterns: [] }, $base: { patterns: [] } }
  }
  const engine = await createTextmateHighlighter({
    onigLib,
    resolveLanguage: resolveCodeLanguage,
    getScope: getCodeLanguageScope,
    getInjections: scope => [
      ...(getCodeInjections(scope) ?? []),
      ...(scope === 'source.js' ? [custom.scopeName] : [])
    ],
    loadGrammar: async scope => (scope === custom.scopeName ? custom : loadCodeGrammar(scope)),
    theme: {
      settings: [
        ...theme.settings,
        { scope: 'constant.custom', settings: { foreground: '#AABBCC' } }
      ]
    },
    maxLineTime: 1000,
    maxBlockTime: 1500
  })
  try {
    const result = await engine.highlight(
      'const value = CUSTOM; const view = html`<div>Hello</div>`;',
      { language: 'js' }
    )
    expect(result.html).toContain('#AABBCC')
    expect(result.html).toContain('#112233')
  } finally {
    engine.dispose()
  }
})

it('loads injection grammars by their real scope without treating them as code languages', async () => {
  for (const scope of getCodeInjections('source.js')!)
    expect((await loadCodeGrammar(scope))?.scopeName).toBe(scope)
  expect(getCodeInjections('source.yaml')).toBeUndefined()
  expect(resolveCodeLanguage('inline.es6-html')).toBeUndefined()
  expect(await loadCodeGrammar('unconfigured.injection')).toBeNull()
})
