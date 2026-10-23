import { rm } from 'node:fs/promises'
import { build } from 'esbuild'
await rm('dist', { recursive: true, force: true })
await build({
  entryPoints: [
    'src/index.ts',
    'src/highlightjs.ts',
    'src/textmate.ts',
    'src/languages.ts',
    'src/detection.ts',
    'src/oniguruma.ts',
    'src/presets/textmate.ts',
    'src/presets/highlightjs.ts'
  ],
  outdir: 'dist',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  supported: { 'import-attributes': true },
  packages: 'external'
})

// JSONC 的 ESM 包内导入省略扩展名；宿主入口须内联，不能原样留给 Node 解析
await build({
  entryPoints: ['src/vscode.ts'],
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  external: ['vscode', 'vscode-textmate']
})
