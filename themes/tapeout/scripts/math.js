'use strict';

// LaTeX 支援：伺服器端 KaTeX、自動方程式編號、\label / \ref / \eqref、定理環境
//
//   行內  $E = mc^2$   \(E = mc^2\)
//   區塊  $$ … $$   \[ … \]   \begin{align} … \end{align}（equation / gather / alignat / multline / eqnarray）
//   引用  式子裡寫 \label{eq:x}，內文用 \eqref{eq:x}；定理內寫 \label{thm:x}，內文用 \ref{thm:x}
//   定理  > [!theorem] 名稱（Obsidian callout）或 {% theorem 名稱 %} … {% endtheorem %}
//         另有 lemma、proposition、corollary、definition、example、exercise、remark、proof
//
// 流程：before_post_render 先把數學式換成 <tex-ph> 佔位標籤，marked 與 Nunjucks 就碰不到
// 反斜線、底線、| 與 {{ }}；after_post_render 再編號、解析引用，最後用 KaTeX 輸出 HTML。
// 文章 front-matter 寫 math: false 可關閉。

const fs = require('fs');
const path = require('path');
const katex = require('katex');
const { escapeHTML } = require('hexo-util');

const pending = new WeakMap();
// 屬性值不加引號：Hexo 解析 {% tag 參數 %} 時會把引號吃掉。
// 前後包一對 Unicode 保留字元（U+FDD0/U+FDD1）：佔位標籤開頭的 < 是標點，
// 「中文**$x$**中文」的 ** 會因此不被當成粗體；保留字元不算標點，輸出前再拿掉。
const ph = i => `﷐<tex-ph data-i=${i}></tex-ph>﷑`;
const rPh = /<tex-ph data-i=(\d+)><\/tex-ph>/g;
// 出現在屬性裡（例如圖片 alt）時會被 escape
const rPhEscaped = /&lt;tex-ph data-i(?:=|&#x3D;|&#61;)(\d+)&gt;&lt;(?:\/|&#x2F;|&#47;)tex-ph&gt;/g;
const THM_SLOT = '<span class="thm-num"></span>';

function mathConfig() {
  return Object.assign({ enable: true, macros: {} }, hexo.theme.config.math);
}

// ── 1. 抽出數學式 ─────────────────────────────────────────────

const ENVS = 'equation|align|gather|alignat|multline|flalign|eqnarray|displaymath';
const rEnvOpen = new RegExp(`\\\\begin\\{((?:${ENVS})\\*?)\\}`, 'y');
const rRef = /\\(eqref|ref|label)\s*\{([^{}\n]+)\}/y;
const rSkipTag = /\{%-?\s*(raw|codeblock|code|wavedrom|include_code)\b[\s\S]*?%\}/y;
const rSkipHtml = /<(script|style|pre|code|hexoPostRenderCodeBlock)\b/iy;
const rPunct = /[!-/:-@[-`{-~]/;

// 從 from 開始找 TeX 的結尾分隔符號，跳過跳脫字元；stopAtBlank 時遇到空行（段落結束）就放棄
function findClose(src, from, close, stopAtBlank) {
  for (let j = from; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') {
      if (src.startsWith(close, j)) return j;
      j++;
    } else if (c === '`') {
      return -1; // 不跨過行內 code
    } else if (c === '\n' && stopAtBlank && /^[ \t>]*\n/.test(src.slice(j + 1, j + 80))) {
      return -1;
    } else if (close[0] === '$' && c === '$') {
      if (close === '$$') {
        if (src[j + 1] === '$') return j;
      } else {
        // 跟 Pandoc 一樣：結尾 $ 前面不能是空白、後面不能接數字，所以 $20 與 $30 不會變成數學式
        return /\s/.test(src[j - 1]) || /\d/.test(src[j + 1] || '') ? -1 : j;
      }
    }
  }
  return -1;
}

function findEnvEnd(src, from, env) {
  const re = new RegExp(`\\\\(begin|end)\\{${env.replace('*', '\\*')}\\}`, 'g');
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(src))) {
    depth += m[1] === 'begin' ? 1 : -1;
    if (!depth) return re.lastIndex;
  }
  return -1;
}

