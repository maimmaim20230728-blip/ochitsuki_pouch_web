'use strict';
/* おちつきポーチ(仮) 本体シェル(そよぎアプリ・キット v1)
   ・端末内だけに保存(localStorage・キーは「pouch.」で始まる)・完全オフライン・匿名・広告なし
   ・click禁止: 操作は全て Tap.bind(tap.js)。select / file input だけはネイティブイベント
   ・画面は screens/<id>.js が window.SCREENS.register('<id>', { render(container, api) }) で登録する
     (会話補助ノートと同じ取り決め。画面同士・シェルの内部状態は共有しない)
   ・api = { T, el, pref, toast, go, Tap, Photo, load, save, remove, getExtra, setExtra, speak, stopSpeak, vibrate, lang, rtl, ver, appKey }
   ・🔴 BUILDER: アプリ固有の処理は screens/*.js に書く。このファイルは共通部分なので最小限の変更にとどめ、
     変えたら README の「シェルの変更点」に書く */
(function(){

var VER = '0.3.1';                // 🔴 更新のたびに上げる(build.gradle の versionName / sw.js の CACHE と一緒に)
var APP_KEY = 'ochitsuki_pouch';        // バックアップの識別(別アプリのファイルを読まない)
var LS = 'pouch.';
var LS_PREF = LS + 'pref.v1';
var LANGS = ['ja','en','de','fr','es','it','pt','nl','sv','ko','zh','ar'];
var RTL_LANGS = ['ar'];
var THEMES = ['green','aqua','white','dark'];
var BGMS = ['off','green','blue'];
var DEFAULT_THEME = 'aqua';
var DEFAULT_BGM = 'green';
var TTS_LANG = { ja:'ja-JP', en:'en-US', de:'de-DE', fr:'fr-FR', es:'es-ES', it:'it-IT', pt:'pt-PT', nl:'nl-NL', sv:'sv-SE', ko:'ko-KR', zh:'zh-CN', ar:'ar-SA' };

var $ = function(id){ return document.getElementById(id); };

/* ---- 保存(端末内のみ) ---- */
function loadJSON(key){ try{ var s = localStorage.getItem(key); return s ? JSON.parse(s) : null; }catch(_){ return null; } }
function saveJSON(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); return true; }catch(_){ return false; } }
function removeKey(key){ try{ localStorage.removeItem(key); }catch(_){} }

function detectLang(){
  try{ var n = String((navigator && navigator.language) || 'ja').slice(0, 2).toLowerCase(); return LANGS.indexOf(n) >= 0 ? n : 'ja'; }
  catch(_){ return 'ja'; }
}
/* prefは常にホワイトリスト経由(バックアップ読み込みでも同じ道) */
function sanitizePref(p){
  p = p || {};
  return {
    lang:  LANGS.indexOf(p.lang) >= 0 ? p.lang : detectLang(),
    fs:    [0,1,2].indexOf(p.fs) >= 0 ? p.fs : 0,
    theme: THEMES.indexOf(p.theme) >= 0 ? p.theme : DEFAULT_THEME,
    bgm:   BGMS.indexOf(p.bgm) >= 0 ? p.bgm : DEFAULT_BGM,
    sound: (p.sound === undefined) ? true : !!p.sound,
    extra: (p.extra && typeof p.extra === 'object' && !Array.isArray(p.extra)) ? p.extra : {}   // 画面側の小さな設定(api.setExtra)
  };
}
var pref = sanitizePref(loadJSON(LS_PREF));
function savePref(){ saveJSON(LS_PREF, pref); }
function next(list, cur){ return list[(list.indexOf(cur) + 1) % list.length]; }

