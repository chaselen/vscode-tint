import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const consumer = await mkdtemp(join(tmpdir(), 'vscode-highlighter-package-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const run = (command, args, cwd = consumer) =>
  execFileSync(command, args, { cwd, stdio: 'pipe', encoding: 'utf8' })
try {
  const [tarball] = JSON.parse(run(npm, ['pack', '--ignore-scripts', '--json'], process.cwd()))
  const archive = resolve(tarball.filename)
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  run(npm, [
    'install',
    archive,
    '--ignore-scripts',
    '--engine-strict',
    '--no-audit',
    '--no-fund',
    '--registry=https://registry.npmjs.org'
  ])
  // Load the host entry directly in Node with only the VS Code host API stubbed.
  const vscodeStub = join(consumer, 'node_modules', 'vscode')
  await mkdir(vscodeStub)
  await writeFile(
    join(vscodeStub, 'package.json'),
    JSON.stringify({ type: 'module', exports: './index.js' })
  )
  await writeFile(
    join(vscodeStub, 'index.js'),
    `
    export const Uri = {}
    export default {
      workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
      extensions: { all: [] }
    }
  `
  )
  await writeFile(
    join(consumer, 'host.mjs'),
    `
    import assert from 'node:assert/strict'
    import { getSyntaxTheme } from 'vscode-tint/vscode'
    assert.deepEqual(await getSyntaxTheme(), { name: '', settings: [] })
  `
  )
  run(process.execPath, ['host.mjs'])
  const modules = await readdir(join(consumer, 'node_modules'))
  assert(
    !modules.includes('jsonc-parser'),
    'Host parser is bundled and must not require a runtime JSONC dependency'
  )
  assert(!modules.includes('tm-grammars'), 'Base installation must not install grammars')
  assert(!modules.includes('vscode-oniguruma'), 'Base installation must not install WASM')
  const source = `
    import assert from 'node:assert/strict'
    import { createHighlightJsHighlighter } from 'vscode-tint/highlightjs'
    import { commonHighlightJs } from 'vscode-tint/detection'
    const engine = await createHighlightJsHighlighter({ hljs: commonHighlightJs, theme: { settings: [{ scope: 'string', settings: { foreground: '#123456' } }] } })
    const result = await engine.highlight('const text = "<script>"', { language: 'js' })
    assert(result.highlighted)
    assert(!result.html.includes('<script>'))
    assert(engine.getStyleSheet().includes('#123456'))
    assert((await engine.highlight('<!doctype html><html></html>')).language === 'xml')
    engine.dispose()
  `
  await writeFile(join(consumer, 'light.mjs'), source)
  run(process.execPath, ['light.mjs'])
  const browser = source.replace(
    "import assert from 'node:assert/strict'",
    'const assert = value => { if (!value) throw new Error("Assertion failed") }'
  )
  await writeFile(join(consumer, 'browser.mjs'), browser)
  const bundle = await build({
    absWorkingDir: consumer,
    entryPoints: ['browser.mjs'],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    minify: true,
    write: false,
    metafile: true
  })
  const inputs = Object.keys(bundle.metafile.inputs)
  assert(
    !inputs.some(input => /vscode-oniguruma|tm-grammars/.test(input)),
    'Light bundle must not contain full-engine dependencies'
  )
  await writeFile(
    join(consumer, 'consumer.ts'),
    `
    import type { CodeHighlighter } from 'vscode-tint'
    import { createHighlightJsHighlighter } from 'vscode-tint/highlightjs'
    import core from 'highlight.js/lib/core'
    const highlighter: CodeHighlighter = await createHighlightJsHighlighter({ hljs: core.newInstance() })
    await highlighter.highlight('hello', { autoDetect: false })
  `
  )
  run(process.execPath, [
    resolve('node_modules/typescript/bin/tsc'),
    '--noEmit',
    '--module',
    'nodenext',
    '--target',
    'es2022',
    '--skipLibCheck',
    'consumer.ts'
  ])
  run(npm, [
    'install',
    '--no-save',
    'vscode-oniguruma@2.0.1',
    'tm-grammars@1.32.22',
    '--ignore-scripts',
    '--engine-strict',
    '--no-audit',
    '--no-fund',
    '--registry=https://registry.npmjs.org'
  ])
  await writeFile(
    join(consumer, 'full.mjs'),
    `
    import assert from 'node:assert/strict'
    import { readFile } from 'node:fs/promises'
    import { createRequire } from 'node:module'
    import { createTextmateHighlighter } from 'vscode-tint/textmate'
    import { loadOniguruma } from 'vscode-tint/oniguruma'
    import { loadCodeGrammar, resolveCodeLanguage, getCodeLanguageScope, getCodeInjections } from 'vscode-tint/languages'
    const bytes = await readFile(createRequire(import.meta.url).resolve('vscode-oniguruma/release/onig.wasm'))
    const padded = Buffer.concat([Buffer.from([0, 1]), bytes, Buffer.from([2, 3])])
    const engine = await createTextmateHighlighter({
      onigLib: loadOniguruma(padded.subarray(2, padded.length - 2)),
      loadGrammar: loadCodeGrammar, resolveLanguage: resolveCodeLanguage, getScope: getCodeLanguageScope, getInjections: getCodeInjections,
      detectLanguage: () => 'xml',
      theme: { settings: [{ scope: 'string', settings: { foreground: '#654321' } }, { scope: 'entity.name.tag.html', settings: { foreground: '#123456' } }, { scope: 'support.type.property-name.css', settings: { foreground: '#abcdef' } }] }
    })
    const result = await engine.highlight('const value = "<script>"', { language: 'js' })
    assert(result.highlighted)
    assert(!result.html.includes('<script>'))
    assert(result.html.includes('#654321'))
    const html = await engine.highlight('<!doctype html><html><script>const value = "hello";</script></html>')
    assert(html.language === 'xml')
    assert(html.highlighted)
    assert(html.html.includes('#654321'))
    const tagged = await engine.highlight('const view = html\`<h1>Hello</h1>\`; const style = css\`h1 { color: red; }\`;', { language: 'js' })
    assert(tagged.highlighted)
    assert(tagged.html.includes('#123456'))
    assert(tagged.html.includes('#ABCDEF'))
    engine.dispose()
  `
  )
  run(process.execPath, ['full.mjs'])
  console.log(
    `Packed consumer checks passed. Tarball: ${tarball.size} bytes; light browser bundle with 18 language definitions: ${bundle.outputFiles[0].contents.length} bytes.`
  )
} catch (error) {
  if (error.stdout) console.error(String(error.stdout))
  if (error.stderr) console.error(String(error.stderr))
  throw error
} finally {
  await rm(consumer, { recursive: true, force: true })
}
