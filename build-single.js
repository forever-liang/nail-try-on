/* =====================================================================
   把整个网站打包成一个 HTML 文件（CSS / JS 全部内联）
   用法：node build-single.js
   产物：美甲试戴-单文件版.html
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, '美甲试戴-单文件版.html');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const out = html
  .replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) =>
    '<style>\n' + fs.readFileSync(path.join(ROOT, href), 'utf8') + '\n</style>')
  .replace(/<script src="([^"]+)"><\/script>/g, (m, src) =>
    '<script>\n' + fs.readFileSync(path.join(ROOT, src), 'utf8') + '\n</script>');

fs.writeFileSync(OUT, out, 'utf8');
console.log('已生成：' + OUT);
console.log('大小：' + (Buffer.byteLength(out) / 1024).toFixed(1) + ' KB');
