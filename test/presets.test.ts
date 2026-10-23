import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { createHighlightJsHighlighter } from '../src/presets/highlightjs.js'
import { createTextmateHighlighter } from '../src/presets/textmate.js'

const wasm = readFileSync(
  createRequire(import.meta.url).resolve('vscode-oniguruma/release/onig.wasm')
)
const theme = {
  settings: [
    { scope: 'entity.name.tag.html', settings: { foreground: '#123456' } },
    { scope: 'support.type.property-name.css', settings: { foreground: '#abcdef' } },
    { scope: 'string', settings: { foreground: '#654321' } }
  ]
}

it('light preset detects common languages and isolates instance CSS', async () => {
  const a = await createHighlightJsHighlighter({ theme })
  const b = await createHighlightJsHighlighter()
  try {
    const result = await a.highlight('{"name":"<img>"}')
    expect(result.language).toBe('json')
    expect(result.reason).toBeUndefined()
    expect(result.html).not.toContain('<img>')
    expect(a.getStyleSheet()).toContain('#654321')
    expect(result.className).not.toBe((await b.highlight('x')).className)
  } finally {
    a.dispose()
    b.dispose()
  }
})

it('TextMate preset wires detection, HTML embeddings and template injections', async () => {
  const engine = await createTextmateHighlighter({
    wasm,
    theme,
    maxLineTime: 1000,
    maxBlockTime: 1500
  })
  try {
    const html = await engine.highlight(
      '<!doctype html><html><style>h1 { color: red; }</style><script>const title = "hello"</script></html>'
    )
    expect(html.highlighted).toBe(true)
    expect(html.language).toBe('xml')
    expect(html.html).toContain('#ABCDEF')
    expect(html.html).toContain('#654321')
    const tagged = await engine.highlight(
      'const view = html`<h1>Hello</h1>`; const style = css`h1 { color: red; }`;',
      { language: 'js' }
    )
    expect(tagged.html).toContain('#123456')
    expect(tagged.html).toContain('#ABCDEF')
    expect(tagged.reason).toBeUndefined()
  } finally {
    engine.dispose()
  }
})

it('TextMate preset can disable detection and injections without changing explicit language handling', async () => {
  const engine = await createTextmateHighlighter({
    wasm,
    theme,
    autoDetect: false,
    injections: false,
    maxLineTime: 1000,
    maxBlockTime: 1500
  })
  try {
    expect((await engine.highlight('const x = 1')).reason).toBe('language-not-specified')
    expect((await engine.highlight('const x = 1', { language: 'js' })).highlighted).toBe(true)
    expect(
      (await engine.highlight('const view = html`<h1>Hello</h1>`;', { language: 'js' })).html
    ).not.toContain('#123456')
  } finally {
    engine.dispose()
  }
})

it('preset reports invalid WASM during creation rather than disguising it as a fallback', async () => {
  await expect(
    createTextmateHighlighter({ wasm: new Response('', { status: 404 }) })
  ).rejects.toThrow('404')
})
