'use strict';

// 多語系：預設語言（_config.yml 的 language）的內容放在原本的位置，其他語言放在 <lang>/ 底下、路徑相同：
//   source/_posts/projects/x.md  ↔  source/_posts/en/projects/x.md   （/projects/x/ ↔ /en/projects/x/）
//   source/projects/index.md     ↔  source/en/projects/index.md      （/projects/   ↔ /en/projects/）
//   首頁（index generator）       ↔  source/en/index.md               （/            ↔ /en/）
// 可用的語言 = themes/tapeout/languages/*.yml。翻譯版不會出現在首頁、Archive、標籤頁與全站圖譜，
// 只在 /en/projects/ 這類同語言的列表裡；頁首的語言切換會連到另一個語言的同一頁。

const defaultLang = () => [].concat(hexo.config.language || 'zh-TW')[0];
const otherLangs = () => hexo.theme.i18n.list().filter(l => l !== defaultLang() && l !== 'default');

// 網址路徑 → 比對用的 key：去掉開頭的 /、結尾的 index.html，目錄一律以 / 結尾
function keyOf(path) {
  let s = String(path || '');
  try { s = decodeURI(s); } catch (e) {}
  s = s.replace(/^\/+/, '').replace(/index\.html$/, '');
  if (s && !s.endsWith('/') && !/\.[a-z0-9]+$/i.test(s)) s += '/';
  return s;
}

function langOf(doc) {
  if (doc && doc.lang) return doc.lang;
  const seg = keyOf(doc && doc.path).split('/')[0];
  return otherLangs().includes(seg) ? seg : defaultLang();
}

// 去掉語言前綴的 key：/en/projects/x/ 與 /projects/x/ 都是 projects/x/
function baseKey(doc) {
  const key = keyOf(doc.path);
  const lang = langOf(doc);
  return lang !== defaultLang() && key.startsWith(lang + '/') ? key.slice(lang.length + 1) : key;
}

const keyFor = (base, lang) => (lang === defaultLang() ? base : lang + '/' + base);

function docIndex(site) {
  const index = new Map();
  // 預設語言的首頁由 index generator 產生，不在 site.pages 裡
  index.set('', { path: '' });
  [site.posts, site.pages].forEach(q => q.forEach(d => index.set(keyOf(d.path), d)));
  return index;
}

hexo.extend.helper.register('default_lang', defaultLang);
hexo.extend.helper.register('lang_of', langOf);
hexo.extend.helper.register('lang_base_key', baseKey);

// 某個語言的文章，預設是網站的預設語言；其他語言還沒翻譯的文章用預設語言的版本補上（例如英文首頁的 Writing）
hexo.extend.helper.register('in_lang', function (posts, lang) {
  const want = lang || defaultLang();
  const list = posts && posts.toArray ? posts.toArray() : posts || [];
  if (want === defaultLang()) return list.filter(p => langOf(p) === want);
  const translated = new Set(list.filter(p => langOf(p) === want).map(baseKey));
  return list.filter(p => langOf(p) === want || (langOf(p) === defaultLang() && !translated.has(baseKey(p))));
});

// _config.tapeout.yml 裡的文字可以寫成 { zh-TW: …, en: … }，依這一頁的語言取值；缺的語言用預設語言
hexo.extend.helper.register('localize', function (value, lang) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  lang = lang || langOf(this.page);
  return value[lang] != null ? value[lang] : value[defaultLang()];
});

// 這一頁的所有語言版本：[{ lang, name, path, current }]；沒有翻譯時回傳 []
hexo.extend.helper.register('page_versions', function (page) {
  const index = docIndex(this.site);
  const lang = langOf(page);
  const base = baseKey(page);
  const versions = [defaultLang()].concat(otherLangs()).map(l => {
    const doc = l === lang ? page : index.get(keyFor(base, l));
    if (!doc) return null;
    return { lang: l, name: hexo.theme.i18n.get(l).language_name || l, path: doc.path, current: l === lang };
  }).filter(Boolean);
  return versions.length > 1 ? versions : [];
});

// 站內連結換成同語言的版本（有的話），例如英文頁的導覽列 /projects/ → /en/projects/
hexo.extend.helper.register('localized_path', function (path, lang) {
  lang = lang || langOf(this.page);
  if (lang === defaultLang()) return path;
  return docIndex(this.site).has(keyFor(keyOf(path), lang)) ? '/' + keyFor(keyOf(path), lang) : path;
});

// 同語言裡的上一篇（較新）與下一篇（較舊），取代 Hexo 跨語言的 page.prev / page.next
hexo.extend.helper.register('post_neighbors', function (page) {
  const lang = langOf(page);
  const list = this.site.posts.sort('-date').filter(p => langOf(p) === lang).toArray();
  const i = list.findIndex(p => p._id === page._id);
  if (i < 0) return { prev: null, next: null };
  return { prev: list[i - 1] || null, next: list[i + 1] || null };
});

// ── 檢查：每個專案都要有中英文兩個版本，而且共用的欄位要一致 ─────────────
const SHARED = ['date', 'featured', 'part', 'period', 'cover', 'stack', 'tools', 'floorplan', 'tags', 'metrics', 'links'];

function shared(post, field) {
  const v = post[field];
  if (field === 'date') return v ? v.valueOf() : null;
  if (field === 'tags') return v ? v.map(t => t.name).sort() : [];
  if (field === 'metrics') return (v || []).map(m => m.value);  // label、note 可以翻譯，數字不行
  if (field === 'links') return (v || []).map(l => l.url);
  if (v == null || v === false || (Array.isArray(v) && !v.length)) return null;
  return v;
}

hexo.extend.filter.register('before_generate', function () {
  const projects = hexo.locals.get('posts').filter(p => p.layout === 'project').toArray();
  const byKey = new Map(projects.map(p => [keyOf(p.path), p]));
  const langs = [defaultLang()].concat(otherLangs());
  const twinSource = (post, lang) => post.source.replace(/^_posts\//, `_posts/${lang}/`);

  projects.filter(p => langOf(p) === defaultLang()).forEach(post => {
    langs.filter(l => l !== defaultLang()).forEach(lang => {
      const twin = byKey.get(keyFor(baseKey(post), lang));
      if (!twin) {
        hexo.log.warn(`[i18n] ${post.source}: 還沒有 ${lang} 版（應該放在 ${twinSource(post, lang)}）`);
        return;
      }
      const diff = SHARED.filter(f => JSON.stringify(shared(post, f)) !== JSON.stringify(shared(twin, f)));
      if (diff.length) hexo.log.warn(`[i18n] ${twin.source}: 這些欄位和 ${post.source} 不一致：${diff.join(', ')}`);
    });
  });
  projects.filter(p => langOf(p) !== defaultLang()).forEach(post => {
    if (!byKey.has(baseKey(post))) hexo.log.warn(`[i18n] ${post.source}: 找不到對應的 ${defaultLang()} 原文（${baseKey(post)}）`);
  });
});
