import oniguruma from 'vscode-oniguruma'
import type { IOnigLib } from 'vscode-textmate'

/**
 * 将 TextMate 的公开 FindOption 位标记转换为 Oniguruma 2 的选项数组
 * 两个包的 const enum 没有运行时导出，数值与各自公开声明对应
 */
export function createOnigurumaLib(): IOnigLib {
  return {
    createOnigString: source => oniguruma.createOnigString(source),
    createOnigScanner: sources => {
      const scanner = oniguruma.createOnigScanner(sources)
      return {
        dispose: () => scanner.dispose(),
        findNextMatchSync: (source, position, flags) => {
          const options = []
          if (flags & 1) options.push(21)
          if (flags & 2) options.push(22)
          if (flags & 4) options.push(23)
          if (flags & 8) options.push(25)
          const text =
            typeof source === 'string' || source instanceof oniguruma.OnigString
              ? source
              : source.content
          return scanner.findNextMatchSync(text, position, options)
        }
      }
    }
  }
}

/** WASM 输入，Uint8Array 也兼容 Node Buffer，且只读取视图实际包含的字节 */
export type OnigurumaData = ArrayBuffer | Uint8Array | Response

/** Initialize the official WASM from caller-provided bytes or a response; no bundler-specific URL imports. */
export function loadOniguruma(data: OnigurumaData | PromiseLike<OnigurumaData>): Promise<IOnigLib> {
  return Promise.resolve(data).then(async value => {
    if (value instanceof Response) {
      if (!value.ok) throw new Error(`Unable to load Oniguruma WASM: ${value.status}`)
      value = await value.arrayBuffer()
    }
    if (value instanceof Uint8Array) value = new Uint8Array(value).buffer
    await oniguruma.loadWASM(value)
    return createOnigurumaLib()
  })
}
