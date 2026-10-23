# Changelog

## 0.2.0

- Add independent highlight.js and TextMate presets with common language configuration.
- Report structured fallback reasons without changing the existing low-level factories.
- Use presets and display fallback diagnostics in the playground.

- Align package runtime, development and testing requirements with the toolchain: Node ^20.19.0 || >=22.12.0.
- Validate packed consumers on the minimum runtime and development Node versions.

## 0.1.0

- Add highlight.js and TextMate engines with a shared HTML and lifecycle API.
- Resolve theme rules through Microsoft's public vscode-textmate APIs.
- Read the selected VS Code theme and token color customizations from the extension host.
- Keep Oniguruma and grammar presets optional and isolated behind separate entry points.

- Add a standalone playground with eight bundled VS Code themes and editable engine comparisons.

- Preserve raw highlight.js detection results and adapt HTML/XML only during TextMate grammar selection.

- Expose getInjections and add optional upstream HTML/CSS tagged-template injections with a playground sample.

- Isolate per-instance highlight.js styles, handle initialization and disposal errors, support Buffer WASM inputs, and make the host entry directly loadable in Node.
