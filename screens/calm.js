'use strict';
/* 画面: おちつく = 登録した写真と音をワンタップで全画面に出す
   ・保存キー calm.v1 = { items:[{ id, name, img(256px正方形 dataURL), audio(dataURL・2MBまで), audioName }] }
   ・音は端末の音声ファイルを <input type=file accept=audio/*> で選ぶ(file input だけネイティブ change)。全画面ではループ再生
   ・動画の区間くり返しは第2版(SPEC_V1.md) */
(function(){
  var KEY = 'calm.v1';
  var MAX_AUDIO = 2 * 1024 * 1024;
  var MIN_LOOP = 0.2;   // これより短い音はくりかえさない(0秒の音をループすると画面が固まる)
  var P = function(){ return window.POUCH_PARTS; };
  var cur = null;   // 再生中の Audio(全画面を閉じたら止める)
  /* 音の大きさ 小・中・大(端末の音量とは別・Audio.volume・選んだ段は pref.extra の calmVol に覚える。決まっていなければ 大=今まで通り) */
  var VOLS = [0.3, 0.6, 1];
  function volIdx(api){ var v = api.getExtra('calmVol', 2); return (v === 0 || v === 1 || v === 2) ? v : 2; }

  function loadItems(api){ return P().cleanData(KEY, api.load(KEY, null)).items; }
  function stopAudio(){ if(cur){ try{ cur.pause(); cur.src = ''; }catch(_){} cur = null; } }

  /* 音の欄(フォームの extra): えらぶ / けす / いまの名前 */
  function soundField(api, state){
    var T = api.T;
    var wrap = api.el('div', 'field sound-field');
    wrap.appendChild(api.el('label', null, T('screen.calm.soundH')));
    /* 保存の使用量の目安と、2MBの音があと何件入るか(音を入れる前に・容量が切れて書きかけを失う前に気づけるように) */
    var si = P().storageInfo();
    var usage = api.el('p', 'hint usage-hint', P().fmt(T(si.sounds >= 1 ? 'screen.calm.usage' : 'screen.calm.usageFull'), { u: si.u, t: si.t, n: si.sounds }));
    usage.setAttribute('id', 'calm-usage');
    wrap.appendChild(usage);
    var name = api.el('p', 'sound-name');
    function draw(){
      name.textContent = state.audio ? ('🎵 ' + (state.audioName || '')) : T('screen.calm.soundNone');
      del.classList.toggle('hidden', !state.audio);
    }
    var row = api.el('div', 'btn-row');
    var pickBtn = P().btn(api, 'btn', '🎵 ' + T('screen.calm.soundPick'), function(){
      P().dropStaleFiles();   // 選ばずにやめた隠し input を消す(同じ作りの photo.js と同じ・2026-11-11)
      var inp = api.el('input', 'photo-file'); inp.type = 'file'; inp.accept = 'audio/*';
      inp.addEventListener('cancel', function(){ P().remove(inp); });
      inp.addEventListener('change', function(e){
        var f = e.target.files && e.target.files[0];
        try{ e.target.value = ''; }catch(_){}
        P().remove(inp);
        if(!f) return;
        if(f.size > MAX_AUDIO){ api.toast(T('screen.calm.soundTooBig')); return; }
        try{
          var r = new FileReader();
          r.onload = function(){ state.audio = String(r.result || ''); state.audioName = f.name || ''; draw(); P().touchForm(wrap); };   // 戻るボタンの書きかけ
          r.onerror = function(){ api.toast(T('screen.calm.soundFail')); };
          r.readAsDataURL(f);
        }catch(_){ api.toast(T('screen.calm.soundFail')); }
      });
      document.body.appendChild(inp);
      inp.click();
    });
    row.appendChild(pickBtn);
    var del = P().btn(api, 'btn', T('screen.calm.soundDel'), function(){ state.audio = ''; state.audioName = ''; draw(); P().touchForm(wrap); });
    row.appendChild(del);
    wrap.appendChild(name); wrap.appendChild(row);
    draw();
    return wrap;
  }

  function openEditor(api, items, item){
    var T = api.T;
    P().openForm(api, {
      title: T('screen.calm.formTitle'),
      photo: true, photoLabel: T('screen.calm.photoH'),
      fields: [{ key:'name', label:T('screen.calm.name'), ph:T('screen.calm.namePh'), type:'text' }],
      data: item || { id:P().newId(), name:'', img:'', audio:'', audioName:'' },
      extra: function(state){ return soundField(api, state); },
      onSave: function(d){
        if(!d.img && !d.audio){ api.toast(T('screen.calm.noContent')); return false; }
        var next = items.filter(function(x){ return x.id !== d.id; });
        if(item){ next.splice(items.indexOf(item), 0, d); } else { next.push(d); }
        if(!P().saveOrWarn(api, KEY, { items: next })) return false;
        api.toast(T('common.saved')); api.go('calm');
        return true;
      },
      onDelete: item ? function(){
        var next = items.filter(function(x){ return x.id !== item.id; });
        if(P().saveOrWarn(api, KEY, { items: next })){ api.toast(T('common.deleted')); api.go('calm'); }
      } : null
    });
  }

  /* 全画面: 写真は大きく・音はループ
     ・登録した音を鳴らす間は BGM を止めて重ねない(とじるで戻す。もしもカードの「緊急音優先」と同じ型) */
  function openView(api, item){
    var T = api.T;
    stopAudio();
    var ov = P().overlay(api, 'calm-ov');
    if(item.name) ov.appendChild(api.el('div', 'calm-name', item.name));
    if(item.img){ var im = api.el('img', 'calm-img'); im.src = item.img; im.alt = ''; ov.appendChild(im); }
    if(item.audio){
      var st = api.el('p', 'calm-sound-state');
      var row = api.el('div', 'btn-row');
      function fail(a){ if(cur !== a) return; stopAudio(); st.textContent = ''; api.toast(T('screen.calm.soundFail')); }
      function play(){
        if(typeof Audio === 'undefined') return;
        try{
          if(!cur){
            var a = cur = new Audio();
            try{ a.volume = VOLS[volIdx(api)]; }catch(_){}
            /* 長さが分かってから くりかえしにする(Chrome は 0秒の音でも最初は長さ Infinity と言い、あとで 0 に直す)
               ・長さ0は鳴らせない音として止める。ごく短い音は1回だけ。長さ不明(Infinity)のままの音は ended で頭から鳴らし直す */
            var judge = function(){
              if(cur !== a) return;
              var d = a.duration;
              if(!isFinite(d)) return;
              a.loop = d >= MIN_LOOP;
              if(!(d > 0)) fail(a);
            };
            a.addEventListener('loadedmetadata', judge);
            a.addEventListener('durationchange', judge);
            a.addEventListener('ended', function(){
              if(cur !== a) return;
              if(a.currentTime >= MIN_LOOP){ try{ a.currentTime = 0; var p2 = a.play(); if(p2 && p2.catch) p2.catch(function(){}); }catch(_){} return; }
              st.textContent = '';
            });
            a.addEventListener('error', function(){ fail(a); });
            a.src = item.audio;
          }
          var pr = cur.play(); if(pr && pr.catch) pr.catch(function(){});
          st.textContent = '🎵 ' + T('screen.calm.looping');
        }catch(_){ api.toast(T('screen.calm.soundFail')); }
      }
      function stop(){ stopAudio(); st.textContent = ''; }
      row.appendChild(P().btn(api, 'btn primary', T('screen.calm.play'), play));
      row.appendChild(P().btn(api, 'btn', T('screen.calm.stop'), stop));
      ov.appendChild(st); ov.appendChild(row);
      /* 音の大きさ(小・中・大): 選んだ段は光らせ(primary)、鳴っている音にもすぐ効かせる */
      var vlbl = api.el('p', 'hint calm-vol-label', T('screen.calm.vol'));
      var vrow = api.el('div', 'btn-row vol-row');
      var vbtns = [];
      function drawVol(){
        var i = volIdx(api);
        vbtns.forEach(function(b, k){ b.classList.toggle('primary', k === i); b.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
        if(cur){ try{ cur.volume = VOLS[i]; }catch(_){} }
      }
      T('screen.calm.vols').forEach(function(lbl, k){
        var b = P().btn(api, 'btn vol-btn', lbl, function(){ api.setExtra('calmVol', k); drawVol(); });
        b.setAttribute('data-vol', String(k));
        vbtns.push(b); vrow.appendChild(b);
      });
      vlbl.setAttribute('id', 'calm-vol-label');
      ov.appendChild(vlbl); ov.appendChild(vrow);
      drawVol();
      if(window.Sound) window.Sound.pauseBgm();
      play();
    }
    P().closeBtn(api, ov, T('common.close'), function(){
      stopAudio();
      if(item.audio && window.Sound) window.Sound.resumeBgm();
    });
    return ov;
  }

  window.SCREENS.register('calm', {
    render: function(c, api){
      var T = api.T;
      var items = loadItems(api);
      c.appendChild(api.el('h1', 'scr-title', '🌿 ' + T('screen.calm.title')));
      c.appendChild(api.el('p', 'hint', T('screen.calm.hint')));
      c.appendChild(P().btn(api, 'btn primary wide', '＋ ' + T('screen.calm.add'), function(){ openEditor(api, items, null); }));
      if(!items.length){ c.appendChild(api.el('p', 'empty', T('screen.calm.empty'))); return; }
      var ul = api.el('ul', 'list calm-list');
      items.forEach(function(it){
        /* タップ対象を入れ子にしない(Tapのバブリング二重発火を避ける): 開く領域と なおすボタンは兄弟 */
        var li = api.el('li', 'calm-item');
        var open = api.el('button', 'calm-open'); open.type = 'button';
        open.appendChild(P().thumb(api, it.img, it.audio ? '🎵' : '🌿'));
        var g = api.el('div', 'grow');
        g.appendChild(api.el('div', 'item-title', it.name || (it.audio ? (it.audioName || '🎵') : '🌿')));
        g.appendChild(api.el('div', 'hint', T('screen.calm.openHint')));
        open.appendChild(g);
        api.Tap.bind(open, function(){ openView(api, it); });
        li.appendChild(open);
        var eb = P().btn(api, 'btn small', '✎', function(){ openEditor(api, items, it); });
        eb.setAttribute('aria-label', T('common.edit'));   // 記号だけのボタンに読み上げ名(TalkBack)
        li.appendChild(eb);
        ul.appendChild(li);
      });
      c.appendChild(ul);
    }
  });
})();
