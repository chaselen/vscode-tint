import type { IRawTheme } from 'vscode-textmate'

/** A serializable TextMate theme, shared by the extension host and Webview. */
export type SyntaxTheme = IRawTheme

/** Language selection. Unknown explicit languages fall back to escaped plain text. */
export interface HighlightOptions {
  language?: string
  autoDetect?: boolean
}

/** HTML fragment and the class to apply to its containing code element. */
export interface HighlightResult {
  html: string
  /** 报告语言不随 TextMate 内部 grammar 适配改变，例如 HTML 文档的检测结果仍为 xml */
  language?: string
  highlighted: boolean
  className: string
}

/** Both engines expose the same lifecycle. Re-render existing blocks after changing themes. */
export interface CodeHighlighter {
  highlight(source: string, options?: HighlightOptions): Promise<HighlightResult>
  setTheme(theme: SyntaxTheme): Promise<void>
  getStyleSheet(): string
  dispose(): void
}

/** Optional language detector; TextMate itself does not identify languages. */
export type LanguageDetector = (source: string) => string | undefined | Promise<string | undefined>

/** Escape untrusted code before inserting it into HTML. */
export function escapeHtml(source: string): string {
  return source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