// 在 blockquote 裡的區塊數學式，後續每一行開頭都有 >，要拿掉
function stripQuotePrefix(src, at, tex) {
  const prefix = src.slice(src.lastIndexOf('\n', at - 1) + 1, at);
  const depth = /^[ \t>]*$/.test(prefix) ? (prefix.match(/>/g) || []).length : 0;
  if (!depth) return tex;
  const re = new RegExp(`^(?:[ \\t]*>){1,${depth}}[ \\t]?`);
  return tex.split('\n').map((line, i) => (i ? line.replace(re, '') : line)).join('\n');
}

function extract(src, items) {
  let out = '';
  let last = 0;
  let i = 0;
  const take = (end, item, start = i) => {
    let head = src.slice(last, start);
    // LaTeX 的 Theorem~\ref{…}：~ 是不換行空白，留著會被當成刪除線
    if (item.ref && head.endsWith('~')) head = head.slice(0, -1) + '&nbsp;';
    out += head + ph(items.push(item) - 1);
    i = last = end;
  };

  while (i < src.length) {
    const c = src[i];
    let m;

    if (c === '<') {
      // 程式碼、HTML 註解、<script> 等原樣保留
      if (src.startsWith('<!--', i)) {
        const end = src.indexOf('-->', i + 4);
        i = end < 0 ? src.length : end + 3;
        continue;
      }
      rSkipHtml.lastIndex = i;
      if ((m = rSkipHtml.exec(src))) {
        const end = src.toLowerCase().indexOf(`</${m[1].toLowerCase()}>`, i);
        if (end > -1) { i = end + m[1].length + 3; continue; }
      }
    } else if (c === '{' && src[i + 1] === '%') {
      rSkipTag.lastIndex = i;
      if ((m = rSkipTag.exec(src))) {
        const close = new RegExp(`\\{%-?\\s*end${m[1]}\\s*-?%\\}`, 'g');
        close.lastIndex = rSkipTag.lastIndex;
        const end = close.exec(src);
        i = end ? close.lastIndex : rSkipTag.lastIndex;
        continue;
      }
    } else if (c === '`') {
      // 行內 code：找長度相同的反引號
      let k = i;
      while (src[k] === '`') k++;
      const fence = src.slice(i, k);
      let j = k;
      let found = -1;
      while ((j = src.indexOf(fence, j)) > -1) {
        if (src[j + fence.length] !== '`' && src[j - 1] !== '`') { found = j; break; }
        while (src[j] === '`') j++;
      }
      i = found < 0 ? k : found + fence.length;
      continue;
    } else if (c === '$') {
      if (src[i + 1] === '$') {
        // 一行開頭的 $$ 是區塊數學式，跟 Obsidian 一樣可以跨空行；段落中間的 $$ 遇到空行就放棄
        const block = /^[ \t>]*$/.test(src.slice(src.lastIndexOf('\n', i - 1) + 1, i));
        const end = findClose(src, i + 2, '$$', !block);
        if (end > -1) {
          take(end + 2, { tex: stripQuotePrefix(src, i, src.slice(i + 2, end)), display: true });
          continue;
        }
        i += 2;
        continue;
      }
      if (src[i + 1] && !/\s/.test(src[i + 1])) {
        const end = findClose(src, i + 1, '$', true);
        if (end > -1) {
          take(end + 1, { tex: src.slice(i + 1, end), display: false });
          continue;
        }
      }
    } else if (c === '\\') {
      const next = src[i + 1];
      if (next === '(' || next === '[') {
        const display = next === '[';
        const end = findClose(src, i + 2, display ? '\\]' : '\\)', !display);
        if (end > -1) {
          const tex = src.slice(i + 2, end);
          take(end + 2, { tex: display ? stripQuotePrefix(src, i, tex) : tex, display });
          continue;
        }
      }
      rEnvOpen.lastIndex = i;
      if (next === 'b' && (m = rEnvOpen.exec(src))) {
        const end = findEnvEnd(src, rEnvOpen.lastIndex, m[1]);
        if (end > -1) {
          take(end, { tex: stripQuotePrefix(src, i, src.slice(i, end)), display: true });
          continue;
        }
      }
      rRef.lastIndex = i;
      if ((m = rRef.exec(src))) {
        take(rRef.lastIndex, { ref: m[1], key: m[2].trim() });
        continue;
      }
      // Markdown 的跳脫字元（\$、\\、\`…）連同下一個字一起跳過
      if (next && rPunct.test(next)) { i += 2; continue; }
    }
    i++;
  }
  return out + src.slice(last);
}

