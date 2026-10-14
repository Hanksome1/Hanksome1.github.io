'use strict';

// {% wavedrom 圖說文字 %}
// { signal: [ { name: 'clk', wave: 'p...' } ] }
// {% endwavedrom %}
hexo.extend.tag.register('wavedrom', function (args, content) {
  const caption = args.join(' ');
  return `<figure class="wavedrom-fig"><script type="WaveDrom">${content.trim()}</script>`
    + (caption ? `<figcaption>${caption}</figcaption>` : '')
    + '</figure>';
}, { ends: true });

// {% note warn 標題 %} 內容 {% endnote %} — 類似 datasheet 的注意事項框
hexo.extend.tag.register('note', function (args, content) {
  const kinds = ['info', 'warn', 'tip'];
  const kind = kinds.includes(args[0]) ? args.shift() : 'info';
  const title = args.join(' ') || { info: 'NOTE', warn: 'CAUTION', tip: 'TIP' }[kind];
  const body = hexo.render.renderSync({ text: content, engine: 'markdown' });
  return `<aside class="note note-${kind}"><div class="note-title">${title}</div>${body}</aside>`;
}, { ends: true });

// 讓 ```systemverilog 也能用 verilog 的語法上色
try {
  require('highlight.js').registerAliases(['systemverilog', 'svlog'], { languageName: 'verilog' });
} catch (e) {}
