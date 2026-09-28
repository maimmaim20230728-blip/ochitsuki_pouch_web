'use strict';
/* 写真の取り込み+アプリ内トリミング(そよぎアプリ・キット v1・会話補助ノート/スケジューラーの方式)
   ・📷カメラ / 🖼しゃしん の両方から → 正方形枠に 指ドラッグpan + やじるし + スライダーズーム(ピンチ不使用・片麻痺配慮)
     → OUT px 正方形JPEG(dataURL)を onDone に渡す。保存は呼び出し側(localStorage等)。
   使い方: Photo.pick({ camera:true|false, T:api.T, toast:api.toast, out:256, onDone:function(dataUrl){...} })
   ・T は common.photo.* を持つ翻訳関数。オーバーレイは document.body に足して自分で消す。 */
var Photo = (function(){
  var CROP_V = 300, NUDGE = 40;

  function elc(tag, cls, txt){ var e = document.createElement(tag); if(cls) e.className = cls; if(txt != null) e.textContent = txt; return e; }
  function tapBind(el, fn){ if(window.Tap && window.Tap.bind) window.Tap.bind(el, fn); }

  function pick(o){
    o = o || {};
    var T = o.T || function(k){ return k; };
    var inp = elc('input', 'photo-file'); inp.type = 'file'; inp.accept = 'image/*';
    if(o.camera) inp.setAttribute('capture', 'environment');
    inp.addEventListener('change', function(e){
      var f = e.target.files && e.target.files[0];
      try{ e.target.value = ''; }catch(_){}
      if(inp.parentNode) inp.parentNode.removeChild(inp);
      if(!f) return;
      var url = URL.createObjectURL(f);
      var im = new Image();
      im.onload = function(){ openCrop(im, url, o, T); };
      im.onerror = function(){ try{ URL.revokeObjectURL(url); }catch(_){} if(o.toast) o.toast(T('common.photo.fail')); };
      im.src = url;
    });
    document.body.appendChild(inp);
    inp.click();
  }

  function openCrop(img, url, o, T){
    var OUT = o.out || 256;
    var ov = elc('div', 'photo-ov');
    ov.appendChild(elc('div', 'photo-ov-title', T('common.photo.cropTitle')));
    ov.appendChild(elc('p', 'photo-ov-hint', T('common.photo.cropHint')));
    var cv = elc('canvas', 'photo-crop-canvas'); cv.width = CROP_V; cv.height = CROP_V;
    ov.appendChild(cv);
    var ctx = cv.getContext ? cv.getContext('2d') : null;
    var st = { zoom:1, ox:0, oy:0, drag:null };
    st.base = CROP_V / Math.max(1, Math.min(img.width || 1, img.height || 1));
    function dw(){ return (img.width || 1) * st.base * st.zoom; }
    function dh(){ return (img.height || 1) * st.base * st.zoom; }
    function clamp(){ st.ox = Math.min(0, Math.max(CROP_V - dw(), st.ox)); st.oy = Math.min(0, Math.max(CROP_V - dh(), st.oy)); }
    function draw(){ if(!ctx) return; ctx.clearRect(0, 0, CROP_V, CROP_V); ctx.drawImage(img, 0, 0, img.width, img.height, st.ox, st.oy, dw(), dh()); }
    function nudge(dx, dy){ st.ox += dx; st.oy += dy; clamp(); draw(); }
    function zoomTo(v){
      var nz = Math.max(1, Math.min(3, (v || 100) / 100));
      var ow = dw(), oh = dh();
      st.zoom = nz;
      st.ox = CROP_V / 2 - (CROP_V / 2 - st.ox) * (dw() / ow);
      st.oy = CROP_V / 2 - (CROP_V / 2 - st.oy) * (dh() / oh);
      clamp(); draw();
    }
    st.ox = (CROP_V - dw()) / 2; st.oy = (CROP_V - dh()) / 2; clamp(); draw();

    cv.addEventListener('pointerdown', function(e){ st.drag = { x:e.clientX, y:e.clientY }; });
    cv.addEventListener('pointermove', function(e){
      if(!st.drag) return;
      var disp = CROP_V;
      if(cv.getBoundingClientRect){ var r = cv.getBoundingClientRect(); if(r && r.width) disp = r.width; }
      var s = CROP_V / disp;
      st.ox += (e.clientX - st.drag.x) * s; st.oy += (e.clientY - st.drag.y) * s;
      st.drag = { x:e.clientX, y:e.clientY };
      clamp(); draw();
    });
    cv.addEventListener('pointerup', function(){ st.drag = null; });
    cv.addEventListener('pointercancel', function(){ st.drag = null; });

    var pad = elc('div', 'photo-dpad');
    function nudBtn(emoji, key, dx, dy){ var b = elc('button', 'photo-nudge', emoji); b.type = 'button'; b.setAttribute('aria-label', T(key)); tapBind(b, function(){ nudge(dx, dy); }); return b; }
    function spacer(){ var s = elc('span', 'photo-nudge spacer'); s.setAttribute('aria-hidden', 'true'); return s; }
    pad.appendChild(spacer()); pad.appendChild(nudBtn('⬆', 'common.photo.panUp', 0, -NUDGE)); pad.appendChild(spacer());
    pad.appendChild(nudBtn('⬅', 'common.photo.panLeft', -NUDGE, 0)); pad.appendChild(spacer()); pad.appendChild(nudBtn('➡', 'common.photo.panRight', NUDGE, 0));
    pad.appendChild(spacer()); pad.appendChild(nudBtn('⬇', 'common.photo.panDown', 0, NUDGE)); pad.appendChild(spacer());
    ov.appendChild(pad);

    var zrow = elc('div', 'photo-zoom-row');
    var zico = elc('span', null, '🔍'); zico.setAttribute('aria-hidden', 'true');
    var range = elc('input'); range.type = 'range'; range.min = '100'; range.max = '300'; range.step = '5'; range.value = '100';
    range.setAttribute('aria-label', T('common.photo.zoom'));
    range.addEventListener('input', function(){ zoomTo(parseInt(range.value, 10)); });
    zrow.appendChild(zico); zrow.appendChild(range);
    ov.appendChild(zrow);

    function close(){ try{ URL.revokeObjectURL(url); }catch(_){} if(ov.parentNode) ov.parentNode.removeChild(ov); }
    function confirm(){
      try{
        var out = elc('canvas'); out.width = OUT; out.height = OUT;
        var octx = out.getContext('2d');
        var s = OUT / CROP_V;
        octx.drawImage(img, 0, 0, img.width, img.height, st.ox * s, st.oy * s, dw() * s, dh() * s);
        var data = out.toDataURL('image/jpeg', 0.85);
        close();
        if(o.onDone) o.onDone(data);
      }catch(_){ close(); if(o.toast) o.toast(T('common.photo.fail')); }
    }
    var row = elc('div', 'photo-row');
    var bc = elc('button', 'btn', '✕ ' + T('common.cancel')); bc.type = 'button'; tapBind(bc, close);
    var bo = elc('button', 'btn primary', '✓ ' + T('common.photo.make')); bo.type = 'button'; tapBind(bo, confirm);
    row.appendChild(bc); row.appendChild(bo);
    ov.appendChild(row);
    document.body.appendChild(ov);
  }

  return { pick: pick };
})();
window.Photo = Photo;
