'use strict';
/* 画面: ホーム = 大ボタン4つ(おちつく/さがす/たべもの/しぐさ)+「きょうの1枚」を撮る入口
   ・文言は api.T('screen.home.*')。操作は api.Tap.bind(click禁止)。画面遷移は api.go('<id>')
   ・きょうの1枚は screens/parts.js(POUCH_PARTS.takeToday)で撮り、さがす画面と同じ保存キー today.v1 */
(function(){
  var P = function(){ return window.POUCH_PARTS; };

  window.SCREENS.register('home', {
    render: function(c, api){
      var T = api.T;
      c.appendChild(api.el('h1', 'scr-title', T('screen.home.title')));
      c.appendChild(api.el('p', 'tagline', T('app.tagline')));

      /* 大ボタン4つ */
      var grid = api.el('div', 'grid2 home-grid');
      [
        { id:'calm',    ico:'🌿', cls:'primary' },
        { id:'search',  ico:'🔍', cls:'alert' },
        { id:'food',    ico:'🍙', cls:'' },
        { id:'gesture', ico:'🤲', cls:'' }
      ].forEach(function(d){
        var b = api.el('button', 'big-btn home-btn ' + d.cls); b.type = 'button';
        b.setAttribute('id', 'home-' + d.id);
        b.appendChild(api.el('span', 'ico', d.ico));
        b.appendChild(api.el('span', 'lbl', T('screen.home.' + d.id)));
        b.appendChild(api.el('span', 'sub', T('screen.home.' + d.id + 'Sub')));
        api.Tap.bind(b, function(){ api.go(d.id); });
        grid.appendChild(b);
      });
      c.appendChild(grid);

      /* きょうの1枚 */
      var card = api.el('div', 'card today-card');
      card.appendChild(api.el('h2', 'sec-h today-h', '📷 ' + T('screen.home.todayH')));
      var today = P().loadToday(api);
      if(today){
        var im = api.el('img', 'today-img'); im.src = today.img; im.alt = '';
        card.appendChild(im);
        card.appendChild(api.el('p', 'today-date', P().fmt(T('screen.home.todayHas'), { d: today.date })));
        /* 「かえってきた」を押し忘れた前の日の写真: 出かける前に撮り直すよう知らせる */
        if(!P().isTodayFresh(today)) card.appendChild(api.el('p', 'note today-old', T('common.parts.todayOld')));
        var row = api.el('div', 'btn-row');
        row.appendChild(P().btn(api, 'btn', '📷 ' + T('screen.home.todayRetake'), function(){ P().takeToday(api, function(){ api.go('home'); }); }));
        row.appendChild(P().btn(api, 'btn primary', '🔍 ' + T('screen.home.search'), function(){ api.go('search'); }));
        card.appendChild(row);
      } else {
        var b = api.el('button', 'big-btn wide'); b.type = 'button'; b.setAttribute('id', 'home-today');
        b.appendChild(api.el('span', 'ico', '📷'));
        b.appendChild(api.el('span', 'lbl', T('screen.home.todayTake')));
        api.Tap.bind(b, function(){ P().takeToday(api, function(){ api.go('home'); }); });
        card.appendChild(b);
      }
      /* きょうの服装メモ(任意・2026-11-11): 写真だけでは靴や帽子が読み取りにくいので、一言を今日の1枚に添えて残す。
         書いたそばから静かに自動保存(さがすの特徴欄と同じ)。「さがす」の特徴欄へは、そちらのボタンで足せる。
         入れたらすぐ保存される欄なので、戻るボタンの「書きかけ」には数えない(data-nodirty) */
      if(today){
        var mf = api.el('div', 'field memo-field');
        mf.setAttribute('data-nodirty', '1');
        var ml = api.el('label', null, T('screen.home.memoH'));
        ml.setAttribute('for', 'home-memo');
        var mi = api.el('input'); mi.type = 'text'; mi.className = 'fld'; mi.setAttribute('id', 'home-memo');
        mi.setAttribute('dir', 'auto'); mi.setAttribute('maxlength', String(P().MEMO_MAX));
        mi.placeholder = T('screen.home.memoPh'); mi.value = today.memo || '';
        var memoWarned = false;
        mi.addEventListener('input', function(){   // 文字入力の通知(タップ操作ではない)
          var cur = P().loadToday(api);
          if(!cur) return;
          var m = String(mi.value || '').trim().slice(0, P().MEMO_MAX);
          if(m) cur.memo = m; else delete cur.memo;
          if(api.save(P().TODAY_KEY, cur)){ memoWarned = false; return; }
          if(!memoWarned){ memoWarned = true; api.toast(T('common.storageFull')); }
        });
        mf.appendChild(ml); mf.appendChild(mi);
        card.appendChild(mf);
      }
      card.appendChild(api.el('p', 'hint', T('screen.home.todayHint')));
      c.appendChild(card);

      c.appendChild(api.el('p', 'note', T('screen.home.note')));
      /* SPEC: 付き添いの支援者は事業所の端末で(私物に利用者の写真を残さない)。支援者が読む文なので漢字 */
      c.appendChild(api.el('p', 'hint staff-note', T('screen.home.staffNote')));
    }
  });
})();
