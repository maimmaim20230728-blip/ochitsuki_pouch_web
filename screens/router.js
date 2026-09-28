'use strict';
/* 画面ルーター(レジストリ)。共有ファイル=画面の担当者は書き換えない。
   各画面(screens/<id>.js)は起動時に1回だけ
     window.SCREENS.register('<id>', { render(container, api){ ... } });
   を呼ぶ。render は その画面が表示されるたびに app.js から呼ばれる(container は空にしてから渡される)。
   api は app.js の screenApi() の最小セットのみ。画面同士・シェルの内部状態は共有しない。 */
(function(){
  var registry = {};
  function register(id, mod){
    if(!id || !mod || typeof mod.render !== 'function'){
      console.error('SCREENS.register: render(container, api) を持つモジュールが必要です → ' + id);
      return;
    }
    registry[id] = mod;
  }
  function get(id){ return registry[id] || null; }
  function ids(){ return Object.keys(registry); }
  window.SCREENS = { register: register, get: get, ids: ids };
})();
