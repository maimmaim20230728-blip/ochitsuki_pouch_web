'use strict';
/* おちつきポーチ・そよぎ 本体シェル(そよぎアプリ・キット v1)
   ・端末内だけに保存(localStorage・キーは「pouch.」で始まる)・完全オフライン・匿名・広告なし
   ・click禁止: 操作は全て Tap.bind(tap.js)。select / file input だけはネイティブイベント
   ・画面は screens/<id>.js が window.SCREENS.register('<id>', { render(container, api) }) で登録する
     (会話補助ノートと同じ取り決め。画面同士・シェルの内部状態は共有しない)
   ・api = { T, el, pref, toast, go, Tap, Photo, load, save, remove, getExtra, setExtra, speak, stopSpeak, vibrate, lang, rtl, ver, appKey }
   ・🔴 BUILDER: アプリ固有の処理は screens/*.js に書く。このファイルは共通部分なので最小限の変更にとどめ、
     変えたら README の「シェルの変更点」に書く */
(function(){

var VER = '0.4.7';                // 🔴 更新のたびに上げる(build.gradle の versionName / sw.js の CACHE と一緒に)
var APP_KEY = 'ochitsuki_pouch';        // バックアップの識別(別アプリのファイルを読まない)
var LS = 'pouch.';
var LS_PREF = LS + 'pref.v1';
var LANGS = ['ja','en','de','fr','es','it','pt','nl','sv','ko','zh','ar'];
var RTL_LANGS = ['ar'];
var THEMES = ['green','aqua','white','dark'];
var BGMS = ['off','green','blue'];
var DEFAULT_THEME = 'aqua';
var GUIDE_AGAIN = true;             // せっていから「つかいかた」をもう一度ひらけるか(隠れた入口の開き方を書いたアプリは false)
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
  'lbl-guide':'guide.title', 'btn-guide':'guide.again',   // はじめての つかいかた(せっていの行)
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
  fitTitle();
  if(current !== 'set') renderScreen(current);   // 表示中の画面も訳し直す
  var gov = document.querySelector && document.querySelector('.guide-ov');
  if(gov && gov._draw) gov._draw();               // はじめての つかいかた も訳し直す
  applyBarSpace();
}

/* ヘッダーの名前: 正式名(そよぎ付き)が入りきらないときだけ、そよぎを抜いた短い名前にする(ヒロさん指示 2026-09-28) */
function fitTitle(){
  var e = $('hd-title'); if(!e) return;
  var full = T('app.name'), s = T('app.short');
  e.textContent = full;
  /* 1px のはみ出しも見逃さない(+1 の余裕があると en 432px で短い名前に切り替わらず「…」で切れた・2026-09-29) */
  if(s !== 'app.short' && s !== full && e.scrollWidth > e.clientWidth) e.textContent = s;
}
if(typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', function(){ fitTitle(); });
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
    if(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform()){
      /* 🔴 取得は Capacitor.Plugins.TextToSpeech(ネイティブが注入する)。registerPlugin は @capacitor/core の関数で WebView には無い(2026-09-29) */
      var p = c.Plugins && c.Plugins.TextToSpeech;
      if(p && typeof p.speak === 'function') return p;
      if(typeof c.registerPlugin === 'function') return c.registerPlugin('TextToSpeech');
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
    markSaved: markSaved,               // 保存したら呼ぶ(戻るボタンの書きかけの確かめを出さない・2026-09-29)
    ask: askBox,                        // 確かめの窓(Play版はアプリの中・Web版は confirm)。ask(文, function(はい){...}, confirmが無いときの答え)
    backDefault: backDefault,           // 画面の back() が確かめのあとで「来た画面へ」を続けるとき
    ver: VER,
    appKey: APP_KEY
  };
}
function renderScreen(id){
  if(dirtyIn && dirtyIn.classList && dirtyIn.classList.contains('screen')) dirtyIn = null;   // 描き直し=書きかけは消えた(戻るボタン)
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
function showScreen(id, how){
  noteBack(current, id, how);   // 戻るボタンの来た道(2026-09-29)
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

/* ---- Play版のファイル保存(2026-09-29) ----
   Capacitor 8 の BridgeActivity には DownloadListener が無く、<a download> では何も保存されない(なのに「かきだしました」が出ていた)。
   Play版(isNativePlatform)だけ、端末の一時フォルダ(CACHE)に書いてから Android の共有の画面を出し、保存先は利用者が選ぶ。Web版は今までどおり <a download>。
   🔴 プラグインはネイティブが注入する Capacitor.Plugins.Filesystem / Share を使う(registerPlugin は @capacitor/core の関数で WebView には無い)。
   ・then は受け取った物にそのままつなぐ(Promise で包まない。_smoke_app.js の同期の偽物で確かめられるように) */
function isNativeApp(){
  try{ var c = window.Capacitor; return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform()); }catch(_){ return false; }
}
function nativePlugin(name, fn){
  try{
    var c = window.Capacitor;
    if(typeof c.isPluginAvailable === 'function' && !c.isPluginAvailable(name)) return null;
    var p = c.Plugins && c.Plugins[name];
    return (p && typeof p[fn] === 'function') ? p : null;
  }catch(_){ return null; }
}
/* 利用者が共有の画面を閉じた("Share canceled")・もう出ている("...in progress")ときは何も出さない */
function shareQuiet(err){
  var m = String((err && (err.message || err.errorMessage)) || err || '');
  return !!err && (err.name === 'AbortError' || /cancel|in progress/i.test(m));
}
/* name=ファイル名 / data=中身(utf8=true なら文字・false なら base64) / label=共有の画面の題
   done('ok')=送り先を選べた / done('quiet')=閉じた / done('fail')=書けない・共有できない・プラグインが無い */
function nativeSaveFile(name, data, utf8, label, done){
  var fsp = nativePlugin('Filesystem', 'writeFile'), shp = nativePlugin('Share', 'share');
  if(!fsp || !shp){ done('fail'); return; }
  var opt = { path:name, data:data, directory:'CACHE' };
  if(utf8) opt.encoding = 'utf8';
  var w;
  try{ w = fsp.writeFile(opt); }catch(_){ done('fail'); return; }
  if(!w || typeof w.then !== 'function'){ done('fail'); return; }
  w.then(function(r){
    if(!r || !r.uri){ done('fail'); return; }
    var s;
    try{ s = shp.share({ title:name, files:[r.uri], dialogTitle:label }); }catch(err){ done(shareQuiet(err) ? 'quiet' : 'fail'); return; }
    if(s && typeof s.then === 'function') s.then(function(){ done('ok'); }, function(err){ done(shareQuiet(err) ? 'quiet' : 'fail'); });
    else done('ok');
  }, function(){ done('fail'); });
}

/* ---- Android の戻るボタン(Play版だけ・2026-09-29) ----
   @capacitor/app が無いと、戻るを押すとアプリごと後ろに下がっていた(Android 11 以前は閉じる)。
   押したときの順: ①いちばん上に重ねた画面(.ov / .photo-ov)を、その画面の「とじる」と同じ動きで閉じる
                  ②画面のモジュールが back(api) を持ち true を返したら、それで終わり(画面の中の段を1つ戻る など)
                  ③ホーム以外なら、来た画面へ(来た道 backStack。無ければホーム)
                  ④ホームなら、アプリを後ろに下げる(minimizeApp。中身はそのまま)
   書きかけ: 文字を入れた(input イベント)まま保存していない層を閉じるときだけ、確かめの窓(askBox・common.backConfirm)を出す。
     やめる=何もしない。保存したら api.markSaved()。画面を描き直すと、その画面の書きかけは無い扱い。
     さがす欄(type=search)と data-nodirty の中の入力は数えない(入れたらすぐ保存される欄にも付ける)。
   重ねた画面の閉じ方: ov._back(関数) → [data-back] の要素 → .ov-close を click()(Tap は click も拾う)。
     data-noback の層(同意の窓など)は閉じずに④と同じ。
   Web版(ブラウザ)は何も変えない(戻るはブラウザのまま) */
var backStack = [];          // 来た道(画面id)。ホームに着いたら空
var dirtyIn = null;          // 書きかけのある層(.ov か .screen)
function noteBack(from, to, how){
  if(how === 'tab'){ backStack = (to === 'home') ? [] : ['home']; return; }   // 下ナビ=ホームの1つ下
  if(to === from) return;
  if(to === 'home'){ backStack = []; return; }
  var i = backStack.indexOf(to);
  if(i >= 0){ backStack = backStack.slice(0, i); return; }   // 前にいた画面へ行く=そこまで戻ったのと同じ
  if(from) backStack.push(from);
  if(backStack.length > 20) backStack.shift();
}
function markSaved(){ dirtyIn = null; }
function isWriting(t){
  if(!t || !t.tagName) return false;
  if(t.closest && t.closest('[data-nodirty]')) return false;
  if(t.tagName === 'TEXTAREA' || t.isContentEditable) return true;
  if(t.tagName !== 'INPUT') return false;
  return /^(text|tel|email|url|number|date|time|datetime-local|month|week|)$/.test(String(t.type || 'text').toLowerCase());
}
function topLayer(){
  var ls = document.querySelectorAll('.ov, .photo-ov');
  for(var i = ls.length - 1; i >= 0; i--){ if(ls[i].getClientRects && ls[i].getClientRects().length) return ls[i]; }
  return null;
}
function minimizeApp(){
  var ap = nativePlugin('App', 'minimizeApp');
  try{ if(ap){ var p = ap.minimizeApp(); if(p && p.catch) p.catch(function(){}); } }catch(_){}
}
/* ---- アプリの中の確かめの窓(2026-09-29) ----
   Play版の window.confirm は、Capacitor(BridgeWebChromeClient)がボタンを英語の OK / Cancel に決め打ちしている。
   Play版だけ、アプリの中に「いいえ / はい」(common.no / common.yes・12言語・文字の大きさの設定どおり)の窓を出す。
   Web版は今までどおり window.confirm(ブラウザの言葉で出る)。confirm の無い環境(疑似DOMのスモーク)は dflt。
   done(true=はい / false=いいえ)。Web版では done をその場で呼ぶ。戻るボタン=いいえ(data-back) */
function askBox(msg, done, dflt){
  if(!isNativeApp()){
    var r = !!dflt;
    try{ if(typeof window.confirm === 'function') r = !!window.confirm(msg); }catch(_){ r = false; }
    done(r);
    return;
  }
  var ov = el('div', 'ov ask-ov');
  ov.setAttribute('role', 'alertdialog');
  ov.setAttribute('aria-modal', 'true');
  var box = el('div', 'ask-box');
  var p = el('p', 'ask-msg', msg);
  var row = el('div', 'ask-row');
  var no = el('button', 'btn ask-no', T('common.no'));
  var yes = el('button', 'btn ask-yes', T('common.yes'));
  no.type = 'button'; yes.type = 'button';
  no.setAttribute('data-back', '1');
  var closed = false;
  function close(v){ if(closed) return; closed = true; if(ov.parentNode) ov.parentNode.removeChild(ov); done(v); }
  Tap.bind(no, function(){ close(false); });
  Tap.bind(yes, function(){ close(true); });
  row.appendChild(no); row.appendChild(yes);
  box.appendChild(p); box.appendChild(row); ov.appendChild(box);
  document.body.appendChild(ov);
  try{ no.focus(); }catch(_){}
}
function closeLayer(ov){
  if(typeof ov._back === 'function'){ try{ ov._back(); }catch(err){ console.error('back error:', err); } return; }
  var b = ov.querySelector('[data-back]') || ov.querySelector('.ov-close');
  if(b){ b.click(); return; }
  if(ov.parentNode) ov.parentNode.removeChild(ov);
}
function onBack(){
  var ov = topLayer();
  if(ov && ov.hasAttribute('data-noback')){ minimizeApp(); return; }
  var mod = window.SCREENS && window.SCREENS.get(current);
  var hasBack = !!(mod && typeof mod.back === 'function');
  if(!ov && current === 'home' && !hasBack){ minimizeApp(); return; }   // 後ろに下げるだけ(書きかけも消えない)
  var layer = ov || $('scr-' + current);
  if(dirtyIn && !document.body.contains(dirtyIn)) dirtyIn = null;
  function go(){
    if(ov){ closeLayer(ov); return; }
    if(hasBack){
      try{ if(mod.back(screenApi()) === true) return; }catch(err){ console.error('back error:', current, err); }
    }
    backDefault();
  }
  if(layer && dirtyIn === layer){
    askBox(T('common.backConfirm'), function(ok){ if(!ok) return; dirtyIn = null; go(); });
    return;
  }
  go();
}
/* 来た画面へ(無ければホーム)・ホームなら後ろに下げる。画面の back() が確かめの窓のあとで続けるときにも使う(api.backDefault) */
function backDefault(){
  if(current !== 'home'){ showScreen(backStack.length ? backStack[backStack.length - 1] : 'home'); return; }
  minimizeApp();
}
function watchBack(){
  if(!isNativeApp()) return;
  var ap = nativePlugin('App', 'addListener');
  if(!ap) return;
  try{ ap.addListener('backButton', function(){ onBack(); }); }catch(_){ return; }
  if(document.addEventListener) document.addEventListener('input', function(e){
    var t = e.target;
    if(isWriting(t)) dirtyIn = (t.closest && (t.closest('.ov, .photo-ov') || t.closest('.screen'))) || null;
  }, true);
}

/* ---- はじめての つかいかた(初回の案内・2026-09-30) ----
   ヒロさん「ひとつずつ・そよぎ みたいなタイプのアプリは、必ず最初に使い方の丁寧な説明を出してほしい。10代の情報室のように」。
   ・初回起動で必ず出す(最後まで読むまで、開くたびに出る)。文言は i18n の guide.*(title / step / start / again / heads[] / bodies[])
   ・1ページずつ「つぎ」「まえ」で進む。閉じるのは最後のページの「はじめる」だけ(× は置かない)
   ・戻るボタン(Play版): 2ページ目から=まえのページ / 1ページ目=初回なら後ろに下げる(閉じない・10代の情報室と同じ)、せっていから開いたときは閉じる
   ・読み終えたら LS + 'guide.v1' = true。GUIDE_AGAIN が true なら、せっていの「つかいかた」で もう一度ひらける
     (隠れた入口の開き方を書いたアプリは、10代の情報室と同じく二度と出さない=false にして、せっていの行も消す)
   ・閉じたら document に 'guide-done' を出す(画面側が続きをするとき用) */
var LS_GUIDE = LS + 'guide.v1';
function guideDone(){ return loadJSON(LS_GUIDE) === true; }
function openGuide(first){
  var bodies = T('guide.bodies');
  if(!Array.isArray(bodies) || !bodies.length) return;
  if(document.querySelector('.guide-ov')) return;
  var i = 0;
  var ov = el('div', 'ov guide-ov');
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  var box = el('div', 'guide-box');
  var top = el('div', 'guide-top');
  var ttl = el('p', 'guide-title');
  var step = el('p', 'guide-step');
  top.appendChild(ttl); top.appendChild(step);
  /* ことば(1ページ目だけ): 案内はヘッダーの Language も覆うので、端末のことばが無いアプリ(日本語で始まる)でも ここで選べるように */
  var langRow = null, langLbl = null, langSel = null, src = $('set-lang');
  if(src && src.options && src.options.length){
    langRow = el('div', 'guide-lang');
    langLbl = el('span', 'guide-lang-lbl');
    langSel = document.createElement('select');
    langSel.setAttribute('aria-label', 'Language 言語');
    for(var o = 0; o < src.options.length; o++){
      var op = document.createElement('option');
      op.value = src.options[o].value; op.textContent = src.options[o].textContent;
      langSel.appendChild(op);
    }
    langSel.addEventListener('change', function(){
      pref.lang = langSel.value; savePref();
      if($('set-lang')) $('set-lang').value = pref.lang;
      applyI18n();                                   // 案内も draw() で訳し直す
    });
    langRow.appendChild(langLbl); langRow.appendChild(langSel);
  }
  var h = el('h2', 'guide-h');
  var p = el('p', 'guide-p');
  var dots = el('div', 'guide-dots');
  dots.setAttribute('aria-hidden', 'true');
  var row = el('div', 'guide-row');
  var prevB = el('button', 'btn guide-prev');
  var nextB = el('button', 'btn primary guide-next');
  prevB.type = 'button'; nextB.type = 'button';
  row.appendChild(prevB); row.appendChild(nextB);
  box.appendChild(top); if(langRow) box.appendChild(langRow); box.appendChild(h); box.appendChild(p); box.appendChild(dots);
  ov.appendChild(box); ov.appendChild(row);
  function draw(){
    var heads = T('guide.heads');
    bodies = T('guide.bodies');                    // ことばを変えたときも、いまのページのまま訳し直す
    var n = bodies.length;
    if(i > n - 1) i = n - 1;
    ov.setAttribute('aria-label', T('guide.title'));
    ttl.textContent = T('guide.title');
    step.textContent = String(T('guide.step')).replace('{n}', i + 1).replace('{m}', n);
    step.setAttribute('dir', /[֐-ࣿ]/.test(step.textContent) ? 'rtl' : 'ltr');   // 「1 / 8」は右から左の言葉でも左から(ar の「8 / 1」を防ぐ)
    if(langRow){
      langRow.style.display = (i === 0) ? '' : 'none';
      langLbl.textContent = T('set.lang');
      langSel.value = pref.lang;
    }
    h.textContent = (Array.isArray(heads) && heads[i]) ? heads[i] : '';
    p.textContent = bodies[i];
    dots.textContent = '';
    for(var k = 0; k < n; k++) dots.appendChild(el('span', 'guide-dot' + (k === i ? ' on' : '')));
    prevB.textContent = T('common.prev');
    prevB.style.visibility = (i === 0) ? 'hidden' : 'visible';   // 「つぎ」の位置を変えない
    nextB.textContent = (i === n - 1) ? T('guide.start') : T('common.next');
    ov.scrollTop = 0;
  }
  function close(){
    if(ov.parentNode) ov.parentNode.removeChild(ov);
    saveJSON(LS_GUIDE, true);
    try{ document.dispatchEvent(new Event('guide-done')); }catch(_){}
  }
  ov._draw = draw;
  ov._back = function(){
    if(i > 0){ i--; draw(); return; }
    if(first) minimizeApp(); else close();
  };
  Tap.bind(prevB, function(){ if(i > 0){ i--; draw(); } });
  Tap.bind(nextB, function(){ if(i < bodies.length - 1){ i++; draw(); } else close(); });
  draw();
  document.body.appendChild(ov);
  try{ nextB.focus(); }catch(_){}
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
  var d = new Date();
  var fname = APP_KEY + '-backup-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
  /* Play版(2026-09-29): 一時フォルダに書いて共有の画面へ。選べたら「かきだしました」・閉じたら何も出さない・書けなければ「ほぞんできませんでした」 */
  if(isNativeApp()){
    nativeSaveFile(fname, JSON.stringify(data), true, T('set.bkExport'), function(r){
      if(r === 'ok') toast(T('set.exported'));
      else if(r === 'fail') toast(T('common.saveFail'));
    });
    return;
  }
  var blob = new Blob([JSON.stringify(data)], { type:'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 3000);
  toast(T('set.exported'));
}
/* よみこむ(点検 pouch-21・8本共通 D 2026-09-29)
   ・このアプリのファイルか・形を確かめてから、置き換える前に askBox で確かめる(やめる=何も変えない)。
     Play版はアプリの中の はい/いいえ の窓・Web版は window.confirm。confirm の無い環境(疑似DOMスモーク)は そのまま進む
   ・はい=丸ごと入れ替え: いまの「pouch.」のデータを消してから、ファイルの中身を書く(ファイルに無いものは残さない=混ざらない)。
     ほかのアプリのキー(pouch. で始まらない)は触らない。書けなかったら(容量など)元に戻して「よみこめませんでした」 */
function ownDataKeys(){
  var ks = [];
  try{
    for(var i = 0; i < localStorage.length; i++){
      var k = localStorage.key(i);
      if(k && k.indexOf(LS) === 0 && k !== LS_PREF) ks.push(k);
    }
  }catch(_){}
  return ks;
}
function replaceAllData(data){
  var old = {}, keys = ownDataKeys(), k, ok = true;
  try{ keys.forEach(function(x){ old[x] = localStorage.getItem(x); }); }catch(_){ return false; }
  keys.forEach(removeKey);
  for(k in data){ if(!saveJSON(LS + k, data[k])){ ok = false; break; } }
  if(ok) return true;
  /* 元に戻す */
  ownDataKeys().forEach(removeKey);
  for(k in old){ try{ if(old[k] !== null) localStorage.setItem(k, old[k]); }catch(_){} }
  return false;
}
function importBackup(e){
  var f = e.target.files && e.target.files[0];
  if(!f) return;
  var r = new FileReader();
  r.onload = function(){
    var d, data = {};
    try{
      d = JSON.parse(r.result);
      if(!d || d.app !== APP_KEY) throw new Error('different app');
      if(d.data && typeof d.data === 'object'){
        data = d.data;
        /* アプリ固有の形チェック(screens 側が window.APP_IMPORT_FILTER を置けば、知らないキー・壊れた形・外部URLをここで落とす) */
        if(typeof window.APP_IMPORT_FILTER === 'function') data = window.APP_IMPORT_FILTER(data) || {};
      }
    }catch(err){ toast(T('set.importFail')); return; }
    askBox(T('set.importConfirm'), function(ok){   // Play版はアプリの中の窓(はい/いいえ)・Web版は window.confirm
      if(!ok) return;
      if(!replaceAllData(data)){ toast(T('set.importFail')); return; }
      pref = sanitizePref(d.pref);
      savePref();
      applyAll(true);
      toast(T('set.imported'));
    }, true);
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
    (function(b){ Tap.bind(b, function(){ showScreen(b.getAttribute('data-scr'), 'tab'); }); })(navs[i]);
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
  if($('btn-guide')) Tap.bind($('btn-guide'), function(){ openGuide(false); });
  if(!GUIDE_AGAIN && $('set-guide-row')) $('set-guide-row').classList.add('hidden');

  applyAll(false);
  showScreen('home');
  if(!guideDone()) openGuide(true);   // はじめての つかいかた(読み終えるまで毎回・2026-09-30)

  watchBack();                        // Android の戻るボタン(Play版だけ)
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
window.App = { VER: VER, T: T, go: showScreen, toast: toast, pref: function(){ return Object.assign({}, pref); }, api: screenApi, guide: openGuide };

init();

})();
