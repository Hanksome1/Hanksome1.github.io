// 把 hexo 產生的一頁做成單一 HTML，給使用者發布前先看（artifact 預覽只會載 Google Fonts，站內的 CSS/JS 要內嵌）。
// node preview.js public/lab/<slug>/index.html <out.html> [https://hanksome1.github.io]
//   站內 CSS、JS 全部內嵌；其他站內連結（筆記、圖片）改成正式站的絕對網址，點了會開正式站。
const fs = require('fs'), path = require('path');
const [, , src, out, site = 'https://hanksome1.github.io'] = process.argv;
if (!src || !out) { console.error('usage: node preview.js <public/.../index.html> <out.html> [site]'); process.exit(1); }
const pub = path.resolve(src).replace(/\/public\/.*$/, '/public');
const local = href => path.join(pub, href.split(/[?#]/)[0]);   // css()/js() 會加 ?v=<hash>
let html = fs.readFileSync(src, 'utf8');
html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*href="(\/[^"]+\.css[^"]*)"[^>]*>/g, (m, href) =>
  fs.existsSync(local(href)) ? '<style>\n' + fs.readFileSync(local(href), 'utf8') + '\n</style>' : m);
html = html.replace(/<script\b([^>]*)src="(\/[^"]+\.js[^"]*)"([^>]*)><\/script>/g, (m, a, href, b) =>
  fs.existsSync(local(href)) ? '<script' + (a + b).replace(/\s+(defer|async)\b/g, '') + '>\n' + fs.readFileSync(local(href), 'utf8').replace(/<\/script/gi, '<\\/script') + '\n</script>' : m);
html = html.replace(/(href|src)="\/(?!\/)/g, `$1="${site}/`);
fs.writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB`);
