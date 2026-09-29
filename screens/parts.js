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

  /* 戻るボタン(Play版)の書きかけ: 写真・おとを えらんだ/けした ときも、文字を入れたときと同じ扱いにする。
     フォームの最初の文字欄に input を知らせるだけ(値は変えない。Web版は受け取る所が無いので何も起きない・2026-09-29) */
  function touchForm(node){
    try{
      var ov = node && node.closest && node.closest('.ov');
      var f = ov && ov.querySelector('input.fld, textarea.fld');
      if(f && typeof Event === 'function') f.dispatchEvent(new Event('input', { bubbles:true }));
    }catch(_){}
  }

  /* けす確認(window.confirm は使わない=Tap方式・見た目を揃える)。戻るボタン=いいえ(けさない) */
  function confirmDel(api, onYes){
    var ov = overlay(api, 'confirm-ov');
    var box = api.el('div', 'confirm-box');
    box.appendChild(api.el('p', 'confirm-text', api.T('common.delConfirm')));
    var row = api.el('div', 'btn-row');
    var no = btn(api, 'btn', api.T('common.no'), function(){ remove(ov); });
    no.setAttribute('data-back', '1');
    row.appendChild(no);
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
      api.Photo.pick({ camera:camera, T:api.T, toast:api.toast, out:o.out || 256, onDone:function(d){ state.img = d; draw(); touchForm(wrap); } });
    }
    row.appendChild(btn(api, 'btn', '📷 ' + api.T('common.photo.camera'), function(){ pick(true); }));
    row.appendChild(btn(api, 'btn', '🖼️ ' + api.T('common.photo.roll'), function(){ pick(false); }));   // VS16 付き(文字化け防止)
    var del = btn(api, 'btn wide', api.T('common.parts.photoDel'), function(){ state.img = ''; draw(); touchForm(wrap); });
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
    var cancel = btn(api, 'btn', '✕ ' + api.T('common.cancel'), function(){ remove(ov); });
    cancel.setAttribute('data-back', '1');   // 戻るボタン=やめる(書きかけがあれば app.js が先に確かめる)
    row.appendChild(cancel);
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

  /* 1画面1ステップの手順。o = { title, steps:[text], tel:{ index→番号 }, telLabel, show:{ index→true }, showLabel, onShow(), note, after()→要素(注記の下に足す) }
     ・発信と「見せる」は段数のすぐ下(本文より上)に出す。まえ/つぎ は とじるの上に固定(style.css)
       =文字が大きい・訳が長いときも、押すボタンがスクロールの下に隠れない */
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
      /* 「この画面の写真を見せます」の段: 見せる画面を手順の上に重ねて開く(とじると手順に戻る) */
      var canShow = !!(o.show && o.show[idx] && o.onShow);
      if(canShow) callWrap.appendChild(btn(api, 'btn wide step-show', o.showLabel || '', function(){ o.onShow(); }));
      callWrap.classList.toggle('hidden', !tel && !canShow);
      prev.disabled = idx === 0;
      next.disabled = idx >= steps.length - 1;
      prev.classList.toggle('dim', idx === 0);
      next.classList.toggle('dim', idx >= steps.length - 1);
    }
    ov.appendChild(count); ov.appendChild(callWrap); ov.appendChild(text); ov.appendChild(nav);
    if(o.note) ov.appendChild(api.el('p', 'hint show-note', o.note));
    if(o.after) ov.appendChild(o.after());
    draw();
    closeBtn(api, ov);
    /* 戻るボタン(Play版): 2段目より先なら「まえ」と同じ(1段もどる)。1段目なら とじる と同じ */
    ov._back = function(){ if(idx > 0){ idx--; draw(); } else remove(ov); };
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
  function loadToday(api){ return cleanData(TODAY_KEY, api.load(TODAY_KEY, null)) || null; }
  /* 撮った日が今日か(前の日の写真を「今日の服装」として見せないため) */
  function isTodayFresh(t){ return !!(t && t.date === dateStr(new Date())); }
  function takeToday(api, onDone){
    pickPlainPhoto(api, { camera:true, maxSide:640, onDone:function(data){
      var now = new Date();
      if(saveOrWarn(api, TODAY_KEY, { img:data, date:dateStr(now), ts:now.getTime() })){ api.toast(api.T('common.saved')); if(onDone) onDone(); }
    } });
  }
  function clearToday(api){ api.remove(TODAY_KEY); }

  /* 保存データの形チェック(読み出しと バックアップの よみこむ で共用)
     ・壊れた形(null・数字・文字の混ざった items など)でも画面が壊れないよう、決まった形に整える
     ・写真は 'data:image/'、音は 'data:' で始まるものだけ残す(端末内のデータだけ。http などの外部URLは空にする=外へ取りに行かない) */
  var FIELDS = { 'calm.v1':['name', 'audioName'], 'food.v1':['name', 'maker', 'shop', 'cond'], 'gesture.v1':['sign', 'meaning', 'worked'] };
  function isObj(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
  function str(v){ return (typeof v === 'string') ? v : ((typeof v === 'number' && isFinite(v)) ? String(v) : ''); }
  function imgUrl(v){ return (typeof v === 'string' && v.indexOf('data:image/') === 0) ? v : ''; }
  function audioUrl(v){ return (typeof v === 'string' && v.indexOf('data:') === 0) ? v : ''; }
  function cleanData(key, d){
    if(FIELDS[key]){
      var src = (isObj(d) && Array.isArray(d.items)) ? d.items : [];
      return { items: src.filter(isObj).map(function(x){
        var o = { id: str(x.id) || newId(), img: imgUrl(x.img) };
        FIELDS[key].forEach(function(f){ o[f] = str(x[f]); });
        if(key === 'calm.v1') o.audio = audioUrl(x.audio);
        return o;
      }) };
    }
    if(key === 'person.v1'){ var p = isObj(d) ? d : {}; return { feat: str(p.feat), appr: str(p.appr), contact: str(p.contact) }; }
    if(key === TODAY_KEY){ return (isObj(d) && imgUrl(d.img)) ? { img: d.img, date: str(d.date), ts: (typeof d.ts === 'number') ? d.ts : 0 } : null; }
    return null;   // このアプリが使わないキー
  }
  /* よみこむ: 知らないキーは捨て、知っているキーは形を整えてから入れる(app.js の importBackup が呼ぶ) */
  function importFilter(data){
    var out = {};
    if(!isObj(data)) return out;
    Object.keys(data).forEach(function(k){ var v = cleanData(k, data[k]); if(v) out[k] = v; });
    return out;
  }
  window.APP_IMPORT_FILTER = importFilter;

  window.POUCH_PARTS = {
    newId: newId, fmt: fmt, btn: btn, remove: remove, saveOrWarn: saveOrWarn, thumb: thumb,
    overlay: overlay, closeBtn: closeBtn, confirmDel: confirmDel, photoField: photoField, touchForm: touchForm,
    openForm: openForm, openShow: openShow, openSteps: openSteps,
    pickPlainPhoto: pickPlainPhoto, loadToday: loadToday, isTodayFresh: isTodayFresh, takeToday: takeToday, clearToday: clearToday, TODAY_KEY: TODAY_KEY,
    cleanData: cleanData, importFilter: importFilter
  };
})();
