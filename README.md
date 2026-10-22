# vscode-tint

面向 VS Code Webview 的代码高亮与主题适配。提供两套可独立导入的引擎，支持自动识别语言、主题切换和安全 HTML 输出。

| 引擎          | 分词与 HTML                      | 主题匹配                                    | 适合场景                       |
| ------------- | -------------------------------- | ------------------------------------------- | ------------------------------ |
| `highlightjs` | highlight.js                     | 官方 vscode-textmate，使用代表性 scope 探针 | 优先控制包体积的帖子、文档展示 |
| `textmate`    | 官方 vscode-textmate + Oniguruma | 官方 vscode-textmate，使用真实语法 scope    | 需要语言上下文和嵌入语法的展示 |

只使用公开 API，不访问 VS Code 内部服务，不自建 TextMate 主题选择器匹配器。highlight.js 类别与代表性 TextMate scope 的对应表由本包维护，并非 VS Code 官方映射。

## 安装

```sh
npm install vscode-tint
```

轻量方案不需要安装 WASM 或语法包。完整方案另行安装以下可选 peer dependencies：

```sh
npm install vscode-oniguruma@2.0.1 tm-grammars@1.32.22
```

ESM 包，提供 TypeScript 声明。开发及 Node.js 调用要求 Node >= 22.18.0；Webview 入口不依赖 Node.js 或 `vscode` 运行时。

## highlight.js 为主

由调用方提供 highlight.js 实例，决定支持哪些语言。使用 `newInstance()`，避免影响应用中其他 highlight.js 使用者。

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

缺少 `language` 时默认自动识别；可以通过 `detectLanguages` 限制候选，通过 `{ autoDetect: false }` 关闭。自动识别只检查前 12000 个字符，选定语言后高亮整个允许长度内的代码块。

每个轻量实例默认生成独立的 CSS 类名，多实例可使用不同主题而互不覆盖。请使用返回的 `result.className`，不要硬编码类名；也可传入单个合法类名 `className` 固定作用域，自定义时由调用方保证实例之间不冲突。

可选的 `scopeMap` 覆盖单个 highlight.js 类别对应的代表性 scope；候选按顺序选择第一个有样式的 scope。键名采用 highlight.js 的点分类别，如 `title.function`，转换为 `.hljs-title.function_`。

```ts
const highlighter = await createHighlightJsHighlighter({
  hljs,
  theme,
  detectLanguages: ['javascript'],
  scopeMap: { 'title.function': ['entity.name.function', 'support.function'] }
})
```

调用方负责将 CSS 写入自己允许的样式容器，并在代码元素上添加返回的 `className`。不要同时加载覆盖这些颜色的 highlight.js 主题 CSS。

## TextMate 为主

使用本包的可选常用语法集合，并按需加载本地 WASM。以下 `?url` 是消费者侧 Vite 的写法，包本身不绑定 Vite。

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

`onigLib` 也可以注入自定义的 `IOnigLib`；`loadGrammar`、`resolveLanguage` 和 `getScope` 可替换为自建语法集合。公共检测器与 highlight.js 引擎保留 highlight.js 的原始检测结果。HTML 和 XML 共用 highlight.js 的 `xml` grammar，因此 HTML 示例的自动识别结果也是 `xml`。只有 TextMate 引擎在选择 grammar 时，才根据检测样本开头的 HTML doctype 或 `<html>` 根标签选择支持 CSS / JavaScript 嵌入的 HTML grammar；返回的 `language` 仍为 `xml`，不会被该适配改写。显式指定 `xml` 时使用 XML grammar；没有明确文档线索的 HTML 片段建议显式指定 `html`。自定义语法集合未提供 HTML scope 时回退到原语言 scope。

TextMate 工厂会等待 `onigLib` 就绪，WASM 初始化失败时创建调用直接拒绝。`loadOniguruma()` 接受 `ArrayBuffer`、`Uint8Array`（包括 Node Buffer）、`Response` 或对应 Promise。Node 中可直接传入 `readFile()` 的结果，无需手动截取底层 buffer。

TextMate 不提供语言自动识别；未提供 `detectLanguage` 时，未标注语言的代码保持纯文本。

`/languages` 入口包含 28 个语言及嵌入依赖的动态导入，以及 2 个可选 HTML/CSS 标签模板注入 grammar。语言集合包括：Shell、C、C++、C#、CSS、Diff、Dockerfile、Go、INI、Java、JavaScript、JSON、Kotlin、Markdown、Objective-C、PHP、Python、Ruby、Rust、SQL、TypeScript、XML、HTML、YAML、TOML、TSX，以及 C++ macro 和 Python regexp 嵌入依赖。未包含的嵌入语法保留外层样式。动态加载减少首次加载量，所有引用的 grammar 仍会进入消费者的打包产物。

