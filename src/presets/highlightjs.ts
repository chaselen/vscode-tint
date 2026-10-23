import { createHighlightJsHighlighter as createEngine } from '../highlightjs.js'
import type { HighlightJsOptions } from '../highlightjs.js'
import type { CodeHighlighter } from '../index.js'
import { commonHighlightJs } from '../detection.js'

/** 内置常用语言的轻量配置；自定义语言实例时使用底层 /highlightjs 工厂 */
export type HighlightJsPresetOptions = Omit<HighlightJsOptions, 'hljs'>

/** 使用隔离的常用语言实例创建轻量引擎，不加载 WASM 或 TextMate grammar */
export function createHighlightJsHighlighter(
  options: HighlightJsPresetOptions = {}
): Promise<CodeHighlighter> {
  return createEngine({ ...options, hljs: commonHighlightJs })
}
