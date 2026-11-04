'use strict';

// 快速切換器（像 Obsidian 的 Quick Switcher，⌘K 打開）用的索引。
// 每個語言一份：預設語言在 /search.json，其他語言在 /<lang>/search.json，收錄的範圍跟全站圖譜一樣——
// 這個語言的頁面，加上沒有這個語言版本的頁面（例如只有中文的筆記）。
// 內容：文章（專案、文章、筆記）、source/ 底下有標題的頁面（列表頁、About、/lab/ 的動畫頁）、
// 每篇文章的 h2 / h3（連到頁內錨點），以及標籤。前端在 source/js/search.js，第一次打開時才下載。

const { stripHTML, unescapeHTML, url_for } = require('hexo-util');

const helper = name => hexo.extend.helper.get(name);
const langOf = doc => helper('lang_of')(doc);
const defaultLang = () => helper('default_lang')();
const kindOf = doc => helper('post_kind').call(hexo, doc);
const inLang = (docs, lang) => helper('in_lang')(docs, lang);

const trimSlash = s => String(s || '').replace(/^\/+|\/+$/g, '');
const toArray = v => (Array.isArray(v) ? v : v ? [v] : []);
// 拿掉 KaTeX 給螢幕閱讀器的 MathML，留下畫面上的字
const plain = html => unescapeHTML(stripHTML(String(html || '')
  .replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g, ''))).replace(/\s+/g, ' ').trim();
const url = path => url_for.call(hexo, path);

// 只有文章的版型會把 h2 / h3 原樣放在頁面上；動畫頁的內文另外排版，錨點不一定存在
const HEADING_LAYOUTS = new Set(['post', 'project', undefined]);

function headingsOf(doc) {
  if (!HEADING_LAYOUTS.has(doc.layout)) return [];
  const out = [];
  const re = /<h([23])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
  let m;
  while ((m = re.exec(doc.content || ''))) {
    const t = plain(m[3]);
    if (t) out.push([+m[1], t, unescapeHTML(m[2])]);
  }
  return out;
}

function buildIndex(locals, lang) {
  const theme = hexo.theme.config;
  const navLabel = path => {
    const item = toArray(theme.nav).find(n => trimSlash(n.path) === trimSlash(path));
    return item ? item.label : trimSlash(path);
  };
  const folders = { project: navLabel('/projects/'), post: navLabel('/blog/'), note: navLabel('/notes/') };
  const courses = toArray((theme.notes || {}).courses).filter(c => c && c.hub && c.tag);
  // 搜尋結果左邊淡色的「資料夾」：Notes/ICLAB、Projects、Lab
  const folderOf = doc => {
    if (!String(doc.source).startsWith('_posts/')) return trimSlash(doc.path).startsWith('lab/') ? 'Lab' : '';
    const kind = kindOf(doc);
    if (kind !== 'note') return folders[kind];
    const tags = doc.tags ? doc.tags.map(t => t.name) : [];
    const course = courses.find(c => trimSlash(c.hub) === trimSlash(doc.path) || tags.includes(c.tag));
    return course ? folders.note + '/' + course.tag : folders.note;
  };

  const entry = (doc, kind) => {
    const e = { t: doc.title, u: url(doc.path), k: kind, f: folderOf(doc) };
    const aliases = toArray(doc.aliases).map(String).filter(a => a !== doc.title);
    if (aliases.length) e.a = aliases;
    const tags = doc.tags && doc.tags.length ? doc.tags.map(t => t.name) : [];
    if (tags.length) e.g = tags;
    if (doc.summary) e.s = String(doc.summary);
    if (kind !== 'page' && doc.date) e.d = doc.date.format('YYYY-MM-DD');
    const h = headingsOf(doc);
    if (h.length) e.h = h;
    return e;
  };

  const posts = inLang(locals.posts.sort('-date'), lang).map(p => entry(p, kindOf(p)));
  const pages = inLang(locals.pages, lang)
    .filter(p => p.title && !p.noindex && p.layout !== 'index' && trimSlash(p.path) !== '404.html')
    .map(p => entry(p, p.kind === 'note' ? 'note' : 'page'));
  // 不是 source/ 底下的檔案、由 generator 產生的頁面
  const home = lang === defaultLang() ? '/' : '/' + lang + '/';
  const extra = [
    { t: 'Home', u: url(home), k: 'page', f: '' },
    { t: 'Archive', u: url('/archives/'), k: 'page', f: '' }
  ];

  const visible = new Set(inLang(locals.posts, lang).map(p => p._id));
  const tags = locals.tags.toArray()
    .map(t => ({ t: t.name, u: url(t.path), n: t.posts.filter(p => visible.has(p._id)).length }))
    .filter(t => t.n > 0)
    .sort((a, b) => b.n - a.n);

  return { pages: posts.concat(pages, extra), tags };
}

hexo.extend.generator.register('search', function (locals) {
  const langs = [defaultLang()].concat(hexo.theme.i18n.list().filter(l => l !== defaultLang() && l !== 'default'));
  return langs.map(lang => ({
    path: (lang === defaultLang() ? '' : lang + '/') + 'search.json',
    data: JSON.stringify(buildIndex(locals, lang))
  }));
});

// 版型用：這一頁的語言對應的索引網址
hexo.extend.helper.register('search_index_url', function () {
  const lang = langOf(this.page);
  return url((lang === defaultLang() ? '' : lang + '/') + 'search.json');
});
