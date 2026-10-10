/* =====================================================================
   hand-detect.js — 本地自动识别手指（纯前端 / 不联网 / 不上传）

   流程：
     肤色分割 → 最大连通域 → 主轴方向 + 角度搜索（用「手指细长程度」评分）
     → 垂直剖面找指尖 → 量指宽 → 输出指尖 / 朝向 / 指宽

   返回坐标基于原始图片像素
   ===================================================================== */
(function (global) {
  'use strict';

  var ANALYSIS_MAX = 300;        // 分析缩略图最长边

  /* ------------------------------ 肤色判定 ------------------------------ */

  function isSkin(r, g, b, relaxed) {
    if (r < 45) return false;
    var y = 0.299 * r + 0.587 * g + 0.114 * b;
    var cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    var cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    var warm = r - b;
    if (relaxed) {
      return y > 45 && cb > 70 && cb < 142 && cr > 128 && cr < 188 && warm > 6 && r >= g * 0.97;
    }
    return y > 55 && cb > 76 && cb < 136 && cr > 131 && cr < 178 &&
      warm > 10 && r > g && g > b * 0.82;
  }

  /* ------------------------------ 连通域 ------------------------------ */

  function largestComponent(mask, w, h) {
    var label = new Int32Array(w * h);
    var stack = new Int32Array(1 << 16);
    var best = null;
    var id = 0;

    for (var start = 0; start < mask.length; start++) {
      if (!mask[start] || label[start]) continue;
      id++;
      var top = 0, size = 0;
      stack[top++] = start;
      label[start] = id;
      var sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0;
      var pixels = [];

      while (top > 0) {
        var cur = stack[--top];
        var cx = cur % w, cy = (cur - cx) / w;
        size++;
        sumX += cx; sumY += cy;
        sumXX += cx * cx; sumYY += cy * cy; sumXY += cx * cy;
        pixels.push(cur);

        if (cx > 0 && mask[cur - 1] && !label[cur - 1]) { label[cur - 1] = id; stack[top++] = cur - 1; }
        if (cx < w - 1 && mask[cur + 1] && !label[cur + 1]) { label[cur + 1] = id; stack[top++] = cur + 1; }
        if (cy > 0 && mask[cur - w] && !label[cur - w]) { label[cur - w] = id; stack[top++] = cur - w; }
        if (cy < h - 1 && mask[cur + w] && !label[cur + w]) { label[cur + w] = id; stack[top++] = cur + w; }

        if (top > stack.length - 8) {
          var grown = new Int32Array(stack.length * 2);
          grown.set(stack);
          stack = grown;
        }
      }

      if (!best || size > best.size) {
        var mx = sumX / size, my = sumY / size;
        best = {
          size: size, pixels: pixels,
          mx: mx, my: my,
          xx: sumXX / size - mx * mx,
          yy: sumYY / size - my * my,
          xy: sumXY / size - mx * my
        };
      }
    }
    return best;
  }

  /* --------------------------- 旋转坐标系 --------------------------- */
  /* u 沿手指方向，t 垂直于手指 */

  function makeFrame(comp, ang, w, h) {
    var m = { x: Math.cos(ang), y: Math.sin(ang) };
    var n = { x: -Math.sin(ang), y: Math.cos(ang) };
    var px = comp.pixels, N = px.length;
    var us = new Float32Array(N), ts = new Float32Array(N);
    var umin = 1e9, umax = -1e9, tmin = 1e9, tmax = -1e9;
    for (var i = 0; i < N; i++) {
      var x = px[i] % w, y = (px[i] - x) / w;
      var dx = x - comp.mx, dy = y - comp.my;
      var u = dx * m.x + dy * m.y;
      var t = dx * n.x + dy * n.y;
      us[i] = u; ts[i] = t;
      if (u < umin) umin = u; if (u > umax) umax = u;
      if (t < tmin) tmin = t; if (t > tmax) tmax = t;
    }
    return { m: m, n: n, us: us, ts: ts, umin: umin, umax: umax, tmin: tmin, tmax: tmax };
  }

  function buildGrid(frame) {
    var uLen = Math.ceil(frame.umax - frame.umin) + 1;
    var tLen = Math.ceil(frame.tmax - frame.tmin) + 1;
    var grid = new Uint8Array(uLen * tLen);
    for (var i = 0; i < frame.us.length; i++) {
      var u = Math.round(frame.us[i] - frame.umin);
      var t = Math.round(frame.ts[i] - frame.tmin);
      if (u < 0 || u >= uLen || t < 0 || t >= tLen) continue;
      grid[u * tLen + t] = 1;
    }
    return { grid: grid, uLen: uLen, tLen: tLen, frame: frame };
  }

  function runsAt(g, u) {
    var count = 0, inside = false;
    for (var t = 0; t < g.tLen; t++) {
      var v = g.grid[u * g.tLen + t];
      if (v && !inside) { count++; inside = true; }
      else if (!v) inside = false;
    }
    return count;
  }

  function widthAt(g, u, t0) {
    if (u < 0 || u >= g.uLen || t0 < 0 || t0 >= g.tLen) return 0;
    if (!g.grid[u * g.tLen + t0]) return 0;
    var a = t0, b = t0;
    while (a > 0 && g.grid[u * g.tLen + a - 1]) a--;
    while (b < g.tLen - 1 && g.grid[u * g.tLen + b + 1]) b++;
    return b - a + 1;
  }

  /* 在 t 方向就近找一个在手部里的点（手指可能是斜的） */
  function findNear(g, u, t) {
    for (var off = 0; off <= 4; off++) {
      if (t + off < g.tLen && g.grid[u * g.tLen + t + off]) return t + off;
      if (t - off >= 0 && g.grid[u * g.tLen + t - off]) return t - off;
    }
    return -1;
  }

  function smoothArray(arr, size) {
    var out = new Float32Array(arr.length);
    for (var i = 0; i < arr.length; i++) {
      var acc = 0, cnt = 0;
      for (var k = -size; k <= size; k++) {
        var j = i + k;
        if (j < 0 || j >= arr.length || arr[j] < 0) continue;
        acc += arr[j]; cnt++;
      }
      out[i] = cnt ? acc / cnt : -1;
    }
    return out;
  }

  /* 找指尖：返回归一化剖面（越大越靠近指尖）与峰值 */
  function findTips(g, options) {
    var headRuns = 0, tailRuns = 0;
    var span = Math.max(4, Math.round(g.uLen * 0.16));
    for (var i = 0; i < span; i++) {
      headRuns += runsAt(g, i);
      tailRuns += runsAt(g, g.uLen - 1 - i);
    }
    var flip = tailRuns > headRuns;
    var dirU = flip ? -1 : 1;

    var raw = new Float32Array(g.tLen).fill(-1);
    for (var t = 0; t < g.tLen; t++) {
      var found = -1;
      if (flip) {
        for (var u = g.uLen - 1; u >= 0; u--) if (g.grid[u * g.tLen + t]) { found = u; break; }
        raw[t] = found;
      } else {
        for (var u2 = 0; u2 < g.uLen; u2++) if (g.grid[u2 * g.tLen + t]) { found = u2; break; }
        raw[t] = found < 0 ? -1 : (g.uLen - 1 - found);
      }
    }

    var prof = smoothArray(raw, 2);
    var vmin = Infinity, vmax = -Infinity;
    for (i = 0; i < prof.length; i++) {
      if (prof[i] < 0) continue;
      if (prof[i] < vmin) vmin = prof[i];
      if (prof[i] > vmax) vmax = prof[i];
    }
    if (!isFinite(vmin)) return null;

    var range = Math.max(1, vmax - vmin);
    var prominence = range * (options.prominence || 0.20);
    var minGap = Math.max(3, Math.round(g.tLen * 0.05));

    var peaks = [];
    for (i = 1; i < prof.length - 1; i++) {
      var v = prof[i];
      if (v < 0) continue;
      if (prof[i - 1] > v || prof[i + 1] > v) continue;
      var leftMin = v, rightMin = v;
      for (var d = 1; d <= minGap * 4; d++) {
        if (i - d >= 0 && prof[i - d] >= 0) leftMin = Math.min(leftMin, prof[i - d]);
        if (i + d < prof.length && prof[i + d] >= 0) rightMin = Math.min(rightMin, prof[i + d]);
        if (leftMin < v - prominence && rightMin < v - prominence) break;
      }
      var prom = v - Math.max(leftMin, rightMin);
      if (prom < prominence) continue;
      if (peaks.length && i - peaks[peaks.length - 1].t < minGap) {
        if (prom > peaks[peaks.length - 1].prom) peaks[peaks.length - 1] = { t: i, prom: prom, v: v };
        continue;
      }
      peaks.push({ t: i, prom: prom, v: v });
    }

    return { prof: prof, peaks: peaks, flip: flip, dirU: dirU, range: range, vmin: vmin, vmax: vmax };
  }

  /* 在给定方向下解析每根手指：指尖 / 朝向 / 指宽 / 细长程度 */
  function analyzeFingers(g, tips, ang, s, comp) {
    var flip = tips.flip, dirU = tips.dirU;
    var peaks = tips.peaks;
    if (peaks.length > 5) {
      peaks = peaks.slice().sort(function (a, b) { return b.prom - a.prom; }).slice(0, 5)
        .sort(function (a, b) { return a.t - b.t; });
    }

    var toImage = function (u, t) {
      var du = g.frame.umin + u, dt = g.frame.tmin + t;
      return {
        x: (comp.mx + g.frame.m.x * du + g.frame.n.x * dt) / s,
        y: (comp.my + g.frame.m.y * du + g.frame.n.y * dt) / s
      };
    };

    var sampleAt = [0.050, 0.090, 0.135, 0.185];
    var fingers = [];
    for (var i = 0; i < peaks.length; i++) {
      var pk = peaks[i];
      var uTip = flip ? pk.v : (g.uLen - 1 - pk.v);
      uTip = Math.max(0, Math.min(g.uLen - 1, Math.round(uTip)));

      /* 指宽采样（中位数，抗噪） */
      var samples = [];
      for (var si = 0; si < sampleAt.length; si++) {
        var us = Math.round(uTip + dirU * g.uLen * sampleAt[si]);
        if (us < 0 || us >= g.uLen) break;
        var tt = findNear(g, us, pk.t);
        if (tt < 0) break;
        var wHere = widthAt(g, us, tt);
        if (wHere >= 2) samples.push(wHere); else break;
      }
      if (!samples.length) continue;
      var sorted = samples.slice().sort(function (a, b) { return a - b; });
      var fingerW = sorted[Math.floor(sorted.length / 2)];
      if (fingerW < 2) continue;

      /* 细长程度：从指尖往掌心走多远，指宽才明显变粗 */
      var elong = 0;
      for (var stp = 1; stp < g.uLen * 0.6; stp++) {
        var u = uTip + dirU * stp;
        if (u < 0 || u >= g.uLen) break;
        var tc = findNear(g, u, pk.t);
        if (tc < 0) break;
        if (widthAt(g, u, tc) > fingerW * 1.55) break;
        elong = stp;
      }

      /* 单指朝向：指尖到指节之间那条窄带做 PCA */
      var uEnd = uTip + dirU * Math.round(g.uLen * 0.20);
      var from = Math.min(uTip + dirU * 3, uEnd), to = Math.max(uTip + dirU * 3, uEnd);
      var halfW = Math.max(3, fingerW * 0.6);
      var su = 0, sv = 0, n = 0, sxx = 0, syy = 0, sxy = 0;
      for (var pi = 0; pi < g.frame.us.length; pi++) {
        var pu = g.frame.us[pi] - g.frame.umin;
        var pv = g.frame.ts[pi] - g.frame.tmin;
        if (Math.abs(pv - pk.t) > halfW) continue;
        if (pu < from || pu > to) continue;
        su += pu; sv += pv; n++;
        sxx += pu * pu; syy += pv * pv; sxy += pu * pv;
      }
      var fAng = flip ? ang : ang + Math.PI;
      if (n > 25) {
        var mux = su / n, muv = sv / n;
        var cx2 = sxx / n - mux * mux, cy2 = syy / n - muv * muv, cxy2 = sxy / n - mux * muv;
        var rel = 0.5 * Math.atan2(2 * cxy2, cx2 - cy2);
        var cu = Math.cos(rel), cv = Math.sin(rel);
        var dirx = g.frame.m.x * cu + g.frame.n.x * cv;
        var diry = g.frame.m.y * cu + g.frame.n.y * cv;
        var tdx = flip ? g.frame.m.x : -g.frame.m.x;
        var tdy = flip ? g.frame.m.y : -g.frame.m.y;
        if (dirx * tdx + diry * tdy < 0) { dirx = -dirx; diry = -diry; }
        fAng = Math.atan2(diry, dirx);
      }

      var tipPt = toImage(uTip + dirU * g.uLen * 0.01, pk.t);
      var ux = Math.cos(fAng), uy = Math.sin(fAng);
      var palmPt = toImage(uTip + dirU * g.uLen * 0.15, pk.t);
      if ((palmPt.x - tipPt.x) * ux + (palmPt.y - tipPt.y) * uy > 0) { ux = -ux; uy = -uy; }

      fingers.push({
        tip: tipPt,
        dir: { x: ux, y: uy },
        width: fingerW / s,
        elongation: elong / Math.max(1, fingerW),
        prominence: pk.prom
      });
    }
    return fingers;
  }

  /* ------------------------------ 主流程 ------------------------------ */

  function detect(image, options) {
    options = options || {};
    var W = image.naturalWidth || image.width;
    var H = image.naturalHeight || image.height;
    if (!W || !H) return { ok: false, message: '图片读取失败' };

    var s = Math.min(1, ANALYSIS_MAX / Math.max(W, H));
    var aw = Math.max(40, Math.round(W * s));
    var ah = Math.max(40, Math.round(H * s));

    var cv = document.createElement('canvas');
    cv.width = aw; cv.height = ah;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, aw, ah);
    var data = ctx.getImageData(0, 0, aw, ah).data;

    var strict = new Uint8Array(aw * ah);
    var relaxed = new Uint8Array(aw * ah);
    var nStrict = 0;
    for (var i = 0, p = 0; i < strict.length; i++, p += 4) {
      var r = data[p], g2 = data[p + 1], b = data[p + 2];
      if (isSkin(r, g2, b, false)) { strict[i] = 1; nStrict++; }
      if (isSkin(r, g2, b, true)) relaxed[i] = 1;
    }

    var area = aw * ah;
    var comp = nStrict > area * 0.01 ? largestComponent(strict, aw, ah) : null;
    if (!comp || comp.size < area * 0.008) {
      var comp2 = largestComponent(relaxed, aw, ah);
      if (comp2 && (!comp || comp2.size > comp.size)) comp = comp2;
    }
    if (!comp || comp.size < area * 0.005) {
      return { ok: false, reason: 'noskin', message: '照片里没找到手，换背景或补光再试，也可以手动点选' };
    }

    /* 主轴 + 角度搜索：用「手指够细长」来挑最像手的方向 */
    var base = 0.5 * Math.atan2(2 * comp.xy, comp.xx - comp.yy);
    var offsets = [0, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75, -1.0, 1.0, -1.25, 1.25];
    var best = null;
    for (i = 0; i < offsets.length; i++) {
      var ang = base + offsets[i];
      var frame = makeFrame(comp, ang, aw, ah);
      var g = buildGrid(frame);
      var tips = findTips(g, options);
      if (!tips || tips.peaks.length < 2) continue;
      var fingers = analyzeFingers(g, tips, ang, s, comp);
      if (fingers.length < 2) continue;

      var score = 0;
      for (var fi = 0; fi < fingers.length; fi++) {
        var f = fingers[fi];
        var elong = f.elongation;
        if (elong < 1.0) { score -= 14; continue; }
        score += 12 + Math.min(elong, 3.5) * 5;
        /* 指宽要合理：不能比整只手还宽 */
        var wRel = (f.width * s) / Math.max(1, Math.min(g.uLen, g.tLen));
        if (wRel > 0.34) score -= 25;
      }
      score += fingers.length * 4;
      if (fingers.length >= 4) score += 10;
      if (Math.abs(offsets[i]) < 1e-6) score += 2;
      if (!best || score > best.score) {
        best = {
          score: score, fingers: fingers, ang: ang,
          debug: {
            ang: +(ang * 180 / Math.PI).toFixed(1),
            score: Math.round(score),
            fingers: fingers.map(function (f) {
              return { e: +f.elongation.toFixed(2), w: Math.round(f.width), y: Math.round(f.tip.y) };
            })
          }
        };
      }
    }

    if (!best || best.fingers.length < 2) {
      return { ok: false, reason: 'fewpeaks', message: '没识别到手指，建议手动点选指位', debug: best && best.debug };
    }

    var out = best.fingers.slice();
    /* 细长程度太差的丢掉 */
    out = out.filter(function (f) { return f.elongation >= 0.75; });
    if (out.length < 2) {
      return { ok: false, reason: 'failed', message: '没识别到手指，请手动点选', debug: best.debug };
    }

    out.sort(function (a, b) { return a.tip.x - b.tip.x; });
    return { ok: true, fingers: out, count: out.length };
  }

  global.HandDetect = { detect: detect, isSkin: isSkin };
})(window);
