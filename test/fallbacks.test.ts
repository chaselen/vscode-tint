import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { beforeAll, expect, it, vi } from 'vitest'
import type { IOnigLib } from 'vscode-textmate'
import textmate from 'vscode-textmate'
import { loadOniguruma } from '../src/oniguruma.js'
import { createTextmateHighlighter } from '../src/textmate.js'
import { createHighlightJsHighlighter } from '../src/presets/highlightjs.js'
import { loadCodeGrammar, resolveCodeLanguage, getCodeLanguageScope } from '../src/languages.js'

let onigLib: IOnigLib
beforeAll(async () => {
  onigLib = await loadOniguruma(
    readFileSync(createRequire(import.meta.url).resolve('vscode-oniguruma/release/onig.wasm'))
  )
})
const options = () => ({
  onigLib,
  loadGrammar: loadCodeGrammar,
  resolveLanguage: resolveCodeLanguage,
  getScope: getCodeLanguageScope
})

it.each(['text', 'plaintext', 'txt', 'plain'])(
  'both engines distinguish explicit %s from unknown languages',
  async language => {
    const engines = [
      await createTextmateHighlighter(options()),
      await createHighlightJsHighlighter()
    ]
    for (const engine of engines) {
      try {
        expect(await engine.highlight('<x>&', { language })).toMatchObject({
          html: '&lt;x&gt;&amp;',
          highlighted: false,
          reason: 'plaintext'
        })
        expect((await engine.highlight('<x>', { language: 'unknown' })).reason).toBe(
          'unsupported-language'
        )
        expect((await engine.highlight('<x>', { autoDetect: false })).reason).toBe(
          'language-not-specified'
        )
      } finally {
        engine.dispose()
      }
    }
  }
)

it('distinguishes unclassified input and absent language configuration', async () => {
  const a = await createTextmateHighlighter(options())
  const b = await createTextmateHighlighter({ ...options(), detectLanguage: () => undefined })
  const light = await createHighlightJsHighlighter()
  try {
    expect((await a.highlight('')).reason).toBe('language-not-specified')
    expect((await b.highlight('')).reason).toBe('language-not-detected')
    expect((await light.highlight('')).reason).toBe('language-not-detected')
  } finally {
    a.dispose()
    b.dispose()
    light.dispose()
  }
})

it('reports code and line limits without loading grammars', async () => {
  const loadGrammar = vi.fn(loadCodeGrammar)
  const engine = await createTextmateHighlighter({
    ...options(),
    loadGrammar,
    maxCodeLength: 8,
    maxLineLength: 3
  })
  const light = await createHighlightJsHighlighter({ maxCodeLength: 8 })
  try {
    for (const highlighter of [engine, light]) {
      expect(await highlighter.highlight('<12345678>', { language: 'js' })).toMatchObject({
        html: '&lt;12345678&gt;',
        reason: 'code-too-long'
      })
    }
    expect((await engine.highlight('1234', { language: 'js' })).reason).toBe('line-too-long')
    expect(loadGrammar).not.toHaveBeenCalled()
  } finally {
    engine.dispose()
    light.dispose()
  }
})

it.each([false, true])(
  'reports unavailable grammar for absent loader/scope: %s',
  async absentScope => {
    const engine = await createTextmateHighlighter({
      ...options(),
      loadGrammar: async () => null,
      getScope: absentScope ? () => undefined : getCodeLanguageScope
    })
    try {
      expect((await engine.highlight('x', { language: 'js' })).reason).toBe('grammar-unavailable')
    } finally {
      engine.dispose()
    }
  }
)

it.each([false, true])(
  'distinguishes theme invalidation from disposal during grammar loading: %s',
  async dispose => {
    let release!: () => void
    const barrier = new Promise<void>(resolve => {
      release = resolve
    })
    const engine = await createTextmateHighlighter({
      ...options(),
      loadGrammar: async scope => {
        await barrier
        return loadCodeGrammar(scope)
      }
    })
    const pending = engine.highlight('let x = 1', { language: 'js' })
    if (dispose) engine.dispose()
    else await engine.setTheme({ settings: [] })
    release()
    expect((await pending).reason).toBe(dispose ? 'disposed' : 'theme-changed')
    engine.dispose()
  }
)

it('reports timeout instead of emitting partial HTML; loader errors remain rejections', async () => {
  const original = textmate.Registry.prototype.loadGrammar
  const spy = vi
    .spyOn(textmate.Registry.prototype, 'loadGrammar')
    .mockImplementation(async function (this: InstanceType<typeof textmate.Registry>, scope) {
      const grammar = await original.call(this, scope)
      if (grammar)
        grammar.tokenizeLine2 = () => ({
          tokens: new Uint32Array(),
          fonts: [],
          ruleStack: textmate.INITIAL,
          stoppedEarly: true
        })
      return grammar
    })
  const engine = await createTextmateHighlighter(options())
  try {
    expect(await engine.highlight('<x>', { language: 'js' })).toMatchObject({
      html: '&lt;x&gt;',
      highlighted: false,
      reason: 'timeout'
    })
  } finally {
    engine.dispose()
    spy.mockRestore()
  }
  const broken = await createTextmateHighlighter({
    ...options(),
    loadGrammar: async () => {
      throw new Error('loader failed')
    }
  })
  try {
    await expect(broken.highlight('x', { language: 'js' })).rejects.toThrow('loader failed')
  } finally {
    broken.dispose()
  }
})