// ```math 區塊（GitHub / GitLab 的寫法）改成 $$，要在 Hexo 把 ``` 轉成程式碼之前做；
// 逐行追蹤 fence，包在其他程式碼區塊裡的 ```math（例如語法說明）不會被改到
function mathFences(src) {
  const lines = src.split('\n');
  let open = null;
  lines.forEach((line, i) => {
    const m = /^([ \t]*(?:>[ \t]?)*)(`{3,}|~{3,})(.*)$/.exec(line);
    if (!m) return;
    if (!open) {
      open = { fence: m[2], math: m[3].trim() === 'math' };
      if (open.math) lines[i] = m[1] + '$$';
    } else if (m[2][0] === open.fence[0] && m[2].length >= open.fence.length && !m[3].trim()) {
      if (open.math) lines[i] = m[1] + '$$';
      open = null;
    }
  });
  return lines.join('\n');
}

hexo.extend.filter.register('before_post_render', function (data) {
  if (data.math === false || !mathConfig().enable || !data.content) return;
  if (/^[ \t>]*(?:`{3,}|~{3,})[ \t]*math[ \t]*$/m.test(data.content)) data.content = mathFences(data.content);
}, 9);

hexo.extend.filter.register('before_post_render', function (data) {
  if (data.math === false || !mathConfig().enable || !data.content || !/[$\\]/.test(data.content)) return;
  const items = [];
  data.content = extract(data.content, items);
  if (items.length) pending.set(data, items);
}, 11); // 排在 Hexo 內建的 backtick_code_block（10）之後：``` 區塊已被包成 <hexoPostRenderCodeBlock>

// ── 2. 方程式編號 ─────────────────────────────────────────────
// KaTeX 用 CSS counter 編號、不支援 \label，所以改成在這裡算好號碼，
// 把 equation / align 換成 equation* / align*，再在每一列補上 \tag{n}。

const rCs = /\\([A-Za-z]+|[\s\S])/y;

// 走過 TeX 原始碼，只回報最外層（不在 {} 或 \begin…\end 裡）的字元與控制序列
function walkTop(s, fn) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '\\') {
      rCs.lastIndex = i;
      const m = rCs.exec(s);
      if (!m) return;
      if (m[1] === 'begin') depth++;
      else if (m[1] === 'end') depth--;
      else if (!depth && fn(i, m[0]) === false) return;
      i += m[0].length - 1;
    } else if (!depth && fn(i, c) === false) return;
  }
}

function splitRows(s) {
  const rows = [];
  let start = 0;
  const rSep = /\\\\\*?(?:\s*\[[^\]]*\])?/y;
  walkTop(s, (i, tok) => {
    if (tok !== '\\\\' || i < start) return;
    rSep.lastIndex = i;
    const sep = rSep.exec(s)[0];
    rows.push({ text: s.slice(start, i), sep });
    start = i + sep.length;
  });
  rows.push({ text: s.slice(start), sep: '' });
  return rows;
}

// eqnarray 的 a &=& b 改成 align 的 a &= b
function dropSecondAmp(row) {
  let seen = 0;
  let at = -1;
  walkTop(row, (i, tok) => {
    if (tok === '&' && ++seen === 2) { at = i; return false; }
  });
  return at < 0 ? row : row.slice(0, at) + row.slice(at + 1);
}

