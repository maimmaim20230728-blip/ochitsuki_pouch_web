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
  /* 見せる画面を開いている間だけ、画面を明るく保つ(Wake Lock API・2026-11-11)。使えない端末・断られたときは何もしない。
     返す関数で手放す(閉じたとき)。ほかのアプリに移って戻ったときは、まだ開いていれば取り直す */
  function keepAwake(ov){
    var lock = null, stopped = false;
    function acquire(){
      try{
        var wl = (typeof navigator !== 'undefined') ? navigator.wakeLock : null;
        if(stopped || !wl || typeof wl.request !== 'function') return;
        var p = wl.request('screen');
        if(p && typeof p.then === 'function') p.then(function(l){
          if(stopped){ try{ l.release(); }catch(_){} } else lock = l;
        }, function(){});
      }catch(_){}
    }
    function onVis(){
      if(stopped) return;
      if(document.body && typeof document.body.contains === 'function' && ov && !document.body.contains(ov)){ release(); return; }
      if(document.visibilityState === 'visible' && (!lock || lock.released)) acquire();
    }
    function release(){
      if(stopped) return;
      stopped = true;
      try{ document.removeEventListener('visibilitychange', onVis); }catch(_){}
      if(lock){ try{ var r = lock.release(); if(r && r.catch) r.catch(function(){}); }catch(_){} }
      lock = null;
    }
    try{ document.addEventListener('visibilitychange', onVis); }catch(_){}
    acquire();
    return release;
  }

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
      /* tels = 見つかった番号ごとのボタン([{ tel, label }]・どの番号か分かるよう番号を添える) */
      (b.tels || []).forEach(function(p){
        var a2 = api.el('a', 'call-btn', (b.telLabel || '') + ' ' + p.label); a2.href = 'tel:' + p.tel; blk.appendChild(a2);
      });
      ov.appendChild(blk);
    });
    if(o.note) ov.appendChild(api.el('p', 'hint show-note', o.note));
    var release = keepAwake(ov);
    closeBtn(api, ov, undefined, release);
    return ov;
  }

  /* 1画面1ステップの手順。o = { title, steps:[text], tel:{ index→番号 }, telLabel, show:{ index→true }, showLabel, onShow(), say:{ index→true }, sayLabel, onSay(), note, after()→要素(注記の下に足す) }
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
      /* 「電話で伝える用」: 110番の段で、特徴を上から順に大きく出す・読み上げる画面を重ねて開く */
      var canSay = !!(o.say && o.say[idx] && o.onSay);
      if(canSay) callWrap.appendChild(btn(api, 'btn wide step-show step-say', o.sayLabel || '', function(){ o.onSay(); }));
      callWrap.classList.toggle('hidden', !tel && !canShow && !canSay);
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
  /* 選ばずにやめた(change が来ない)ファイル選びの隠し input が body に残らないよう、次の選びの前に古い物を消す(2026-11-11)。
     cancel イベントに対応した端末では、やめた時点でも消す */
  function dropStaleFiles(){
    try{
      var old = document.querySelectorAll('.photo-file');
      for(var i = 0; i < old.length; i++) remove(old[i]);
    }catch(_){}
  }
  function pickPlainPhoto(api, o){
    dropStaleFiles();
    var inp = api.el('input', 'photo-file'); inp.type = 'file'; inp.accept = 'image/*';
    if(o.camera) inp.setAttribute('capture', 'environment');
    inp.addEventListener('cancel', function(){ remove(inp); });
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
  var MEMO_MAX = 80;   // 服装メモの長さの上限(文字)
  function dateStr(d){ return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0'); }
  function loadToday(api){ return cleanData(TODAY_KEY, api.load(TODAY_KEY, null)) || null; }
  /* 撮った日が今日か(前の日の写真を「今日の服装」として見せないため) */
  function isTodayFresh(t){ return !!(t && t.date === dateStr(new Date())); }
  function takeToday(api, onDone){
    pickPlainPhoto(api, { camera:true, maxSide:640, onDone:function(data){
      var now = new Date();
      var rec = { img:data, date:dateStr(now), ts:now.getTime() };
      var old = loadToday(api);
      if(old && old.memo && isTodayFresh(old)) rec.memo = old.memo;   // 同じ日に撮りなおしても、服装メモは残す
      if(saveOrWarn(api, TODAY_KEY, rec)){ api.toast(api.T('common.saved')); if(onDone) onDone(); }
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
    if(key === TODAY_KEY){
      if(!(isObj(d) && imgUrl(d.img))) return null;
      var t = { img: d.img, date: str(d.date), ts: (typeof d.ts === 'number') ? d.ts : 0 };
      var memo = str(d.memo).slice(0, MEMO_MAX);   // 今日の服装メモ(あるときだけ)
      if(memo) t.memo = memo;
      return t;
    }
    return null;   // このアプリが使わないキー
  }
  /* はじめての つかいかた(app.js・guide.v1)を読み終えたかどうかは、この端末のこと(2026-09-30)。
     よみこむ は「pouch.」のデータを丸ごと入れ替えるので、知らないキーとして捨てると、よみこんだあと案内がもう一度出てしまう。
     ファイルか この端末のどちらかで読み終えていれば残す(値は true だけ) */
  var GUIDE_KEY = 'guide.v1';
  function guideReadHere(){ try{ return localStorage.getItem('pouch.' + GUIDE_KEY) === 'true'; }catch(_){ return false; } }
  /* よみこむ: 知らないキーは捨て、知っているキーは形を整えてから入れる(app.js の importBackup が呼ぶ) */
  function importFilter(data){
    var out = {};
    if(!isObj(data)) return out;
    Object.keys(data).forEach(function(k){ var v = cleanData(k, data[k]); if(v) out[k] = v; });
    if(data[GUIDE_KEY] === true || guideReadHere()) out[GUIDE_KEY] = true;
    return out;
  }
  window.APP_IMPORT_FILTER = importFilter;

  /* 端末内の保存の使用量の目安(2026-11-11)。localStorage は 5MB 前後(文字数)で一杯になるので、
     ブラウザの上限を 5,000,000 文字として、全キーの「名前+中身」の文字数を数える。音は 2MB の ファイルが dataURL で 約1.37倍 */
  var LS_LIMIT = 5000000;
  var AUDIO_CHARS = Math.ceil(2 * 1024 * 1024 / 3) * 4 + 64;
  function storageUsed(){
    var n = 0;
    try{
      for(var i = 0; i < localStorage.length; i++){
        var k = localStorage.key(i);
        if(k) n += k.length + String(localStorage.getItem(k) || '').length;
      }
    }catch(_){}
    return n;
  }
  function mb(chars){ return Math.max(0.1, chars / 1000000).toFixed(1); }
  /* → { used(文字), limit, left, sounds(2MBの音があと何件入るか), u, t(表示用のMB) } */
  function storageInfo(){
    var used = storageUsed(), left = Math.max(0, LS_LIMIT - used);
    return { used: used, limit: LS_LIMIT, left: left, sounds: Math.floor(left / AUDIO_CHARS), u: mb(used), t: mb(LS_LIMIT) };
  }

  window.POUCH_PARTS = {
    newId: newId, fmt: fmt, btn: btn, remove: remove, saveOrWarn: saveOrWarn, thumb: thumb,
    overlay: overlay, closeBtn: closeBtn, confirmDel: confirmDel, photoField: photoField, touchForm: touchForm,
    openForm: openForm, openShow: openShow, openSteps: openSteps,
    pickPlainPhoto: pickPlainPhoto, loadToday: loadToday, isTodayFresh: isTodayFresh, takeToday: takeToday, clearToday: clearToday, TODAY_KEY: TODAY_KEY,
    cleanData: cleanData, importFilter: importFilter,
    dropStaleFiles: dropStaleFiles, keepAwake: keepAwake, storageInfo: storageInfo, MEMO_MAX: MEMO_MAX
  };
})();
