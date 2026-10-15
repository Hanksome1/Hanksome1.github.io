'use strict';

// RSS（hexo-generator-feed，設定在 _config.yml 的 feed）：
// 跟首頁、Archive 一樣只收預設語言的文章，翻譯版不會在訂閱裡重複出現；
// 每篇的摘要用 front-matter 的 summary，沒有的話取內文開頭的純文字（外掛預設會把 HTML 直接截斷）。

const { stripHTML, unescapeHTML } = require('hexo-util');

const langOf = post => hexo.extend.helper.get('lang_of')(post);
const defaultLang = () => hexo.extend.helper.get('default_lang')();

const SUMMARY_LENGTH = 140;

// 拿掉整段 KaTeX 輸出（<span class="katex">…</span>）：轉成純文字會變成 ∂t∂ρ 這種亂碼，摘要裡乾脆略過數學式。
// 裡面是巢狀的 span，所以數 span 的層數找結尾
function dropMath(html) {
  const start = /<span class="katex">/g;
  const tag = /<\/?span\b[^>]*>/g;
  let out = '', last = 0, m;
  while ((m = start.exec(html))) {
    out += html.slice(last, m.index);
    let depth = 0, t;
    tag.lastIndex = m.index;
    while ((t = tag.exec(html)) && (depth += t[0][1] === '/' ? -1 : 1));
    last = start.lastIndex = t ? tag.lastIndex : html.length;
  }
  return out + html.slice(last);
}

function plainSummary(html) {
  const text = unescapeHTML(stripHTML(dropMath(String(html || '')))).replace(/\s+/g, ' ').trim();
  return text.length > SUMMARY_LENGTH ? text.slice(0, SUMMARY_LENGTH) + '…' : text;
}

const feed = hexo.config.feed || {};
[].concat(feed.enable === false ? [] : feed.type || []).forEach(type => {
  const generate = hexo.extend.generator.get(type);
  if (!generate) return;
  hexo.extend.generator.register(type, function (locals) {
    // 疊一層 prototype 只蓋掉 description，文章本身不受影響
    const posts = locals.posts.filter(p => langOf(p) === defaultLang())
      .map(p => Object.create(p, { description: { value: p.description || p.summary || plainSummary(p.content) } }));
    return generate.call(this, Object.assign({}, locals, { posts: new locals.posts.constructor(posts) }));
  });
});
