'use strict';
/* 画面: さがす = 今日の全身写真(きょうの1枚)+ふだんの特徴+接し方を全画面で見せる/2つの手順を1画面1ステップ
   ・保存キー person.v1 = { feat, appr, contact } / today.v1 は parts.js と共用(ホームでも撮れる)
   ・見せる画面と手順は漢字・大きな文字(相手が読む)。操作文言はひらがな主体(家族が読む)
   ・警察(110)と緊急連絡先は tel: リンクの発信ボタン(もしもカードの方式)
   ・「見つかる」「防げる」と書かない。「迷ったら早めに110番」の一般案内にとどめ、判断は指示しない */
(function(){
  var KEY = 'person.v1';
  var P = function(){ return window.POUCH_PARTS; };

  function loadPerson(api){ return P().cleanData(KEY, api.load(KEY, null)); }
  /* 連絡先の文から電話番号を取り出す。日本語入力の全角数字・長音符などのハイフンも読めるよう、先に半角へそろえる */
  function extractPhone(text){
    var s = String(text || '');
    try{ s = s.normalize('NFKC'); }catch(_){}
    s = s.replace(/[ー‐‑‒–―−]/g, '-');
    var m = s.match(/\+?\d[\d\-().\s]{5,}\d/);
    return m ? m[0].replace(/[^\d+]/g, '') : null;
  }

  /* 見せる(全画面・白地・漢字) */
  function openShow(api){
    var T = api.T;
    var p = loadPerson(api), today = P().loadToday(api);
    var blocks = [];
    /* 前の日に撮った写真は「今日の服装」と書かず、撮った日を出す */
    if(today) blocks.push({ label: P().isTodayFresh(today) ? (T('screen.search.showToday') + ' ' + today.date) : P().fmt(T('screen.search.showTodayOld'), { d: today.date }), img: today.img });
    else blocks.push({ label: T('screen.search.showToday'), value: T('screen.search.showTodayNone') });
    if(p.feat) blocks.push({ label: T('screen.search.showFeat'), value: p.feat });
    if(p.appr) blocks.push({ label: T('screen.search.showAppr'), value: p.appr });
    if(p.contact){
      var tel = extractPhone(p.contact);
      blocks.push({ label: T('screen.search.showContact'), value: p.contact, tel: tel, telLabel: '📞 ' + T('screen.search.call') });
    }
    P().openShow(api, { title: T('screen.search.showTitle'), blocks: blocks, note: T('common.parts.showHint') });
  }

  /* 手順の文が「この画面の写真を見せます」と言う段(昼1枚目・夜4枚目)には、見せる画面を重ねて開くボタンを出す */
  function openStepsDay(api){
    var T = api.T;
    P().openSteps(api, { title: T('screen.search.stepsDayTitle'), steps: T('screen.search.stepsDay'),
      tel: { 3:'110' }, telLabel: '📞 ' + T('screen.search.call110'),
      show: { 0:true }, showLabel: '📣 ' + T('screen.search.show'), onShow: function(){ openShow(api); },
      note: T('screen.search.stepsNote') });
  }
  function openStepsNight(api){
    var T = api.T;
    P().openSteps(api, { title: T('screen.search.stepsNightTitle'), steps: T('screen.search.stepsNight'),
      tel: { 2:'110', 3:'110' }, telLabel: '📞 ' + T('screen.search.call110'),
      show: { 3:true }, showLabel: '📣 ' + T('screen.search.show'), onShow: function(){ openShow(api); },
      note: T('screen.search.stepsNote') });
  }

  window.SCREENS.register('search', {
    render: function(c, api){
      var T = api.T;
      var p = loadPerson(api);
      var today = P().loadToday(api);
      c.appendChild(api.el('h1', 'scr-title', '🔍 ' + T('screen.search.title')));
      c.appendChild(api.el('p', 'hint', T('screen.search.hint')));

      /* 見せる・手順(いちばん上=考える余裕のない瞬間に押す) */
      var show = api.el('button', 'big-btn primary wide'); show.type = 'button'; show.setAttribute('id', 'search-show');
      show.appendChild(api.el('span', 'ico', '📣'));
      show.appendChild(api.el('span', 'lbl', T('screen.search.show')));
      api.Tap.bind(show, function(){ openShow(api); });
      c.appendChild(show);
      var srow = api.el('div', 'btn-row steps-row');
      var sd = P().btn(api, 'btn', '☀ ' + T('screen.search.stepsDayBtn'), function(){ openStepsDay(api); }); sd.setAttribute('id', 'search-steps-day');
      var sn = P().btn(api, 'btn', '🌙 ' + T('screen.search.stepsNightBtn'), function(){ openStepsNight(api); }); sn.setAttribute('id', 'search-steps-night');
      srow.appendChild(sd); srow.appendChild(sn);
      c.appendChild(srow);

      /* きょうの1枚 */
      var card = api.el('div', 'card today-card');
      card.appendChild(api.el('h2', 'sec-h today-h', '📷 ' + T('screen.search.todayH')));
      if(today){
        var im = api.el('img', 'today-img'); im.src = today.img; im.alt = '';
        card.appendChild(im);
        card.appendChild(api.el('p', 'today-date', today.date));
        if(!P().isTodayFresh(today)) card.appendChild(api.el('p', 'note today-old', T('common.parts.todayOld')));
        /* 探している最中の押し間違いで いちばん大事な写真を失わないよう、ほかの「けす」と同じく はい/いいえ を挟む */
        var hb = P().btn(api, 'btn wide', '🏠 ' + T('screen.search.home'), function(){
          P().confirmDel(api, function(){ P().clearToday(api); api.toast(T('screen.search.homeDone')); api.go('search'); });
        });
        hb.setAttribute('id', 'search-home');
        card.appendChild(hb);
      } else {
        card.appendChild(api.el('p', 'hint', T('screen.search.todayNone')));
        var tb = P().btn(api, 'btn primary wide', '📷 ' + T('screen.search.todayTake'), function(){ P().takeToday(api, function(){ api.go('search'); }); });
        tb.setAttribute('id', 'search-take');
        card.appendChild(tb);
      }
      c.appendChild(card);

      /* ふだんの特徴・接し方・連絡先
         ・書いたそばから静かに自動保存(ほぞんするの押し忘れで、見せる画面に出ない・画面を移ると消える、を防ぐ)。
           「ほぞんする」は保存できた実感のため残す(もしもカードと同じ) */
      var fe, ap, ct;
      function collect(){ return { feat: String(fe.value || '').trim(), appr: String(ap.value || '').trim(), contact: String(ct.value || '').trim() }; }
      function autoSave(){ if(fe && ap && ct) api.save(KEY, collect()); }
      function field(key, label, ph, hint, textarea){
        var fl = api.el('div', 'field');
        fl.appendChild(api.el('label', null, label));
        if(hint) fl.appendChild(api.el('p', 'hint', hint));
        var inp = textarea ? api.el('textarea') : api.el('input');
        if(textarea) inp.rows = 4; else inp.type = 'text';
        inp.className = 'fld'; inp.setAttribute('data-key', key); inp.setAttribute('id', 'search-' + key);
        inp.setAttribute('dir', 'auto');   // RTL(ar)でも日本語の入力は左→右のまま
        inp.placeholder = ph; inp.value = p[key] || '';
        inp.addEventListener('input', autoSave);   // 文字入力の通知(タップ操作ではない)
        fl.appendChild(inp);
        c.appendChild(fl);
        return inp;
      }
      fe = field('feat', T('screen.search.featH'), T('screen.search.featPh'), T('screen.search.featHint'), true);
      ap = field('appr', T('screen.search.apprH'), T('screen.search.apprPh'), '', true);
      ct = field('contact', T('screen.search.contactH'), T('screen.search.contactPh'), '', false);
      var sv = P().btn(api, 'btn primary wide', '✓ ' + T('screen.search.save'), function(){
        if(P().saveOrWarn(api, KEY, collect())) api.toast(T('common.saved'));
      });
      sv.setAttribute('id', 'search-save');
      c.appendChild(sv);
      c.appendChild(api.el('p', 'hint', T('common.optional')));
    }
  });
})();
