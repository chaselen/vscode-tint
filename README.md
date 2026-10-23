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

常用语言可以直接使用预设，默认支持自动识别：

```ts
import { createHighlightJsHighlighter } from 'vscode-tint/presets/highlightjs'
import type { SyntaxTheme } from 'vscode-tint'

const theme: SyntaxTheme = {
  settings: [{ scope: 'string', settings: { foreground: '#a5d6ff' } }]
}
const highlighter = await createHighlightJsHighlighter({ theme })
const result = await highlighter.highlight('const value = "hello"', { language: 'js' })
codeElement.classList.add(result.className)
codeElement.innerHTML = result.html
styleElement.textContent = highlighter.getStyleSheet()
```

省略 `language` 时自动识别，可用 `detectLanguages` 限制候选，或在 `highlight()` 中通过 `{ autoDetect: false }` 关闭。每个实例默认生成独立的 `className`，请应用返回类名和 CSS，不要叠加其他 highlight.js 主题 CSS。

需要自定义语言集合时，继续使用底层 `vscode-tint/highlightjs` 工厂并传入注册好语言的 `hljs.newInstance()`。预设也接受 `scopeMap`，用于调整 highlight.js 类别对应的代表性 scope。

## TextMate 引擎

以下示例复用上一节的 `theme`。`?url` 是调用方使用 Vite 时加载 WASM 的写法，库本身不绑定构建工具。

```ts
import wasmUrl from 'vscode-oniguruma/release/onig.wasm?url'
import { createTextmateHighlighter } from 'vscode-tint/presets/textmate'

const highlighter = await createTextmateHighlighter({
  wasm: fetch(wasmUrl),
  theme
})
const result = await highlighter.highlight('const answer = 42')
codeElement.classList.add(result.className)
codeElement.innerHTML = result.html
```

预设默认启用自动检测、常用 grammar 及 JS / TS / TSX 的 HTML/CSS 标签模板注入；通过 `autoDetect: false`、`injections: false` 分别关闭。未声明语言时才自动检测；显式未知语言不会再次猜测。

`wasm` 接受 `ArrayBuffer`、`Uint8Array`（含 Node Buffer）、`Response` 或对应 Promise；Node 中可直接传入 `readFile()` 结果。预设不下载 WASM，也不绑定 URL 或 CDN，初始化失败时工厂调用拒绝。grammar 按需加载，但预设引用的语法仍会进入打包产物。

需要自定义 grammar、正则引擎或检测器时，保留底层 `vscode-tint/textmate` 工厂，传入 `onigLib`、`loadGrammar`、`resolveLanguage`、`getScope`，可选 `getInjections` 和 `detectLanguage`。该工厂不会自动配置检测或注入。`/languages`、`/detection` 和 `/oniguruma` 仍可独立组合。

自定义 `getInjections(scope)` 返回注入 grammar 的 scope 数组或 `undefined`，并由 `loadGrammar()` 提供带有 `injectionSelector` 的 grammar 及依赖；修改注入配置时重建实例。内置注入不保证覆盖外层语言中的脚本、自定义标签或所有插值嵌套，YAML+ERB 尚不支持。

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

## 回退原因

纯文本回退始终保留完整转义文本，`highlighted: false`，并提供可选 `reason`。成功结果不带 `reason`；字段保持可选以兼容现有自定义高亮器。

| reason                            | 含义                                    |
| --------------------------------- | --------------------------------------- |
| `plaintext`                       | 显式选择纯文本                          |
| `language-not-specified`          | 未声明语言且没有启用检测                |
| `language-not-detected`           | 检测器未识别出语言                      |
| `unsupported-language`            | 不支持该语言                            |
| `grammar-unavailable`             | 已解析语言，但没有可用 scope 或 grammar |
| `code-too-long` / `line-too-long` | 超出代码或单行长度上限                  |
| `timeout`                         | TextMate 分词超时                       |
| `theme-changed` / `disposed`      | 处理中主题已变化或实例已释放，结果作废  |

```ts
if (!result.highlighted) console.debug('高亮回退:', result.reason)
```

加载错误仍抛出，应用需捕获；释放后新调用仍抛错。`disposed` 仅用于释放前已经开始的 TextMate 请求。

## 使用边界

- 自动检测不保证准确，已知语言优先显式指定。HTML/XML 共用 `xml` 检测结果；TextMate 仅在自动模式下根据开头的 HTML doctype 或 `<html>` 选择 HTML grammar，返回的 `language` 仍为 `xml`。HTML 片段建议指定 `html`，TSX 应指定 `tsx`。
- 轻量引擎不能完整还原语言专属及父级 scope 规则；两套引擎均不能保证与编辑器逐 token 一致。
- 默认代码上限 100000 字符，检测样本 12000 字符；TextMate 单行上限 10000 字符，单行 / 代码块预算为 250ms / 500ms，可通过工厂选项调整。预算无法中断正在执行的单个正则，处理不可信大输入时可配合 Worker。
- Webview 的 CSP 需允许实际使用的脚本、WASM 及样式；库不会修改 CSP。

更多参数见各入口导出的 TypeScript 类型与 JSDoc。源码开发、验证、演示维护和发布约定见仓库中的 [AGENTS.md](https://github.com/chaselen/vscode-tint/blob/main/AGENTS.md)。

## License

MIT。第三方许可见 [THIRD_PARTY_NOTICES.txt](./THIRD_PARTY_NOTICES.txt)；打包 grammar 或 WASM 时须保留对应上游许可。
