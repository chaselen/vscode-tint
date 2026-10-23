# 项目协作规范

## 文档职责

- README 面向包使用者，仅保留安装、引擎选择、接入示例、公开契约和必要的使用边界
- AGENTS 面向开发与维护，记录环境、架构约束、验证、演示维护和发布流程；不要将这些内容重复写入 README
- 详细参数和默认值优先维护在公开类型与 JSDoc，README 不复制完整方法或语言清单
- CHANGELOG 记录用户可见变化，第三方来源和许可维护在 `THIRD_PARTY_NOTICES.txt` 及 `demo/themes/`

## 项目目标与结构

本项目维护 `vscode-tint`，面向 VS Code Webview 提供代码高亮和主题适配。支持 highlight.js 为主的轻量引擎，以及 vscode-textmate 为主的完整引擎。

- `src/index.ts`：两套引擎共享的公开类型和安全转义函数
- `src/highlightjs.ts`：highlight.js 分词及代表性 TextMate scope 的颜色适配
- `src/textmate.ts`：真实 TextMate grammar 分词和 HTML 渲染
- `src/presets/`：两套独立常用配置，复用底层工厂，不复制高亮实现
- `src/theme.ts`：官方主题匹配探针、颜色校验及 metadata 解码
- `src/vscode.ts`、`src/tokenColors.ts`：扩展宿主中的当前主题读取和自定义规则整理
- `src/languages.ts`、`src/detection.ts`、`src/oniguruma.ts`：可选语言集合、自动识别和 WASM 适配
- `test/`：引擎、主题和宿主的定向测试
- `demo/`：用于演示和回归验证的浏览器页面与内置主题快照
- `scripts/`：构建和真实 npm 压缩包消费者验证
- `dist/`、`demo-dist/`：构建产物，不手工修改

## 运行环境

- 使用 npm 和 `package-lock.json`，遵循 `.nvmrc`、`package.json` 的 `engines` 和 `packageManager`
- 发布包运行、源码开发、测试和演示构建统一要求 Node `^20.19.0 || >=22.12.0`，默认使用 `.nvmrc` 中的 22.12.0，可用 `fnm exec --using 22.12.0 <command>` 执行
- 安装优先使用 `npm ci`，不得擅自调整全局运行环境或版本约束
- 使用 `.oxfmtrc.json`，只格式化本次修改的文件

## 架构与公开 API

- 预设不从根入口导入；轻量预设不得引入 grammar / WASM，TextMate 预设仅在自动检测时延迟加载检测器。预设与底层工厂时间预算保持一致
- 纯文本回退提供稳定的 `FallbackReason`，加载失败仍抛出；新增原因同步更新两引擎、demo 文案和 README
- 两套引擎保持一致的 `CodeHighlighter` 接口；公开接口变更同步更新类型、README 和测试
- 仅使用依赖和 VS Code 的公开 API，不读取引擎私有字段，不自行实现 TextMate 主题选择器匹配
- highlight.js 类别到 TextMate scope 的映射是近似适配，不能宣称与编辑器或 semantic tokens 完全一致
- 保持独立子路径入口；轻量入口不得导入 Oniguruma、WASM 或语法包，根入口不得自动加载任一引擎
- `tm-grammars` 和 `vscode-oniguruma` 保持可选 peer dependencies，不因演示需求改为必装运行时依赖
- Webview 通用入口不依赖 Node.js 或 `vscode`，宿主相关逻辑仅放在 `/vscode`
- 公共 WASM 接口接受调用方提供的数据，不绑定 Vite 的 `?url` 或某种资源部署方式
- 不默认引入所有语言；语言集合与检测候选需明确，新增语言时核对嵌入依赖和上游许可证
- 宿主入口内联 JSONC 解析器，避免 Node 直接加载其省略扩展名的 ESM 导入；通用入口与可选 grammar 保持独立
- `tokenizeLine2()` 的 metadata 位布局集中封装在 `src/theme.ts`，升级 vscode-textmate 时用真实引擎测试核对
- HTML/XML 仅在自动 grammar 选择阶段适配，保持原始检测结果；JSX 使用 JS grammar，TSX 须显式指定，不新增启发式正则猜测
- HTML/CSS 标签模板复用 `tm-grammars` 的 `es-tag-html` / `es-tag-css`，不复制上游正则；新增注入时检查根 scope、依赖及许可

