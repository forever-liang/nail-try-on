/* =====================================================================
   nail-art.js — 美甲渲染引擎
   · pathD()    : 统一的甲面路径（画布 / SVG 共用，保证形状一致）
   · STYLES     : 款式数据（底色 + 图层 + 光泽）
   · getCanvas(): 取某款式的甲片贴图（带缓存）
   ===================================================================== */
(function (global) {
  'use strict';

  /* ----------------------------- 基础工具 ----------------------------- */

  function hex2rgb(hex) {
    hex = String(hex).replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }

  function rgba(color, a) {
    if (a === undefined) a = 1;
    if (String(color)[0] === '#') {
      var c = hex2rgb(color);
      return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    }
    return color;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ----------------------------- 形状定义 ----------------------------- */
  /* 局部坐标：x ∈ [-w/2, w/2]，y = 0 甲根（甲缘皮），y = h 甲尖 */

  var SHAPES = [
    { id: 'almond', name: '杏仁' },
    { id: 'square', name: '方圆' },
    { id: 'coffin', name: '芭蕾' },
    { id: 'round', name: '圆头' }
  ];

  var LENGTHS = [
    { id: 'short', name: '短', ratio: 1.32 },
    { id: 'mid', name: '中', ratio: 1.70 },
    { id: 'long', name: '长', ratio: 2.12 }
  ];

  function lengthRatio(id) {
    for (var i = 0; i < LENGTHS.length; i++) if (LENGTHS[i].id === id) return LENGTHS[i].ratio;
    return 1.70;
  }

  function pathD(w, h, shape) {
    var hw = w / 2;
    var cw = hw * 0.88;      // 甲根半宽
    var cy = h * 0.065;      // 甲根两侧起笔
    var cc = -h * 0.125;     // 甲根控制点：中间向指根微凸
    var n = function (v) { return v.toFixed(2); };
    var d = ['M ' + n(-cw) + ' ' + n(cy), 'Q 0 ' + n(cc) + ' ' + n(cw) + ' ' + n(cy)];

    if (shape === 'square') {
      d.push('C ' + n(hw * 0.99) + ' ' + n(h * 0.30) + ' ' + n(hw * 0.98) + ' ' + n(h * 0.76) + ' ' + n(hw * 0.96) + ' ' + n(h * 0.92));
      d.push('C ' + n(hw * 0.94) + ' ' + n(h * 1.00) + ' ' + n(-hw * 0.94) + ' ' + n(h * 1.00) + ' ' + n(-hw * 0.96) + ' ' + n(h * 0.92));
      d.push('C ' + n(-hw * 0.98) + ' ' + n(h * 0.76) + ' ' + n(-hw * 0.99) + ' ' + n(h * 0.30) + ' ' + n(-cw) + ' ' + n(cy));
    } else if (shape === 'coffin') {
      d.push('C ' + n(hw * 1.01) + ' ' + n(h * 0.30) + ' ' + n(hw * 0.92) + ' ' + n(h * 0.66) + ' ' + n(hw * 0.66) + ' ' + n(h * 0.88));
      d.push('C ' + n(hw * 0.62) + ' ' + n(h * 0.99) + ' ' + n(-hw * 0.62) + ' ' + n(h * 0.99) + ' ' + n(-hw * 0.66) + ' ' + n(h * 0.88));
      d.push('C ' + n(-hw * 0.92) + ' ' + n(h * 0.66) + ' ' + n(-hw * 1.01) + ' ' + n(h * 0.30) + ' ' + n(-cw) + ' ' + n(cy));
    } else if (shape === 'round') {
      d.push('C ' + n(hw * 1.00) + ' ' + n(h * 0.28) + ' ' + n(hw * 1.00) + ' ' + n(h * 0.66) + ' ' + n(hw * 0.93) + ' ' + n(h * 0.84));
      d.push('C ' + n(hw * 0.84) + ' ' + n(h * 1.00) + ' ' + n(-hw * 0.84) + ' ' + n(h * 1.00) + ' ' + n(-hw * 0.93) + ' ' + n(h * 0.84));
      d.push('C ' + n(-hw * 1.00) + ' ' + n(h * 0.66) + ' ' + n(-hw * 1.00) + ' ' + n(h * 0.28) + ' ' + n(-cw) + ' ' + n(cy));
    } else { // almond 杏仁
      d.push('C ' + n(hw * 1.00) + ' ' + n(h * 0.30) + ' ' + n(hw * 0.94) + ' ' + n(h * 0.70) + ' ' + n(hw * 0.50) + ' ' + n(h * 0.88));
      d.push('C ' + n(hw * 0.33) + ' ' + n(h * 0.96) + ' ' + n(hw * 0.16) + ' ' + n(h) + ' 0 ' + n(h));
      d.push('C ' + n(-hw * 0.16) + ' ' + n(h) + ' ' + n(-hw * 0.33) + ' ' + n(h * 0.96) + ' ' + n(-hw * 0.50) + ' ' + n(h * 0.88));
      d.push('C ' + n(-hw * 0.94) + ' ' + n(h * 0.70) + ' ' + n(-hw * 1.00) + ' ' + n(h * 0.30) + ' ' + n(-cw) + ' ' + n(cy));
    }
    d.push('Z');
    return d.join(' ');
  }

  /* 柔和的椭圆光晕：用于珍珠光、猫眼光带、高光 */
  function softEllipse(ctx, cx, cy, rx, ry, rot, stops) {
    ctx.save();
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);
    ctx.scale(Math.max(rx, 0.001), Math.max(ry, 0.001));
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  /* ----------------------------- 基础图形 ----------------------------- */

  function sparkle(ctx, x, y, r, color, a, thin) {
    var k = thin === undefined ? 0.16 : thin;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + r * k, y - r * k, x + r, y);
    ctx.quadraticCurveTo(x + r * k, y + r * k, x, y + r);
    ctx.quadraticCurveTo(x - r * k, y + r * k, x - r, y);
    ctx.quadraticCurveTo(x - r * k, y - r * k, x, y - r);
    ctx.closePath();
    ctx.fillStyle = rgba(color, a);
    ctx.fill();
  }

  function gem(ctx, x, y, r, color, a) {
    var g = ctx.createRadialGradient(x - r * 0.30, y - r * 0.34, r * 0.05, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,' + Math.min(1, a + 0.1) + ')');
    g.addColorStop(0.42, rgba(color, a));
    g.addColorStop(1, rgba(color, Math.max(0, a - 0.25)));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(0.6, r * 0.16);
    ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.75) + ')';
    ctx.stroke();
    sparkle(ctx, x - r * 0.28, y - r * 0.30, r * 0.62, '#ffffff', Math.min(1, a + 0.15));
  }

  /* ----------------------------- 图层实现 ----------------------------- */
  /* 每个图层拿到 { ctx, path, w, h, rng } */

  var LAYERS = {

    /* 指尖渐亮 / 渐深 */
    ombre: function (L, o) {
      var ctx = L.ctx, h = L.h, w = L.w;
      ctx.save();
      ctx.clip(L.path);
      var y0 = h * o.from, y1 = h * o.to;
      var g = ctx.createLinearGradient(0, y0, 0, y1);
      var a = o.a === undefined ? 0.85 : o.a;
      g.addColorStop(0, rgba(o.color, 0));
      g.addColorStop(0.5, rgba(o.color, a * 0.45));
      g.addColorStop(1, rgba(o.color, a));
      ctx.fillStyle = g;
      ctx.fillRect(-w, y0, w * 2, (y1 - y0) + h * 0.5);
      ctx.restore();
    },

    /* 法式甲尖 */
    french: function (L, o) {
      var ctx = L.ctx, h = L.h, w = L.w;
      ctx.save();
      ctx.clip(L.path);
      var t = o.thickness === undefined ? 0.28 : o.thickness;
      var y0 = h * (1 - t);
      var bow = h * (o.bow === undefined ? 0.10 : o.bow);
      ctx.beginPath();
      ctx.moveTo(-w, y0 + bow * 0.90);
      ctx.bezierCurveTo(-w * 0.42, y0 - bow, w * 0.42, y0 - bow, w, y0 + bow * 0.90);
      ctx.lineTo(w, h * 1.4);
      ctx.lineTo(-w, h * 1.4);
      ctx.closePath();
      var fg = ctx.createLinearGradient(0, y0 - bow, 0, h);
      fg.addColorStop(0, rgba(o.color, (o.a === undefined ? 1 : o.a) * 0.94));
      fg.addColorStop(1, rgba(o.color, o.a === undefined ? 1 : o.a));
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.restore();
    },

    /* 猫眼磁感光带 */
    catEye: function (L, o) {
      var ctx = L.ctx, w = L.w, h = L.h;
      var a = o.a === undefined ? 0.5 : o.a;
      var ang = (o.angle === undefined ? -24 : o.angle) * Math.PI / 180;
      var y = (o.y === undefined ? 0.42 : o.y) * h;
      ctx.save();
      ctx.clip(L.path);
      ctx.globalCompositeOperation = 'lighter';
      softEllipse(ctx, 0, y, w * 0.62, h * 0.11, ang, [
        [0, rgba(o.color, a * 0.55)], [0.5, rgba(o.color, a * 0.20)], [1, rgba(o.color, 0)]
      ]);
      softEllipse(ctx, 0, y, w * 0.46, h * 0.026, ang, [
        [0, 'rgba(255,255,255,0.80)'], [0.6, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']
      ]);
      ctx.restore();
    },

    /* 细闪 / 砂糖 */
    glitter: function (L, o) {
      var ctx = L.ctx, w = L.w, h = L.h, rng = L.rng;
      var y0 = o.y0 === undefined ? 0 : o.y0;
      var y1 = o.y1 === undefined ? 1 : o.y1;
      var colors = o.colors || [o.color || '#ffffff'];
      ctx.save();
      ctx.clip(L.path);
      for (var i = 0; i < o.n; i++) {
        var rx = rng(), ry = rng();
        var x = (rx * 1.06 - 0.03) * w - w / 2;
        var y = (y0 + ry * (y1 - y0)) * h;
        var s = (o.size === undefined ? 1 : o.size) * (0.32 + rng() * rng() * 1.2) * (w / 58);
        s = Math.min(s, w * 0.018);
        var col = colors[Math.floor(rng() * colors.length) % colors.length];
        var a = (o.a === undefined ? 0.6 : o.a) * (0.35 + rng() * 0.75);
        if (s > w * 0.009) {
          sparkle(ctx, x, y, s * 1.75, col, a * 0.9, 0.14);
        } else {
          ctx.beginPath();
          ctx.arc(x, y, s, 0, Math.PI * 2);
          ctx.fillStyle = rgba(col, a);
          ctx.fill();
        }
      }
      ctx.restore();
    },

    /* 贝母箔片 */
    foil: function (L, o) {
      var ctx = L.ctx, w = L.w, h = L.h, rng = L.rng;
      var colors = o.colors || ['#ffffff', '#ffe9f0', '#eef4ff'];
      ctx.save();
      ctx.clip(L.path);
      for (var i = 0; i < o.n; i++) {
        var x = (rng() * 1.02 - 0.01) * w - w / 2;
        var y = (o.y0 === undefined ? 0.08 : o.y0) * h + rng() * (o.span === undefined ? 0.7 : o.span) * h;
        var r = w * (0.05 + rng() * 0.12);
        var rot = rng() * Math.PI;
        var col = colors[Math.floor(rng() * colors.length) % colors.length];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.globalAlpha = (o.a === undefined ? 0.55 : o.a) * (0.5 + rng() * 0.7);
        var g = ctx.createLinearGradient(-r, -r * 0.6, r, r * 0.6);
        g.addColorStop(0, rgba(col, 0.15));
        g.addColorStop(0.45, rgba(col, 0.95));
        g.addColorStop(1, rgba(col, 0.2));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-r, -r * 0.42);
        ctx.lineTo(r * 0.62, -r * 0.78);
        ctx.lineTo(r, r * 0.36);
        ctx.lineTo(-r * 0.5, r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    },

    /* 极光 / 珍珠光带 */
    aurora: function (L, o) {
      var ctx = L.ctx, w = L.w, h = L.h;
      var bands = o.bands || [
        { c: '#ffffff', a: 0.34, x: -0.10, y: 0.30, rx: 0.52, ry: 0.15, rot: -0.40 },
        { c: '#ffd9e6', a: 0.26, x: 0.06, y: 0.54, rx: 0.50, ry: 0.13, rot: 0.34 },
        { c: '#d9e8ff', a: 0.24, x: -0.04, y: 0.76, rx: 0.46, ry: 0.12, rot: -0.24 }
      ];
      ctx.save();
      ctx.clip(L.path);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < bands.length; i++) {
        var b = bands[i];
        softEllipse(ctx, (b.x || 0) * w, b.y * h, (b.rx || 0.5) * w, (b.ry || 0.13) * h, b.rot || 0, [
          [0, rgba(b.c, b.a)], [0.5, rgba(b.c, b.a * 0.42)], [1, rgba(b.c, 0)]
        ]);
      }
      ctx.restore();
    },

    /* 手绘格纹 */
    plaid: function (L, o) {
      var ctx = L.ctx, w = L.w, h = L.h;
      var col = o.color || '#a87b6c';
      ctx.save();
      ctx.clip(L.path);
      ctx.lineCap = 'round';
      var xs = o.xs || [-0.46, -0.02, 0.42];
      var ys = o.ys || [0.26, 0.54, 0.82];
      var lw = (o.lw === undefined ? 0.014 : o.lw) * w;
      var i, p;
      for (i = 0; i < ys.length; i++) {
        p = ys[i] * h;
        ctx.beginPath();
        ctx.moveTo(-w * 0.6, p);
        ctx.lineTo(w * 0.6, p + (i % 2 ? w * 0.02 : -w * 0.015));
        ctx.lineWidth = lw * (i % 2 ? 0.7 : 1);
        ctx.strokeStyle = rgba(col, o.a === undefined ? 0.75 : o.a);
        ctx.stroke();
      }
      for (i = 0; i < xs.length; i++) {
        p = xs[i] * w;
        ctx.beginPath();
        ctx.moveTo(p, -h * 0.05);
        ctx.lineTo(p + (i % 2 ? w * 0.03 : -w * 0.02), h * 1.05);
        ctx.lineWidth = lw * (i % 2 ? 0.7 : 1);
        ctx.strokeStyle = rgba(col, o.a === undefined ? 0.75 : o.a);
        ctx.stroke();
      }
      // 白色细线，制造手绘感
      ctx.lineWidth = lw * 0.42;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      for (i = 0; i < ys.length; i++) {
        p = ys[i] * h + lw * 1.15;
        ctx.beginPath(); ctx.moveTo(-w * 0.55, p); ctx.lineTo(w * 0.55, p); ctx.stroke();
      }
      for (i = 0; i < xs.length; i++) {
        p = xs[i] * w + lw * 1.15;
        ctx.beginPath(); ctx.moveTo(p, h * 0.02); ctx.lineTo(p, h * 1.0); ctx.stroke();
      }
      ctx.restore();
    },

    /* 波点 */
    dots: function (L, o) {
      var ctx = L.ctx, w = L.w, h = L.h, rng = L.rng;
      var cols = o.cols || 3, rows = o.rows || 3;
      var x0 = o.x0 === undefined ? 0.16 : o.x0, x1 = o.x1 === undefined ? 0.84 : o.x1;
      var y0 = o.y0 === undefined ? 0.14 : o.y0, y1 = o.y1 === undefined ? 0.9 : o.y1;
      ctx.save();
      ctx.clip(L.path);
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var fx = cols === 1 ? 0.5 : c / (cols - 1);
          var fy = rows === 1 ? 0.5 : r / (rows - 1);
          var x = (x0 + fx * (x1 - x0)) * w - w / 2 + (rng() - 0.5) * w * 0.05;
          var y = (y0 + fy * (y1 - y0)) * h + (rng() - 0.5) * h * 0.03;
          ctx.beginPath();
          ctx.arc(x, y, w * (o.size === undefined ? 0.028 : o.size) * (0.7 + rng() * 0.7), 0, Math.PI * 2);
          ctx.fillStyle = rgba(o.color, o.a === undefined ? 0.85 : o.a);
          ctx.fill();
        }
      }
      ctx.restore();
    },

    /* 星星 */
    stars: function (L, o) {
      var ctx = L.ctx, w = L.w, h = L.h, rng = L.rng;
      ctx.save();
      ctx.clip(L.path);
      for (var i = 0; i < o.n; i++) {
        var x = (0.12 + rng() * 0.76) * w - w / 2;
        var y = (o.y0 === undefined ? 0.1 : o.y0) * h + rng() * ((o.y1 === undefined ? 0.9 : o.y1) - (o.y0 === undefined ? 0.1 : o.y0)) * h;
        var r = w * (o.size === undefined ? 0.085 : o.size) * (0.65 + rng() * 0.7);
        sparkle(ctx, x, y, r, o.color || '#6b4a3f', o.a === undefined ? 0.92 : o.a);
      }
      ctx.restore();
    },

    /* 水钻 */
    gems: function (L, o) {
      var ctx = L.ctx, w = L.w, h = L.h, rng = L.rng;
      ctx.save();
      ctx.clip(L.path);
      for (var i = 0; i < o.n; i++) {
        var x = (0.16 + rng() * 0.68) * w - w / 2;
        var y = (o.y0 === undefined ? 0.12 : o.y0) * h + rng() * ((o.y1 === undefined ? 0.88 : o.y1) - (o.y0 === undefined ? 0.12 : o.y0)) * h;
        var r = w * (o.size === undefined ? 0.075 : o.size) * (0.7 + rng() * 0.7);
        gem(ctx, x, y, r, o.color || '#f2f6ff', o.a === undefined ? 0.95 : o.a);
      }
      ctx.restore();
    },

    /* 线条 */
    line: function (L, o) {
      var ctx = L.ctx, w = L.w, h = L.h;
      ctx.save();
      ctx.clip(L.path);
      ctx.lineCap = 'round';
      if (o.shape === 'arc') {
        ctx.beginPath();
        ctx.moveTo(-w * 0.5, h * (o.y === undefined ? 0.72 : o.y));
        ctx.quadraticCurveTo(0, h * ((o.y === undefined ? 0.72 : o.y) + 0.16), w * 0.5, h * (o.y === undefined ? 0.72 : o.y));
      } else {
        ctx.beginPath();
        ctx.moveTo(-w * 0.3, h * ((o.y === undefined ? 0.3 : o.y) - 0.18));
        ctx.quadraticCurveTo(0, h * 0.5, w * 0.3, h * ((o.y === undefined ? 0.3 : o.y) + 0.3));
      }
      ctx.lineWidth = w * (o.lw === undefined ? 0.018 : o.lw);
      ctx.strokeStyle = rgba(o.color || '#b98b7c', o.a === undefined ? 0.8 : o.a);
      ctx.stroke();
      ctx.restore();
    },

    /* 蝴蝶结 */
    bow: function (L, o) {
      var ctx = L.ctx, w = L.w, h = L.h;
      var s = w * (o.size === undefined ? 0.24 : o.size);
      var c1 = o.color || '#fff8f6';
      var c2 = o.color2 || '#e9c3ba';
      var a = o.a === undefined ? 0.98 : o.a;
      ctx.save();
      ctx.clip(L.path);
      ctx.translate(o.x === undefined ? 0 : o.x * w, (o.y === undefined ? 0.34 : o.y) * h);
      ctx.rotate((o.angle || 0) * Math.PI / 180);
      [-1, 1].forEach(function (k) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(k * s * 1.45, -s * 0.92);
        ctx.quadraticCurveTo(k * s * 0.72, 0, k * s * 1.45, s * 0.92);
        ctx.closePath();
        var lg = ctx.createLinearGradient(0, -s, 0, s * 0.6);
        lg.addColorStop(0, 'rgba(255,255,255,' + a + ')');
        lg.addColorStop(1, rgba(c1, a * 0.9));
        ctx.fillStyle = lg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(178,124,108,0.38)';
        ctx.lineWidth = Math.max(0.5, s * 0.045);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.ellipse(0, s * 0.10, s * 0.30, s * 0.26, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(c2, a);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,110,95,0.4)';
      ctx.lineWidth = Math.max(0.5, s * 0.045);
      ctx.stroke();
      ctx.restore();
    },

    /* 小花 / 雏菊 */
    flower: function (L, o) {
      var ctx = L.ctx, w = L.w, h = L.h;
      var petals = o.petals || 5;
      var r = w * (o.size === undefined ? 0.15 : o.size);
      var cx = (o.x === undefined ? 0 : o.x) * w;
      var cy = (o.y === undefined ? 0.32 : o.y) * h;
      ctx.save();
      ctx.clip(L.path);
      ctx.translate(cx, cy);
      ctx.rotate((o.angle || 0) * Math.PI / 180);
      for (var i = 0; i < petals; i++) {
        ctx.save();
        ctx.rotate(i * Math.PI * 2 / petals);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.86, r * 0.48, r * 0.92, 0, 0, Math.PI * 2);
        ctx.fillStyle = rgba(o.color || '#ffffff', o.a === undefined ? 0.95 : o.a);
        ctx.fill();
        ctx.strokeStyle = 'rgba(196,150,130,0.22)';
        ctx.lineWidth = Math.max(0.5, r * 0.04);
        ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.40, 0, Math.PI * 2);
      ctx.fillStyle = rgba(o.core || '#e8c07a', 0.95);
      ctx.fill();
      ctx.restore();
    },

    /* 雪花 */
    snowflake: function (L, o) {
      var ctx = L.ctx, w = L.w, h = L.h;
      var r = w * (o.size === undefined ? 0.20 : o.size);
      ctx.save();
      ctx.clip(L.path);
      ctx.translate((o.x === undefined ? 0 : o.x) * w, (o.y === undefined ? 0.34 : o.y) * h);
      ctx.rotate((o.angle || 0) * Math.PI / 180);
      ctx.strokeStyle = rgba(o.color || '#ffffff', o.a === undefined ? 0.95 : o.a);
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(0.7, r * 0.13);
      for (var i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate(i * Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -r);
        ctx.moveTo(0, -r * 0.62);
        ctx.lineTo(-r * 0.24, -r * 0.82);
        ctx.moveTo(0, -r * 0.62);
        ctx.lineTo(r * 0.24, -r * 0.82);
        ctx.moveTo(0, -r * 0.36);
        ctx.lineTo(-r * 0.2, -r * 0.54);
        ctx.moveTo(0, -r * 0.36);
        ctx.lineTo(r * 0.2, -r * 0.54);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    },

    /* 大理石纹 */
    marble: function (L, o) {
      var ctx = L.ctx, w = L.w, h = L.h, rng = L.rng;
      var cols = o.colors || ['#c8a291', '#e0c3b6'];
      ctx.save();
      ctx.clip(L.path);
      ctx.lineCap = 'round';
      for (var i = 0; i < (o.n || 5); i++) {
        var y = h * (0.05 + rng() * 0.95);
        var amp = h * (0.05 + rng() * 0.14);
        ctx.beginPath();
        ctx.moveTo(-w * 0.6, y);
        ctx.bezierCurveTo(-w * 0.2, y - amp, w * 0.1, y + amp, w * 0.6, y - amp * 0.5);
        ctx.lineWidth = w * (0.004 + rng() * 0.012);
        ctx.strokeStyle = rgba(cols[i % cols.length], 0.18 + rng() * 0.35);
        ctx.stroke();
      }
      ctx.restore();
    },

    /* 镜面描边 */
    chrome: function (L, o) {
      var ctx = L.ctx, w = L.w, h = L.h;
      ctx.save();
      ctx.clip(L.path);
      var g = ctx.createLinearGradient(-w / 2, 0, w / 2, h);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.4, rgba(o.color || '#dcd6d3', 0.85));
      g.addColorStop(0.7, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, rgba(o.color || '#dcd6d3', 0.9));
      ctx.strokeStyle = g;
      ctx.lineWidth = w * (o.lw === undefined ? 0.07 : o.lw);
      ctx.stroke(L.path);
      ctx.restore();
    }
  };

  /* ----------------------------- 面料 / 光泽 ----------------------------- */

  function fillBase(L, style) {
    var ctx = L.ctx, h = L.h, w = L.w;
    var g = ctx.createLinearGradient(-w * 0.12, -h * 0.06, w * 0.22, h * 1.02);
    style.base.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    ctx.fillStyle = g;
    ctx.fill(L.path);
  }

  function drawFinish(L, style) {
    var ctx = L.ctx, w = L.w, h = L.h, path = L.path;
    var gloss = style.finish !== 'matte';
    ctx.save();
    ctx.clip(path);

    /* 甲根处的血色，让半透款式更自然 */
    ctx.globalCompositeOperation = 'source-over';
    softEllipse(ctx, 0, h * 0.10, w * 0.44, h * 0.20, 0, [
      [0, 'rgba(226,150,132,0.20)'], [0.6, 'rgba(226,150,132,0.07)'], [1, 'rgba(226,150,132,0)']
    ]);

    /* 曲面明暗：中间微凸、两侧压暗，制造立体感 */
    var cyl = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    cyl.addColorStop(0.00, 'rgba(88,56,46,0.14)');
    cyl.addColorStop(0.14, 'rgba(255,255,255,0.09)');
    cyl.addColorStop(0.34, 'rgba(255,255,255,0.03)');
    cyl.addColorStop(0.58, 'rgba(88,56,46,0.01)');
    cyl.addColorStop(0.84, 'rgba(88,56,46,0.08)');
    cyl.addColorStop(1.00, 'rgba(88,56,46,0.18)');
    ctx.fillStyle = cyl;
    ctx.fillRect(-w / 2, -h * 0.05, w, h * 1.15);

    /* 甲面边缘的立体感：左侧反光、右侧压暗 */
    var eg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    eg.addColorStop(0, 'rgba(255,255,255,0.30)');
    eg.addColorStop(0.14, 'rgba(255,255,255,0.04)');
    eg.addColorStop(0.70, 'rgba(96,62,52,0.02)');
    eg.addColorStop(1, 'rgba(96,62,52,0.14)');
    ctx.strokeStyle = eg;
    ctx.lineWidth = w * 0.07;
    ctx.stroke(path);

    /* 甲根阴影，让甲片“嵌”进手指 */
    softEllipse(ctx, 0, h * 0.015, w * 0.62, h * 0.15, 0, [
      [0, 'rgba(112,72,60,0.22)'], [0.5, 'rgba(112,72,60,0.07)'], [1, 'rgba(112,72,60,0)']
    ]);

    if (!gloss) {
      ctx.fillStyle = 'rgba(255,248,244,0.22)';
      ctx.fillRect(-w, -h * 0.2, w * 2, h * 1.4);
    } else {
      /* 大范围柔光（面光） */
      softEllipse(ctx, -w * 0.16, h * 0.42, w * 0.26, h * 0.32, -0.06, [
        [0, 'rgba(255,255,255,0.16)'], [0.45, 'rgba(255,255,255,0.06)'], [1, 'rgba(255,255,255,0)']
      ]);
      /* 镜面亮条：光泽的关键 */
      softEllipse(ctx, -w * 0.21, h * 0.42, w * 0.045, h * 0.26, -0.03, [
        [0, 'rgba(255,255,255,0.85)'], [0.4, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']
      ]);
      /* 上三分之一处的横向反光带（弧面顶部受光） */
      softEllipse(ctx, w * 0.02, h * 0.30, w * 0.40, h * 0.08, 0.02, [
        [0, 'rgba(255,255,255,0.08)'], [1, 'rgba(255,255,255,0)']
      ]);
      /* 靠甲根的副高光 */
      softEllipse(ctx, -w * 0.08, h * 0.15, w * 0.13, h * 0.07, -0.10, [
        [0, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']
      ]);
      /* 指尖小反光 */
      softEllipse(ctx, w * 0.10, h * 0.88, w * 0.06, h * 0.08, 0.10, [
        [0, 'rgba(255,255,255,0.30)'], [1, 'rgba(255,255,255,0)']
      ]);
    }

    /* 甲尖的通透感（像真甲边缘透光） */
    softEllipse(ctx, 0, h * 0.99, w * 0.46, h * 0.13, 0, [
      [0, 'rgba(255,255,255,0.18)'], [0.6, 'rgba(255,255,255,0.05)'], [1, 'rgba(255,255,255,0)']
    ]);
    ctx.restore();
  }

  /* ----------------------------- 款式数据 ----------------------------- */

  var STYLES = [
    {
      id: 'nude-ombre', name: '裸粉渐变', series: 'nude',
      base: [[0, '#e9b7a7'], [0.45, '#f3cec4'], [1, '#fbe8e1']],
      layers: [
        { t: 'ombre', from: 0.50, to: 1.0, color: '#fff1ea', a: 0.55 },
        { t: 'glitter', n: 30, size: 0.75, color: '#fff2ea', a: 0.42, y0: 0.15, y1: 1 }
      ],
      finish: 'gloss'
    },
    {
      id: 'milk-tea', name: '奶茶裸咖', series: 'nude',
      base: [[0, '#cfa189'], [0.5, '#e4c0ae'], [1, '#f7e7dc']],
      layers: [
        { t: 'marble', n: 4, colors: ['#b98a72', '#e6cdbf'] },
        { t: 'ombre', from: 0.5, to: 1, color: '#fff4ea', a: 0.45 },
        { t: 'glitter', n: 22, size: 0.7, color: '#ffe9d6', a: 0.32, y0: 0.3, y1: 1 }
      ],
      finish: 'gloss'
    },
    {
      id: 'aurora-moon', name: '极光白月光', series: 'nude',
      base: [[0, '#f5dcd7'], [0.5, '#fcedea'], [1, '#fefaf9']],
      layers: [
        { t: 'aurora', bands: [{ c: '#ffffff', a: 0.24, x: -0.08, y: 0.32, rx: 0.50, ry: 0.13, rot: -0.42 }, { c: '#ffd9e6', a: 0.18, x: 0.06, y: 0.58, rx: 0.48, ry: 0.11, rot: 0.32 }, { c: '#d9e8ff', a: 0.16, x: -0.02, y: 0.78, rx: 0.44, ry: 0.10, rot: -0.22 }] },
        { t: 'foil', n: 7, y0: 0.12, span: 0.7, a: 0.30, colors: ['#ffffff', '#ffe6f0', '#e9f1ff'] },
        { t: 'glitter', n: 26, size: 0.8, colors: ['#ffffff', '#ffe9f4', '#e6f0ff'], a: 0.5, y0: 0.1, y1: 1 }
      ],
      finish: 'gloss'
    },
    {
      id: 'sugar-glaze', name: '透亮砂糖', series: 'shine',
      base: [[0, '#eec3b8'], [0.55, '#f7d8d1'], [1, '#fdeeea']],
      layers: [
        { t: 'glitter', n: 70, size: 0.62, colors: ['#ffffff', '#ffeef5'], a: 0.62, y0: 0.45, y1: 1 },
        { t: 'glitter', n: 26, size: 0.5, colors: ['#ffffff'], a: 0.38, y0: 0, y1: 1 }
      ],
      finish: 'soft'
    },
    {
      id: 'cat-eye', name: '玻璃猫眼', series: 'cat',
      base: [[0, '#dcab9e'], [0.5, '#ecc2b8'], [1, '#f8dcd5']],
      layers: [
        { t: 'catEye', color: '#ffffff', a: 0.30, angle: -26, y: 0.30 },
        { t: 'catEye', color: '#ffe6ef', a: 0.22, angle: -26, y: 0.68 },
        { t: 'glitter', n: 50, size: 0.75, colors: ['#ffffff', '#ffe9f2'], a: 0.5, y0: 0.1, y1: 1 }
      ],
      finish: 'gloss'
    },
    {
      id: 'glitter-dust', name: '细闪碎钻', series: 'shine',
      base: [[0, '#e8b9ab'], [0.5, '#f2cec4'], [1, '#fbe4dd']],
      layers: [
        { t: 'glitter', n: 90, size: 0.8, colors: ['#ffffff', '#ffeaf3', '#fff4d9'], a: 0.62, y0: 0.06, y1: 1 },
        { t: 'gems', n: 3, size: 0.038, color: '#f4f7ff', a: 0.95, y0: 0.28, y1: 0.8 }
      ],
      finish: 'gloss'
    },
    {
      id: 'shell-foil', name: '贝母箔片', series: 'shine',
      base: [[0, '#f6e3de'], [0.5, '#fdf4f1'], [1, '#fffbfa']],
      layers: [
        { t: 'aurora', bands: [{ c: '#ffffff', a: 0.24, x: -0.08, y: 0.34, rx: 0.52, ry: 0.16, rot: -0.38 }, { c: '#ffe3ee', a: 0.18, x: 0.10, y: 0.66, rx: 0.48, ry: 0.14, rot: 0.30 }] },
        { t: 'foil', n: 11, y0: 0.08, span: 0.82, a: 0.26, colors: ['#ffffff', '#ffe4ef', '#e8f0ff', '#f6ecd3'] },
        { t: 'glitter', n: 30, size: 0.7, colors: ['#ffffff', '#ffe9f4'], a: 0.5, y0: 0.1, y1: 1 }
      ],
      finish: 'gloss'
    },
    {
      id: 'french-white', name: '经典白法式', series: 'french',
      base: [[0, '#e9b8a9'], [0.55, '#f5d5cb'], [1, '#fcebe6']],
      layers: [
        { t: 'french', color: '#fffdfc', thickness: 0.22, bow: 0.16 },
        { t: 'glitter', n: 20, size: 0.6, color: '#ffffff', a: 0.28, y0: 0.05, y1: 1 }
      ],
      finish: 'gloss'
    },
    {
      id: 'french-pink', name: '皮粉细法式', series: 'french',
      base: [[0, '#d9a795'], [0.5, '#e8c2b4'], [1, '#f7e0d7']],
      layers: [
        { t: 'french', color: '#fff2ed', thickness: 0.18, bow: 0.15 },
        { t: 'line', shape: 'arc', y: 0.72, lw: 0.011, color: '#b98a78', a: 0.75 },
        { t: 'glitter', n: 22, size: 0.6, color: '#ffffff', a: 0.32, y0: 0.05, y1: 1 }
      ],
      finish: 'gloss'
    },
    {
      id: 'french-chrome', name: '银边法式', series: 'french',
      base: [[0, '#e2b6aa'], [0.5, '#efcec5'], [1, '#f8e4de']],
      layers: [
        { t: 'french', color: '#efeae7', thickness: 0.19, bow: 0.16 },
        { t: 'chrome', color: '#dcd6d3', lw: 0.055 }
      ],
      finish: 'gloss'
    },
    {
      id: 'plaid', name: '手绘格纹', series: 'sweet',
      base: [[0, '#e3b5a6'], [0.5, '#efccc0'], [1, '#f8e3db']],
      layers: [
        { t: 'plaid', color: '#9c7264', lw: 0.011, a: 0.6 },
        { t: 'stars', n: 2, size: 0.07, color: '#5f4437', a: 0.9, y0: 0.12, y1: 0.9 },
        { t: 'dots', cols: 3, rows: 2, size: 0.02, color: '#8a6153', a: 0.55, y0: 0.72, y1: 0.94 }
      ],
      finish: 'gloss'
    },
    {
      id: 'star-dot', name: '星星点点', series: 'sweet',
      base: [[0, '#e9bcaf'], [0.5, '#f3d1c7'], [1, '#fae5de']],
      layers: [
        { t: 'dots', cols: 4, rows: 3, size: 0.022, color: '#fffaf8', a: 0.9, y0: 0.74, y1: 0.9 },
        { t: 'line', shape: 'arc', y: 0.62, lw: 0.012, color: '#ffffff', a: 0.85 },
        { t: 'stars', n: 3, size: 0.08, color: '#b07f6e', a: 0.95, y0: 0.16, y1: 0.62 }
      ],
      finish: 'gloss'
    },
    {
      id: 'bow', name: '小蝴蝶结', series: 'sweet',
      base: [[0, '#eec8bf'], [0.5, '#f7dcd5'], [1, '#fdefeb']],
      layers: [
        { t: 'line', shape: 'arc', y: 0.74, lw: 0.014, color: '#ffffff', a: 0.9 },
        { t: 'bow', y: 0.34, size: 0.20, color: '#fff6f4', color2: '#e9c3ba', a: 0.98 },
        { t: 'glitter', n: 30, size: 0.7, color: '#ffffff', a: 0.4, y0: 0.05, y1: 1 }
      ],
      finish: 'gloss'
    },
    {
      id: 'daisy', name: '雏菊小花', series: 'sweet',
      base: [[0, '#f7e6e0'], [0.5, '#fdf4f0'], [1, '#fffbf8']],
      layers: [
        { t: 'flower', y: 0.36, size: 0.115, color: '#ffffff', core: '#e9c07d', petals: 5, angle: 12 },
        { t: 'glitter', n: 40, size: 0.7, colors: ['#ffffff', '#fff0d9'], a: 0.4, y0: 0.05, y1: 1 }
      ],
      finish: 'gloss'
    },
    {
      id: 'marble', name: '大理石纹', series: 'french',
      base: [[0, '#efdbd1'], [0.5, '#f8ebe4'], [1, '#fdf7f2']],
      layers: [
        { t: 'marble', n: 6, colors: ['#c19b8b', '#ad8271', '#e6cdc2'] },
        { t: 'line', shape: 'diag', y: 0.42, lw: 0.007, color: '#d0ab77', a: 0.5 }
      ],
      finish: 'gloss'
    },
    {
      id: 'snowflake', name: '雪花冰晶', series: 'shine',
      base: [[0, '#e2dbe9'], [0.5, '#efeaf3'], [1, '#faf8fc']],
      layers: [
        { t: 'aurora', bands: [{ c: '#ffffff', a: 0.18, x: -0.06, y: 0.30, rx: 0.46, ry: 0.11, rot: -0.34 }, { c: '#e6f2ff', a: 0.14, x: 0.06, y: 0.62, rx: 0.44, ry: 0.10, rot: 0.28 }] },
        { t: 'snowflake', y: 0.36, size: 0.30, color: '#fdfdff', a: 1 },
        { t: 'glitter', n: 35, size: 0.7, colors: ['#ffffff', '#eaf3ff'], a: 0.55, y0: 0.05, y1: 1 }
      ],
      finish: 'gloss'
    },
    {
      id: 'galaxy', name: '星河碎闪', series: 'shine',
      base: [[0, '#cfc2e5'], [0.5, '#dfd6ef'], [1, '#f0ebf8']],
      layers: [
        { t: 'aurora', bands: [{ c: '#ffffff', a: 0.30, x: -0.06, y: 0.32, rx: 0.52, ry: 0.17, rot: -0.36 }, { c: '#cdb8ff', a: 0.28, x: 0.08, y: 0.62, rx: 0.50, ry: 0.15, rot: 0.30 }] },
        { t: 'glitter', n: 80, size: 0.8, colors: ['#ffffff', '#d9c6ff', '#ffe3f3'], a: 0.7, y0: 0.06, y1: 1 },
        { t: 'gems', n: 2, size: 0.038, color: '#eef1ff', a: 0.95, y0: 0.3, y1: 0.78 }
      ],
      finish: 'gloss'
    }
  ];

  var SERIES = [
    { id: 'all', name: '全部' },
    { id: 'nude', name: '裸感' },
    { id: 'cat', name: '猫眼' },
    { id: 'shine', name: '闪钻' },
    { id: 'french', name: '法式' },
    { id: 'sweet', name: '甜酷' }
  ];

  function styleById(id) {
    for (var i = 0; i < STYLES.length; i++) if (STYLES[i].id === id) return STYLES[i];
    return STYLES[0];
  }

  /* ----------------------------- 渲染 & 缓存 ----------------------------- */

  var CLASS_PX = { thumb: 120, main: 300 };
  var CLASS_SCALE = { thumb: 2, main: 1.6 };
  var CACHE_MAX = { thumb: 60, main: 20 };
  var cache = { thumb: new Map(), main: new Map() };

  function renderNail(style, shapeId, lenId, pxWidth, scale, fingerSeed) {
    var ratio = lengthRatio(lenId);
    var w = pxWidth, h = pxWidth * ratio;
    var cv = document.createElement('canvas');
    cv.width = Math.max(2, Math.round(w * scale));
    cv.height = Math.max(2, Math.round(h * scale));
    var ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(w / 2, 0);

    var L = {
      ctx: ctx,
      path: new Path2D(pathD(w, h, shapeId)),
      w: w,
      h: h,
      ratio: ratio,
      rng: mulberry32(hashString(style.id + '|' + shapeId + '|' + lenId) + (fingerSeed || 0) * 7919)
    };

    fillBase(L, style);
    (style.layers || []).forEach(function (layer) {
      var fn = LAYERS[layer.t];
      if (fn) fn(L, layer);
    });
    drawFinish(L, style);
    return cv;
  }

  function getCanvas(styleId, shapeId, lenId, cls, fingerSeed) {
    cls = cls || 'main';
    fingerSeed = fingerSeed || 0;
    var store = cache[cls] || cache.main;
    var key = styleId + '|' + shapeId + '|' + lenId + '|' + cls + '|' + fingerSeed;
    if (store.has(key)) return store.get(key);
    var cv = renderNail(styleById(styleId), shapeId, lenId, CLASS_PX[cls] || CLASS_PX.main,
      CLASS_SCALE[cls] || 1.6, fingerSeed);
    store.set(key, cv);
    while (store.size > (CACHE_MAX[cls] || 20)) {
      store.delete(store.keys().next().value);
    }
    return cv;
  }

  global.NailArt = {
    SHAPES: SHAPES,
    LENGTHS: LENGTHS,
    SERIES: SERIES,
    STYLES: STYLES,
    lengthRatio: lengthRatio,
    pathD: pathD,
    styleById: styleById,
    getCanvas: getCanvas,
    renderNail: renderNail
  };
})(window);
