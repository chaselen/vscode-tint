# 项目协作规范

## 项目目标与结构

本项目维护 `vscode-tint`，面向 VS Code Webview 提供代码高亮和主题适配。支持 highlight.js 为主的轻量引擎，以及 vscode-textmate 为主的完整引擎。

- `src/index.ts`：两套引擎共享的公开类型和安全转义函数
- `src/highlightjs.ts`：highlight.js 分词及代表性 TextMate scope 的颜色适配
- `src/textmate.ts`：真实 TextMate grammar 分词和 HTML 渲染
- `src/theme.ts`：官方主题匹配探针、颜色校验及 metadata 解码
- `src/vscode.ts`、`src/tokenColors.ts`：扩展宿主中的当前主题读取和自定义规则整理
- `src/languages.ts`、`src/detection.ts`、`src/oniguruma.ts`：可选语言集合、自动识别和 WASM 适配
- `test/`：引擎、主题和宿主的定向测试
- `demo/`：用于演示和回归验证的浏览器页面与内置主题快照
- `scripts/`：构建和真实 npm 压缩包消费者验证
- `dist/`、`demo-dist/`：构建产物，不手工修改

## 运行环境

- 使用 npm 和 `package-lock.json`，遵循 `.nvmrc`、`package.json` 的 `engines` 和 `packageManager`
- 当前 Node.js 要求 >=22.18.0，可用 `fnm exec --using 22.18.0 <command>` 执行
- 安装优先使用 `npm ci`，不得擅自调整全局运行环境或版本约束
- 使用 `.oxfmtrc.json`，只格式化本次修改的文件

## 架构与公开 API

- 两套引擎保持一致的 `CodeHighlighter` 接口；公开接口变更同步更新类型、README 和测试
- 仅使用依赖和 VS Code 的公开 API，不读取引擎私有字段，不自行实现 TextMate 主题选择器匹配
- highlight.js 类别到 TextMate scope 的映射是近似适配，不能宣称与编辑器或 semantic tokens 完全一致
- 保持独立子路径入口；轻量入口不得导入 Oniguruma、WASM 或语法包，根入口不得自动加载任一引擎
- `tm-grammars` 和 `vscode-oniguruma` 保持可选 peer dependencies，不因演示需求改为必装运行时依赖
- Webview 通用入口不依赖 Node.js 或 `vscode`，宿主相关逻辑仅放在 `/vscode`
- 公共 WASM 接口接受调用方提供的数据，不绑定 Vite 的 `?url` 或某种资源部署方式
- 不默认引入所有语言；语言集合与检测候选需明确，新增语言时核对嵌入依赖和上游许可证

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
- 发布到 npm 官方源并使用具有 `vscode-tint` 发布权限的账号；不读取、输出或写入仓库任何令牌
- 仅在用户明确要求时提交或发布；提交使用英文 Conventional Commits，不覆盖无关未提交改动

## 注释与维护

- 导出函数、类型和关键约束优先使用 JSDoc；类型信息由 TypeScript 表达
- 注释解释意图和约束，不重复显而易见的代码；修改行为时同步更新相关说明
- README 记录安装、公开入口、示例与兼容性边界，CHANGELOG 记录用户可见变化
