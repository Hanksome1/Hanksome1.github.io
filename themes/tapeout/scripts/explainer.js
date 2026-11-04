'use strict';

// layout: explainer：tools/sync-vault.js 把卡片排在標記之間，這裡切回舞台前、卡片、舞台後三塊。
// 卡片留在內文裡，連結、數學式、callout、關聯圖都照一般筆記處理。
hexo.extend.helper.register('explainer_parts', function (content) {
  const html = String(content || '');
  const m = /^([\s\S]*?)<!-- explainer:begin -->([\s\S]*?)<!-- explainer:end -->([\s\S]*)$/.exec(html);
  if (!m) return { before: html, cards: {}, after: '' };
  const cards = {};
  const pieces = m[2].split(/<!-- explainer:card ([A-Za-z0-9-]+) -->/);
  for (let i = 1; i < pieces.length; i += 2) cards[pieces[i]] = pieces[i + 1].trim();
  return { before: m[1], cards, after: m[3] };
});
