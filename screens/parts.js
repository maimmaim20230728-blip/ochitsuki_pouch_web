'use strict';
/* 共通の部品(おちつきポーチ固有・画面ではない): window.POUCH_PARTS
   ・写真カード部品(たべもの・しぐさ・おちつく で共用)、入力フォーム(.ov)、見せる画面(.ov.show-white)、
     1画面1ステップの手順(.ov)、けす確認(.ov)、容量オーバーを通知する保存
   ・操作は全て api.Tap.bind(click禁止)。file input だけネイティブの change
   ・画面(screens/<id>.js)は render のたびに api を受け取るので、部品も api を引数でもらう(状態を持たない) */
(function(){

  function newId(){ return String(Date.now().toString(36)) + Math.random().toString(36).slice(2, 7); }
  function fmt(s, m){ return String(s).replace(/\{(\w+)\}/g, function(_, k){ return (m[k] === undefined) ? '' : m[k]; }); }
  function btn(api, cls, label, fn, opts){ var b = api.el('button', cls, label); b.type = 'button'; api.Tap.bind(b, fn, opts); return b; }
  function remove(node){ if(node && node.parentNode) node.parentNode.removeChild(node); }

  /* 保存: false(容量オーバー等)なら通知して false を返す。呼び出し側は状態を変えない */
  function saveOrWarn(api, key, obj){
    if(api.save(key, obj)) return true;
    api.toast(api.T('common.storageFull'));
    return false;
  }

  /* 一覧のサムネイル(写真が無ければ絵文字の枠) */
  function thumb(api, img, emoji){
    if(img){ var im = api.el('img', 'photo-thumb'); im.src = img; im.alt = ''; return im; }
    return api.el('span', 'thumb-ph', emoji || '📷');
  }

  /* 全画面オーバーレイの土台 */
  function overlay(api, cls){
    var ov = api.el('div', 'ov' + (cls ? ' ' + cls : ''));
    document.body.appendChild(ov);
    return ov;
  }
  function closeBtn(api, ov, label, onClose){
    var b = btn(api, 'ov-close', label || api.T('common.close'), function(){ if(onClose) onClose(); remove(ov); });
    ov.appendChild(b);
    return b;
  }

  /* けす確認(window.confirm は使わない=Tap方式・見た目を揃える) */
  function confirmDel(api, onYes){
    var ov = overlay(api, 'confirm-ov');
    var box = api.el('div', 'confirm-box');
    box.appendChild(api.el('p', 'confirm-text', api.T('common.delConfirm')));
    var row = api.el('div', 'btn-row');
    row.appendChild(btn(api, 'btn', api.T('common.no'), function(){ remove(ov); }));
    row.appendChild(btn(api, 'btn danger', api.T('common.yes'), function(){ remove(ov); onYes(); }));
    box.appendChild(row);
    ov.appendChild(box);
    return ov;
  }

  /* 写真の欄(プレビュー+とる/えらぶ/けす)。state.img を書き換える */
  function photoField(api, state, opts){
    var o = opts || {};
    var wrap = api.el('div', 'field photo-field');
    if(o.label) wrap.appendChild(api.el('label', null, o.label));
    var prev = api.el('div', 'photo-prev');
    function draw(){
      prev.textContent = '';
      if(state.img){ var im = api.el('img', 'photo-big'); im.src = state.img; im.alt = ''; prev.appendChild(im); }
      else prev.appendChild(api.el('p', 'hint', api.T('common.parts.photoNone')));
      del.classList.toggle('hidden', !state.img);
    }
    var row = api.el('div', 'btn-row');
    function pick(camera){
      if(!api.Photo) return;
      api.Photo.pick({ camera:camera, T:api.T, toast:api.toast, out:o.out || 256, onDone:function(d){ state.img = d; draw(); } });
    }
    row.appendChild(btn(api, 'btn', '📷 ' + api.T('common.photo.camera'), function(){ pick(true); }));
    row.appendChild(btn(api, 'btn', '🖼️ ' + api.T('common.photo.roll'), function(){ pick(false); }));   // VS16 付き(文字化け防止)
    var del = btn(api, 'btn wide', api.T('common.parts.photoDel'), function(){ state.img = ''; draw(); });
    wrap.appendChild(prev); wrap.appendChild(row); wrap.appendChild(del);
    draw();
    return wrap;
  }

  /* 入力フォーム(全画面)
     o = { title, fields:[{ key, label, ph, type:'text'|'textarea' }], photo:true|false, data, extra(fn: state→要素),
           onSave(data)→true で閉じる, onDelete()(あれば「けす」を出す) } */
  function openForm(api, o){
    var ov = overlay(api, 'form-ov');
    var state = Object.assign({}, o.data || {});
    ov.appendChild(api.el('h2', 'ov-title', o.title));
    ov.appendChild(api.el('p', 'hint', api.T('common.optional')));
    if(o.photo) ov.appendChild(photoField(api, state, { label: o.photoLabel || '' }));
    var inputs = {};
    (o.fields || []).forEach(function(f){
      var fl = api.el('div', 'field');
      fl.appendChild(api.el('label', null, f.label));
      var inp;
      if(f.type === 'textarea'){ inp = api.el('textarea'); inp.rows = 3; }
      else { inp = api.el('input'); inp.type = 'text'; }
      inp.className = 'fld';
      inp.setAttribute('dir', 'auto');   // RTL(ar)でも日本語の入力は左→右のまま
      inp.setAttribute('data-key', f.key);
      inp.placeholder = f.ph || '';
      inp.value = state[f.key] || '';
      fl.appendChild(inp);
      ov.appendChild(fl);
      inputs[f.key] = inp;
    });
    if(o.extra) ov.appendChild(o.extra(state));
    var row = api.el('div', 'btn-row form-actions');
    row.appendChild(btn(api, 'btn', '✕ ' + api.T('common.cancel'), function(){ remove(ov); }));
    row.appendChild(btn(api, 'btn primary', '✓ ' + api.T('common.save'), function(){
      for(var k in inputs){ state[k] = String(inputs[k].value || '').trim(); }
      if(o.onSave(state)) remove(ov);
    }));
    ov.appendChild(row);
    if(o.onDelete){
      ov.appendChild(btn(api, 'btn danger wide', '🗑 ' + api.T('common.del'), function(){
        confirmDel(api, function(){ o.onDelete(); remove(ov); });
      }));
    }
    return ov;
  }

  /* 見せる画面(白地・漢字・大きな文字)。o = { title, blocks:[{ head, label, value, img, tel }], note }
     head=項目の見出し(商品名・しぐさ等を大きく) / label=小さな見出し */
  function openShow(api, o){
    var ov = overlay(api, 'show-white show-ov');
    ov.appendChild(api.el('div', 'show-head', o.title));
    (o.blocks || []).forEach(function(b){
      var blk = api.el('div', 'show-block');
      if(b.label) blk.appendChild(api.el('div', 'show-label', b.label));
      if(b.head) blk.appendChild(api.el('div', 'show-item-head', b.head));
      if(b.img){ var im = api.el('img', 'show-img'); im.src = b.img; im.alt = ''; blk.appendChild(im); }
      /* 長い文(特徴・接し方など)は少し小さくして1画面に収まりやすくする(短い値は大きいまま) */
      if(b.value) blk.appendChild(api.el('div', 'show-value' + (String(b.value).length > 40 ? ' long' : ''), b.value));
      if(b.tel){ var a = api.el('a', 'call-btn', b.telLabel || b.tel); a.href = 'tel:' + b.tel; blk.appendChild(a); }
      ov.appendChild(blk);
    });
    if(o.note) ov.appendChild(api.el('p', 'hint show-note', o.note));
    closeBtn(api, ov);
    return ov;
  }

  /* 1画面1ステップの手順。o = { title, steps:[text], tel:{ index→番号 }, telLabel, note } */
  function openSteps(api, o){
    var ov = overlay(api, 'show-white steps-ov');
    var steps = o.steps || [];
    var idx = 0;
    ov.appendChild(api.el('div', 'show-head', o.title));
    var count = api.el('p', 'step-count');
    var text = api.el('div', 'step-text');
    var callWrap = api.el('div', 'step-call');
    var nav = api.el('div', 'btn-row step-nav');
    /* 矢印は読む向きに合わせる(RTL では「まえ」が右・「つぎ」が左) */
    var arrowPrev = api.rtl ? '→ ' : '← ', arrowNext = api.rtl ? ' ←' : ' →';
    var prev = btn(api, 'btn', arrowPrev + api.T('common.prev'), function(){ if(idx > 0){ idx--; draw(); } });
    var next = btn(api, 'btn primary', api.T('common.next') + arrowNext, function(){ if(idx < steps.length - 1){ idx++; draw(); } });
    nav.appendChild(prev); nav.appendChild(next);
    function draw(){
      count.textContent = fmt(api.T('common.parts.step'), { n: idx + 1, m: steps.length });
      text.textContent = steps[idx] || '';
      callWrap.textContent = '';
      var tel = o.tel && o.tel[idx];
      if(tel){ var a = api.el('a', 'call-btn', o.telLabel || tel); a.href = 'tel:' + tel; callWrap.appendChild(a); }
      prev.disabled = idx === 0;
      next.disabled = idx >= steps.length - 1;
      prev.classList.toggle('dim', idx === 0);
      next.classList.toggle('dim', idx >= steps.length - 1);
    }
    ov.appendChild(count); ov.appendChild(text); ov.appendChild(callWrap); ov.appendChild(nav);
    if(o.note) ov.appendChild(api.el('p', 'hint show-note', o.note));
    draw();
    closeBtn(api, ov);
    return ov;
  }

  /* 今日の全身写真: 切り取らず、長辺 maxSide px に縮めて JPEG(dataURL)。縦長のまま残す */
  function pickPlainPhoto(api, o){
    var inp = api.el('input', 'photo-file'); inp.type = 'file'; inp.accept = 'image/*';
    if(o.camera) inp.setAttribute('capture', 'environment');
    inp.addEventListener('change', function(e){
      var f = e.target.files && e.target.files[0];
      try{ e.target.value = ''; }catch(_){}
      remove(inp);
      if(!f) return;
      var url = URL.createObjectURL(f);
      var im = new Image();
      im.onload = function(){
        try{
          var maxSide = o.maxSide || 640;
          var w = im.width || 1, h = im.height || 1;
          var s = Math.min(1, maxSide / Math.max(w, h));
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          var data = cv.toDataURL('image/jpeg', 0.82);
          try{ URL.revokeObjectURL(url); }catch(_){}
          if(o.onDone) o.onDone(data);
        }catch(_){ api.toast(api.T('common.photo.fail')); }
      };
      im.onerror = function(){ try{ URL.revokeObjectURL(url); }catch(_){} api.toast(api.T('common.photo.fail')); };
      im.src = url;
    });
    document.body.appendChild(inp);
    inp.click();
  }

  /* 今日の1枚(ホームと さがす で共用)。保存キー today.v1 = { img, date:'YYYY/MM/DD', ts } */
  var TODAY_KEY = 'today.v1';
  function dateStr(d){ return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0'); }
  function loadToday(api){ var t = api.load(TODAY_KEY, null); return (t && t.img) ? t : null; }
  function takeToday(api, onDone){
    pickPlainPhoto(api, { camera:true, maxSide:640, onDone:function(data){
      var now = new Date();
      if(saveOrWarn(api, TODAY_KEY, { img:data, date:dateStr(now), ts:now.getTime() })){ api.toast(api.T('common.saved')); if(onDone) onDone(); }
    } });
  }
  function clearToday(api){ api.remove(TODAY_KEY); }

  window.POUCH_PARTS = {
    newId: newId, fmt: fmt, btn: btn, remove: remove, saveOrWarn: saveOrWarn, thumb: thumb,
    overlay: overlay, closeBtn: closeBtn, confirmDel: confirmDel, photoField: photoField,
    openForm: openForm, openShow: openShow, openSteps: openSteps,
    pickPlainPhoto: pickPlainPhoto, loadToday: loadToday, takeToday: takeToday, clearToday: clearToday, TODAY_KEY: TODAY_KEY
  };
})();