const anchorId = key => 'eq-' + key.replace(/[\s"'<>&#]+/g, '-');

function numberDisplay(it, eq, setLabel) {
  let tex = it.tex.trim();
  let env = null;
  let star = '';
  let arg = '';
  const m = /^\\begin\{([a-z]+)(\*?)\}((?:\{\d+\})?)([\s\S]*)\\end\{\1\2\}$/.exec(tex);
  if (m && new RegExp(`^(?:${ENVS})$`).test(m[1])) [, env, star, arg, tex] = m;

  let eqnarray = false;
  if (env === 'displaymath') env = null;
  else if (env === 'multline') { env = 'equation'; tex = `\\begin{gathered}${tex}\\end{gathered}`; }
  else if (env === 'flalign') env = 'align';
  else if (env === 'eqnarray') { env = 'align'; eqnarray = true; }

  const numbered = env !== null && !star;
  const rows = /^(?:align|gather|alignat)$/.test(env) ? splitRows(tex) : [{ text: tex, sep: '' }];
  it.ids = [];
  const body = rows.map(({ text, sep }) => {
    if (eqnarray) text = dropSecondAmp(text);
    const keys = [];
    text = text.replace(/\\label\s*\{([^{}]*)\}/g, (_, k) => { keys.push(k.trim()); return ''; });
    let skip = false;
    text = text.replace(/\\no(?:number|tag)(?![A-Za-z])/g, () => { skip = true; return ''; });
    const tag = /\\tag\*?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(text);
    let label = tag ? tag[1] : null;
    // 有 \label 的式子一定編號，即使寫在 $$ 或 align* 裡
    if (!tag && !skip && text.trim() && (numbered || keys.length)) {
      label = String(++eq);
      text += `\\tag{${label}}`;
    }
    keys.forEach(key => {
      if (label === null) return setLabel(key, null);
      const id = anchorId(key);
      it.ids.push(id);
      setLabel(key, { text: label, id });
    });
    return text + sep;
  }).join('');

  it.tex = env ? `\\begin{${env}*}${arg}${body}\\end{${env}*}` : body;
  return eq;
}

// ── 3. KaTeX 輸出 ─────────────────────────────────────────────

function groupEnd(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '{') depth++;
    else if (s[i] === '}' && !--depth) return i;
  }
  return -1;
}

// 把「指令開頭 + {參數}」整段換掉；re 要停在參數的 { 前面
function replaceWithArg(tex, re, fn) {
  let out = '';
  let pos = 0;
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(tex))) {
    const open = re.lastIndex;
    const close = groupEnd(tex, open);
    if (close < 0) break;
    out += tex.slice(pos, m.index) + fn(m, tex.slice(open + 1, close));
    pos = re.lastIndex = close + 1;
  }
  return out + tex.slice(pos);
}

