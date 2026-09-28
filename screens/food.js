'use strict';
/* 画面: たべもの = 写真+商品名/メーカー/買える店/条件の名簿(追加・直す・けす)と「見せる」1画面(漢字・大きく)
   ・保存キー food.v1 = { items:[{ id, img, name, maker, shop, cond }] }
   ・写真カード部品(parts.js)を しぐさ と共用。アレルギーは もしもカードが正(ここには書かない) */
(function(){
  var KEY = 'food.v1';
  var P = function(){ return window.POUCH_PARTS; };
  function loadItems(api){ return P().cleanData(KEY, api.load(KEY, null)).items; }   // 壊れた形でも画面が壊れない(parts.js)

  function openEditor(api, items, item){
    var T = api.T;
    P().openForm(api, {
      title: T('screen.food.formTitle'),
      photo: true,
      fields: [
        { key:'name',  label:T('screen.food.name'),  ph:T('screen.food.namePh'),  type:'text' },
        { key:'maker', label:T('screen.food.maker'), ph:T('screen.food.makerPh'), type:'text' },
        { key:'shop',  label:T('screen.food.shop'),  ph:T('screen.food.shopPh'),  type:'text' },
        { key:'cond',  label:T('screen.food.cond'),  ph:T('screen.food.condPh'),  type:'textarea' }
      ],
      data: item || { id:P().newId(), img:'', name:'', maker:'', shop:'', cond:'' },
      onSave: function(d){
        if(!d.img && !d.name && !d.maker && !d.shop && !d.cond){ api.toast(T('common.parts.needOne')); return false; }
        var next = items.filter(function(x){ return x.id !== d.id; });
        if(item){ next.splice(items.indexOf(item), 0, d); } else { next.push(d); }
        if(!P().saveOrWarn(api, KEY, { items: next })) return false;
        api.toast(T('common.saved')); api.go('food');
        return true;
      },
      onDelete: item ? function(){
        var next = items.filter(function(x){ return x.id !== item.id; });
        if(P().saveOrWarn(api, KEY, { items: next })){ api.toast(T('common.deleted')); api.go('food'); }
      } : null
    });
  }

  /* 見せる: 全件を漢字・大きな文字で(避難所・預け先の相手が読む) */
  function openShow(api, items){
    var T = api.T;
    var blocks = [];
    items.forEach(function(it){
      var lines = [];
      if(it.maker) lines.push(T('screen.food.showMaker') + ': ' + it.maker);
      if(it.shop) lines.push(T('screen.food.showShop') + ': ' + it.shop);
      if(it.cond) lines.push(T('screen.food.showCond') + ': ' + it.cond);
      blocks.push({ head: it.name || '', img: it.img, value: lines.join('\n') });
    });
    P().openShow(api, { title: T('screen.food.showTitle'), blocks: blocks, note: T('common.parts.showHint') });
  }

  window.SCREENS.register('food', {
    render: function(c, api){
      var T = api.T;
      var items = loadItems(api);
      c.appendChild(api.el('h1', 'scr-title', '🍙 ' + T('screen.food.title')));
      c.appendChild(api.el('p', 'hint', T('screen.food.hint')));
      var row = api.el('div', 'btn-row');
      var sb = P().btn(api, 'btn primary', '📣 ' + T('screen.food.show'), function(){ openShow(api, items); });
      sb.setAttribute('id', 'food-show'); sb.disabled = !items.length; sb.classList.toggle('dim', !items.length);
      var ab = P().btn(api, 'btn', '＋ ' + T('screen.food.add'), function(){ openEditor(api, items, null); });
      ab.setAttribute('id', 'food-add');
      row.appendChild(sb); row.appendChild(ab);
      c.appendChild(row);
      c.appendChild(api.el('p', 'note', T('screen.food.allergy')));
      if(!items.length){ c.appendChild(api.el('p', 'empty', T('screen.food.empty'))); return; }
      var ul = api.el('ul', 'list');
      items.forEach(function(it){
        var li = api.el('li', 'tappable item-li');
        li.appendChild(P().thumb(api, it.img, '🍙'));
        var g = api.el('div', 'grow');
        g.appendChild(api.el('div', 'item-title', it.name || it.maker || it.shop || '(' + T('screen.food.name') + ')'));
        var sub = [it.maker, it.shop].filter(Boolean).join(' / ');
        if(sub) g.appendChild(api.el('div', 'hint', sub));
        li.appendChild(g);
        li.appendChild(api.el('span', 'edit-mark', '✎'));
        api.Tap.bind(li, function(){ openEditor(api, items, it); });
        ul.appendChild(li);
      });
      c.appendChild(ul);
    }
  });
})();
