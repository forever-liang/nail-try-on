/* =====================================================================
   app.js — 页面交互：款式选择 / 模型手预览 / 照片试戴控制
   ===================================================================== */
(function () {
  'use strict';

  var NAIL = window.NailArt;

  var state = {
    styleId: 'nude-ombre',
    shapeId: 'almond',
    lenId: 'mid',
    series: 'all',
    mode: 'photo'
  };

  var $ = function (id) { return document.getElementById(id); };

  /* 安全绑定，避免某个元素缺失就整页脚本挂掉 */
  function on(id, type, fn) {
    var el = $(id);
    if (el) el.addEventListener(type, fn);
    return el;
  }

  /* ------------------------------ 小工具 ------------------------------ */

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ------------------------------ 款式选择 ------------------------------ */

  function renderSeries() {
    var box = $('seriesChips');
    box.innerHTML = '';
    NAIL.SERIES.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'chip' + (state.series === s.id ? ' on' : '');
      b.textContent = s.name;
      b.addEventListener('click', function () {
        state.series = s.id;
        renderSeries();
        renderStrip();
      });
      box.appendChild(b);
    });
  }

  function renderStrip() {
    var box = $('styleStrip');
    box.innerHTML = '';
    NAIL.STYLES.filter(function (s) {
      return state.series === 'all' || s.series === state.series;
    }).forEach(function (s) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'style-card' + (state.styleId === s.id ? ' on' : '');
      card.dataset.style = s.id;

      var cvs = document.createElement('canvas');
      cvs.className = 'style-thumb';
      cvs.width = 168; cvs.height = 200;
      cvs.dataset.style = s.id;

      var name = document.createElement('span');
      name.className = 'style-name';
      name.textContent = s.name;

      card.appendChild(cvs);
      card.appendChild(name);
      card.addEventListener('click', function () { selectStyle(s.id); });
      box.appendChild(card);
    });
    paintThumbs();
  }

  function paintThumbs() {
    var list = document.querySelectorAll('.style-thumb');
    Array.prototype.forEach.call(list, function (cvs) {
      var ctx = cvs.getContext('2d');
      var W = cvs.width, H = cvs.height;
      ctx.clearRect(0, 0, W, H);
      var src = NAIL.getCanvas(cvs.dataset.style, state.shapeId, state.lenId, 'thumb');
      var pad = 14;
      var s = Math.min((W - pad * 2) / src.width, (H - pad * 2) / src.height);
      var w = src.width * s, h = src.height * s;
      ctx.save();
      ctx.shadowColor = 'rgba(176,128,110,0.35)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
      ctx.restore();
    });
  }

  function selectStyle(id) {
    state.styleId = id;
    Array.prototype.forEach.call(document.querySelectorAll('.style-card'), function (el) {
      el.classList.toggle('on', el.dataset.style === id);
    });
    syncPreview();
  }

  function renderOptionBars() {
    var shapeBox = $('shapeChips');
    shapeBox.innerHTML = '';
    NAIL.SHAPES.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'chip' + (state.shapeId === s.id ? ' on' : '');
      b.textContent = s.name;
      b.dataset.shape = s.id;
      b.addEventListener('click', function () {
        state.shapeId = s.id;
        renderOptionBars();
        paintThumbs();
        syncPreview();
      });
      shapeBox.appendChild(b);
    });

    var lenBox = $('lenChips');
    lenBox.innerHTML = '';
    NAIL.LENGTHS.forEach(function (l) {
      var b = document.createElement('button');
      b.className = 'chip' + (state.lenId === l.id ? ' on' : '');
      b.textContent = l.name;
      b.dataset.len = l.id;
      b.addEventListener('click', function () {
        state.lenId = l.id;
        renderOptionBars();
        paintThumbs();
        syncPreview();
      });
      lenBox.appendChild(b);
    });
  }

  /* ------------------------------ 预览同步 ------------------------------ */

  function syncPreview() {
    window.HandModel.update($('viewModel'), {
      styleId: state.styleId, shapeId: state.shapeId, lenId: state.lenId
    });
    tryon.setStyle({ styleId: state.styleId, shapeId: state.shapeId, lenId: state.lenId });
    var st = NAIL.styleById(state.styleId);
    $('curStyleName').textContent = st.name;
  }

  /* ------------------------------ 照片试戴 ------------------------------ */

  var tryon = window.TryOn.create($('photoCanvas'), { onChange: syncPhotoUI });
  var sliderBusy = false;

  function syncPhotoUI(info) {
    $('photoEmpty').hidden = info.hasPhoto;
    $('placeRow').hidden = !info.hasPhoto || !!info.picking;
    $('adjustRow').hidden = !info.hasPhoto || !info.selectedNail;
    $('saveBtn').hidden = !info.hasPhoto;
    $('clearBtn').hidden = !info.hasPhoto;
    $('photoTools').hidden = state.mode !== 'photo' || !info.hasPhoto;
    $('autoBtn').textContent = info.count ? '重新识别手指' : '自动识别手指';
    ['undoBtn', 'undoBtn2'].forEach(function (id) {
      var b = $(id);
      if (b) b.disabled = !info.canUndo;
    });

    if (info.picking) {
      var step = info.picking.step;
      var part = step.part === 'tip' ? '指甲尖端' : '指甲根部（与皮肤交界处）';
      $('pickBar').hidden = false;
      $('pickText').textContent = '第 ' + (info.picking.idx + 1) + '/' + info.picking.total +
        ' 步 · 点一下【' + step.label + '】的' + part;
    } else {
      $('pickBar').hidden = true;
    }

    if (info.selectedNail && !sliderBusy) {
      $('rngSize').value = info.selectedNail.sizeK;
      $('rngRot').value = Math.round(info.selectedNail.rotAdd * 2) / 2;
      $('selName').textContent = info.selectedNail.finger;
      $('adjustRow').hidden = false;
    }
  }

  function setMode(mode) {
    state.mode = mode;
    $('viewModel').hidden = mode !== 'model';
    $('viewPhoto').hidden = mode !== 'photo';
    document.querySelectorAll('#modeTabs button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.mode === mode);
    });
    $('stageHint').textContent = mode === 'model'
      ? '模型手 · 自然手型，不做任何美化'
      : '真实照片 · 只叠加甲片，不修饰肤色与手型';
    $('photoTools').hidden = mode !== 'photo';
    if (mode === 'photo') {
      requestAnimationFrame(function () { tryon.fit(); syncPhotoUI(tryon.info()); });
    }
  }

  function handleFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
    toast('正在载入照片…');
    tryon.loadFile(file).then(function () {
      setMode('photo');
      toast('照片已载入，正在识别手指…');
      setTimeout(function () {
        var r = tryon.autoPlace();
        if (r.ok) toast('识别到 ' + r.count + ' 根手指，可拖动微调');
        else toast('没自动认出手指，请点「手动点选指位」');
      }, 60);
    }).catch(function () {
      toast('照片读取失败，请换一张试试');
    });
  }

  function doUndo() {
    if (tryon.undo()) toast('已回到上一步');
    else toast('没有可回退的步骤了');
  }

  /* ------------------------------ 初始化 ------------------------------ */

  function init() {
    window.HandModel.mount($('viewModel'));
    renderSeries();
    renderOptionBars();
    renderStrip();

    Array.prototype.forEach.call(document.querySelectorAll('#modeTabs button'), function (b) {
      b.addEventListener('click', function () { setMode(b.dataset.mode); });
    });

    on('camInput', 'change', function (e) {
      handleFile(e.target.files && e.target.files[0]);
      e.target.value = '';
    });
    on('fileInput', 'change', function (e) {
      handleFile(e.target.files && e.target.files[0]);
      e.target.value = '';
    });
    on('camBtn2', 'click', function () { $('camInput').click(); });
    on('fileBtn2', 'click', function () { $('fileInput').click(); });
    on('clearBtn', 'click', function () {
      tryon.clearPhoto();
      toast('已移除照片');
    });

    on('autoBtn', 'click', function () {
      toast('正在识别手指…');
      setTimeout(function () {
        var r = tryon.autoPlace();
        if (r.ok) toast('识别到 ' + r.count + ' 根手指，可拖动微调');
        else toast(r.message || '没识别到手指，请手动点选');
      }, 40);
    });
    on('pickBtn', 'click', function () {
      tryon.startPick();
      toast('按提示依次点选 10 个位置');
    });
    on('undoBtn', 'click', doUndo);
    on('undoBtn2', 'click', doUndo);
    on('pickUndoBtn', 'click', doUndo);
    on('cancelPickBtn', 'click', function () { tryon.cancelPick(); });
    on('spreadBtn', 'click', function () {
      tryon.spread();
      toast('已铺开 5 片，拖动到对应手指即可');
    });

    ['rngSize', 'rngRot'].forEach(function (id) {
      var el = $(id);
      var start = function () { sliderBusy = true; };
      var end = function () { sliderBusy = false; };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('touchstart', start, { passive: true });
      el.addEventListener('touchend', end);
      el.addEventListener('input', function () {
        sliderBusy = true;
        if (id === 'rngSize') tryon.setSize(parseFloat(el.value));
        else tryon.setRot(parseFloat(el.value));
      });
      el.addEventListener('change', function () { sliderBusy = false; });
    });
    on('syncBtn', 'click', function () {
      tryon.syncAll();
      toast('已同步到所有手指');
    });
    on('resetBtn', 'click', function () {
      tryon.resetTweaks();
      toast('已重置微调');
    });
    on('delBtn', 'click', function () {
      if (!tryon.info().selectedNail) return;
      tryon.removeSelected();
      toast('已删除该片');
    });

    on('saveBtn', 'click', function () {
      toast('正在生成效果图…');
      tryon.exportBlob().then(function (blob) {
        if (!blob) { toast('保存失败，请长按图片保存'); return; }
        var url = URL.createObjectURL(blob);
        $('resultImg').src = url;
        $('resultLink').href = url;
        $('resultModal').classList.add('show');
        toast('效果图已生成');
      });
    });
    on('closeResult', 'click', function () {
      $('resultModal').classList.remove('show');
    });

    setMode('photo');
    syncPreview();

    // 便于本地调试 / 演示：?demo=图片地址 可直接载入一张照片
    var demo = new URLSearchParams(location.search).get('demo');
    if (demo) {
      setMode('photo');
      fetch(demo).then(function (r) { return r.blob(); }).then(function (b) {
        return tryon.loadFile(new File([b], 'demo.jpg', { type: b.type || 'image/jpeg' }));
      }).then(function () {
        tryon.autoPlace();
        syncPhotoUI(tryon.info());
      }).catch(function () { toast('演示图片载入失败'); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
