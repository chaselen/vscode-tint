import vscode, { Uri } from 'vscode'
// UMD 入口的动态 require 无法被 esbuild 完整打包，使用包内 ESM 入口
import { parse, type ParseError } from 'jsonc-parser/lib/esm/main.js'
import textmate from 'vscode-textmate'
import {
  getCustomTokenColorRules,
  isRecord,
  readTokenColorRules,
  type TokenColorRule
} from './tokenColors.js'
import type { IRawTheme } from 'vscode-textmate'

interface ThemeContribution {
  id?: string
  label?: string
  path: string
}

let cached: { key: string; theme: Promise<IRawTheme> } | undefined

/** 加载 JSONC 主题继承与外置 tokenColors，限制循环与异常深度 */
async function readThemeRules(
  uri: vscode.Uri,
  ancestors: string[] = []
): Promise<TokenColorRule[]> {
  const key = uri.toString()
  if (ancestors.includes(key) || ancestors.length >= 32) {
    throw new Error('主题继承存在循环或层级过深')
  }
  const source = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
  if (uri.path.toLowerCase().endsWith('.tmtheme')) {
    const parsed: unknown = textmate.parseRawGrammar(source, uri.path)
    return isRecord(parsed) ? readTokenColorRules(parsed.settings) : []
  }
  const errors: ParseError[] = []
  const theme: unknown = parse(source, errors, { allowTrailingComma: true })
  if (errors.length) throw new Error('主题文件不是有效的 JSONC')
  if (Array.isArray(theme)) return readTokenColorRules(theme)
  if (!isRecord(theme)) throw new Error('主题文件不是有效的 JSONC 对象')
  const rules: TokenColorRule[] = []
  const parents = [...ancestors, key]
  const directory = Uri.joinPath(uri, '..')
  if (typeof theme.include === 'string') {
    rules.push(...(await readThemeRules(Uri.joinPath(directory, theme.include), parents)))
  }
  if (typeof theme.tokenColors === 'string') {
    rules.push(...(await readThemeRules(Uri.joinPath(directory, theme.tokenColors), parents)))
  } else {
    rules.push(...readTokenColorRules(theme.tokenColors))
  }
  return rules
}

/** 获取当前选中主题的 tokenColors；多个 Webview 共用同一份读取结果 */
export function getSyntaxTheme(): Promise<IRawTheme> {
  const themeName = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme', '')
  const customizations = vscode.workspace
    .getConfiguration('editor')
    .get<unknown>('tokenColorCustomizations')
  const extensions = vscode.extensions.all
  const key = JSON.stringify([
    themeName,
    customizations,
    extensions.map(extension => [
      extension.id,
      extension.packageJSON.version,
      extension.extensionUri.toString()
    ])
  ])
  if (cached?.key === key) return cached.theme

  const theme = (async () => {
    let rules: TokenColorRule[] = []
    for (const extension of extensions) {
      const contributions: unknown = extension.packageJSON.contributes?.themes
      if (!Array.isArray(contributions)) continue
      const theme = contributions.find(
        (value): value is ThemeContribution =>
          isRecord(value) &&
          typeof value.path === 'string' &&
          (value.id === themeName || (!value.id && value.label === themeName))
      )
      if (!theme) continue
      try {
        rules = await readThemeRules(Uri.joinPath(extension.extensionUri, theme.path))
      } catch (error) {
        console.warn('[vscode-tint] Unable to read syntax theme', themeName, error)
      }
      break
    }
    return {
      name: themeName,
      settings: [...rules, ...getCustomTokenColorRules(customizations, themeName)]
    }
  })()
  cached = { key, theme }
  return theme
}

/** 按需订阅宿主主题、token 自定义与主题扩展变化，由 RPC 桥接器释放 */
export function watchSyntaxTheme(onChange: () => void): vscode.Disposable {
  const changed = () => {
    cached = undefined
    onChange()
  }
  return vscode.Disposable.from(
    vscode.window.onDidChangeActiveColorTheme(changed),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (
        event.affectsConfiguration('workbench.colorTheme') ||
        event.affectsConfiguration('editor.tokenColorCustomizations')
      )
        changed()
    }),
    vscode.extensions.onDidChange(changed)
  )
}
