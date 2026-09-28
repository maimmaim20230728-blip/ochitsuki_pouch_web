'use strict';
/* 音まわり(そよぎアプリ・キット v1): タップの手応え音 + 生成BGM(green/blue) + 小さな合図音
   ・BGMはWeb Audioでその場生成(音源ファイル無し=軽量・完全オフライン)。おうち介護記録→もしもカードの方式
   🔴 起動しただけでは鳴らさない: app.js は setBgmEnabled(pref.bgm!=='off', false) で状態だけ合わせる。
      Capacitorは自動再生制限を外すため、ブラウザの制限に頼ると実機だけ無操作で鳴り出す
   🔴 tap()(BGM開始トリガー)は tap.js が fn(e) の後に呼ぶ。press() は押した瞬間の手応え音(タップ音ONのみ)
   🔴 止めるときは素早く消す(0.25秒ランプ+予約済みオシレータも stop)
   🔴 画面を離れている間(タブ非表示・ホーム・画面OFF)は suspend して鳴らさない */
var Sound = (function(){
  var ctx = null;
  var enabled = true;        // タップ音
  var bgmEnabled = false;    // app.js の pref.bgm と同期
  var mode = 'green';
  var playing = false;
  var master = null, filter = null;
  var timer = 0, nextBar = 0, chordIdx = 0;
  var live = [];

  var PATTERNS = {
    green: { bar: 4.6, vol: 0.042, lp: 750, type: 'triangle',
      chords: [[131, 196, 262], [110, 165, 220], [175, 220, 262], [98, 196, 294]],
      scale: [523, 587, 659, 784, 880] },
    blue:  { bar: 5.2, vol: 0.038, lp: 620, type: 'sine',
      chords: [[98, 196, 247], [82.4, 165, 247], [131, 196, 330], [147, 196, 294]],
      scale: [587, 659, 784, 880, 988] }
  };

  /* AudioContextを用意。suspendedならresume(非同期)し、解けたら開始判定をやり直す */
  function ensure(){
    if(!ctx){
      try{ ctx = new (window.AudioContext || window.webkitAudioContext)(); }catch(_){ ctx = null; }
    }
    if(ctx && ctx.state === 'suspended'){
      try{ ctx.resume().then(function(){ maybeStartBgm(); }).catch(function(){}); }catch(_){}
    }
  }
  function track(o){
    live.push(o);
    o.onended = function(){ var i = live.indexOf(o); if(i >= 0) live.splice(i, 1); };
  }

  /* 押した瞬間の手応え音(短いクリック) */
  function click(){
    try{
      var t = ctx.currentTime;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 830;
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.09);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.1);
    }catch(_){}
  }

  /* 小さな合図音(次のステップへ等)。freq/秒/大きさ。タップ音OFFでも呼び出し側が使えるよう enabled は見ない */
  function tone(freq, dur, gain){
    ensure();
    if(!ctx) return;
    try{
      var t = ctx.currentTime;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq || 660;
      var d = dur || 0.25, v = gain || 0.06;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0008, t + d);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + d + 0.02);
    }catch(_){}
  }

  /* ---- BGM ---- */
  function scheduleBar(t){
    var p = PATTERNS[mode] || PATTERNS.green;
    var chord = p.chords[chordIdx % p.chords.length];
    chordIdx++;
    chord.forEach(function(f){
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = p.type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(p.vol, t + p.bar * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, t + p.bar * 1.35);
      o.connect(g); g.connect(filter);
      o.start(t); o.stop(t + p.bar * 1.4);
      track(o);
    });
    var n = 1 + (Math.random() < 0.5 ? 1 : 0);
    for(var i = 0; i < n; i++){
      var nt = t + p.bar * (0.15 + Math.random() * 0.7);
      var f2 = p.scale[Math.floor(Math.random() * p.scale.length)];
      var o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sine'; o2.frequency.value = f2;
      g2.gain.setValueAtTime(0.0001, nt);
      g2.gain.linearRampToValueAtTime(p.vol * 0.55, nt + 0.06);
      g2.gain.exponentialRampToValueAtTime(0.0001, nt + 2.2);
      o2.connect(g2); g2.connect(filter);
      o2.start(nt); o2.stop(nt + 2.3);
      track(o2);
    }
  }
  function startBgm(){
    ensure();
    if(!ctx || playing) return;
    if(ctx.state === 'suspended') return;   // 許可前→resumeのthenで再挑戦
    master = ctx.createGain(); master.gain.value = 1;
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = (PATTERNS[mode] || PATTERNS.green).lp;
    filter.connect(master); master.connect(ctx.destination);
    playing = true; chordIdx = 0;
    nextBar = ctx.currentTime + 0.1;
    scheduleBar(nextBar); nextBar += (PATTERNS[mode] || PATTERNS.green).bar;
    timer = setInterval(function(){
      if(!playing || !ctx) return;
      if(ctx.currentTime > nextBar - 1.2){
        scheduleBar(nextBar);
        nextBar += (PATTERNS[mode] || PATTERNS.green).bar;
      }
    }, 400);
  }
  function stopBgm(){
    if(!playing) return;
    playing = false;
    clearInterval(timer);
    var now = ctx ? ctx.currentTime : 0;
    if(master && ctx){
      try{
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0.0001, now + 0.25);
        var m = master;
        setTimeout(function(){ try{ m.disconnect(); }catch(_){} }, 400);
      }catch(_){}
    }
    live.forEach(function(o){ try{ o.stop(now + 0.26); }catch(_){ try{ o.stop(); }catch(_2){} } });
    live = [];
    master = null; filter = null;
  }
  function maybeStartBgm(){ if(bgmEnabled && !playing) startBgm(); }

  /* 画面を離れている間は鳴らさない */
  function suspendNow(){ if(!ctx) return; try{ ctx.suspend(); }catch(_){} }
  if(typeof document !== 'undefined' && document.addEventListener){
    document.addEventListener('visibilitychange', function(){
      if(!ctx) return;
      if(document.hidden){ suspendNow(); return; }
      if(playing && bgmEnabled){ try{ ctx.resume().catch(function(){}); }catch(_){} }
    });
  }
  if(typeof window !== 'undefined' && window.addEventListener){
    window.addEventListener('pagehide', suspendNow);
  }

  return {
    /* 押した瞬間の手応え音(タップ音ONのみ) */
    press: function(){ if(!enabled) return; ensure(); if(ctx && ctx.state === 'running') click(); },
    /* タップ完了=音を出してよい瞬間。BGM開始のトリガー(音を切っている人にはAudioContextも作らない) */
    tap: function(){ if(!bgmEnabled && !enabled) return; ensure(); maybeStartBgm(); },
    tone: tone,
    setEnabled: function(v){ enabled = !!v; },
    setBgmMode: function(m){
      if(!PATTERNS[m]) return;
      if(m === mode) return;
      mode = m;
      if(playing){ stopBgm(); setTimeout(function(){ maybeStartBgm(); }, 450); }
    },
    /* startNow=false なら状態を合わせるだけで鳴らさない(起動時の同期用) */
    setBgmEnabled: function(v, startNow){
      bgmEnabled = !!v;
      if(!bgmEnabled){ stopBgm(); return; }
      if(startNow !== false){ ensure(); maybeStartBgm(); }
    },
    pauseBgm: function(){ stopBgm(); },
    resumeBgm: function(){ maybeStartBgm(); },
    get enabled(){ return enabled; },
    get bgmEnabled(){ return bgmEnabled; },
    get bgmPlaying(){ return playing; }
  };
})();
window.Sound = Sound;