## 安全、资源与生命周期

- 代码文本必须转义；主题颜色和 CSS 类别必须校验后才能写入 HTML 或 CSS
- 保留输入长度和 TextMate 时间预算，以及完整纯文本回退；不要输出部分分词结果
- 异步加载、主题切换和释放必须处理过期结果，不能用旧主题或旧输入覆盖新结果
- 使用 `workspace.fs` 和 `Uri.joinPath()` 读取 VS Code 资源，不假设 URI 为 `file:`
- 库不直接操作 Webview DOM 或 RPC；这些由消费者管理，演示页面可展示具体接线方式

## 演示与主题快照

- 演示页直接调用本包引擎，不维护另一套高亮逻辑
- 支持两引擎对比、主题切换、语言选择、自动识别及编辑代码；保留加载和错误状态
- 内置主题使用可追溯的上游快照，记录来源、版本和许可证；不要把演示主题打入 npm 发布产物
- 页面使用语义 HTML、带标签的原生控件和响应式 CSS，支持键盘操作与高对比主题
- 修改页面后在真实浏览器验证两套引擎、亮暗和高对比主题、代码转义及窄屏布局

演示开发运行 `npm run demo`，生产构建运行 `npm run demo:build`（输出 `demo-dist/`），本地预览运行 `npm run demo:preview`。主题快照来源、版本和许可证记录在 `demo/themes/`。

演示的 TextMate 单行 / 代码块预算为 1000ms / 1500ms，用于容纳嵌入语法首次编译；不要据此放宽库默认预算。

GitHub Pages 通过 `.github/workflows/pages.yml` 在 `main` 更新后部署，也支持手动触发。部署命令为 `npm run demo:build -- --base=/vscode-tint/`；本地保持相对资源路径。部署后检查在线页面的 grammar 动态导入、WASM 和主题切换。

## 验证与发布

- `npm run check`：源码、测试及演示代码的类型检查
- `npm test`：定向单元与真实引擎测试；可传测试路径缩小范围
- `npm run build`：库构建与类型声明
- `npm run demo` / `demo:build` / `demo:preview`：演示开发、生产构建与预览
- `npm run test:package`：实际打包安装、公开类型和两引擎运行验证，并检查轻量入口依赖边界
- 公共 API、导出、资源或依赖变更运行 `check`、相关测试、`build` 和 `test:package`
- 仅演示或文档改动按实际影响验证，不重复已通过且未受后续修改影响的检查
- 发布前运行完整检查、测试、构建和消费者验证，检查 `npm pack` 的文件清单与体积
- npm 发布采用 `files` 白名单，只分发库产物、README、更新说明和许可证
- CI 在 Node 20.19.0、22.12.0 和 24 上检查开发工具链和真实打包消费者；消费者安装启用 `--engine-strict`
- `npm pack` / `npm publish` 已通过 `prepack` 执行类型检查、测试和库构建，完整发布验证可运行 `npm pack` 后执行 `npm run test:package`，不要重复调用相同检查
- 发布前运行 `npm whoami --registry=https://registry.npmjs.org` 确认账号；正式发布命令为 `npm publish --access public --registry=https://registry.npmjs.org`
- 发布到 npm 官方源并使用具有 `vscode-tint` 发布权限的账号；不读取、输出或写入仓库任何令牌
- 仅在用户明确要求时提交或发布；提交使用英文 Conventional Commits，不覆盖无关未提交改动

## 注释与维护

- 导出函数、类型和关键约束优先使用 JSDoc；类型信息由 TypeScript 表达
- 注释解释意图和约束，不重复显而易见的代码；修改行为时同步更新相关说明
- README 记录安装、公开入口、示例与兼容性边界，CHANGELOG 记录用户可见变化