// KaTeX 沒有、但 LaTeX 筆記或 HackMD / Obsidian（MathJax）常見的寫法
const DEFAULT_MACROS = { '\\mathbbm': '\\mathbb' };
const rColor = /^\s*(?:[A-Za-z]+|#[0-9A-Fa-f]{3,6})\s*$/;

function shim(tex) {
  // \newcommand{\R}{…} → \gdef\R{…}：KaTeX 內建了 \R 等巨集，直接 \newcommand 會報「重複定義」
  tex = tex.replace(
    /\\(?:re)?newcommand\*?\s*(?:\{\s*(\\[A-Za-z@]+)\s*\}|(\\[A-Za-z@]+))\s*(?:\[\s*(\d)\s*\])?(?!\s*\[)/g,
    (_, a, b, n) => '\\gdef' + (a || b) + Array.from({ length: +n || 0 }, (__, k) => '#' + (k + 1)).join('')
  );
  // \DeclareMathOperator{\Tr}{Tr} → \gdef\Tr{\operatorname{Tr}}
  tex = replaceWithArg(tex, /\\DeclareMathOperator(\*?)\s*(?:\{\s*(\\[A-Za-z]+)\s*\}|(\\[A-Za-z]+))\s*(?=\{)/g,
    (m, body) => `\\gdef${m[2] || m[3]}{\\operatorname${m[1]}{${body}}}`);
  // MathJax 專用：\require{…} 載入擴充、\displaylines{a \\ b}、\bbox[yellow]{x}
  tex = replaceWithArg(tex, /\\require\s*(?=\{)/g, () => '');
  tex = replaceWithArg(tex, /\\displaylines\s*(?=\{)/g, (m, body) => `\\begin{gathered}${body}\\end{gathered}`);
  tex = replaceWithArg(tex, /\\bbox\s*(?:\[([^\]]*)\])?\s*(?=\{)/g,
    (m, body) => (m[1] && rColor.test(m[1]) ? `\\colorbox{${m[1].trim()}}{$${body}$}` : `\\boxed{${body}}`));
  // MathJax 允許 a^\ket{n}；KaTeX 的 \ket 是巨集，當上下標要加大括號
  tex = replaceWithArg(tex, /([\^_])\s*(\\(?:[Bb]ra|[Kk]et|[Bb]raket))\s*(?=\{)/g,
    (m, body) => `${m[1]}{${m[2]}{${body}}}`);
  return tex.replace(/\\qedhere(?![A-Za-z])/g, '');
}

function renderMath(it, ctx) {
  const tex = shim(it.tex)
    .replace(/\\label\s*\{[^{}]*\}/g, '')
    .replace(/\\(eqref|ref)\s*\{([^{}]*)\}/g, (_, cmd, key) => {
      const t = ctx.labels.get(key.trim());
      if (!t) {
        ctx.warn(`找不到 \\${cmd}{${key}} 的 \\label`);
        return '\\textbf{??}';
      }
      return `\\href{#${t.id}}{\\text{${cmd === 'eqref' ? `(${t.text})` : t.text}}}`;
    });
  const opts = {
    displayMode: it.display,
    macros: ctx.macros,
    globalGroup: true, // 文章裡前面定義的 \newcommand，後面的式子也能用
    strict: 'ignore',
    trust: ({ command }) => command === '\\href' || command === '\\url',
    throwOnError: true
  };
  let html;
  try {
    html = katex.renderToString(tex, opts);
  } catch (err) {
    ctx.warn(err.message);
    try {
      html = katex.renderToString(tex, Object.assign(opts, { throwOnError: false }));
    } catch (e) {
      html = `<code class="math-error">${escapeHTML(it.tex)}</code>`;
    }
  }
  return (it.ids || []).map(id => `<span class="math-anchor" id="${escapeHTML(id)}"></span>`).join('') + html;
}

function renderRef(it, ctx) {
  if (it.ref === 'label') return '';
  const t = ctx.labels.get(it.key);
  if (!t) {
    ctx.warn(`找不到 \\${it.ref}{${it.key}} 的 \\label`);
    return `<span class="ref-missing" title="${escapeHTML(it.key)}">??</span>`;
  }
  const text = it.ref === 'eqref' ? `(${t.text})` : t.text;
  // \tag{$\ast$} 這種自訂標籤本身含有 TeX
  const label = /[\\$]/.test(text)
    ? katex.renderToString(`\\text{${text}}`, { throwOnError: false, macros: ctx.macros })
    : escapeHTML(text);
  return `<a class="ref" href="#${escapeHTML(t.id)}">${label}</a>`;
}

hexo.extend.filter.register('after_post_render', function (data) {
  if (data.content && data.content.includes('callout callout-')) data.content = convertCallouts(data.content);
  const items = pending.get(data) || [];
  if (!items.length && !(data.content && data.content.includes(THM_SLOT))) return;
  pending.delete(data);
  // 標題 id 是從文字產生的，數學式在那裡只剩相鄰的一對保留字元：Heading-with-﷐﷑-math → Heading-with-math
  data.content = data.content
    .replace(/(-?)﷐﷑(-?)/g, (_, a, b) => (a && b ? '-' : ''))
    .replace(/[﷐﷑]/g, '');

  const warn = msg => hexo.log.warn(`[math] ${data.source}: ${msg}`);
  const labels = new Map();
  const setLabel = (key, target) => {
    if (!target) return warn(`\\label{${key}} 所在的式子沒有編號`);
    if (labels.has(key)) warn(`\\label{${key}} 重複定義`);
    labels.set(key, target);
  };

  let eq = 0;
  items.forEach(it => { if (it.display) eq = numberDisplay(it, eq, setLabel); });

  // 定理依出現順序編號；寫在定理裡（或之後）的 \label 指向最近的定理
  let thm = 0;
  let current = null;
  data.content = data.content.replace(/<span class="thm-num"><\/span>|<tex-ph data-i=(\d+)><\/tex-ph>/g, (m, idx) => {
    if (idx === undefined) {
      current = { text: String(++thm), id: 'thm-' + thm };
      return `<span class="thm-num" id="${current.id}">${thm}</span>`;
    }
    const it = items[idx];
    if (it && it.ref === 'label') {
      if (current) setLabel(it.key, current);
      else warn(`\\label{${it.key}} 不在任何定理或式子裡`);
    }
    return m;
  });

  const macros = Object.assign({}, DEFAULT_MACROS);
  Object.entries(mathConfig().macros || {}).forEach(([k, v]) => {
    macros[k.startsWith('\\') ? k : '\\' + k] = String(v);
  });
  const ctx = { labels, macros, warn };
  const html = items.map(it => (it.ref ? renderRef(it, ctx) : renderMath(it, ctx)));

  // marked 的 breaks: true 會在區塊數學式前後、\label 那一行後面留下 <br>
  const parts = data.content.split(/(<tex-ph data-i=\d+><\/tex-ph>)/);
  for (let k = 1; k < parts.length; k += 2) {
    const it = items[parts[k].match(/\d+/)[0]];
    if (!it || !(it.display || it.ref === 'label')) continue;
    if (it.display) parts[k - 1] = parts[k - 1].replace(/<br>\s*$/, '');
    parts[k + 1] = parts[k + 1].replace(/^\s*<br>\s*/, '');
  }

  data.content = parts.join('')
    // 獨立成段的區塊數學式不需要外層 <p>
    .replace(/<p>\s*((?:<tex-ph data-i=\d+><\/tex-ph>\s*)+)<\/p>/g, (all, inner) => {
      const blockish = [...inner.matchAll(rPh)].every(([, i]) => items[i].display || items[i].ref === 'label');
      return blockish ? inner : all;
    })
    .replace(rPh, (all, i) => (html[i] === undefined ? all : html[i]))
    .replace(rPhEscaped, (all, i) => (items[i] ? escapeHTML(items[i].tex || '') : all));
}, 11); // 排在 obsidian.js 轉換 callout（10）之後

// ── 4. 定理環境 ───────────────────────────────────────────────
// 兩種寫法，輸出相同；編號在 after_post_render 依出現順序統一計算（theorem、lemma… 共用同一組號碼）
//   Hexo tag：      {% theorem Cauchy–Schwarz %} 內容 {% endtheorem %}
//   Obsidian callout：> [!theorem] Cauchy–Schwarz
//                    > 內容

const THEOREMS = {
  theorem: 'Theorem',
  lemma: 'Lemma',
  proposition: 'Proposition',
  corollary: 'Corollary',
  definition: 'Definition',
  example: 'Example',
  exercise: 'Exercise',
  remark: 'Remark'
};
const UNNUMBERED = ['remark'];

// fold 有值時（Obsidian 的 > [!proof]- 摺疊 callout）改用 <details>，值是 '' 或 ' open'
function theoremHtml(kind, name, body, fold) {
  const num = UNNUMBERED.includes(kind) ? '' : ' ' + THM_SLOT;
  const head = `<span class="thm-kind">${THEOREMS[kind]}${num}</span>` + (name ? `<span class="thm-name">${name}</span>` : '');
  return fold === undefined
    ? `<div class="thm thm-${kind}"><p class="thm-head">${head}</p>${body}</div>`
    : `<details class="thm thm-${kind}"${fold}><summary class="thm-head">${head}</summary>${body}</details>`;
}

// 「Proof.」接在第一段開頭、∎ 接在最後一段結尾，和 LaTeX 的 proof 環境一樣
function proofHtml(name, body, fold) {
  const title = `${name || 'Proof'}.`;
  const qed = '<span class="qed" aria-hidden="true"></span>';
  body = body.trim();
  body = body.endsWith('</p>') ? body.slice(0, -4) + qed + '</p>' : body + `<p>${qed}</p>`;
  if (fold !== undefined) return `<details class="proof"${fold}><summary class="proof-head">${title}</summary>${body}</details>`;
  const head = `<span class="proof-head">${title}</span> `;
  body = body.startsWith('<p>') ? '<p>' + head + body.slice(3) : `<p>${head}</p>${body}`;
  return `<div class="proof">${body}</div>`;
}

const renderMarkdown = text => hexo.render.renderSync({ text, engine: 'markdown' });

Object.keys(THEOREMS).forEach(kind => {
  hexo.extend.tag.register(kind, (args, content) => theoremHtml(kind, args.join(' '), renderMarkdown(content)), { ends: true });
});

// {% proof %} … {% endproof %}，或 {% proof Proof of Theorem~\ref{thm:x} %}
hexo.extend.tag.register('proof', (args, content) => proofHtml(args.join(' '), renderMarkdown(content)), { ends: true });

// obsidian.js 先把 > [!type] 轉成 <aside class="note … callout callout-type">（可摺疊的是 <details>），這裡再把定理類的換掉
const rCallout = new RegExp(
  `<(aside|details) class="note note-\\w+ callout callout-(${Object.keys(THEOREMS).join('|')}|proof)"( open)?>`
  + '<(div|summary) class="note-title">([\\s\\S]*?)</\\4>', 'g'
);

function convertCallouts(html) {
  let out = '';
  let pos = 0;
  let m;
  rCallout.lastIndex = 0;
  while ((m = rCallout.exec(html))) {
    const tags = new RegExp(`<(/?)${m[1]}\\b[^>]*>`, 'g');
    tags.lastIndex = rCallout.lastIndex;
    let depth = 1;
    let t;
    while (depth && (t = tags.exec(html))) depth += t[1] ? -1 : 1;
    if (depth) break;
    const [, el, kind, open, , title] = m;
    // 沒寫標題時 obsidian.js 會填入大寫的類型名稱
    const name = title.trim() === kind.toUpperCase() ? '' : title.trim();
    const body = html.slice(rCallout.lastIndex, t.index);
    const fold = el === 'details' ? open || '' : undefined;
    out += html.slice(pos, m.index) + (kind === 'proof' ? proofHtml(name, body, fold) : theoremHtml(kind, name, body, fold));
    pos = rCallout.lastIndex = tags.lastIndex;
  }
  return out + html.slice(pos);
}

// ── 5. 目錄與資源 ─────────────────────────────────────────────

// 標題裡的數學式在目錄中照樣顯示成公式，而不是一串重複的文字
hexo.extend.helper.register('math_toc', function (content, options) {
  const stash = [];
  const src = String(content || '').replace(/<h([1-6])\b[\s\S]*?<\/h\1>/g, heading => {
    let out = '';
    let pos = 0;
    let at;
    while ((at = heading.indexOf('<span class="katex">', pos)) > -1) {
      const tags = /<(\/?)span\b[^>]*>/g;
      tags.lastIndex = at;
      let depth = 0;
      let t;
      while ((t = tags.exec(heading))) if (!(depth += t[1] ? -1 : 1)) break;
      if (!t) break;
      out += heading.slice(pos, at) + `￼${stash.push(heading.slice(at, tags.lastIndex)) - 1}￼`;
      pos = tags.lastIndex;
    }
    return out + heading.slice(pos);
  });
  return this.toc(src, options).replace(/￼(\d+)￼/g, (_, i) => stash[i]);
});

// 從 node_modules 複製 KaTeX 的 CSS 與字型，版本永遠和伺服器端算出來的 HTML 一致
hexo.extend.generator.register('katex_assets', function () {
  if (!mathConfig().enable) return [];
  const dist = path.dirname(require.resolve('katex/dist/katex.min.css'));
  // 現代瀏覽器都支援 woff2，其他格式就不輸出了
  const css = fs.readFileSync(path.join(dist, 'katex.min.css'), 'utf8')
    .replace(/,\s*url\([^)]+\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g, '');
  return [{ path: 'katex/katex.min.css', data: css }].concat(
    fs.readdirSync(path.join(dist, 'fonts'))
      .filter(f => f.endsWith('.woff2'))
      .map(f => ({ path: 'katex/fonts/' + f, data: () => fs.createReadStream(path.join(dist, 'fonts', f)) }))
  );
});
