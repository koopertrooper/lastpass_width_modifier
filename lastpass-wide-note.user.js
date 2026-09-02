// ==UserScript==
// @name         LastPass — Wide Secure Note Panel
// @namespace    https://github.com/koopertrooper/lastpass_width_modifier
// @version      1.1.1
// @description  Stretch the LastPass item/secure-note drawer so long notes are readable. Adjustable width, manual element picker, persisted.
// @author       koopertrooper
// @match        https://lastpass.com/*
// @match        https://*.lastpass.com/*
// @updateURL    https://raw.githubusercontent.com/koopertrooper/lastpass_width_modifier/main/lastpass-wide-note.user.js
// @downloadURL  https://raw.githubusercontent.com/koopertrooper/lastpass_width_modifier/main/lastpass-wide-note.user.js
// @supportURL   https://github.com/koopertrooper/lastpass_width_modifier/issues
// @homepageURL  https://github.com/koopertrooper/lastpass_width_modifier
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------- settings
  const KEY_W    = 'lp_note_width';
  const KEY_H    = 'lp_note_height';
  const KEY_PICK = 'lp_note_selector';
  const MIN_W = 400;
  const STEP  = 80;
  const MAX_W = () => Math.max(MIN_W, window.innerWidth - 40);

  const store = {
    get(k, d) {
      try { if (typeof GM_getValue === 'function') return GM_getValue(k, d); } catch (e) {}
      const v = localStorage.getItem(k);
      return v === null ? d : v;
    },
    num(k, d) { const v = Number(this.get(k, d)); return isFinite(v) ? v : d; },
    set(k, v) {
      try { if (typeof GM_setValue === 'function') { GM_setValue(k, v); return; } } catch (e) {}
      localStorage.setItem(k, String(v));
    }
  };

  const clampW = (w) => Math.min(MAX_W(), Math.max(MIN_W, Math.round(w)));

  let width    = clampW(store.num(KEY_W, 900));
  let height   = Math.max(150, store.num(KEY_H, 480));
  let pickedSel = store.get(KEY_PICK, '') || '';

  // ------------------------------------------------------------ shadow-aware
  // LastPass mixes plain DOM and (in places) shadow roots — walk both.
  function deepAll(root, pred, out, depth) {
    out = out || [];
    depth = depth || 0;
    if (depth > 12) return out;
    const kids = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const el of kids) {
      if (pred(el)) out.push(el);
      if (el.shadowRoot) deepAll(el.shadowRoot, pred, out, depth + 1);
    }
    return out;
  }

  // ------------------------------------------------------------------- style
  const style = document.createElement('style');
  style.textContent = [
    '#lp-wide-ctl {',
    '  position: fixed; z-index: 2147483647; bottom: 12px; left: 12px;',
    '  display: flex; align-items: center; gap: 7px; padding: 6px 10px;',
    '  font: 12px/1.2 system-ui, sans-serif; color: #1a1a1a;',
    '  background: rgba(255,255,255,.97); border: 1px solid #c9ced6;',
    '  border-radius: 999px; box-shadow: 0 2px 10px rgba(0,0,0,.18);',
    '  user-select: none; max-width: 92vw; flex-wrap: wrap;',
    '}',
    '#lp-wide-ctl button {',
    '  all: unset; cursor: pointer; padding: 2px 7px; border-radius: 6px;',
    '  background: #eef1f5; font-weight: 600; font: 600 12px system-ui, sans-serif;',
    '}',
    '#lp-wide-ctl button:hover { background: #dde3ea; }',
    '#lp-wide-ctl button.on { background: #d32d27; color: #fff; }',
    '#lp-wide-ctl input[type=range] { width: 130px; accent-color: #d32d27; }',
    '#lp-wide-ctl .lp-val { font-variant-numeric: tabular-nums; min-width: 46px; text-align: right; }',
    '#lp-wide-ctl .lp-lbl { opacity: .6; }',
    '#lp-wide-ctl .lp-stat { opacity: .6; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.lp-pick-hover { outline: 3px solid #d32d27 !important; outline-offset: -3px !important; cursor: crosshair !important; }'
  ].join('\n');
  (document.head || document.documentElement).appendChild(style);

  // --------------------------------------------------------------- detection
  const TITLE_RE = /(secure note|add item|edit item|item details|view item|add password|edit password)/i;

  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) !== 0;
  }

  // Geometry only — no position requirement (the drawer is often a flex child).
  function looksLikeDrawer(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el === document.body || el === document.documentElement) return false;
    if (el.id === 'lp-wide-ctl' || el.closest('#lp-wide-ctl')) return false;
    if (!visible(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.height < window.innerHeight * 0.45) return false;         // tall
    if (r.width < 240 || r.width > window.innerWidth * 0.96) return false;
    if (r.right < window.innerWidth - 40) return false;             // hugs right edge
    return true;
  }

  function findByTitle() {
    const heads = deepAll(document, (el) => {
      const tag = el.tagName;
      if (tag !== 'H1' && tag !== 'H2' && tag !== 'H3' && tag !== 'DIV' && tag !== 'SPAN') return false;
      if (el.getAttribute('role') === 'heading') return true;
      const cls = (el.className && el.className.baseVal !== undefined) ? el.className.baseVal : String(el.className || '');
      if (tag === 'DIV' || tag === 'SPAN') return /title|header|heading/i.test(cls);
      return true;
    });

    let title = null;
    for (const h of heads) {
      const t = (h.textContent || '').trim();
      if (t && t.length < 60 && TITLE_RE.test(t) && h.getBoundingClientRect().height > 0) { title = h; break; }
    }
    if (!title) return null;

    let best = null, n = title.parentElement || (title.getRootNode() && title.getRootNode().host);
    while (n && n !== document.body) {
      if (looksLikeDrawer(n)) best = n;   // climb: outermost matching wins
      n = n.parentElement || (n.getRootNode() && n.getRootNode().host);
    }
    return best;
  }

  function findByTextarea() {
    // The note editor is the giveaway: a big textarea inside a tall right panel.
    const areas = deepAll(document, (el) => el.tagName === 'TEXTAREA' && el.getBoundingClientRect().height > 120);
    for (const ta of areas) {
      let best = null, n = ta.parentElement || (ta.getRootNode() && ta.getRootNode().host);
      while (n && n !== document.body) {
        if (looksLikeDrawer(n)) best = n;
        n = n.parentElement || (n.getRootNode() && n.getRootNode().host);
      }
      if (best) return best;
    }
    return null;
  }

  function findByGeometry() {
    let best = null;
    const cands = deepAll(document, looksLikeDrawer);
    for (const el of cands) {
      if (!el.querySelector('textarea, input, [contenteditable="true"]')) continue;
      if (!best || el.contains(best)) best = el;
    }
    return best;
  }

  function findDrawer() {
    if (pickedSel) {
      try {
        const el = document.querySelector(pickedSel);
        if (el && visible(el) && el.getBoundingClientRect().height > 100) return el;
      } catch (e) { /* stale selector */ }
    }
    return findByTitle() || findByTextarea() || findByGeometry();
  }

  // ----------------------------------------------------------------- styling
  // Inline !important beats any stylesheet, and we widen the constraining
  // ancestors too — widening only the panel does nothing if a wrapper caps it.
  const applied = new Set();

  function forceWide(el, w) {
    const s = el.style;
    s.setProperty('width', w + 'px', 'important');
    s.setProperty('max-width', 'calc(100vw - 24px)', 'important');
    s.setProperty('min-width', '0', 'important');
    s.setProperty('flex', '0 0 auto', 'important');
    s.setProperty('flex-basis', 'auto', 'important');
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'absolute') {
      s.setProperty('left', 'auto', 'important');
      s.setProperty('right', '0', 'important');
    }
    applied.add(el);
  }

  function clearWide(el) {
    ['width', 'max-width', 'min-width', 'flex', 'flex-basis', 'left', 'right', 'min-height', 'white-space', 'font-family', 'resize', 'overflow']
      .forEach((p) => el.style.removeProperty(p));
  }

  function clearAll() {
    applied.forEach(clearWide);
    applied.clear();
  }

  function applyAll() {
    if (!current || !current.isConnected) return;
    clearAll();

    const panelW = current.getBoundingClientRect().width;
    forceWide(current, width);

    // Widen every ancestor that was roughly as narrow as the panel (the
    // wrappers actually doing the constraining). Full-width rows are skipped.
    let n = current.parentElement || (current.getRootNode() && current.getRootNode().host);
    let hops = 0;
    while (n && n !== document.body && n !== document.documentElement && hops < 8) {
      const r = n.getBoundingClientRect();
      if (r.width <= Math.max(panelW, width) + 80 && r.width < window.innerWidth * 0.97) {
        forceWide(n, width);
      }
      n = n.parentElement || (n.getRootNode() && n.getRootNode().host);
      hops++;
    }

    // Inner boxes with their own max-width, plus the note textarea.
    for (const el of current.querySelectorAll('div,form,section,header,footer,input,select,textarea')) {
      const cs = getComputedStyle(el);
      if (cs.maxWidth !== 'none') { el.style.setProperty('max-width', 'none', 'important'); applied.add(el); }
    }
    for (const ta of current.querySelectorAll('textarea')) {
      ta.style.setProperty('min-height', height + 'px', 'important');
      ta.style.setProperty('white-space', 'pre', 'important');
      ta.style.setProperty('overflow', 'auto', 'important');
      ta.style.setProperty('resize', 'both', 'important');
      ta.style.setProperty('font-family', 'ui-monospace, SFMono-Regular, Consolas, monospace', 'important');
      applied.add(ta);
    }
  }

  // ----------------------------------------------------------------- control
  let current = null;
  let ctl = null, range = null, val = null, stat = null, pickBtn = null;

  function describe(el) {
    if (!el) return 'no panel found';
    const cls = String(el.className || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
  }

  function mark(el) {
    if (current === el) { applyAll(); return; }
    if (current) clearAll();
    current = el;
    applyAll();
    if (stat) stat.textContent = describe(current);
  }

  function scan() {
    if (picking) return;
    mark(findDrawer());
  }

  // ------------------------------------------------------------ manual picker
  let picking = false, hovered = null;

  function cssPath(el) {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.body && parts.length < 6) {
      let sel = n.tagName.toLowerCase();
      if (n.id && !/^\d/.test(n.id)) { parts.unshift('#' + CSS.escape(n.id)); break; }
      const p = n.parentElement;
      if (p) {
        const same = Array.prototype.filter.call(p.children, (c) => c.tagName === n.tagName);
        if (same.length > 1) sel += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
      }
      parts.unshift(sel);
      n = p;
    }
    return parts.join(' > ');
  }

  function onPickMove(e) {
    if (hovered) hovered.classList.remove('lp-pick-hover');
    hovered = e.target;
    if (hovered && hovered.classList) hovered.classList.add('lp-pick-hover');
  }

  function onPickClick(e) {
    e.preventDefault();
    e.stopPropagation();
    let el = e.target;
    if (!el || el.closest('#lp-wide-ctl')) return;
    // Prefer the tall right-edge ancestor of whatever was clicked.
    let n = el, best = null;
    while (n && n !== document.body) {
      if (looksLikeDrawer(n)) best = n;
      n = n.parentElement;
    }
    el = best || el;
    pickedSel = cssPath(el);
    store.set(KEY_PICK, pickedSel);
    stopPicking();
    mark(el);
    console.log('[lp-wide] picked selector:', pickedSel, el);
  }

  function startPicking() {
    picking = true;
    pickBtn.classList.add('on');
    stat.textContent = 'click the panel…';
    document.addEventListener('mousemove', onPickMove, true);
    document.addEventListener('click', onPickClick, true);
  }

  function stopPicking() {
    picking = false;
    pickBtn.classList.remove('on');
    if (hovered) { hovered.classList.remove('lp-pick-hover'); hovered = null; }
    document.removeEventListener('mousemove', onPickMove, true);
    document.removeEventListener('click', onPickClick, true);
  }

  function debugDump() {
    const rows = deepAll(document, (el) => {
      const r = el.getBoundingClientRect();
      return r.height > window.innerHeight * 0.4 && r.width > 200 && r.width < window.innerWidth * 0.96;
    }).map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        el: el,
        tag: describe(el),
        w: Math.round(r.width), h: Math.round(r.height),
        right: Math.round(r.right), pos: cs.position,
        maxW: cs.maxWidth, flex: cs.flex
      };
    });
    console.log('[lp-wide] viewport', window.innerWidth + 'x' + window.innerHeight,
                '| picked:', pickedSel || '(none)', '| current:', current);
    console.table(rows.map(({ el, ...rest }) => rest));
    console.log('[lp-wide] candidate elements:', rows.map((r) => r.el));
    alert('lp-wide: dumped ' + rows.length + ' candidates to the console (F12 > Console). Paste the table back.');
  }

  function buildControl() {
    ctl = document.createElement('div');
    ctl.id = 'lp-wide-ctl';

    const lbl = document.createElement('span');
    lbl.className = 'lp-lbl';
    lbl.textContent = 'width';

    const minus = document.createElement('button');
    minus.textContent = '−'; minus.title = 'Narrower (Ctrl+Alt+Left)'; minus.dataset.act = 'minus';

    range = document.createElement('input');
    range.type = 'range'; range.min = String(MIN_W); range.max = String(MAX_W());
    range.step = '10'; range.value = String(width);

    const plus = document.createElement('button');
    plus.textContent = '+'; plus.title = 'Wider (Ctrl+Alt+Right)'; plus.dataset.act = 'plus';

    val = document.createElement('span');
    val.className = 'lp-val'; val.textContent = width + 'px';

    const maxBtn = document.createElement('button');
    maxBtn.textContent = 'max'; maxBtn.dataset.act = 'max';

    pickBtn = document.createElement('button');
    pickBtn.textContent = 'pick'; pickBtn.title = 'Click, then click the panel to target it manually'; pickBtn.dataset.act = 'pick';

    const dbgBtn = document.createElement('button');
    dbgBtn.textContent = 'debug'; dbgBtn.title = 'Dump candidate panels to console'; dbgBtn.dataset.act = 'debug';

    stat = document.createElement('span');
    stat.className = 'lp-stat'; stat.textContent = 'scanning…';

    ctl.append(lbl, minus, range, plus, val, maxBtn, pickBtn, dbgBtn, stat);
    document.body.appendChild(ctl);

    range.addEventListener('input', () => setWidth(Number(range.value)));
    ctl.addEventListener('click', (e) => {
      const act = e.target && e.target.dataset ? e.target.dataset.act : null;
      if (!act) return;
      if (act === 'minus') setWidth(width - STEP);
      if (act === 'plus')  setWidth(width + STEP);
      if (act === 'max')   setWidth(MAX_W());
      if (act === 'debug') debugDump();
      if (act === 'pick') {
        if (picking) { stopPicking(); scan(); }
        else if (e.shiftKey) { pickedSel = ''; store.set(KEY_PICK, ''); scan(); }
        else startPicking();
      }
    });
  }

  function setWidth(w) {
    width = clampW(w);
    store.set(KEY_W, width);
    if (range) { range.max = String(MAX_W()); range.value = String(width); }
    if (val) val.textContent = width + 'px';
    applyAll();
  }

  function setHeight(h) {
    height = Math.min(2400, Math.max(150, Math.round(h)));
    store.set(KEY_H, height);
    applyAll();
  }

  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.altKey) return;
    if (e.key === 'ArrowLeft')  { setWidth(width - STEP);  e.preventDefault(); }
    if (e.key === 'ArrowRight') { setWidth(width + STEP);  e.preventDefault(); }
    if (e.key === 'ArrowUp')    { setHeight(height + 60);  e.preventDefault(); }
    if (e.key === 'ArrowDown')  { setHeight(height - 60);  e.preventDefault(); }
    if (e.key === 'Escape' && picking) { stopPicking(); scan(); }
  }, true);

  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('Set panel width...', () => {
        const v = prompt('Panel width in px:', String(width)); if (v) setWidth(Number(v));
      });
      GM_registerMenuCommand('Set note box height...', () => {
        const v = prompt('Note textarea min-height in px:', String(height)); if (v) setHeight(Number(v));
      });
      GM_registerMenuCommand('Forget picked panel', () => {
        pickedSel = ''; store.set(KEY_PICK, ''); scan();
      });
      GM_registerMenuCommand('Dump panel candidates to console', debugDump);
    }
  } catch (e) {}

  // -------------------------------------------------------------------- boot
  function start() {
    if (!document.body) { setTimeout(start, 200); return; }
    buildControl();
    scan();

    let pending = null;
    new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(scan, 150);
    }).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style']
    });

    window.addEventListener('resize', () => { setWidth(width); scan(); });
    setInterval(scan, 1200);
    console.log('[lp-wide] v1.1.1 active in', location.href);
  }

  start();
})();
