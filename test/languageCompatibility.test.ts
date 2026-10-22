import { expect, it } from 'vitest'
import { AUTO_DETECT_LANGUAGES, commonHighlightJs, detectCodeLanguage } from '../src/detection.js'
import { getCodeLanguageScope, loadCodeGrammar, resolveCodeLanguage } from '../src/languages.js'

// Representative samples exercise actual detection, while grammar identity is checked for every candidate.
const samples: Record<string, string> = {
  bash: '#!/bin/bash\nset -euo pipefail\nfor file in *.txt; do echo "$file"; done',
  c: '#include <stdio.h>\nint main(void) { printf("hello"); return 0; }',
  cpp: '#include <vector>\nstd::vector<int> values = {1, 2};',
  csharp:
    'using System;\npublic class App { public static void Main() { Console.WriteLine("hello"); } }',
  css: '.greeting { color: #58a6ff; font-weight: 600; }',
  go: 'package main\nimport "fmt"\nfunc main() { fmt.Println("hello") }',
  java: 'import java.util.List;\npublic class App { public static void main(String[] args) { System.out.println("hello"); } }',
  javascript: 'export async function greet(name) { return `Hello, ${name}!`; }',
  json: '{"name":"demo","enabled":true,"items":[1,2,3]}',
  markdown: '# Hello\n\n**bold** and [link](https://example.com)\n\n- item',
  php: '<?php\nfunction greet($name) { return "Hello, $name"; }\necho greet("world");',
  python:
    'from dataclasses import dataclass\n@dataclass\nclass Member:\n    name: str\n    score: float = 0.0',
  ruby: 'class Greeting\n  def greet(name)\n    puts "Hello, #{name}"\n  end\nend',
  rust: 'fn main() { let mut values = Vec::new(); values.push(42); println!("{:?}", values); }',
  sql: 'SELECT name, COUNT(*) FROM users WHERE active = TRUE GROUP BY name;',
  typescript:
    'interface Member { id: number; name: string }\nconst greet = (member: Member): string => member.name;',
  xml: '<?xml version="1.0"?><catalog><item id="42">hello</item></catalog>',
  yaml: 'name: demo\nenabled: true\nitems:\n  - first\n  - second'
}

it.each(AUTO_DETECT_LANGUAGES)(
  'maps candidate %s to the actual loaded grammar scope',
  async candidate => {
    const language = resolveCodeLanguage(candidate)
    expect(language).toBeDefined()
    const scope = getCodeLanguageScope(language!)
    expect(scope).toBeDefined()
    expect((await loadCodeGrammar(scope!))?.scopeName).toBe(scope)
    const raw = commonHighlightJs.highlightAuto(samples[candidate], AUTO_DETECT_LANGUAGES).language
    expect(detectCodeLanguage(samples[candidate])).toBe(raw)
    if (raw) expect(getCodeLanguageScope(resolveCodeLanguage(raw)!)).toBeDefined()
  }
)

it.each(['constructor', '__proto__', 'toString'])(
  'treats prototype key %s as an unknown language and grammar',
  async name => {
    expect(resolveCodeLanguage(name)).toBeUndefined()
    expect(getCodeLanguageScope(name)).toBeUndefined()
    expect(await loadCodeGrammar(name)).toBeNull()
  }
)
