/* =========================================================
   Tap ― 長押しでも確実に反応するタップ判定(らくらくスマホ対策)＋支援技術の合成clickも拾う
   ・click だけだと「グッと押し込む」操作(押し込みで指が少し動く/長押し扱い)が無反応になる
   ・pointerdown→pointerup の自前判定: 押した時間は無制限・移動 MOVE_LIMIT px 以内で発火
   ・🔴 click も併せて購読する: TalkBack/VoiceOver・スイッチ・音声操作・キーボードは
     pointer イベントを出さず click だけを出す。直前の pointerup で発火済みなら二重発火を防ぐ
   ・🔴 iOS Safari: pointerdown で setPointerCapture() を呼ばない(pointerup が届かなくなる)
   ・🔴 fn(e) を先に実行してから Sound.tap()(BGM開始のトリガー)を呼ぶ。逆だと「おと なし」を
     押した瞬間に鳴り始める。押した瞬間の手応え音は Sound.press()(タップ音ON時のみ)
   使い方: Tap.bind(el, fn) / Tap.bind(el, fn, {game:true})=touch-action:none / {silent:true}=手応え音なし
   ========================================================= */
const Tap = (() => {
  const MOVE_LIMIT = 36;
  /* 👻 あとから来るクリックを捨てる(2026-09-29・エミュレータで見つけた):
     pointerup で発火して画面が切り替わると、同じ指の あとから来る mousedown / mouseup / click が
     「新しい画面の同じ位置にある要素」に当たる(入力欄にキーボードが出る・別のボタンが押される)。
     pointerup で発火したあと 700ms 以内・MOVE_LIMIT px 以内の mousedown / mouseup / click を document で捨てる(click を捨てたら終わり)。
     pointer イベントは捨てないので、すぐ次のタップは今までどおり効く。支援技術(click だけ)は pointerup が無いのでここを通らない
     🔴 mousedown を捨てるとフォーカスも動かない(2026-09-30): 字を入れている欄で Tap のボタンを押しても欄が選ばれたまま=キーボードが閉じない。
     指が触れたときに選ばれていた欄が、まだ選ばれたままなら外す(捨てる前の mousedown と同じ)。押した処理が選んだ欄(新しい画面の欄など)はそのまま */
  let ghost = null, downFocus = null;
  function isGhost(e){
    if(!ghost) return false;
    if(Date.now() > ghost.until){ ghost = null; return false; }
    return Math.hypot((e.clientX || 0) - ghost.x, (e.clientY || 0) - ghost.y) <= MOVE_LIMIT;
  }
  if(typeof document !== 'undefined' && document.addEventListener){
    document.addEventListener('pointerdown', () => { downFocus = document.activeElement; }, true);
    ['mousedown', 'mouseup', 'click'].forEach(type => document.addEventListener(type, e => {
      if(!isGhost(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if(type === 'mousedown'){
        const a = document.activeElement;
        if(a && a === downFocus && a !== e.target && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)){ try{ a.blur(); }catch(_){} }
      }
      if(type === 'click') ghost = null;
    }, true));
  }
  function bind(el, fn, opts){
    if(!el) return;
    const o = opts || {};
    el.style.touchAction = o.game ? 'none' : 'manipulation';
    let sx = 0, sy = 0, pid = null, lastFire = 0;
    function fire(e){
      lastFire = Date.now();
      el.classList.remove('pressing');
      fn(e);
      if(window.Sound && !o.silent) window.Sound.tap();
    }
    el.addEventListener('pointerdown', e => {
      if(!e.isPrimary) return;
      pid = e.pointerId; sx = e.clientX; sy = e.clientY;
      el.classList.add('pressing');
      if(!o.silent && window.Sound) window.Sound.press();
    });
    el.addEventListener('pointerup', e => {
      if(e.pointerId !== pid) return;
      pid = null;
      el.classList.remove('pressing');
      if(Math.hypot(e.clientX - sx, e.clientY - sy) <= MOVE_LIMIT){
        const g = ghost = { x:e.clientX, y:e.clientY, until:Date.now() + 700 };   // このあとの同じ指の click を捨てる(上の 👻)
        try{ fire(e); }
        finally{
          /* ⏱ 同じ指の click は、押した処理(fn)が終わってから届く。処理が重くて 700ms を越えると(遅い端末など)、
             付けた時刻が切れて click が通り、2回押しになる・切り替わった先の同じ位置のボタンまで押される(2026-10-01 に確かめた)。
             処理のあとで時刻を付け直す */
          const now = Date.now();
          lastFire = now;
          if(ghost === g) g.until = now + 700;
        }
      }
    });
    el.addEventListener('pointercancel', () => { pid = null; el.classList.remove('pressing'); });
    el.addEventListener('click', e => {
      if(Date.now() - lastFire < 700) return;   // 直前の pointerup で発火済み
      fire(e);
    });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  return { bind };
})();
window.Tap = Tap;
