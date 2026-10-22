import textmate from 'vscode-textmate'
import type { IRawGrammar } from 'vscode-textmate'

/** 仅打包当前支持的语言及必要的嵌入依赖，grammar 按需加载 */
export const commonLanguages: Record<
  string,
  { scope: string; load: () => Promise<{ default: unknown }> }
> = {
  shellscript: {
    scope: 'source.shell',
    load: () => import('tm-grammars/grammars/shellscript.json', { with: { type: 'json' } })
  },
  c: {
    scope: 'source.c',
    load: () => import('tm-grammars/grammars/c.json', { with: { type: 'json' } })
  },
  cpp: {
    scope: 'source.cpp',
    load: () => import('tm-grammars/grammars/cpp.json', { with: { type: 'json' } })
  },
  csharp: {
    scope: 'source.cs',
    load: () => import('tm-grammars/grammars/csharp.json', { with: { type: 'json' } })
  },
  css: {
    scope: 'source.css',
    load: () => import('tm-grammars/grammars/css.json', { with: { type: 'json' } })
  },
  diff: {
    scope: 'source.diff',
    load: () => import('tm-grammars/grammars/diff.json', { with: { type: 'json' } })
  },
  docker: {
    scope: 'source.dockerfile',
    load: () => import('tm-grammars/grammars/docker.json', { with: { type: 'json' } })
  },
  go: {
    scope: 'source.go',
    load: () => import('tm-grammars/grammars/go.json', { with: { type: 'json' } })
  },
  ini: {
    scope: 'source.ini',
    load: () => import('tm-grammars/grammars/ini.json', { with: { type: 'json' } })
  },
  java: {
    scope: 'source.java',
    load: () => import('tm-grammars/grammars/java.json', { with: { type: 'json' } })
  },
  javascript: {
    scope: 'source.js',
    load: () => import('tm-grammars/grammars/javascript.json', { with: { type: 'json' } })
  },
  json: {
    scope: 'source.json',
    load: () => import('tm-grammars/grammars/json.json', { with: { type: 'json' } })
  },
  kotlin: {
    scope: 'source.kotlin',
    load: () => import('tm-grammars/grammars/kotlin.json', { with: { type: 'json' } })
  },
  markdown: {
    scope: 'text.html.markdown',
    load: () => import('tm-grammars/grammars/markdown.json', { with: { type: 'json' } })
  },
  'objective-c': {
    scope: 'source.objc',
    load: () => import('tm-grammars/grammars/objective-c.json', { with: { type: 'json' } })
  },
  php: {
    scope: 'source.php',
    load: () => import('tm-grammars/grammars/php.json', { with: { type: 'json' } })
  },
  python: {
    scope: 'source.python',
    load: () => import('tm-grammars/grammars/python.json', { with: { type: 'json' } })
  },
  ruby: {
    scope: 'source.ruby',
    load: () => import('tm-grammars/grammars/ruby.json', { with: { type: 'json' } })
  },
  rust: {
    scope: 'source.rust',
    load: () => import('tm-grammars/grammars/rust.json', { with: { type: 'json' } })
  },
  sql: {
    scope: 'source.sql',
    load: () => import('tm-grammars/grammars/sql.json', { with: { type: 'json' } })
  },
  typescript: {
    scope: 'source.ts',
    load: () => import('tm-grammars/grammars/typescript.json', { with: { type: 'json' } })
  },
  xml: {
    scope: 'text.xml',
    load: () => import('tm-grammars/grammars/xml.json', { with: { type: 'json' } })
  },
  html: {
    scope: 'text.html.basic',
    load: () => import('tm-grammars/grammars/html.json', { with: { type: 'json' } })
  },
  yaml: {
    scope: 'source.yaml',
    load: () => import('tm-grammars/grammars/yaml.json', { with: { type: 'json' } })
  },
  toml: {
    scope: 'source.toml',
    load: () => import('tm-grammars/grammars/toml.json', { with: { type: 'json' } })
  },
  tsx: {
    scope: 'source.tsx',
    load: () => import('tm-grammars/grammars/tsx.json', { with: { type: 'json' } })
  },
  'cpp-macro': {
    scope: 'source.cpp.embedded.macro',
    load: () => import('tm-grammars/grammars/cpp-macro.json', { with: { type: 'json' } })
  },
  regexp: {
    scope: 'source.regexp.python',
    load: () => import('tm-grammars/grammars/regexp.json', { with: { type: 'json' } })
  }
}

// 保留上游规则，不复制或修改标签模板的正则；只通过公开注入接口关联宿主 scope
const injectionLoaders: Record<string, () => Promise<{ default: unknown }>> = {
  'inline.es6-html': () =>
    import('tm-grammars/grammars/es-tag-html.json', { with: { type: 'json' } }),
  'inline.es6-css': () => import('tm-grammars/grammars/es-tag-css.json', { with: { type: 'json' } })
}

/** 常用 JS、TS、TSX grammar 的 HTML/CSS 模板注入；传入 getInjections 后启用 */
export function getCodeInjections(scope: string): string[] | undefined {
  return ['source.js', 'source.ts', 'source.tsx'].includes(scope)
    ? Object.keys(injectionLoaders)
    : undefined
}

// 这里只处理已确认可复用同一语法的名称；tsx 保留独立入口，不能折叠为 typescript
const aliases: Record<string, string> = {
  bash: 'shellscript',
  sh: 'shellscript',
  zsh: 'shellscript',
  shell: 'shellscript',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  dockerfile: 'docker',
  js: 'javascript',
  // 当前 JavaScript grammar 本身包含 JSX 规则
  jsx: 'javascript',
  kt: 'kotlin',
  kts: 'kotlin',
  md: 'markdown',
  objc: 'objective-c',
  objectivec: 'objective-c',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  ts: 'typescript',
  xhtml: 'html',
  htm: 'html',
  yml: 'yaml',
  patch: 'diff',
  text: 'plaintext',
  txt: 'plaintext',
  plain: 'plaintext'
}

/** 规范化声明或自动识别的语言名；未知语言不做二次猜测 */
export function resolveCodeLanguage(name: string): string | undefined {
  const normalized = name.toLowerCase()
  const language = Object.hasOwn(aliases, normalized) ? aliases[normalized] : normalized
  return language === 'plaintext' || Object.hasOwn(commonLanguages, language) ? language : undefined
}

/** 获取已支持语言的根 scope */
export function getCodeLanguageScope(language: string): string | undefined {
  return commonLanguages[language]?.scope
}

/** 按 TextMate 请求加载 grammar；未打包的嵌入语言保持外层样式 */
export async function loadCodeGrammar(scope: string): Promise<IRawGrammar | null> {
  const language = Object.values(commonLanguages).find(value => value.scope === scope)
  const load =
    language?.load ?? (Object.hasOwn(injectionLoaders, scope) ? injectionLoaders[scope] : undefined)
  if (!load) return null
  const raw = (await load()).default
  return textmate.parseRawGrammar(JSON.stringify(raw), 'grammar.json')
}
