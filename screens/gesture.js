'use strict';
/* 画面: しぐさ = 写真(任意)+しぐさ・持ってくる物・声+意味+効いた関わりの辞典(追加・直す・けす)と「見せる」1画面
   ・保存キー gesture.v1 = { items:[{ id, img, sign, meaning, worked }] }
   ・写真カード部品(parts.js)を たべもの と共用。例文はそよぎの言葉で書き下ろし(i18n.js) */
(function(){
  var KEY = 'gesture.v1';
  var P = function(){ return window.POUCH_PARTS; };
  function loadItems(api){ var d = api.load(KEY, null); return (d && Array.isArray(d.items)) ? d.items : []; }

  function openEditor(api, items, item){
    var T = api.T;
    P().openForm(api, {
      title: T('screen.gesture.formTitle'),
      photo: true,
      fields: [
        { key:'sign',    label:T('screen.gesture.sign'),    ph:T('screen.gesture.signPh'),    type:'text' },
        { key:'meaning', label:T('screen.gesture.meaning'), ph:T('screen.gesture.meaningPh'), type:'text' },
        { key:'worked',  label:T('screen.gesture.worked'),  ph:T('screen.gesture.workedPh'),  type:'textarea' }
      ],
      data: item || { id:P().newId(), img:'', sign:'', meaning:'', worked:'' },
      onSave: function(d){
        if(!d.img && !d.sign && !d.meaning && !d.worked){ api.toast(T('common.parts.needOne')); return false; }
        var next = items.filter(function(x){ return x.id !== d.id; });
        if(item){ next.splice(items.indexOf(item), 0, d); } else { next.push(d); }
        if(!P().saveOrWarn(api, KEY, { items: next })) return false;
        api.toast(T('common.saved')); api.go('gesture');
        return true;
      },
      onDelete: item ? function(){
        var next = items.filter(function(x){ return x.id !== item.id; });
        if(P().saveOrWarn(api, KEY, { items: next })){ api.toast(T('common.deleted')); api.go('gesture'); }
      } : null
    });
  }

  /* 見せる: 全件を漢字・大きな文字で(初めて関わる支援者が読む) */
  function openShow(api, items){
    var T = api.T;
    var blocks = [];
    items.forEach(function(it){
      var lines = [];
      if(it.meaning) lines.push(T('screen.gesture.showMeaning') + ': ' + it.meaning);
      if(it.worked) lines.push(T('screen.gesture.showWorked') + ': ' + it.worked);
      blocks.push({ label: it.sign ? T('screen.gesture.showSign') : '', head: it.sign || '', img: it.img, value: lines.join('\n') });
    });
    P().openShow(api, { title: T('screen.gesture.showTitle'), blocks: blocks, note: T('common.parts.showHint') });
  }

  window.SCREENS.register('gesture', {
    render: function(c, api){
      var T = api.T;
      var items = loadItems(api);
      c.appendChild(api.el('h1', 'scr-title', '🤲 ' + T('screen.gesture.title')));
      c.appendChild(api.el('p', 'hint', T('screen.gesture.hint')));
      var row = api.el('div', 'btn-row');
      var sb = P().btn(api, 'btn primary', '📣 ' + T('screen.gesture.show'), function(){ openShow(api, items); });
      sb.setAttribute('id', 'gesture-show'); sb.disabled = !items.length; sb.classList.toggle('dim', !items.length);
      var ab = P().btn(api, 'btn', '＋ ' + T('screen.gesture.add'), function(){ openEditor(api, items, null); });
      ab.setAttribute('id', 'gesture-add');
      row.appendChild(sb); row.appendChild(ab);
      c.appendChild(row);
      if(!items.length){ c.appendChild(api.el('p', 'empty', T('screen.gesture.empty'))); return; }
      var ul = api.el('ul', 'list');
      items.forEach(function(it){
        var li = api.el('li', 'tappable item-li');
        li.appendChild(P().thumb(api, it.img, '🤲'));
        var g = api.el('div', 'grow');
        g.appendChild(api.el('div', 'item-title', it.sign || '(' + T('screen.gesture.sign') + ')'));
        if(it.meaning) g.appendChild(api.el('div', 'hint', '→ ' + it.meaning));
        li.appendChild(g);
        li.appendChild(api.el('span', 'edit-mark', '✎'));
        api.Tap.bind(li, function(){ openEditor(api, items, it); });
        ul.appendChild(li);
      });
      c.appendChild(ul);
    }
  });
})();
