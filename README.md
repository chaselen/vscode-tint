# vscode-tint

面向 VS Code Webview 的代码高亮与主题适配，支持自动识别语言、主题切换和安全 HTML 输出。

[在线演示](https://chaselen.github.io/vscode-tint/)：切换 VS Code 主题，实时对比两套引擎。

| 引擎          | 分词                        | 配色                  | 适合场景                 |
| ------------- | --------------------------- | --------------------- | ------------------------ |
| `highlightjs` | highlight.js                | TextMate 代表性 scope | 优先控制包体积           |
| `textmate`    | vscode-textmate + Oniguruma | 真实 grammar scope    | 需要语言上下文和嵌入语法 |

两套引擎均通过微软官方 `vscode-textmate` 的公开 API 匹配主题。highlight.js 类别到 scope 的对应表由本包维护，并非 VS Code 官方映射；两者均不包含编辑器的语义高亮。

## 安装

```sh
npm install vscode-tint
```

使用 TextMate 引擎和预设语法时，另装可选依赖：

```sh
npm install vscode-oniguruma@2.0.1 tm-grammars@1.32.22
```

ESM 包，提供 TypeScript 声明。Node 要求 `^20.19.0 || >=22.12.0`；Webview 通用入口不依赖 Node.js 或 `vscode` 运行时。只使用轻量引擎不会加载 WASM 或 grammar。

## highlight.js 引擎

由调用方注册语言，使用 `newInstance()` 隔离其他 highlight.js 使用者。

```ts
import core from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import { createHighlightJsHighlighter } from 'vscode-tint/highlightjs'
import type { SyntaxTheme } from 'vscode-tint'

const hljs = core.newInstance()
hljs.registerLanguage('javascript', javascript)
const theme: SyntaxTheme = {
  settings: [
    { scope: 'keyword', settings: { foreground: '#ff7b72' } },
    { scope: 'string', settings: { foreground: '#a5d6ff' } }
  ]
}
const highlighter = await createHighlightJsHighlighter({ hljs, theme })
const result = await highlighter.highlight('const value = "hello"', { language: 'js' })

codeElement.classList.add(result.className)
codeElement.innerHTML = result.html
styleElement.textContent = highlighter.getStyleSheet()
```

省略 `language` 时自动识别已注册语言，可用 `detectLanguages` 限制候选，或通过 `{ autoDetect: false }` 关闭。也可从 `vscode-tint/detection` 导入包含 18 种候选语言的 `commonHighlightJs`，直接作为 `hljs` 传入。

每个实例默认生成独立的 `className`，请将返回的类名和 `getStyleSheet()` 的 CSS 应用到代码元素，不要叠加其他 highlight.js 主题 CSS。可用 `scopeMap` 调整类别对应的 scope，例如 `{ 'title.function': ['entity.name.function', 'support.function'] }`；候选按顺序选择首个有样式的 scope。

## TextMate 引擎

以下示例复用上一节的 `theme`。`?url` 是调用方使用 Vite 时加载 WASM 的写法，库本身不绑定构建工具。

```ts
import wasmUrl from 'vscode-oniguruma/release/onig.wasm?url'
import { loadOniguruma } from 'vscode-tint/oniguruma'
import { createTextmateHighlighter } from 'vscode-tint/textmate'
import {
  resolveCodeLanguage,
  getCodeLanguageScope,
  getCodeInjections,
  loadCodeGrammar
} from 'vscode-tint/languages'

const highlighter = await createTextmateHighlighter({
  onigLib: loadOniguruma(fetch(wasmUrl)),
  loadGrammar: loadCodeGrammar,
  getInjections: getCodeInjections,
  resolveLanguage: resolveCodeLanguage,
  getScope: getCodeLanguageScope,
  theme,
  detectLanguage: async source => {
    const { detectCodeLanguage } = await import('vscode-tint/detection')
    return detectCodeLanguage(source)
  }
})
const result = await highlighter.highlight('const answer = 42')
codeElement.classList.add(result.className)
codeElement.innerHTML = result.html
```

TextMate 本身不识别语言，示例通过可选的 `detectLanguage` 接入 highlight.js；省略时需显式指定语言，否则返回纯文本。

- `loadOniguruma()` 接受 `ArrayBuffer`、`Uint8Array`（含 Node Buffer）、`Response` 或对应 Promise。Node 中可直接传入 `readFile()` 结果；WASM 初始化失败时工厂调用拒绝。
- `/languages` 提供常用语法及嵌入依赖的按需加载。动态加载减少首次加载量，但预设引用的 grammar 仍会进入打包产物。可通过 `loadGrammar`、`resolveLanguage`、`getScope` 和 `onigLib` 接入自定义语法或正则引擎。
- `getInjections: getCodeInjections` 启用 JS / TS / TSX 的上游 HTML/CSS 标签模板规则；省略时不启用。YAML+ERB 尚不支持。

自定义注入沿用官方 `RegistryOptions.getInjections` 契约，并由 `loadGrammar` 提供注入 grammar 及依赖：

```ts
getInjections: scope => [
  ...(getCodeInjections(scope) ?? []),
  ...(scope === 'source.js' ? ['my.custom.injection'] : [])
]
```

注入 grammar 须定义 `injectionSelector`。修改注入配置时应重建引擎；预设不保证覆盖外层语言中嵌套的脚本、任意自定义标签或所有插值嵌套。

## 读取 VS Code 主题

以下代码仅在扩展宿主运行，通过应用自己的 RPC 将主题传给 Webview。

```ts
import { getSyntaxTheme, watchSyntaxTheme } from 'vscode-tint/vscode'

const theme = await getSyntaxTheme()
// 通过应用自己的 RPC 将可序列化的 theme 发送给 Webview。
const subscription = watchSyntaxTheme(() => {
  void getSyntaxTheme().then(theme => sendThemeToWebview(theme))
})
context.subscriptions.push(subscription)
```

支持主题 ID / label、JSONC、`include` 继承、外部 `tokenColors`、`.tmTheme` 及 `editor.tokenColorCustomizations`。读取失败时警告并使用可读取的自定义规则回退。库不提供 RPC，也不控制背景、字体或间距；未匹配的 token 继承容器颜色。

## 主题切换与生命周期

两套工厂均返回 `Promise<CodeHighlighter>`。通常每个视图复用一个实例，同时展示不同主题时使用多个实例。

```ts
const result = await highlighter.highlight(source, { language: 'javascript' })
// result: { html, language?, highlighted, className }

await highlighter.setTheme(nextTheme)
styleElement.textContent = highlighter.getStyleSheet()
// 重新高亮已有代码块，更新其 HTML。
highlighter.dispose()
```

`getStyleSheet()` 在轻量引擎返回 CSS，TextMate 引擎返回空字符串，颜色直接写入 token span。调用方负责 DOM、CSS 和异步渲染顺序，避免旧结果覆盖新代码或新主题；主题更新完成后需重新高亮。

未知的显式语言、纯文本、超出长度限制或 TextMate 超时返回转义后的完整文本，`highlighted: false`，不会再次猜测未知语言。加载错误向外抛出，应用应捕获并显示原文；释放后继续调用会抛错。

## 使用边界

- 自动检测不保证准确，已知语言优先显式指定。HTML/XML 共用 `xml` 检测结果；TextMate 仅在自动模式下根据开头的 HTML doctype 或 `<html>` 选择 HTML grammar，返回的 `language` 仍为 `xml`。HTML 片段建议指定 `html`，TSX 应指定 `tsx`。
- 轻量引擎不能完整还原语言专属及父级 scope 规则；两套引擎均不能保证与编辑器逐 token 一致。
- 默认代码上限 100000 字符，检测样本 12000 字符；TextMate 单行上限 10000 字符，单行 / 代码块预算为 250ms / 500ms，可通过工厂选项调整。预算无法中断正在执行的单个正则，处理不可信大输入时可配合 Worker。
- Webview 的 CSP 需允许实际使用的脚本、WASM 及样式；库不会修改 CSP。

更多参数见各入口导出的 TypeScript 类型与 JSDoc。源码开发、验证、演示维护和发布约定见仓库中的 [AGENTS.md](https://github.com/chaselen/vscode-tint/blob/main/AGENTS.md)。

## License

MIT。第三方许可见 [THIRD_PARTY_NOTICES.txt](./THIRD_PARTY_NOTICES.txt)；打包 grammar 或 WASM 时须保留对应上游许可。
