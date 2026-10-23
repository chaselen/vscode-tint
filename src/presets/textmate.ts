import { createTextmateHighlighter as createEngine } from '../textmate.js'
import type { TextmateOptions } from '../textmate.js'
import type { CodeHighlighter } from '../index.js'
import { loadOniguruma } from '../oniguruma.js'
import type { OnigurumaData } from '../oniguruma.js'
import {
  getCodeInjections,
  getCodeLanguageScope,
  loadCodeGrammar,
  resolveCodeLanguage
} from '../languages.js'

/** 常用 TextMate 配置；自定义 grammar 或正则引擎时使用底层 /textmate 工厂 */
export interface TextmatePresetOptions extends Pick<
  TextmateOptions,
  'theme' | 'maxCodeLength' | 'maxLineLength' | 'maxLineTime' | 'maxBlockTime'
> {
  /** 调用方加载的本地 WASM，不绑定 URL、构建工具或 CDN */
  wasm: OnigurumaData | PromiseLike<OnigurumaData>
  /** 默认启用 highlight.js 检测，仅在需要自动识别时延迟加载 */
  autoDetect?: boolean
  /** 默认启用 JS / TS / TSX 的 HTML/CSS 标签模板注入 */
  injections?: boolean
}

/** 使用预设 grammar、注入和自动检测创建完整引擎；时间预算与底层工厂一致 */
export function createTextmateHighlighter(
  options: TextmatePresetOptions
): Promise<CodeHighlighter> {
  const { wasm, autoDetect = true, injections = true, ...engineOptions } = options
  return createEngine({
    ...engineOptions,
    onigLib: loadOniguruma(wasm),
    loadGrammar: loadCodeGrammar,
    getInjections: injections ? getCodeInjections : undefined,
    resolveLanguage: resolveCodeLanguage,
    getScope: getCodeLanguageScope,
    detectLanguage: autoDetect
      ? async source => {
          const { detectCodeLanguage } = await import('../detection.js')
          return detectCodeLanguage(source)
        }
      : undefined
  })
}