`/detection` 入口提供隔离实例 `commonHighlightJs`、18 种候选语言的 `AUTO_DETECT_LANGUAGES` 和 `detectCodeLanguage()`。轻量方案也可以直接把 `commonHighlightJs` 传给 `createHighlightJsHighlighter()`。

### HTML/CSS 标签模板注入

`getCodeInjections()` 为 `source.js`、`source.ts`、`source.tsx` 返回 `inline.es6-html` 和 `inline.es6-css`。`loadCodeGrammar()` 负责加载它们及预设中已有的 HTML、CSS、JS 和 TS 依赖，复用 `tm-grammars` 中的 `es-tag-html` / `es-tag-css`（上游 `0x00000001A/es6-string-html`，MIT），不复制或修改正则规则。

将 `getInjections: getCodeInjections` 传给工厂即可启用。省略时保留原有语法行为。它用于匹配根 JS / TS / TSX scope，不保证所有外层语言中嵌套的脚本也自动应用这些注入。上游支持的标签、注释标记和 token scope 决定具体效果，不保证覆盖任意自定义标签或所有插值嵌套。

```ts
const result = await highlighter.highlight(
  'const view = html`<h1>${title}</h1>`; const style = css`h1 { color: red; }`;',
  { language: 'javascript' }
)
```

`TextmateOptions.getInjections` 直接遵循官方 `RegistryOptions.getInjections` 契约：同步接收宿主 scope，返回注入 grammar 的 scope 数组或 `undefined`。可与自定义规则组合：

```ts
getInjections: scope => [
  ...(getCodeInjections(scope) ?? []),
  ...(scope === 'source.js' ? ['my.custom.injection'] : [])
]
```

同时由 `loadGrammar()` 返回自定义 scope 对应的 `IRawGrammar` 及其依赖；注入 grammar 自身须定义 `injectionSelector`。在创建引擎时确定注入配置，Registry 会缓存已加载的 grammar，变更配置时应重建引擎。此扩展点只影响 TextMate，不会让轻量引擎引入 grammar 或 WASM。

YAML+ERB 不包含在这套注入预设中，仍保持原有 YAML 高亮。

### 自动检测与 grammar 的兼容边界

内置 18 个检测候选均可映射到匹配的 TextMate 根 scope。Bash 映射为 `shellscript` / `source.shell`，其余名称按预设或别名解析；HTML/XML 的共用规则仅在 TextMate 自动 grammar 选择阶段适配。

| 情况                                               | 当前处理                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| HTML / XML 共用 `xml` 检测结果                     | 有 HTML 文档开头标记时选择 HTML grammar，报告语言仍为 `xml`                                                         |
| JavaScript / JSX 共用 `javascript`                 | 预设 JavaScript grammar 已包含 JSX 规则；显式 `jsx` 也使用该 grammar                                                |
| TypeScript / TSX 共用 `typescript`                 | TypeScript grammar 不包含 JSX，使用 TSX 时应显式传 `{ language: 'tsx' }`；不凭 JSX 正则猜测，避免误判泛型和类型断言 |
| C / C++、JavaScript / TypeScript 等相似语法        | 属于自动识别准确率限制；保留检测结果，可显式指定语言                                                                |
| JavaScript / TypeScript 的 `html` / `css` 标签模板 | 通过 `getInjections: getCodeInjections` 启用现成注入，省略时不启用                                                  |
| YAML 中的 ERB                                      | 尚未提供对应注入，保持原有 YAML 高亮                                                                                |
| SQL 方言、模板语言及未配置的语言变体               | 不保证与共用规则完全一致，按需注入专用 grammar 和检测器                                                             |

短 JSX 片段也可能被检测成 Java 等候选，不能依靠一次自动检测确定 JSX / TSX。上述兼容检查覆盖当前固定 grammar 版本与内置候选，不代表任意自定义检测器或所有语言方言均可自动适配。

## VS Code 当前主题

仅在扩展宿主导入 `/vscode`，不要从 Webview 导入该入口。

```ts
import { getSyntaxTheme, watchSyntaxTheme } from 'vscode-tint/vscode'

const theme = await getSyntaxTheme()
// 通过应用自己的 RPC 将可序列化的 theme 发送给 Webview。
const subscription = watchSyntaxTheme(() => {
  void getSyntaxTheme().then(theme => sendThemeToWebview(theme))
})
context.subscriptions.push(subscription)
```

支持主题贡献 ID / label、JSONC、`include` 继承、外部 `tokenColors` 文件、`.tmTheme`，以及全局和按主题的 `editor.tokenColorCustomizations`。读取使用 `workspace.fs` 和 `Uri.joinPath()`；读取失败时记录警告，并使用可读取的自定义规则及正文色回退。该入口不提供 Webview RPC，也不处理 DOM 生命周期。

