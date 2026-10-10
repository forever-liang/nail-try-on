/* =====================================================================
   try-on.js — 「我的手」照片试戴
   · 原图不做任何磨皮 / 瘦手 / 调色，只把甲片叠加上去
   · 三种方式定位：自动识别手指 / 点选指位 / 一键铺开
   · 支持撤销上一步（含点选过程中的回退）
   ===================================================================== */
(function (global) {
  'use strict';

  var NAIL = global.NailArt;
  var MAX_EDGE = 1800;               // 照片最长边限制

  var FINGER_ORDER = [
    { id: 'thumb', label: '拇指' },
    { id: 'index', label: '食指' },
    { id: 'middle', label: '中指' },
    { id: 'ring', label: '无名指' },
    { id: 'pinky', label: '小指' }
  ];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function rgba(hex, a) {
    var s = String(hex || '#e8c3b0').replace('#', '');
    if (s.length === 3) s = s.split('').map(function (c) { return c + c; }).join('');
    return 'rgba(' + parseInt(s.slice(0, 2), 16) + ',' + parseInt(s.slice(2, 4), 16) +
      ',' + parseInt(s.slice(4, 6), 16) + ',' + a + ')';
  }

  function toHex(r, g, b) {
    var h = function (v) { var s = Math.max(0, Math.min(255, Math.round(v))).toString(16); return s.length < 2 ? '0' + s : s; };
    return '#' + h(r) + h(g) + h(b);
  }

  function create(canvas, hooks) {
    hooks = hooks || {};
    var ctx = canvas.getContext('2d');
    var img = null;
    var nails = [];
    var selected = -1;
    var picking = null;
    var pointers = new Map();
    var drag = null;
    var style = { styleId: 'nude-ombre', shapeId: 'almond', lenId: 'mid' };
    var marks = [];
    var history = [];
    var lastKey = '', lastTime = 0;

    /* 用于取色的超小图（不含甲片） */
    var colorCv = document.createElement('canvas');
    var colorData = null;
    /* 只含照片、与画布同尺寸的图，供自动识别使用（不会被甲片污染） */
    var photoCv = document.createElement('canvas');

    /* ------------------------------ 历史 / 撤销 ------------------------------ */

    function snapshot() {
      return {
        nails: nails.map(function (n) { return Object.assign({}, n); }),
        selected: selected,
        marks: marks.slice(),
        picking: picking ? { idx: picking.idx, points: JSON.parse(JSON.stringify(picking.points)) } : null
      };
    }

    function push(key) {
      var now = Date.now();
      if (key && key === lastKey && now - lastTime < 700) { lastTime = now; return; }
      lastKey = key || ''; lastTime = now;
      history.push(snapshot());
      if (history.length > 40) history.shift();
    }

    function undo() {
      if (!history.length) return false;
      var s = history.pop();
      nails = s.nails;
      selected = s.selected;
      marks = s.marks;
      if (s.picking) {
        picking = { steps: buildSteps(), idx: s.picking.idx, points: s.picking.points };
      } else {
        picking = null;
      }
      lastKey = '';
      draw();
      return true;
    }

    function canUndo() { return history.length > 0; }

    /* ------------------------------ 绘制 ------------------------------ */

    function currentRatio() { return NAIL.lengthRatio(style.lenId); }

    function fitCanvas() {
      if (!img) return;
      var maxW = canvas.parentElement.clientWidth || 320;
      var maxH = Math.max(240, window.innerHeight * 0.54);
      var k = Math.min(maxW / canvas.width, maxH / canvas.height, 1.6);
      canvas.style.width = Math.round(canvas.width * k) + 'px';
      canvas.style.height = Math.round(canvas.height * k) + 'px';
    }

    /* 取肤色（从缩略图里读，便宜且稳定） */
    function prepareColorBuffer() {
      if (!img) return;
      photoCv.width = canvas.width; photoCv.height = canvas.height;
      photoCv.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      var w = Math.min(160, canvas.width), h = Math.max(1, Math.round(w * canvas.height / canvas.width));
      colorCv.width = w; colorCv.height = h;
      var c = colorCv.getContext('2d', { willReadFrequently: true });
      c.drawImage(img, 0, 0, w, h);
      colorData = c.getImageData(0, 0, w, h).data;
    }

    function sampleSkin(px, py) {
      if (!colorData) return '#e8c3b0';
      var w = colorCv.width, h = colorCv.height;
      var x = Math.round(px / canvas.width * w), y = Math.round(py / canvas.height * h);
      var r = 0, g = 0, b = 0, n = 0;
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          var xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          var i = (yy * w + xx) * 4;
          r += colorData[i]; g += colorData[i + 1]; b += colorData[i + 2]; n++;
        }
      }
      if (!n) return '#e8c3b0';
      return toHex(r / n, g / n, b / n);
    }

    /* 画一片甲片：挂上阴影、环境色、甲根皮褶，让它像长在手上 */
    function drawPatch(n, i) {
      var w = n.baseW * n.sizeK;
      var h = w * currentRatio();
      var rot = (n.rot + n.rotAdd) * Math.PI / 180;
      var art = NAIL.getCanvas(style.styleId, style.shapeId, style.lenId, 'main', (i + 1) * 13);
      var path = new Path2D(NAIL.pathD(w, h, style.shapeId));

      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.rotate(rot);

      /* 1. 接触阴影 */
      ctx.save();
      ctx.shadowColor = 'rgba(72,42,32,0.26)';
      ctx.shadowBlur = Math.max(2, w * 0.09);
      ctx.shadowOffsetY = Math.max(1, w * 0.02);
      ctx.drawImage(art, -w / 2, 0, w, h);
      ctx.restore();

      /* 2. 环境色（附近肤色，轻微 multiply 融进画面） */
      var skin = n._skin || (n._skin = sampleSkin(
        n.x + Math.sin(rot) * w * 0.25,
        n.y - Math.cos(rot) * w * 0.25
      ));
      ctx.save();
      ctx.clip(path);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = skin;
      ctx.fillRect(-w / 2, -h * 0.1, w, h * 1.2);
      ctx.restore();

      /* 3. 甲根皮肤褶皱盖住甲片边缘 —— 真实感的关键 */
      ctx.save();
      ctx.clip(path);
      var fold = ctx.createRadialGradient(0, -h * 0.015, w * 0.12, 0, -h * 0.015, w * 0.66);
      fold.addColorStop(0, rgba(skin, 0.92));
      fold.addColorStop(0.5, rgba(skin, 0.46));
      fold.addColorStop(1, rgba(skin, 0));
      ctx.fillStyle = fold;
      ctx.fillRect(-w / 2, -h * 0.06, w, h * 0.34);
      /* 皮肤与甲面交界处的一道细影 */
      var line = ctx.createLinearGradient(0, h * 0.035, 0, h * 0.075);
      line.addColorStop(0, 'rgba(120,74,58,0.20)');
      line.addColorStop(1, 'rgba(120,74,58,0)');
      ctx.fillStyle = line;
      ctx.fillRect(-w / 2, h * 0.035, w, h * 0.04);
      ctx.restore();

      ctx.restore();

      if (i === selected) {
        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.rotate(rot);
        ctx.setLineDash([Math.max(5, w * 0.16), Math.max(4, w * 0.11)]);
        ctx.lineWidth = Math.max(1.5, w * 0.035);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeRect(-w / 2 - 4, -6, w + 8, h + 12);
        ctx.strokeStyle = 'rgba(201,126,110,0.95)';
        ctx.lineWidth = Math.max(1, w * 0.022);
        ctx.strokeRect(-w / 2 - 4, -6, w + 8, h + 12);
        ctx.restore();
      }
    }

    function draw() {
      if (!img) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (!colorData) prepareColorBuffer();

      nails.forEach(drawPatch);

      if (picking) {
        marks.forEach(function (m, i) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(m.x, m.y, 7, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(201,126,110,0.85)';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#fff';
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = '600 13px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(i + 1), m.x, m.y + 4.5);
          ctx.restore();
        });
      }
      if (hooks.onChange) hooks.onChange(info());
    }

    function info() {
      return {
        hasPhoto: !!img,
        count: nails.length,
        selected: selected,
        canUndo: history.length > 0,
        picking: picking ? { idx: picking.idx, total: picking.steps.length, step: picking.steps[picking.idx] } : null,
        selectedNail: selected >= 0 && nails[selected] ? {
          sizeK: nails[selected].sizeK,
          rotAdd: nails[selected].rotAdd,
          finger: FINGER_ORDER[selected] ? FINGER_ORDER[selected].label : ''
        } : null
      };
    }

    /* ------------------------------ 图片载入 ------------------------------ */

    function resetAll() {
      nails = [];
      selected = -1;
      picking = null;
      marks = [];
      pointers.clear();
      drag = null;
      history = [];
      lastKey = '';
    }

    function loadFile(file) {
      return new Promise(function (resolve, reject) {
        if (!file) return reject(new Error('no file'));
        var url = URL.createObjectURL(file);
        var image = new Image();
        image.onload = function () {
          URL.revokeObjectURL(url);
          var w = image.naturalWidth || image.width;
          var h = image.naturalHeight || image.height;
          var k = Math.min(1, MAX_EDGE / Math.max(w, h));
          canvas.width = Math.max(2, Math.round(w * k));
          canvas.height = Math.max(2, Math.round(h * k));
          img = image;
          colorData = null;
          resetAll();
          fitCanvas();
          prepareColorBuffer();
          draw();
          resolve();
        };
        image.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('decode failed'));
        };
        image.src = url;
      });
    }

    function clearPhoto() {
      img = null;
      colorData = null;
      resetAll();
      canvas.width = 2; canvas.height = 2;
      canvas.style.width = ''; canvas.style.height = '';
      ctx.clearRect(0, 0, 2, 2);
      if (hooks.onChange) hooks.onChange(info());
    }

    /* ------------------------------ 自动识别手指 ------------------------------ */

    function autoPlace() {
      if (!img) return { ok: false, message: '先上传一张手的照片' };
      if (!photoCv.width) prepareColorBuffer();
      var res = global.HandDetect.detect(photoCv, {});
      if (!res.ok) return { ok: false, message: res.message || '没识别到手指，请手动点选' };

      push();
      var fs = res.fingers;
      /* 拇指：两端里更宽的那一根 */
      var thumbAtStart = fs[0].width >= fs[fs.length - 1].width;
      var seq = fs.slice();
      if (!thumbAtStart) seq.reverse();

      var arr = [];
      for (var i = 0; i < seq.length && i < FINGER_ORDER.length; i++) {
        var f = seq[i];
        var meta = FINGER_ORDER[i];
        var wK = meta.id === 'thumb' ? 0.76 : 0.72;
        var nw = f.width * wK;
        var cut = nw * 1.15;                 // 指尖到甲根的距离（自然甲约 1.15 倍甲宽）
        arr.push({
          fingerId: meta.id,
          x: f.tip.x - f.dir.x * cut,
          y: f.tip.y - f.dir.y * cut,
          rot: Math.atan2(-f.dir.x, f.dir.y) * 180 / Math.PI,
          baseW: nw,
          sizeK: 1,
          rotAdd: 0
        });
      }
      nails = arr;
      selected = nails.length ? nails.length - 1 : -1;
      picking = null;
      marks = [];
      draw();
      return { ok: true, count: nails.length };
    }

    /* ------------------------------ 点选指位 ------------------------------ */

    function buildSteps() {
      var steps = [];
      FINGER_ORDER.forEach(function (f) {
        steps.push({ finger: f.id, label: f.label, part: 'tip' });
        steps.push({ finger: f.id, label: f.label, part: 'base' });
      });
      return steps;
    }

    function startPick() {
      if (!img) return;
      push();
      nails = [];
      selected = -1;
      marks = [];
      picking = { steps: buildSteps(), idx: 0, points: {} };
      draw();
    }

    function cancelPick() {
      picking = null;
      marks = [];
      draw();
    }

    function addPickPoint(pt) {
      if (!picking) return;
      push('pick');
      var step = picking.steps[picking.idx];
      var store = picking.points[step.finger] = picking.points[step.finger] || {};
      store[step.part] = pt;
      marks.push(pt);
      picking.idx += 1;

      var done = picking.points[step.finger];
      if (done && done.tip && done.base) buildNail(step.finger, done.tip, done.base);
      if (picking.idx >= picking.steps.length) {
        picking = null;
        marks = [];
        selected = nails.length ? nails.length - 1 : -1;
      }
      draw();
    }

    function buildNail(fingerId, tipPt, basePt) {
      var dx = tipPt.x - basePt.x, dy = tipPt.y - basePt.y;
      var len = Math.hypot(dx, dy);
      if (len < 6) return;
      var rot = Math.atan2(-dx / len, dy / len) * 180 / Math.PI;
      var idx = 0;
      for (var i = 0; i < FINGER_ORDER.length; i++) if (FINGER_ORDER[i].id === fingerId) idx = i;
      nails[idx] = {
        fingerId: fingerId,
        x: basePt.x,
        y: basePt.y,
        rot: rot,
        baseW: len * 0.66,
        sizeK: 1,
        rotAdd: 0
      };
      nails = nails.filter(function (n) { return !!n; });
    }

    /* 兜底：一键在画面中部铺开 5 片 */
    function spread() {
      if (!img) return;
      push();
      var W = canvas.width, H = canvas.height;
      var baseW = W * 0.062;
      nails = FINGER_ORDER.map(function (f, i) {
        return {
          fingerId: f.id,
          x: W * (0.30 + i * 0.10),
          y: H * (0.34 + Math.abs(i - 2) * 0.035),
          rot: 180 + (i - 2) * 7,
          baseW: baseW * (i === 0 ? 1.12 : (i === 4 ? 0.86 : 1)),
          sizeK: 1,
          rotAdd: 0
        };
      });
      selected = nails.length - 1;
      picking = null;
      marks = [];
      draw();
    }

    /* ------------------------------ 交互 ------------------------------ */

    function toCanvas(e) {
      var r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) / r.width * canvas.width,
        y: (e.clientY - r.top) / r.height * canvas.height
      };
    }

    function hitTest(pt) {
      var ratio = currentRatio();
      for (var i = nails.length - 1; i >= 0; i--) {
        var n = nails[i];
        var w = n.baseW * n.sizeK, h = w * ratio;
        var a = -(n.rot + n.rotAdd) * Math.PI / 180;
        var dx = pt.x - n.x, dy = pt.y - n.y;
        var lx = dx * Math.cos(a) - dy * Math.sin(a);
        var ly = dx * Math.sin(a) + dy * Math.cos(a);
        var pad = w * 0.18;
        if (Math.abs(lx) <= w / 2 + pad && ly >= -pad * 1.6 && ly <= h + pad) return i;
      }
      return -1;
    }

    function onPointerDown(e) {
      if (!img) return;
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      var pt = toCanvas(e);
      pointers.set(e.pointerId, pt);

      if (picking) { addPickPoint(pt); return; }

      if (pointers.size === 2) {
        var arr = Array.from(pointers.values());
        push('pinch');
        drag = {
          pinch: true,
          dist: Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y),
          ang: Math.atan2(arr[1].y - arr[0].y, arr[1].x - arr[0].x) * 180 / Math.PI,
          sizeK: nails[selected] ? nails[selected].sizeK : 1,
          rotAdd: nails[selected] ? nails[selected].rotAdd : 0
        };
        return;
      }

      var hit = hitTest(pt);
      selected = hit;
      if (hit >= 0) {
        push('move');
        drag = { pinch: false, idx: hit, offX: pt.x - nails[hit].x, offY: pt.y - nails[hit].y };
      }
      draw();
    }

    function onPointerMove(e) {
      if (!img || !pointers.has(e.pointerId)) return;
      var pt = toCanvas(e);
      pointers.set(e.pointerId, pt);
      if (picking) return;

      if (drag && drag.pinch && pointers.size >= 2 && selected >= 0) {
        var arr = Array.from(pointers.values());
        var d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
        var ang = Math.atan2(arr[1].y - arr[0].y, arr[1].x - arr[0].x) * 180 / Math.PI;
        var n = nails[selected];
        n.sizeK = clamp(drag.sizeK * (d / (drag.dist || d)), 0.35, 3.5);
        n.rotAdd = drag.rotAdd + (ang - drag.ang);
        draw();
        return;
      }

      if (drag && !drag.pinch && drag.idx >= 0) {
        var nail = nails[drag.idx];
        if (!nail) return;
        nail.x = pt.x - drag.offX;
        nail.y = pt.y - drag.offY;
        nail._skin = null;
        draw();
      }
    }

    function onPointerUp(e) {
      pointers.delete(e.pointerId);
      drag = null;
      if (hooks.onChange) hooks.onChange(info());
    }

    function onWheel(e) {
      if (!img || selected < 0) return;
      e.preventDefault();
      push('size');
      var n = nails[selected];
      n.sizeK = clamp(n.sizeK * (e.deltaY < 0 ? 1.06 : 0.94), 0.35, 3.5);
      draw();
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', function () { fitCanvas(); });

    /* ------------------------------ 微调 ------------------------------ */

    function setSize(v) {
      if (selected < 0) return;
      push('size');
      nails[selected].sizeK = clamp(v, 0.35, 3.5);
      draw();
    }
    function setRot(v) {
      if (selected < 0) return;
      push('rot');
      nails[selected].rotAdd = v;
      draw();
    }
    function syncAll() {
      if (selected < 0) return;
      push();
      var s = nails[selected].sizeK, r = nails[selected].rotAdd;
      nails.forEach(function (n) { n.sizeK = s; n.rotAdd = r; n._skin = null; });
      draw();
    }
    function removeSelected() {
      if (selected < 0) return;
      push();
      nails.splice(selected, 1);
      selected = nails.length ? Math.min(selected, nails.length - 1) : -1;
      draw();
    }
    function resetTweaks() {
      push();
      nails.forEach(function (n) { n.sizeK = 1; n.rotAdd = 0; });
      draw();
    }
    function setStyle(next) {
      style = Object.assign({}, style, next);
      draw();
    }

    function exportBlob() {
      return new Promise(function (resolve) {
        var wasSelected = selected;
        selected = -1;
        draw();
        var finish = function (blob) {
          selected = wasSelected;
          draw();
          resolve(blob);
        };
        if (canvas.toBlob) canvas.toBlob(finish, 'image/png');
        else finish(null);
      });
    }

    return {
      loadFile: loadFile,
      clearPhoto: clearPhoto,
      autoPlace: autoPlace,
      startPick: startPick,
      cancelPick: cancelPick,
      spread: spread,
      undo: undo,
      canUndo: canUndo,
      setStyle: setStyle,
      setSize: setSize,
      setRot: setRot,
      syncAll: syncAll,
      removeSelected: removeSelected,
      resetTweaks: resetTweaks,
      exportBlob: exportBlob,
      redraw: draw,
      fit: fitCanvas,
      info: info,
      canvas: canvas,
      hasPhoto: function () { return !!img; }
    };
  }

  global.TryOn = { create: create };
})(window);
