# 内置主题快照

此目录仅用于演示和主题回归，不进入 npm 发布包。主题的 `include` 已展开，保留 `colors` 和 `tokenColors`（存为 `settings`）；不包含 semantic token 配色。

- Dark+、Light+、Dark Modern、Light Modern、High Contrast Dark、High Contrast Light：来自本机 VS Code 1.143.0 的 `extensions/theme-defaults/themes`。上游：[microsoft/vscode](https://github.com/microsoft/vscode/tree/main/extensions/theme-defaults/themes)，MIT，版权 Microsoft Corporation。许可见 `vscode-LICENSE.txt`。
- GitHub Dark、GitHub Light：来自 `GitHub.github-vscode-theme` 6.3.5 的 `dark-default.json` / `light-default.json`。上游：[github/github-vscode-theme](https://github.com/primer/github-vscode-theme)，MIT，许可见 `github-LICENSE.txt`。

更新快照时请固定版本、递归合并继承主题的颜色和语法规则，并核对许可证。不要使用正在运行的编辑器 UI CSS 变量代替语法规则。
