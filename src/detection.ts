import core from 'highlight.js/lib/core'

const hljs = core.newInstance()
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

/** 自动检测使用的常见语言 */
export const AUTO_DETECT_LANGUAGES = [
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'go',
  'java',
  'javascript',
  'json',
  'markdown',
  'php',
  'python',
  'ruby',
  'rust',
  'sql',
  'typescript',
  'xml',
  'yaml'
]

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('go', go)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('php', php)
hljs.registerLanguage('python', python)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)

/** An isolated common-language instance, also usable by the highlight.js engine. */
export { hljs as commonHighlightJs }

/**
 * 检测前 12000 字符并保留 highlight.js 的原始语言标识，不返回 HTML
 * 共用 grammar 的变体不一定能区分，消费者应在自己的 grammar 选择阶段适配
 */
export function detectCodeLanguage(source: string): string | undefined {
  const sample = source.slice(0, 12000)
  return hljs.highlightAuto(sample, AUTO_DETECT_LANGUAGES).language
}
