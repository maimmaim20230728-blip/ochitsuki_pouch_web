'use strict';
/* 画面: おちつく = 登録した写真と音をワンタップで全画面に出す
   ・保存キー calm.v1 = { items:[{ id, name, img(256px正方形 dataURL), audio(dataURL・2MBまで), audioName }] }
   ・音は端末の音声ファイルを <input type=file accept=audio/*> で選ぶ(file input だけネイティブ change)。全画面ではループ再生
   ・動画の区間くり返しは第2版(SPEC_V1.md) */
(function(){
  var KEY = 'calm.v1';
  var MAX_AUDIO = 2 * 1024 * 1024;
  var P = function(){ return window.POUCH_PARTS; };
  var cur = null;   // 再生中の Audio(全画面を閉じたら止める)

  function loadItems(api){ var d = api.load(KEY, null); return (d && Array.isArray(d.items)) ? d.items : []; }
  function stopAudio(){ if(cur){ try{ cur.pause(); cur.src = ''; }catch(_){} cur = null; } }

  /* 音の欄(フォームの extra): えらぶ / けす / いまの名前 */
  function soundField(api, state){
    var T = api.T;
    var wrap = api.el('div', 'field sound-field');
    wrap.appendChild(api.el('label', null, T('screen.calm.soundH')));
    var name = api.el('p', 'sound-name');
    function draw(){
      name.textContent = state.audio ? ('🎵 ' + (state.audioName || '')) : T('screen.calm.soundNone');
      del.classList.toggle('hidden', !state.audio);
    }
    var row = api.el('div', 'btn-row');
    var pickBtn = P().btn(api, 'btn', '🎵 ' + T('screen.calm.soundPick'), function(){
      var inp = api.el('input', 'photo-file'); inp.type = 'file'; inp.accept = 'audio/*';
      inp.addEventListener('change', function(e){
        var f = e.target.files && e.target.files[0];
        try{ e.target.value = ''; }catch(_){}
        P().remove(inp);
        if(!f) return;
        if(f.size > MAX_AUDIO){ api.toast(T('screen.calm.soundTooBig')); return; }
        try{
          var r = new FileReader();
          r.onload = function(){ state.audio = String(r.result || ''); state.audioName = f.name || ''; draw(); };
          r.onerror = function(){ api.toast(T('screen.calm.soundFail')); };
          r.readAsDataURL(f);
        }catch(_){ api.toast(T('screen.calm.soundFail')); }
      });
      document.body.appendChild(inp);
      inp.click();
    });
    row.appendChild(pickBtn);
    var del = P().btn(api, 'btn', T('screen.calm.soundDel'), function(){ state.audio = ''; state.audioName = ''; draw(); });
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

  /* 全画面: 写真は大きく・音はループ */
  function openView(api, item){
    var T = api.T;
    stopAudio();
    var ov = P().overlay(api, 'calm-ov');
    if(item.name) ov.appendChild(api.el('div', 'calm-name', item.name));
    if(item.img){ var im = api.el('img', 'calm-img'); im.src = item.img; im.alt = ''; ov.appendChild(im); }
    if(item.audio){
      var st = api.el('p', 'calm-sound-state');
      var row = api.el('div', 'btn-row');
      function play(){
        if(typeof Audio === 'undefined') return;
        try{
          if(!cur){ cur = new Audio(); cur.src = item.audio; cur.loop = true; }
          var pr = cur.play(); if(pr && pr.catch) pr.catch(function(){});
          st.textContent = '🎵 ' + T('screen.calm.looping');
        }catch(_){ api.toast(T('screen.calm.soundFail')); }
      }
      function stop(){ stopAudio(); st.textContent = ''; }
      row.appendChild(P().btn(api, 'btn primary', T('screen.calm.play'), play));
      row.appendChild(P().btn(api, 'btn', T('screen.calm.stop'), stop));
      ov.appendChild(st); ov.appendChild(row);
      play();
    }
    P().closeBtn(api, ov, T('common.close'), stopAudio);
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
        li.appendChild(P().btn(api, 'btn small', '✎', function(){ openEditor(api, items, it); }));
        ul.appendChild(li);
      });
      c.appendChild(ul);
    }
  });
})();