主题读取器提取语法规则；背景色、编辑器字体、代码块间距等由应用自身样式负责。无 scope 的主题默认规则不应用到代码块，未匹配 token 继承容器颜色。

## 共用 API 与生命周期

两个工厂均返回 `Promise<CodeHighlighter>`。通常每个视图复用一个实例；需要同时展示不同主题时使用多个实例。语法由实例缓存，结束使用时释放：

```ts
const result = await highlighter.highlight(source, { language: 'javascript' })
// result: { html, language?, highlighted, className }

await highlighter.setTheme(nextTheme)
styleElement.textContent = highlighter.getStyleSheet()
// 重新高亮已有代码块，更新其 HTML。
highlighter.dispose()
```

`getStyleSheet()` 在轻量引擎返回作用域内的 CSS，完整引擎返回空字符串，其样式写入经过校验的 token span。默认背景和前景继承宿主。

未知的显式语言、`plaintext` / `text` / `txt` / `plain`、超出长度限制或 TextMate 超时返回转义后的完整纯文本，`highlighted: false`。不会对未知的显式语言再次猜测。引擎加载错误及调用方 loader 错误向外抛出，应用应捕获并显示原始文本；释放后继续调用会抛错。轻量引擎的主题更新失败时保留上一次成功的 CSS，后续高亮仍可使用。

默认限制：代码 100000 字符；检测样本 12000 字符；TextMate 单行 10000 字符、每次分词单行 250ms、代码块 500ms；冷启动最多尝试三次，每次之间让出主线程。可通过工厂选项覆盖对应限制。时间限制是同步正则执行间的尽力检查，不能中断单个长时间正则；处理不可信大输入时仍应保留长度限制，必要时在 Worker 中使用。

异步主题更新期间，完整引擎会丢弃旧主题的结果并返回纯文本，调用方应在主题更新完成后重新渲染。调用方应避免将较早完成的异步请求覆盖到新代码或新主题上。

## 兼容性边界

- 两个引擎都不提供 VS Code 语言服务的 semantic tokens，不能保证与编辑器逐 token 完全一致。
- 轻量方案只探测单个代表性 scope，不能还原语言专属及父级上下文规则；没有匹配时继承正文色。
- 官方 `tokenizeLine2()` 的 metadata 位布局集中封装，并有真实引擎测试覆盖；升级固定版本的 vscode-textmate 时应检查该边界。
- Webview CSP 必须允许应用使用的本地资源、动态模块及对应样式策略。遵循 VS Code Webview CSP 文档配置 WASM 和样式；本包不修改 CSP。
- 只导入 `/highlightjs` 不会引用 Oniguruma、WASM 或 grammar。根入口只提供公共类型和转义函数，不会自动选择或加载引擎。

## 演示与验证页面

```sh
fnm exec --using 22.18.0 npm ci
fnm exec --using 22.18.0 npm run demo
```

打开终端显示的本地地址。内置 Dark+、Light+、Dark Modern、Light Modern、GitHub Dark、GitHub Light、High Contrast Dark / Light 八套 VS Code 主题快照，默认并排对比两套引擎。

演示中的 TextMate 单行 / 代码块预算分别为 1000ms / 1500ms，以容纳首次编译嵌入语法；库的默认预算保持不变。

可切换主题、单引擎 / 双引擎视图、七种代码示例（含 HTML/CSS 标签模板）和语言模式，支持自动识别、纯文本和未知语言回退，也可直接编辑代码。主题快照来源和许可证记录在 `demo/themes/`。页面直接调用库的实现，不依赖已发布 npm 包。

`npm run demo:build` 生成独立静态页面到 `demo-dist/`，`npm run demo:preview` 预览生产构建。演示代码、主题和静态产物均不进入 npm 发布包。

## 开发与发布

```sh
fnm exec --using 22.18.0 npm ci
fnm exec --using 22.18.0 npm run check
fnm exec --using 22.18.0 npm test
fnm exec --using 22.18.0 npm run build
fnm exec --using 22.18.0 npm pack
fnm exec --using 22.18.0 npm run test:package
fnm exec --using 22.18.0 npm publish --access public --registry=https://registry.npmjs.org
```

发布前请使用 `npm whoami --registry=https://registry.npmjs.org` 确认具有 `vscode-tint` 发布权限的账号。`npm pack` 和 `npm publish` 统一通过 `prepack` 执行类型检查、测试与构建，避免重复执行同一组发布检查。宿主入口内联 JSONC 解析器，避免 Node 直接加载依赖包内省略扩展名的 ESM 导入；通用引擎与可选 grammar 仍保留独立入口。

发布文件通过 `files` 白名单限制为构建产物、说明和许可证，不包含测试、开发脚本或 WASM/grammar 副本。

## License

MIT。依赖与语法的许可信息见 `THIRD_PARTY_NOTICES.txt`；消费者打包语法或 WASM 时也应保留对应上游许可。
