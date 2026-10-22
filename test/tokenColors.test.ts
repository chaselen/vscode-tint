import { describe, expect, it } from 'vitest'
import { getCustomTokenColorRules, readTokenColorRules } from '../src/tokenColors.js'

describe('tokenColors', () => {
  it('保留完整 scope 选择器和字体样式，不自行匹配或简化规则', () => {
    const rules = [
      {
        scope: ['source.js entity.name.function', 'string'],
        settings: { foreground: '#123456', background: '#abcdef', fontStyle: 'italic bold' }
      }
    ]
    expect(readTokenColorRules(rules)).toEqual(rules)
  })

  it('全局和当前主题自定义按顺序合并，支持多个主题选择器及通配', () => {
    const rules = getCustomTokenColorRules(
      {
        comments: '#aaaaaa',
        '[GitHub Dark*][Other Theme]': {
          comments: { foreground: '#cccccc', fontStyle: 'italic' },
          textMateRules: [{ scope: 'keyword', settings: { foreground: '#dddddd' } }]
        },
        '[GitHub Light*]': { comments: '#eeeeee' }
      },
      'GitHub Dark Default'
    )
    expect(rules).toEqual([
      { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#aaaaaa' } },
      {
        scope: ['comment', 'punctuation.definition.comment'],
        settings: { foreground: '#cccccc', fontStyle: 'italic' }
      },
      { scope: 'keyword', settings: { foreground: '#dddddd' } }
    ])
  })

  it('清除非法颜色与无效结构，不将配置作为 CSS 或 HTML 注入', () => {
    expect(
      readTokenColorRules([
        null,
        {},
        { scope: 4, settings: {} },
        { scope: ['string', 4], settings: {} },
        {
          scope: 'string',
          settings: {
            foreground: 'red; background:url(https://example.com)',
            background: '<script>',
            fontStyle: 'italic'
          }
        }
      ])
    ).toEqual([{ scope: 'string', settings: { fontStyle: 'italic' } }])
  })
})
