/* =====================================================================
   hand-model.js — 中间区域「模型手」
   用与照片试戴同一套甲面路径，把款式贴到 5 根手指上
   ===================================================================== */
(function (global) {
  'use strict';

  var NAIL = global.NailArt;
  var VB_W = 440, VB_H = 570;

  /* 手部几何：base = 指根，tip = 指尖，hw = 半宽 */
  var FINGERS = [
    { id: 'thumb',  label: '拇指',   base: { x: 178, y: 452 }, tip: { x: 86,  y: 306 }, hwBase: 43, hwTip: 31, nailW: 42, nailK: 0.86 },
    { id: 'index',  label: '食指',   base: { x: 172, y: 344 }, tip: { x: 154, y: 158 }, hwBase: 33, hwTip: 25, nailW: 37, nailK: 1.00 },
    { id: 'middle', label: '中指',   base: { x: 226, y: 326 }, tip: { x: 230, y: 120 }, hwBase: 35, hwTip: 26, nailW: 39, nailK: 1.00 },
    { id: 'ring',   label: '无名指', base: { x: 278, y: 342 }, tip: { x: 288, y: 160 }, hwBase: 31, hwTip: 23, nailW: 36, nailK: 1.00 },
    { id: 'pinky',  label: '小指',   base: { x: 322, y: 378 }, tip: { x: 342, y: 222 }, hwBase: 26, hwTip: 19, nailW: 30, nailK: 1.00 }
  ];

  var PALM = 'M 150 338 C 130 372 126 416 138 458 C 145 486 153 508 161 572 ' +
             'L 283 572 C 291 508 299 486 306 458 C 318 416 346 372 294 338 ' +
             'C 284 322 240 312 222 312 C 204 312 160 322 150 338 Z';

  /* ------------------------------ 几何工具 ------------------------------ */

  function axis(f) {
    var dx = f.tip.x - f.base.x, dy = f.tip.y - f.base.y;
    var len = Math.hypot(dx, dy);
    return {
      ux: dx / len, uy: dy / len,
      nx: -dy / len, ny: dx / len,
      len: len,
      deg: Math.atan2(-(dx / len), dy / len) * 180 / Math.PI
    };
  }

  function pt(f, a, t, n) {
    return {
      x: f.base.x + a.ux * a.len * t + a.nx * n,
      y: f.base.y + a.uy * a.len * t + a.ny * n
    };
  }

  /* 手指轮廓：带锥度的胶囊形 */
  function fingerPath(f) {
    var a = axis(f);
    var r = function (v) { return v.toFixed(1); };
    var P = function (t, n) { return pt(f, a, t, n); };
    var bl = P(0.02, f.hwBase), br = P(0.02, -f.hwBase);
    var tl = P(0.965, f.hwTip), tr = P(0.965, -f.hwTip);
    var c1 = P(0.34, f.hwBase * 0.99), c2 = P(0.68, f.hwTip * 1.06);
    var d1 = P(0.68, -f.hwTip * 1.06), d2 = P(0.34, -f.hwBase * 0.99);
    var k1 = P(1.045, f.hwTip * 0.72), k2 = P(1.045, -f.hwTip * 0.72);
    var b1 = P(-0.05, f.hwBase * 0.82), b2 = P(-0.05, -f.hwBase * 0.82);
    return 'M ' + r(bl.x) + ' ' + r(bl.y) +
      ' C ' + r(c1.x) + ' ' + r(c1.y) + ' ' + r(c2.x) + ' ' + r(c2.y) + ' ' + r(tl.x) + ' ' + r(tl.y) +
      ' C ' + r(k1.x) + ' ' + r(k1.y) + ' ' + r(k2.x) + ' ' + r(k2.y) + ' ' + r(tr.x) + ' ' + r(tr.y) +
      ' C ' + r(d1.x) + ' ' + r(d1.y) + ' ' + r(d2.x) + ' ' + r(d2.y) + ' ' + r(br.x) + ' ' + r(br.y) +
      ' C ' + r(b2.x) + ' ' + r(b2.y) + ' ' + r(b1.x) + ' ' + r(b1.y) + ' ' + r(bl.x) + ' ' + r(bl.y) + ' Z';
  }

  /* 甲片摆放：位置 / 角度 / 尺寸 */
  function nailPlacement(f, lenId) {
    var a = axis(f);
    var nailLen = f.nailW * NAIL.lengthRatio(lenId) * f.nailK;
    var over = nailLen * 0.05;
    var tipX = f.tip.x + a.ux * over, tipY = f.tip.y + a.uy * over;
    return {
      w: f.nailW,
      h: nailLen,
      x: tipX - a.ux * nailLen,
      y: tipY - a.uy * nailLen,
      rot: a.deg
    };
  }

  /* ------------------------------ 渐变定义 ------------------------------ */

  var grainUrl = null;
  function grain() {
    if (grainUrl) return grainUrl;
    var c = document.createElement('canvas');
    c.width = c.height = 72;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(72, 72);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 128 + (Math.random() * 2 - 1) * 46;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    grainUrl = c.toDataURL('image/png');
    return grainUrl;
  }

  function defs() {
    var out = ['<defs>'];

    out.push('<pattern id="grain" width="72" height="72" patternUnits="userSpaceOnUse">' +
      '<image href="' + grain() + '" width="72" height="72"/></pattern>');

    out.push('<linearGradient id="skinBase" gradientUnits="userSpaceOnUse" x1="120" y1="150" x2="360" y2="560">' +
      '<stop offset="0" stop-color="#f7dbc8"/><stop offset="0.32" stop-color="#f0cbb4"/>' +
      '<stop offset="0.68" stop-color="#e6b89e"/><stop offset="1" stop-color="#daa88d"/></linearGradient>');

    out.push('<radialGradient id="palmGlow" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="#fde5d5" stop-opacity="0.80"/>' +
      '<stop offset="0.55" stop-color="#f8dac7" stop-opacity="0.25"/>' +
      '<stop offset="1" stop-color="#f8dac7" stop-opacity="0"/></radialGradient>');

    out.push('<radialGradient id="hiSoft" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="#fff1e6" stop-opacity="0.55"/>' +
      '<stop offset="0.5" stop-color="#ffe9db" stop-opacity="0.18"/>' +
      '<stop offset="1" stop-color="#ffe9db" stop-opacity="0"/></radialGradient>');

    out.push('<radialGradient id="shSoft" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="#c88a6c" stop-opacity="0.34"/>' +
      '<stop offset="0.55" stop-color="#c88a6c" stop-opacity="0.12"/>' +
      '<stop offset="1" stop-color="#c88a6c" stop-opacity="0"/></radialGradient>');

    out.push('<linearGradient id="nailbed" gradientUnits="objectBoundingBox" x1="0.2" y1="1" x2="0.6" y2="0">' +
      '<stop offset="0" stop-color="#f2dbd3"/><stop offset="0.32" stop-color="#f8e8e3"/>' +
      '<stop offset="0.82" stop-color="#fdf6f3"/><stop offset="1" stop-color="#fffdfc"/></linearGradient>');

    out.push('<clipPath id="handClip"><path d="' + PALM + '"/>');
    FINGERS.forEach(function (f) { out.push('<path d="' + fingerPath(f) + '"/>'); });
    out.push('</clipPath>');

    out.push('</defs>');
    return out.join('');
  }

  /* ------------------------------ 手部剪影 ------------------------------ */

  function handMarkup() {
    var out = [];

    /* 外描边：先粗描再覆盖填充，得到干净的并集轮廓 */
    out.push('<g fill="#eac2ac" stroke="#cf9c84" stroke-width="5" stroke-opacity="0.45" stroke-linejoin="round">');
    out.push('<path d="' + PALM + '"/>');
    FINGERS.forEach(function (f) { out.push('<path d="' + fingerPath(f) + '"/>'); });
    out.push('</g>');

    out.push('<g clip-path="url(#handClip)">');

    /* 皮肤本体：整块并集填色，避免手指与手掌之间出现接缝 */
    out.push('<rect x="0" y="0" width="' + VB_W + '" height="' + VB_H + '" fill="url(#skinBase)"/>');
    /* 皮肤颗粒，破掉纯色的“塑料感” */
    out.push('<rect x="0" y="0" width="' + VB_W + '" height="' + VB_H + '" fill="url(#grain)" opacity="0.16" style="mix-blend-mode:overlay"/>');
    out.push('<ellipse cx="216" cy="410" rx="104" ry="118" fill="url(#palmGlow)"/>');

    /* 手指体积：柔和高光 + 柔和暗面 */
    FINGERS.forEach(function (f) {
      var a = axis(f);
      var deg = Math.atan2(a.uy, a.ux) * 180 / Math.PI;
      var hw = f.hwBase * 0.6 + f.hwTip * 0.4;
      var ellipse = function (p, rx, ry, fill) {
        return '<ellipse cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" rx="' + rx.toFixed(1) +
          '" ry="' + ry.toFixed(1) + '" transform="rotate(' + deg.toFixed(1) + ' ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) +
          ')" fill="' + fill + '"/>';
      };
      out.push(ellipse(pt(f, a, 0.42, -hw * 0.34), a.len * 0.46, hw * 0.86, 'url(#hiSoft)'));
      out.push(ellipse(pt(f, a, 0.50, hw * 0.62), a.len * 0.46, hw * 0.72, 'url(#shSoft)'));
    });

    /* 拇指根部与掌侧的柔和转折 */
    out.push('<ellipse cx="168" cy="462" rx="48" ry="64" transform="rotate(-18 168 462)" fill="url(#shSoft)" opacity="0.55"/>');
    out.push('<ellipse cx="292" cy="430" rx="42" ry="96" fill="url(#shSoft)" opacity="0.6"/>');

    /* 指节褶皱：干净的细线，看起来是刻意的插画线条 */
    FINGERS.forEach(function (f) {
      var a = axis(f);
      [[0.47, 0.5]].forEach(function (c) {
        var t = c[0], k = c[1];
        var l = pt(f, a, t, -f.hwTip * k * 1.25);
        var r = pt(f, a, t, f.hwTip * k * 1.25);
        var m = pt(f, a, t + 0.035, 0);
        out.push('<path d="M ' + l.x.toFixed(1) + ' ' + l.y.toFixed(1) +
          ' Q ' + m.x.toFixed(1) + ' ' + m.y.toFixed(1) + ' ' + r.x.toFixed(1) + ' ' + r.y.toFixed(1) +
          '" fill="none" stroke="rgba(184,120,96,0.24)" stroke-width="1.5" stroke-linecap="round"/>');
      });
    });

    /* 腕部褶皱 */
    out.push('<path d="M 168 506 Q 222 522 278 504" fill="none" stroke="rgba(184,120,96,0.26)" stroke-width="2.6" stroke-linecap="round"/>');
    out.push('<path d="M 174 532 Q 222 546 272 530" fill="none" stroke="rgba(184,120,96,0.18)" stroke-width="2.2" stroke-linecap="round"/>');

    out.push('</g>');
    return out.join('');
  }

  /* ------------------------------ 甲片图层 ------------------------------ */

  var urlCache = new Map();

  function nailDataURL(styleId, shapeId, lenId, seed) {
    var key = styleId + '|' + shapeId + '|' + lenId + '|' + seed;
    if (urlCache.has(key)) return urlCache.get(key);
    var url = NAIL.getCanvas(styleId, shapeId, lenId, 'main', seed).toDataURL('image/png');
    urlCache.set(key, url);
    if (urlCache.size > 40) urlCache.delete(urlCache.keys().next().value);
    return url;
  }

  function nailMarkup(styleId, shapeId, lenId) {
    var out = ['<g>'];
    FINGERS.forEach(function (f, i) {
      var p = nailPlacement(f, lenId);
      var d = NAIL.pathD(p.w, p.h, shapeId);
      var tr = 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + p.rot.toFixed(1) + ')';
      out.push('<g transform="' + tr + '">');
      out.push('<path d="' + d + '" fill="url(#nailbed)"/>');
      out.push('<path d="' + d + '" fill="none" stroke="rgba(176,118,98,0.22)" stroke-width="5"/>');
      out.push('<image href="' + nailDataURL(styleId, shapeId, lenId, i + 1) + '" x="' + (-p.w / 2).toFixed(1) +
        '" y="0" width="' + p.w.toFixed(1) + '" height="' + p.h.toFixed(1) + '" preserveAspectRatio="none"/>');
      out.push('</g>');
    });
    out.push('</g>');
    return out.join('');
  }

  /* ------------------------------ 对外接口 ------------------------------ */

  function mount(container) {
    container.innerHTML =
      '<svg viewBox="0 0 ' + VB_W + ' ' + VB_H + '" preserveAspectRatio="xMidYMid meet" ' +
      'role="img" aria-label="模型手效果预览">' +
      defs() +
      '<g style="filter:drop-shadow(0 8px 14px rgba(150,102,80,0.20))">' +
      handMarkup() + '</g><g id="nailLayer"></g></svg>';
    return container.querySelector('svg');
  }

  function update(container, opts) {
    var svg = container.querySelector('svg');
    if (!svg) svg = mount(container);
    svg.querySelector('#nailLayer').innerHTML = nailMarkup(opts.styleId, opts.shapeId, opts.lenId);
  }

  global.HandModel = {
    FINGERS: FINGERS,
    mount: mount,
    update: update,
    nailPlacement: nailPlacement,
    nailDataURL: nailDataURL
  };
})(window);
