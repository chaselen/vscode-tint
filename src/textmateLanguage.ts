/**
 * 仅用于自动检测后的 TextMate grammar 选择，不改写公共检测结果或显式语言
 * highlight.js 的 xml 同时覆盖 HTML/XML，TextMate 则需要分别加载 grammar
 */
export function resolveDetectedTextmateLanguage(
  language: string | undefined,
  source: string
): string | undefined {
  // TypeScript/TSX 等变体缺少可靠文档标记，不以正则猜测泛型与 JSX
  if (language !== 'xml') return language
  // 只接受文档开头的明确线索；注释或普通 XML 子节点中的 HTML 不参与判断
  const document = source.replace(/^\uFEFF?\s*(?:<!--[\s\S]*?-->\s*)*/, '')
  if (/^(?:<!doctype\s+html(?:\s|>)|<html(?:\s|>))/i.test(document)) return 'html'
  return language
}
