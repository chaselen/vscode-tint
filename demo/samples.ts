/** Shared, editable regression examples with strings, comments, types and embedded code. */
export const samples = [
  {
    id: 'typescript',
    label: 'TypeScript · 类型与函数',
    source: `// A small typed greeting service
interface Member {
  id: number
  name: string
  active?: boolean
}

const endpoint = "https://example.com/api"

export async function greet(member: Member): Promise<string> {
  const response = await fetch(\`\${endpoint}/members/\${member.id}\`)
  if (!response.ok) throw new Error("Unable to load member")

  const message = \`Hello, \${member.name}!\`
  console.log(message, { active: member.active ?? true })
  return message
}

const member: Member = { id: 42, name: "Chaselen" }
void greet(member)
`
  },
  {
    id: 'javascript',
    label: 'JavaScript · 字符串与正则',
    source: `// Text is escaped before it enters the preview
const template = '<img src=x onerror="alert(1)">'
const pattern = /hello\\s+(?<name>\\w+)/gi

export class Greeting {
  constructor(name = "world") {
    this.name = name
  }

  render() {
    return \`Hello, \${this.name}!\`
  }
}

const items = [1, 2, 3].map(value => value * 2)
console.log(new Greeting().render(), items, template)
`
  },
  {
    id: 'python',
    label: 'Python · 装饰器与多行文本',
    source: `from dataclasses import dataclass
from typing import Iterable

@dataclass
class Member:
    name: str
    score: float = 0.0


def summarize(members: Iterable[Member]) -> str:
    """Build a readable summary.
    Multiline strings should preserve their color.
    """
    return "\\n".join(
        f"{member.name}: {member.score:.2f}"
        for member in members
        if member.score >= 60
    )

# 中文注释与 Unicode 内容
print(summarize([Member("小明", 98.5)]))
`
  },
  {
    id: 'json',
    label: 'JSON · 配置数据',
    source: `{
  "name": "vscode-tint",
  "version": "0.1.0",
  "engines": ["highlightjs", "textmate"],
  "theme": {
    "name": "GitHub Dark",
    "livePreview": true,
    "maxCodeLength": 100000
  },
  "unsafeText": "<script>alert('escaped')</script>",
  "optional": null
}
`
  },
  {
    id: 'html',
    label: 'HTML · 内嵌 CSS 与 JavaScript',
    source: `<!doctype html>
<html lang="zh-CN">
  <head>
    <style>
      .greeting { color: #58a6ff; font-weight: 600; }
    </style>
  </head>
  <body>
    <!-- Embedded languages use their own grammar -->
    <h1 class="greeting">Hello, world!</h1>
    <script>
      const title = "Theme Playground"
      document.querySelector("h1").textContent = title
    </script>
  </body>
</html>
`
  },
  {
    id: 'bash',
    label: 'Shell · 命令与变量',
    source: `#!/usr/bin/env bash
set -euo pipefail

# Install the lightweight engine
PACKAGE="vscode-tint"
npm install "$PACKAGE"

for theme in dark-plus light-plus github-dark; do
  printf 'Checking theme: %s\\n' "$theme"
done

if [[ -d "dist" ]]; then
  echo "Build is ready"
fi
`
  },
  {
    id: 'tagged-templates',
    label: 'JavaScript · HTML/CSS 标签模板',
    source: `// Existing upstream grammars highlight HTML and CSS inside tagged templates
const title = "Theme Playground"
const foreground = "#58a6ff"

const view = html\`<section class="greeting">
  <h1>\${title}</h1>
  <p title="Preview">Two engines, one theme.</p>
</section>\`

const style = css\`.greeting {
  color: \${foreground};
  font-weight: 600;
  padding: 12px;
}\`

console.log(view, style)
`
  }
]
