import { expect, it } from 'vitest'
import { detectCodeLanguage, commonHighlightJs } from '../src/detection.js'
import { createHighlightJsHighlighter } from '../src/highlightjs.js'
import { resolveDetectedTextmateLanguage } from '../src/textmateLanguage.js'
import { samples } from '../demo/samples.js'

it('preserves raw detection results while TextMate can distinguish HTML documents', async () => {
  const html = samples.find(sample => sample.id === 'html')!.source
  expect(detectCodeLanguage(html)).toBe('xml')
  expect(detectCodeLanguage(html)).toBe(commonHighlightJs.highlightAuto(html).language)
  expect(resolveDetectedTextmateLanguage('xml', '<!DOCTYPE HTML>')).toBe('html')
  expect(resolveDetectedTextmateLanguage('xml', '<html lang="en">')).toBe('html')
  for (const source of [
    '<?xml version="1.0"?><root/>',
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
    '<html-widget/>',
    '<root><!-- <!DOCTYPE html> --><html/></root>'
  ]) {
    expect(resolveDetectedTextmateLanguage('xml', source)).toBe('xml')
  }
  expect(resolveDetectedTextmateLanguage('javascript', 'const html = "<html>"')).toBe('javascript')
  const engine = await createHighlightJsHighlighter({ hljs: commonHighlightJs })
  try {
    expect((await engine.highlight(html)).language).toBe('xml')
    expect((await engine.highlight(html, { language: 'xml' })).language).toBe('xml')
  } finally {
    engine.dispose()
  }
})
