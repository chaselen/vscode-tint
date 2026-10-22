import './style.css'
import { createHighlightJsHighlighter } from '../src/highlightjs'
import { commonHighlightJs, detectCodeLanguage } from '../src/detection'
import type { CodeHighlighter, SyntaxTheme } from '../src/index'
import { samples } from './samples'
import darkPlus from './themes/dark-plus.json'
import lightPlus from './themes/light-plus.json'
import darkModern from './themes/dark-modern.json'
import lightModern from './themes/light-modern.json'
import hcDark from './themes/hc-dark.json'
import hcLight from './themes/hc-light.json'
import githubDark from './themes/github-dark.json'
import githubLight from './themes/github-light.json'

interface DemoTheme extends SyntaxTheme {
  id: string
  kind: string
  source: string
  colors: Record<string, unknown>
}
const themes: DemoTheme[] = [
  darkPlus,
  lightPlus,
  darkModern,
  lightModern,
  githubDark,
  githubLight,
  hcDark,
  hcLight
]
type Engine = 'highlightjs' | 'textmate'
function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing demo element: ${id}`)
  return node as T
}
const themeSelect = element<HTMLSelectElement>('theme')
const engineSelect = element<HTMLSelectElement>('engine')
const sampleSelect = element<HTMLSelectElement>('sample')
const languageSelect = element<HTMLSelectElement>('language')
const source = element<HTMLTextAreaElement>('source')
const style = element<HTMLStyleElement>('highlight-theme')
const pending = new Map<Engine, Promise<CodeHighlighter>>()
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined

for (const theme of themes) themeSelect.add(new Option(theme.name, theme.id))
for (const sample of samples) sampleSelect.add(new Option(sample.label, sample.id))

function selectedTheme(): DemoTheme {
  return themes.find(theme => theme.id === themeSelect.value) ?? themes[0]
}

function applyPageTheme(theme: DemoTheme) {
  const dark = theme.kind === 'dark'
  const fallback = dark
    ? {
        bg: '#181818',
        editor: '#1e1e1e',
        fg: '#d4d4d4',
        muted: '#a0a0a0',
        border: '#414141',
        control: '#313131',
        accent: '#58a6ff'
      }
    : {
        bg: '#f3f3f3',
        editor: '#ffffff',
        fg: '#333333',
        muted: '#616161',
        border: '#d4d4d4',
        control: '#ffffff',
        accent: '#0969da'
      }
  const color = (name: string, fallback: string): string => {
    const value = theme.colors[name]
    return typeof value === 'string' && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)
      ? value
      : fallback
  }
  const variables = {
    bg: color('sideBar.background', fallback.bg),
    editor: color('editor.background', fallback.editor),
    fg: color('editor.foreground', fallback.fg),
    muted: color('descriptionForeground', fallback.muted),
    border: color('contrastBorder', color('panel.border', fallback.border)),
    control: color('dropdown.background', fallback.control),
    accent: color('focusBorder', fallback.accent)
  }
  for (const [name, value] of Object.entries(variables))
    document.documentElement.style.setProperty(`--${name}`, value)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  element('theme-info').textContent = `${theme.name} · ${theme.source}`
}

function getEngine(name: Engine): Promise<CodeHighlighter> {
  let value = pending.get(name)
  if (!value) {
    value = (async () => {
      if (name === 'highlightjs') return createHighlightJsHighlighter({ hljs: commonHighlightJs })
      const [{ createTextmateHighlighter }, { loadOniguruma }, grammar, { default: wasmUrl }] =
        await Promise.all([
          import('../src/textmate'),
          import('../src/oniguruma'),
          import('../src/languages'),
          import('vscode-oniguruma/release/onig.wasm?url')
        ])
      return createTextmateHighlighter({
        onigLib: loadOniguruma(fetch(wasmUrl)),
        loadGrammar: grammar.loadCodeGrammar,
        getInjections: grammar.getCodeInjections,
        resolveLanguage: grammar.resolveCodeLanguage,
        getScope: grammar.getCodeLanguageScope,
        // Demo snapshots include embedded grammars; allow their first regex compilation extra time.
        maxLineTime: 1000,
        maxBlockTime: 1500,
        detectLanguage: detectCodeLanguage
      })
    })().catch(error => {
      pending.delete(name)
      throw error
    })
    pending.set(name, value)
  }
  return value
}

async function render() {
  const version = ++generation
  const theme = selectedTheme()
  const text = source.value
  const language = languageSelect.value === 'auto' ? undefined : languageSelect.value
  const visible: Engine[] =
    engineSelect.value === 'both' ? ['highlightjs', 'textmate'] : [engineSelect.value as Engine]
  applyPageTheme(theme)
  element('character-count').textContent = `${text.length.toLocaleString()} 字符`
  for (const name of ['highlightjs', 'textmate'] as const) {
    const hidden = !visible.includes(name)
    element(`${name}-panel`).hidden = hidden
    if (hidden) element(`${name}-output`).removeAttribute('aria-busy')
  }
  await Promise.all(
    visible.map(async name => {
      const output = element(`${name}-output`)
      const status = element(`${name}-status`)
      status.textContent = '加载中…'
      output.setAttribute('aria-busy', 'true')
      // Clear the previous theme immediately while asynchronous assets are loading.
      output.textContent = text
      try {
        const highlighter = await getEngine(name)
        if (version !== generation) return
        await highlighter.setTheme(theme)
        if (version !== generation) return
        const started = performance.now()
        const result = await highlighter.highlight(text, { language })
        if (version !== generation) return
        if (name === 'highlightjs') style.textContent = highlighter.getStyleSheet()
        output.className = result.className
        output.innerHTML = result.html
        status.textContent = `${result.highlighted ? result.language : '纯文本'} · ${Math.round(performance.now() - started)} ms`
        status.dataset.state = result.highlighted ? 'highlighted' : 'plain'
      } catch (error) {
        if (version !== generation) return
        output.textContent = text
        status.textContent = '加载失败，已保留原文'
        status.dataset.state = 'error'
        console.error(`Unable to render ${name}`, error)
      } finally {
        if (version === generation) output.removeAttribute('aria-busy')
      }
    })
  )
}

function resetSample() {
  source.value = (samples.find(sample => sample.id === sampleSelect.value) ?? samples[0]).source
  void render()
}
source.addEventListener('input', () => {
  // Invalidate in-flight results immediately, before the debounce fires.
  generation++
  clearTimeout(timer)
  timer = setTimeout(() => {
    void render()
  }, 120)
})
for (const select of [themeSelect, engineSelect, languageSelect])
  select.addEventListener('change', () => {
    clearTimeout(timer)
    void render()
  })
sampleSelect.addEventListener('change', resetSample)
element('reset').addEventListener('click', resetSample)
window.addEventListener('pagehide', event => {
  if (event.persisted) return
  generation++
  clearTimeout(timer)
  for (const engine of pending.values()) void engine.then(value => value.dispose()).catch(() => {})
})
resetSample()
