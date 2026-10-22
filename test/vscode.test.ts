import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSyntaxTheme, watchSyntaxTheme } from '../src/vscode.js'

const mocks = vi.hoisted(() => {
  const uri = (path: string) => ({ path, toString: () => `test:${path}` })
  return {
    uri,
    theme: 'Selected theme',
    custom: {} as Record<string, unknown>,
    files: new Map<string, string>(),
    readFile: vi.fn(),
    listeners: new Map<string, (event?: unknown) => void>(),
    disposals: [] as ReturnType<typeof vi.fn>[],
    extensions: [
      {
        id: 'test.theme',
        extensionUri: uri('/themes'),
        packageJSON: {
          version: '1',
          contributes: {
            themes: [
              { id: 'Selected theme', label: 'A different label', path: './selected.json' },
              { label: 'Other theme', path: './other.json' }
            ]
          }
        }
      }
    ]
  }
})

vi.mock('vscode', async () => {
  const { posix } = await import('node:path')
  const listen = (name: string) => (listener: (event?: unknown) => void) => {
    mocks.listeners.set(name, listener)
    const dispose = vi.fn(() => mocks.listeners.delete(name))
    mocks.disposals.push(dispose)
    return { dispose }
  }
  return {
    default: {
      Uri: {
        joinPath: (base: { path: string }, ...parts: string[]) =>
          mocks.uri(posix.join(base.path, ...parts))
      },
      workspace: {
        fs: { readFile: mocks.readFile },
        getConfiguration: (section: string) => ({
          get: () => (section === 'workbench' ? mocks.theme : mocks.custom)
        }),
        onDidChangeConfiguration: listen('configuration')
      },
      window: { onDidChangeActiveColorTheme: listen('theme') },
      extensions: { all: mocks.extensions, onDidChange: listen('extensions') },
      Disposable: {
        from: (...items: { dispose(): void }[]) => ({
          dispose: () => items.forEach(item => item.dispose())
        })
      }
    },
    Uri: {
      joinPath: (base: { path: string }, ...parts: string[]) =>
        mocks.uri(posix.join(base.path, ...parts))
    }
  }
})

beforeEach(() => {
  mocks.theme = 'Selected theme'
  mocks.custom = {}
  mocks.extensions[0].packageJSON.version = String(
    Number(mocks.extensions[0].packageJSON.version) + 1
  )
  mocks.files.clear()
  mocks.readFile.mockReset().mockImplementation(async (uri: { path: string }) => {
    const content = mocks.files.get(uri.path)
    if (content === undefined) throw new Error('not found')
    return new TextEncoder().encode(content)
  })
  mocks.listeners.clear()
  mocks.disposals.length = 0
})

describe('syntaxTheme', () => {
  it('按贡献 id 定位主题，合并 JSONC include，子主题相同 scope 覆盖父主题', async () => {
    mocks.files.set(
      '/themes/selected.json',
      `{
      // Theme inheritance
      "include": "./base.json", "tokenColors": [
        { "scope": "keyword", "settings": { "foreground": "#ff7b72" } },
      ],
    }`
    )
    mocks.files.set(
      '/themes/base.json',
      JSON.stringify({
        tokenColors: [
          { scope: 'keyword', settings: { foreground: '#000000' } },
          { scope: 'string', settings: { foreground: '#a5d6ff' } }
        ]
      })
    )
    expect((await getSyntaxTheme()).settings).toEqual([
      { scope: 'keyword', settings: { foreground: '#000000' } },
      { scope: 'string', settings: { foreground: '#a5d6ff' } },
      { scope: 'keyword', settings: { foreground: '#ff7b72' } }
    ])
    expect(mocks.readFile).toHaveBeenCalledTimes(2)
  })

  it('支持外置 plist tokenColors，解码 XML 字符实体', async () => {
    mocks.files.set('/themes/selected.json', '{"tokenColors":"./tokens.tmTheme"}')
    mocks.files.set(
      '/themes/tokens.tmTheme',
      `<?xml version="1.0"?><plist><dict>
      <key>settings</key><array><dict><key>scope</key><string>comment, string</string>
      <key>settings</key><dict><key>foreground</key><string>&#35;123456</string></dict>
      </dict></array></dict></plist>`
    )
    expect((await getSyntaxTheme()).settings).toEqual([
      { scope: 'comment, string', settings: { foreground: '#123456' } }
    ])
  })

  it('并发页面共用读取，切换主题或 token 自定义后读取新快照', async () => {
    mocks.files.set(
      '/themes/selected.json',
      '{"tokenColors":[{"scope":"string","settings":{"foreground":"#111111"}}]}'
    )
    mocks.files.set(
      '/themes/other.json',
      '{"tokenColors":[{"scope":"string","settings":{"foreground":"#222222"}}]}'
    )
    const [first, second] = await Promise.all([getSyntaxTheme(), getSyntaxTheme()])
    expect(first).toBe(second)
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
    mocks.theme = 'Other theme'
    expect((await getSyntaxTheme()).settings).toEqual([
      { scope: 'string', settings: { foreground: '#222222' } }
    ])
    mocks.custom = { strings: '#333333' }
    expect((await getSyntaxTheme()).settings.at(-1)).toMatchObject({
      scope: ['string', 'meta.embedded.assembly'],
      settings: { foreground: '#333333' }
    })
  })

  it.each(['{"include":"./selected.json"}', '{invalid', '{"include":"./missing.json"}'])(
    '文件无法读取时回退，但仍应用有效的用户自定义：%s',
    async source => {
      mocks.files.set('/themes/selected.json', source)
      mocks.custom = { comments: '#123456' }
      expect((await getSyntaxTheme()).settings).toEqual([
        {
          scope: ['comment', 'punctuation.definition.comment'],
          settings: { foreground: '#123456' }
        }
      ])
    }
  )

  it('订阅相关配置、主题和扩展变化并释放全部监听', () => {
    const changed = vi.fn()
    const disposable = watchSyntaxTheme(changed)
    mocks.listeners.get('theme')?.()
    mocks.listeners.get('configuration')?.({
      affectsConfiguration: (key: string) => key === 'editor.tokenColorCustomizations'
    })
    mocks.listeners.get('configuration')?.({ affectsConfiguration: () => false })
    mocks.listeners.get('extensions')?.()
    expect(changed).toHaveBeenCalledTimes(3)
    disposable.dispose()
    expect(mocks.disposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true)
  })
})