/* ---- i18n ---- */
function walk(obj, key){
  return key.split('.').reduce(function(a, c){ return (a && a[c] !== undefined) ? a[c] : undefined; }, obj);
}
function T(key){
  var tbl = window.POUCH_I18N || {};
  var v = walk(tbl[pref.lang] || tbl.ja || {}, key);
  if(v === undefined) v = walk(tbl.ja || {}, key);
  return (v === undefined) ? key : v;
}
/* 静的要素id → i18nキー(疑似DOMスモークで機械検証できるよう明示マップ方式) */
var I18N_MAP = {
  'hd-title':'app.name',
  'set-h-normal':'set.hNormal', 'set-h-backup':'set.hBackup',
  'lbl-fs':'set.fs', 'lbl-theme':'set.theme', 'lbl-bgm':'set.bgm', 'lbl-sound':'set.sound',
  'bk-hint':'set.bkHint', 'bk-export':'set.bkExport', 'bk-import':'set.bkImport',
  'set-note':'set.note', 'link-privacy':'set.privacy', 'about-credit':'set.credit'
};
function applyI18n(){
  for(var id in I18N_MAP){ var e = $(id); if(e) e.textContent = T(I18N_MAP[id]); }
  var navs = document.querySelectorAll('.nav-btn');
  for(var i = 0; i < navs.length; i++){
    var scr = navs[i].getAttribute('data-scr');
    if(scr) navs[i].textContent = T('nav.' + scr);
  }
  document.documentElement.lang = pref.lang;
  document.documentElement.dir = (RTL_LANGS.indexOf(pref.lang) >= 0) ? 'rtl' : 'ltr';
  if($('btn-fs'))    $('btn-fs').textContent    = T('set.fsSizes')[pref.fs];
  if($('btn-theme')) $('btn-theme').textContent = T('set.themes')[THEMES.indexOf(pref.theme)];
  if($('btn-bgm'))   $('btn-bgm').textContent   = T('set.bgms')[BGMS.indexOf(pref.bgm)];
  if($('btn-sound')) $('btn-sound').textContent = pref.sound ? T('set.on') : T('set.off');
  if($('about-ver')) $('about-ver').textContent = 'v' + VER;
  document.title = T('app.name');
  if(current !== 'set') renderScreen(current);   // 表示中の画面も訳し直す
  applyBarSpace();
}

/* ---- 見た目/音 ---- */
function applyTheme(){ document.body.setAttribute('data-theme', pref.theme); }
function applyBodyClass(){ document.body.className = 'fs' + pref.fs; }
function applySound(startNow){
  Sound.setEnabled(pref.sound);
  if(pref.bgm !== 'off') Sound.setBgmMode(pref.bgm);
  Sound.setBgmEnabled(pref.bgm !== 'off', startNow);   // 起動時は startNow=false(勝手に鳴らさない)
}
function applyAll(startNow){
  applyBodyClass();
  applyTheme();
  applySound(startNow);
  if($('set-lang')) $('set-lang').value = pref.lang;
  applyI18n();
}

/* ---- 下ナビの実寸をCSS変数へ(セーフエリア対応・トースト位置等に使う) ---- */
function applyBarSpace(){
  var st = document.documentElement && document.documentElement.style;
  if(!st || !st.setProperty) return;
  var bar = $('navbar');
  if(!bar || !bar.getBoundingClientRect) return;
  var h = Math.ceil(bar.getBoundingClientRect().height);
  if(h > 0) st.setProperty('--tabbar-h', h + 'px');
}
function watchBarSpace(){
  var bar = $('navbar');
  if(!bar || typeof ResizeObserver === 'undefined') return false;
  try{ new ResizeObserver(applyBarSpace).observe(bar); return true; }catch(_){ return false; }
}

/* ---- 小さなDOMヘルパー(画面側にも渡す) ---- */
function el(tag, cls, txt){
  var e = document.createElement(tag);
  if(cls) e.className = cls;
  if(txt != null) e.textContent = txt;
  return e;
}

