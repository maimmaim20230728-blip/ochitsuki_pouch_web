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
      if(Math.hypot(e.clientX - sx, e.clientY - sy) <= MOVE_LIMIT) fire(e);
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