/* ---- 読み上げ(任意。Play版のWebViewはWeb Speech API非対応なのでネイティブへ橋渡し) ---- */
var NATIVE_TTS = (function(){
  try{
    var c = window.Capacitor;
    if(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform() && typeof c.registerPlugin === 'function'){
      return c.registerPlugin('TextToSpeech');
    }
  }catch(_){}
  return null;
})();
function speak(text, opts){
  if(!text) return false;
  var o = opts || {};
  var tag = TTS_LANG[o.lang || pref.lang] || 'ja-JP';
  var rate = o.rate || 1;
  if(NATIVE_TTS){
    try{
      NATIVE_TTS.stop().catch(function(){}).then(function(){
        NATIVE_TTS.speak({ text:String(text), lang:String(tag), rate:rate, pitch:1.0, volume:1.0 }).catch(function(){});
      });
    }catch(_){}
    return true;
  }
  if(typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  try{
    var synth = window.speechSynthesis; synth.cancel();
    var u = new SpeechSynthesisUtterance(String(text));
    u.lang = tag; u.rate = rate;
    try{
      var vs = synth.getVoices() || [];
      var pre = String(tag).split('-')[0].toLowerCase();
      var v = vs.filter(function(x){ return x.lang && x.lang.toLowerCase() === String(tag).toLowerCase() && x.localService; })[0]
           || vs.filter(function(x){ return x.lang && x.lang.toLowerCase() === String(tag).toLowerCase(); })[0]
           || vs.filter(function(x){ return x.lang && x.lang.toLowerCase().indexOf(pre) === 0; })[0];
      if(v) u.voice = v;
    }catch(_){}
    if(o.onend) u.onend = o.onend;
    synth.speak(u);
    return true;
  }catch(_){ return false; }
}
function stopSpeak(){
  try{ if(NATIVE_TTS) NATIVE_TTS.stop().catch(function(){}); }catch(_){}
  try{ if(typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }catch(_){}
}
function canSpeak(){ return !!(NATIVE_TTS || (typeof window !== 'undefined' && 'speechSynthesis' in window)); }
/* 無音の振動(Android。iOS Safariでは動かない) */
function vibrate(pattern){
  try{ if(navigator && typeof navigator.vibrate === 'function') return !!navigator.vibrate(pattern || 60); }catch(_){}
  return false;
}

/* ---- 画面(screens/*.js が登録) ---- */
var current = 'home';
function screenApi(){
  return {
    T: T,
    el: el,
    pref: Object.assign({}, pref),      // 読み取り専用スナップショット
    toast: toast,
    go: showScreen,
    Tap: window.Tap,
    Photo: window.Photo || null,
    load: function(k, d){ var v = loadJSON(LS + k); return (v === null) ? ((d === undefined) ? null : d) : v; },
    save: function(k, v){ return saveJSON(LS + k, v); },   // false=容量オーバー等(呼び出し側で通知して取消)
    remove: function(k){ removeKey(LS + k); },
    getExtra: function(k, d){ return (pref.extra[k] === undefined) ? d : pref.extra[k]; },
    setExtra: function(k, v){ pref.extra[k] = v; savePref(); },
    speak: speak, stopSpeak: stopSpeak, canSpeak: canSpeak, vibrate: vibrate,
    lang: pref.lang,
    rtl: RTL_LANGS.indexOf(pref.lang) >= 0,
    ver: VER,
    appKey: APP_KEY
  };
}
function renderScreen(id){
  if(id === 'set') return;
  var c = $('scr-' + id);
  if(!c) return;
  c.textContent = '';
  var mod = window.SCREENS && window.SCREENS.get(id);
  if(mod){
    try{ mod.render(c, screenApi()); }
    catch(err){ console.error('screen render error:', id, err); c.appendChild(el('p', 'hint', '(screen error: ' + id + ')')); }
  } else {
    c.appendChild(el('p', 'hint', '(未登録の画面: ' + id + ')'));
  }
}
function showScreen(id){
  current = id;
  var secs = document.querySelectorAll('.screen');
  for(var i = 0; i < secs.length; i++){
    secs[i].classList.toggle('hidden', secs[i].getAttribute('data-scr') !== id);
  }
  var navs = document.querySelectorAll('.nav-btn');
  for(var j = 0; j < navs.length; j++){
    navs[j].classList.toggle('active', navs[j].getAttribute('data-scr') === id);
  }
  if(id !== 'set') renderScreen(id);
  try{ if($('main')) $('main').scrollTop = 0; }catch(_){}
}

/* ---- 機種変更(バックアップ): このアプリの保存キー全部を1ファイルに ---- */
function exportBackup(){
  var data = { app: APP_KEY, ver: 1, exported: Date.now(), pref: pref, data: {} };
  try{
    for(var i = 0; i < localStorage.length; i++){
      var k = localStorage.key(i);
      if(k && k.indexOf(LS) === 0 && k !== LS_PREF) data.data[k.slice(LS.length)] = loadJSON(k);
    }
  }catch(_){}
  var blob = new Blob([JSON.stringify(data)], { type:'application/json' });
  var a = document.createElement('a');
  var d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = APP_KEY + '-backup-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 3000);
  toast(T('set.exported'));
}
function importBackup(e){
  var f = e.target.files && e.target.files[0];
  if(!f) return;
  var r = new FileReader();
  r.onload = function(){
    try{
      var d = JSON.parse(r.result);
      if(d.app !== APP_KEY) throw new Error('different app');
      if(d.data && typeof d.data === 'object'){ for(var k in d.data){ saveJSON(LS + k, d.data[k]); } }
      pref = sanitizePref(d.pref);
      savePref();
      applyAll(true);
      toast(T('set.imported'));
    }catch(err){ toast(T('set.importFail')); }
  };
  r.readAsText(f);
  e.target.value = '';
}

/* ---- トースト ---- */
var toastTimer = 0;
function toast(msg){
  var t = $('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove('show'); }, 1800);
}

/* ---- 初期化 ---- */
function init(){
  var navs = document.querySelectorAll('.nav-btn');
  for(var i = 0; i < navs.length; i++){
    (function(b){ Tap.bind(b, function(){ showScreen(b.getAttribute('data-scr')); }); })(navs[i]);
  }
  Tap.bind($('hd-title'), function(){ showScreen('home'); });   // 名前タップ=いつでもホームへ

  Tap.bind($('btn-fs'), function(){ pref.fs = (pref.fs + 1) % 3; applyBodyClass(); savePref(); applyI18n(); });
  Tap.bind($('btn-theme'), function(){ pref.theme = next(THEMES, pref.theme); applyTheme(); savePref(); applyI18n(); });
  Tap.bind($('btn-bgm'), function(){ pref.bgm = next(BGMS, pref.bgm); applySound(true); savePref(); applyI18n(); });
  Tap.bind($('btn-sound'), function(){ pref.sound = !pref.sound; Sound.setEnabled(pref.sound); savePref(); applyI18n(); });
  if($('set-lang')) $('set-lang').addEventListener('change', function(){ pref.lang = $('set-lang').value; savePref(); applyI18n(); });
  Tap.bind($('bk-export'), exportBackup);
  Tap.bind($('bk-import'), function(){ $('bk-file').click(); });
  if($('bk-file')) $('bk-file').addEventListener('change', importBackup);

  applyAll(false);
  showScreen('home');

  applyBarSpace();
  watchBarSpace();
  if(typeof window !== 'undefined' && window.addEventListener){
    window.addEventListener('load', applyBarSpace);
    window.addEventListener('resize', applyBarSpace);
    window.addEventListener('orientationchange', applyBarSpace);
  }

  /* Service Worker: 本番httpsのみ登録。localhost(開発プレビュー/Capacitor WebView)は登録せず既存も消す
     =「更新しても前の版が出る」事故の恒久対策 */
  if(typeof navigator !== 'undefined' && 'serviceWorker' in navigator){
    var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if(/^https:/.test(location.protocol) && !isLocal){
      try{ navigator.serviceWorker.register('sw.js'); }catch(_){}
    } else {
      try{ navigator.serviceWorker.getRegistrations().then(function(rs){ rs.forEach(function(r){ r.unregister(); }); }).catch(function(){}); }catch(_){}
      try{ if(window.caches && caches.keys) caches.keys().then(function(ks){ ks.forEach(function(k){ caches.delete(k); }); }).catch(function(){}); }catch(_){}
    }
  }
}

/* デバッグ・スクショ用の最小の窓口 */
window.App = { VER: VER, T: T, go: showScreen, toast: toast, pref: function(){ return Object.assign({}, pref); }, api: screenApi };

init();

})();
