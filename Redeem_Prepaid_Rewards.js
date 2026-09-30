(() => {
  'use strict';

  const EXISTING = window.__BS_REWARDS__;
  if (EXISTING && typeof EXISTING.invoke === 'function') {
    EXISTING.invoke();
    return;
  }

  const CFG = {
    enter: true,
    dup: true,
    histMax: 999,
    queueMax: 999,
    dMin: 900,
    dMax: 1250,
    poll: 120,
    actMax: 6000,
    capMax: 15000,
    submitMax: 30000,
    lockStale: 15000,
    lockBeat: 3000,
  };

  const K = {
    email: 'bs_bonus_email',
    clip: 'bs_clip',
    hist: 'bs_hist',
    queue: 'bs_queue_v2',
    active: 'bs_active_v2',
    auto: 'bs_auto_redeem_v2',
    lock: 'bs_lock_v2',
    tab: 'bs_tab_v2'
  };

  const q = s => document.querySelector(s);
  const qa = s => [...document.querySelectorAll(s)];
  const D = m => new Promise(r => setTimeout(r, m));
  const R = () => CFG.dMin + Math.floor(Math.random() * (CFG.dMax - CFG.dMin + 1));
  const txt = e => (e?.value || e?.textContent || '').trim();
  const bar = s => (String(s || '').match(/\b\d{30}\b/) || [])[0] || '';
  const V = e => {
    if (!e) return false;
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return !!(r.width && r.height && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0');
  };
  const ED = e => V(e) && !e.disabled && !e.readOnly;
  const eF = (e, ...a) => a.forEach(x => e.dispatchEvent(new Event(x, { bubbles: true })));
  const Ent = e => ['keydown', 'keypress', 'keyup'].forEach(x => e.dispatchEvent(new KeyboardEvent(x, {
    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
  })));
  const J = (key, fallback) => {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  };
  const S = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  const APP = {
    ok: () => !!document.body && document.body.dataset.project === 'BonusCardRewards'
  };
  if (!APP.ok()) return;

  const DOM = {
    step: () => q('.step_active') || document,
    code: () => q('#target_codes .serial-number_wrapper input:not([type="hidden"])') ||
      q('#target_codes .serial-number_wrapper input') ||
      q('#target_codes input:not([type="hidden"])'),
    next: () => [...DOM.step().querySelectorAll('input,button')]
      .find(e => txt(e).toUpperCase() === 'NEXT'),
    get: () => [...DOM.step().querySelectorAll('input,button,a')]
      .find(e => txt(e).toUpperCase() === 'GET MY BONUS'),
    email: () => [...DOM.step().querySelectorAll('input[type="email"]')].find(V),
    submit: () => [...DOM.step().querySelectorAll('button,a,input')]
      .find(e => V(e) && !e.disabled && e.getAttribute('aria-disabled') !== 'true' &&
        (txt(e).toUpperCase() === 'SHOW & EMAIL CODE' || e.name === 'commit')),
    done: () => qa('.btn-claim-another-code,button,a,input')
      .find(e => V(e) && !e.disabled && e.getAttribute('aria-disabled') !== 'true' &&
        txt(e).toUpperCase().includes('CLAIM ANOTHER BONUS')),
    err: () => qa('.alert,.alert-danger,[role="alert"],.error,.error-message,.form-error-inner')
      .find(e => V(e) && /\b(error|invalid|unable|failed|try again|not valid)\b/i.test(e.textContent || '')),
    sig: () => {
      const s = DOM.step();
      const n = DOM.next();
      return [
        location.href,
        s === document ? 'doc' : (s.id || s.className || 'step'),
        (s.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140),
        DOM.email() ? 1 : 0,
        DOM.done() ? 1 : 0,
        n ? +!!n.disabled : -1
      ].join('|');
    }
  };

  const HIST = {
    load() {
      const a = J(K.hist, []);
      return Array.isArray(a) ? a : [];
    },
    save(a) {
      S(K.hist, a.slice(-CFG.histMax));
      UI.counts();
    },
    async hash(s) {
      if (!crypto?.subtle) return s;
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    },
    async has(code) {
      if (!CFG.dup || !code) return false;
      const h = await HIST.hash(code);
      return HIST.load().some(x => x.h === h);
    },
    async add(code, meta = {}) {
      if (!code) return;
      const h = await HIST.hash(code);
      const a = HIST.load();
      if (!a.some(x => x.h === h)) {
        a.push({ h, code, last4: code.slice(-4), ts: Date.now(), ...meta });
        HIST.save(a);
      }
    },
    clear() {
      localStorage.removeItem(K.hist);
      UI.counts();
      UI.renderQueue();
    }
  };

  const QUEUE = {
    load() {
      const a = J(K.queue, []);
      return Array.isArray(a) ? a.slice(0, CFG.queueMax) : [];
    },
    save(a) {
      S(K.queue, a.slice(0, CFG.queueMax));
      UI.renderQueue();
      UI.counts();
    },
    active() {
      const x = J(K.active, null);
      return x && x.id ? x : null;
    },
    setActive(item) {
      item ? S(K.active, { id: item.id, last8: item.code?.slice(-8) || '', ts: Date.now() }) : localStorage.removeItem(K.active);
    },
    get(id) {
      return QUEUE.load().find(x => x.id === id) || null;
    },
    patch(id, patch) {
      const a = QUEUE.load();
      const i = a.findIndex(x => x.id === id);
      if (i < 0) return null;
      a[i] = { ...a[i], ...patch, updated: Date.now() };
      QUEUE.save(a);
      return a[i];
    },
    next() {
      return QUEUE.load().find(x => x.state === 'queued') || null;
    },
    unresolved() {
      return QUEUE.load().find(x => x.state === 'pending') || null;
    },
    current() {
      const a = QUEUE.active();
      return a ? QUEUE.get(a.id) : null;
    },
    async addCodes(text, source = 'paste') {
      const lines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      if (!lines.length) return { added: 0, invalid: 0, capped: 0 };

      let a = QUEUE.load();
      let added = 0, invalid = 0, capped = 0;
      const seen = new Set(a.map(x => x.code).filter(Boolean));

      for (const line of lines) {
        if (a.length >= CFG.queueMax) {
          capped++;
          continue;
        }
        const code = bar(line);
        if (!code) {
          invalid++;
          continue;
        }

        let state = 'queued';
        let note = '';
        if (seen.has(code)) {
          state = 'duplicate';
          note = 'duplicate in queue';
        } else if (await HIST.has(code)) {
          state = 'duplicate';
          note = 'already in history';
        }

        const active = QUEUE.active();
        if (active && active.last8 === code.slice(-8)) {
          const ax = QUEUE.get(active.id);
          if (ax?.code === code && ax.state === 'pending') {
            state = 'duplicate';
            note = 'matches pending attempt';
          }
        }

        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
        a.push({ id, code, state, note, source, created: Date.now(), updated: Date.now() });
        seen.add(code);
        added++;
      }

      QUEUE.save(a);
      return { added, invalid, capped };
    },
    async markHistoryDuplicates() {
      const a = QUEUE.load();
      let changed = false;
      for (const x of a) {
        if (x.state !== 'queued') continue;
        if (await HIST.has(x.code)) {
          x.state = 'duplicate';
          x.note = 'already in history';
          x.updated = Date.now();
          changed = true;
        }
      }
      if (changed) QUEUE.save(a);
    },
    recover() {
      const a = QUEUE.load();
      const active = QUEUE.active();
      let changed = false;
      for (const x of a) {
        if (x.state === 'processing') {
          x.state = 'queued';
          x.note = 'resumed after interruption';
          x.updated = Date.now();
          changed = true;
        }
      }
      if (active) {
        const x = a.find(v => v.id === active.id);
        if (!x || x.state !== 'pending') localStorage.removeItem(K.active);
      }
      if (changed) QUEUE.save(a);
    },
    clear() {
      localStorage.removeItem(K.queue);
      localStorage.removeItem(K.active);
      UI.renderQueue();
      UI.counts();
    }
  };

  const LOCK = {
    tab() {
      let id = sessionStorage.getItem(K.tab);
      if (!id) {
        id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem(K.tab, id);
      }
      return id;
    },
    read() {
      return J(K.lock, null);
    },
    acquire() {
      const now = Date.now();
      const mine = LOCK.tab();
      const l = LOCK.read();
      if (l && l.owner !== mine && now - Number(l.ts || 0) < CFG.lockStale) return false;
      S(K.lock, { owner: mine, ts: now });
      const v = LOCK.read();
      return v?.owner === mine;
    },
    beat() {
      if (!window._bsRunning) return;
      const mine = LOCK.tab();
      const l = LOCK.read();
      if (!l || l.owner !== mine) {
        window._bsStop = true;
        UI.status('Stopped — another tab took control');
        return;
      }
      S(K.lock, { owner: mine, ts: Date.now() });
    },
    release() {
      const l = LOCK.read();
      if (l?.owner === LOCK.tab()) localStorage.removeItem(K.lock);
    }
  };

  const UI = {
    style: `
#bsp{--bg:rgba(18,20,23,.82);--surface:rgba(27,30,35,.82);--surface2:rgba(35,39,46,.80);--line:rgba(84,92,105,.72);--text:#f4f6f8;--muted:#a8b0bc;--dim:#747d89;--blue:#4c8dff;--green:#35c76f;--amber:#e6ae3a;--red:#f05b61;position:fixed;top:18px;right:18px;width:460px;max-height:calc(100vh - 36px);overflow:visible;z-index:2147483647;color:var(--text);font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
#bsp *{box-sizing:border-box}
#bsm{background:var(--bg);border:1px solid var(--line);box-shadow:0 10px 32px rgba(0,0,0,.58);border-radius:12px;overflow:hidden;max-height:calc(100vh - 36px);display:flex;flex-direction:column;backdrop-filter:saturate(115%) blur(3px);-webkit-backdrop-filter:saturate(115%) blur(3px)}
#bsh{display:flex;gap:8px;align-items:center;padding:9px;border-bottom:1px solid var(--line);background:var(--surface);flex:0 0 auto}
#bsi{min-width:0;flex:1;min-height:36px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:rgba(35,39,46,.86);color:var(--text);font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;outline:none}
#bsi:focus,#bstext:focus{border-color:var(--blue);box-shadow:0 0 0 2px rgba(76,141,255,.24)}
#bsi::placeholder,#bstext::placeholder{color:var(--dim)}
.bsbtn{border:1px solid var(--line);border-radius:8px;background:rgba(35,39,46,.84);color:var(--text);min-height:36px;padding:7px 10px;font:600 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;cursor:pointer;transition:background .14s ease,border-color .14s ease,filter .14s ease}
.bsbtn:hover{background:rgba(55,61,71,.9);border-color:rgba(93,103,118,.9)}
.bsbtn:active{filter:brightness(.92)}
.bsbtn[disabled]{opacity:.42;cursor:default}
#bsa{width:40px;padding:0;font-size:17px;border-color:rgba(76,141,255,.62);background:rgba(76,141,255,.20)}
#bsa[data-running="1"]{border-color:rgba(230,174,58,.68);background:rgba(230,174,58,.20);color:#ffe4a1}
#bsc{width:40px;padding:0;position:relative;font-size:16px}
#bsc[data-on="0"]:after{content:'×';position:absolute;right:2px;bottom:-1px;font-size:16px;color:var(--muted)}
#bsbody{padding:9px;min-height:0;overflow:auto;flex:1 1 auto}
#bstext{width:100%;height:92px;resize:vertical;white-space:pre;overflow:auto;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:rgba(35,39,46,.82);color:var(--text);font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;outline:none}
#bsrow{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
#bsrow .bsbtn{width:100%}
#bsload{background:rgba(76,141,255,.88);border-color:rgba(76,141,255,.92);color:#fff}
#bsload:hover{background:rgba(92,153,255,.94);border-color:#5c99ff}
#bsauto{background:rgba(35,39,46,.78);border-color:var(--line);color:var(--muted)}
#bsauto[data-on="1"]{background:rgba(53,199,111,.22);border-color:rgba(53,199,111,.66);color:#b9f3cc}
#bsstatus{margin-top:8px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:rgba(27,30,35,.78);white-space:pre-wrap;text-align:left;min-height:34px;font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
#bsprog{margin-top:7px;color:var(--muted);font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
#bslist{margin-top:7px;border:1px solid var(--line);border-radius:8px;max-height:270px;overflow:auto;background:rgba(15,17,20,.76)}
.bsitem{display:grid;grid-template-columns:16px 1fr auto;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid rgba(66,73,84,.48);white-space:nowrap;font:11px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.bsitem:hover{background:rgba(255,255,255,.045)}
.bsitem:last-child{border-bottom:0}
.bsitem .code{overflow:hidden;text-overflow:ellipsis;color:#e8ebef}
.bsitem .st{color:var(--muted);font-size:10px}
.bsdot{font-size:14px;line-height:1;text-align:center}.s-queued{color:#8c96a3}.s-processing,.s-pending{color:var(--amber)}.s-complete{color:var(--green)}.s-duplicate,.s-error{color:var(--red)}
#bsfoot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 9px;border-top:1px solid var(--line);background:rgba(27,30,35,.84);flex:0 0 auto}
#bscredit{opacity:1;white-space:nowrap;color:var(--text);font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
#bscounts{display:flex;align-items:center;gap:3px;text-align:right;white-space:nowrap}
.bscounter{appearance:none;border:0;background:transparent;color:var(--muted);padding:3px 5px;border-radius:5px;font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;cursor:pointer}
.bscounter:hover,.bscounter:focus,.bscounter[data-open="1"]{color:var(--text);background:rgba(53,59,68,.78);outline:none}
#bssep{color:var(--dim);opacity:.7}
#bsdrawer{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:4;border:1px solid var(--line);border-radius:10px;background:rgba(20,23,27,.82);box-shadow:0 12px 30px rgba(0,0,0,.48);display:flex;flex-direction:column;min-height:0;overflow:hidden;backdrop-filter:saturate(115%) blur(3px);-webkit-backdrop-filter:saturate(115%) blur(3px)}
#bsdrawer[data-side="above"]{top:auto;bottom:calc(100% + 6px)}
#bsdrawer[hidden]{display:none}
#bsdrawerhead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border-bottom:1px solid var(--line);background:rgba(27,30,35,.80)}
#bsdrawertitle{font-weight:700}
#bsdrawercount{color:var(--muted);font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
#bsdrawerlist{overflow:auto;max-height:540px;background:rgba(15,17,20,.72);overscroll-behavior:contain}
.bsdraweritem{display:grid;grid-template-columns:16px 1fr auto;gap:6px;align-items:center;min-height:27px;padding:5px 9px;border-bottom:1px solid rgba(66,73,84,.44);white-space:nowrap;font:11px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.bsdraweritem:last-child{border-bottom:0}
.bsdraweritem:hover{background:rgba(255,255,255,.045)}
.bsdraweritem[data-revealable="1"]{cursor:pointer}
.bsdraweritem[data-revealed="1"]{background:rgba(76,141,255,.09)}
.bsdraweritem .code{overflow:hidden;text-overflow:ellipsis;color:#e8ebef}
.bsdraweritem .meta{color:var(--muted);font-size:10px}
#bsdrawerempty{padding:12px 10px;color:var(--muted);font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
#bsdraweractions{padding:8px 9px;border-top:1px solid var(--line);background:rgba(27,30,35,.80)}
#bsdrawerclear{width:100%;background:rgba(240,91,97,.15);border-color:rgba(240,91,97,.50);color:#ffc4c7}
#bsconfirm{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:5;border:1px solid var(--line);border-radius:10px;padding:10px 9px;background:rgba(27,30,35,.84);box-shadow:0 12px 30px rgba(0,0,0,.48);backdrop-filter:saturate(115%) blur(3px);-webkit-backdrop-filter:saturate(115%) blur(3px)}
#bsconfirm[data-side="above"]{top:auto;bottom:calc(100% + 6px)}
#bsconfirm[hidden]{display:none}
#bsconfirmtitle{font-weight:700;margin-bottom:4px}
#bsconfirmmsg{color:var(--muted);white-space:pre-wrap}
#bsconfirmactions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}
#bsconfirmok{background:rgba(240,91,97,.22);border-color:rgba(240,91,97,.62);color:#ffc4c7}
`,
    mount() {
      q('#bss')?.remove();
      document.body.appendChild(Object.assign(document.createElement('style'), { id: 'bss', textContent: UI.style }));
      q('#bsp')?.remove();
      document.body.insertAdjacentHTML('beforeend', `
<div id="bsp"><div id="bsm">
  <div id="bsh">
    <input id="bsi" type="email" placeholder="Email address">
    <button id="bsc" class="bsbtn" title="Clipboard barcode">📋</button>
    <button id="bsa" class="bsbtn" title="Start / stop">▶</button>
  </div>
  <div id="bsbody">
    <textarea id="bstext" wrap="off" spellcheck="false" placeholder="Paste one 30-digit barcode per line"></textarea>
    <div id="bsrow">
      <button id="bsauto" class="bsbtn">Auto-Redeem: OFF</button>
      <button id="bsload" class="bsbtn">Add to Queue</button>
    </div>
    <div id="bsstatus">Ready</div>
    <div id="bsprog"></div>
    <div id="bslist"></div>
  </div>
  <div id="bsfoot"><span id="bscredit">courtesy of dotsthewarlock</span><span id="bscounts"><button id="bscountq" class="bscounter" type="button" title="View queue">queue 0/999</button><span id="bssep">•</span><button id="bscounth" class="bscounter" type="button" title="View redemption history">history 0/999</button></span></div>
</div>
<div id="bsdrawer" hidden><div id="bsdrawerhead"><span id="bsdrawertitle"></span><span id="bsdrawercount"></span></div><div id="bsdrawerlist"></div><div id="bsdraweractions"><button id="bsdrawerclear" class="bsbtn" type="button"></button></div></div>
<div id="bsconfirm" hidden><div id="bsconfirmtitle"></div><div id="bsconfirmmsg"></div><div id="bsconfirmactions"><button id="bsconfirmcancel" class="bsbtn" type="button">Cancel</button><button id="bsconfirmok" class="bsbtn" type="button">Clear</button></div></div>
</div>`);

      const email = q('#bsi');
      email.value = localStorage.getItem(K.email) || '';
      email.oninput = () => localStorage.setItem(K.email, email.value.trim());

      const clip = q('#bsc');
      const setClip = on => {
        clip.dataset.on = on ? '1' : '0';
        localStorage.setItem(K.clip, on ? '1' : '0');
        clip.title = `Paste barcode from clipboard: ${on ? 'ON' : 'OFF'}`;
      };
      setClip(localStorage.getItem(K.clip) === '1');
      clip.onclick = () => {
        if (window._bsRunning) return UI.status('Stop workflow before changing clipboard mode');
        setClip(clip.dataset.on !== '1');
        UI.status(`Clipboard barcode: ${clip.dataset.on === '1' ? 'ON' : 'OFF'}`);
      };

      q('#bsa').onclick = () => window._bsRunning ? APPCTL.stop(false) : WF.run(false);
      q('#bsauto').onclick = () => {
        const on = !APPCTL.auto();
        APPCTL.setAuto(on);
        UI.status(`Auto-Redeem ${on ? 'enabled' : 'disabled'}`);
      };
      q('#bsload').onclick = async () => {
        if (window._bsRunning) return UI.status('Stop workflow before editing the queue');
        const ta = q('#bstext');
        const r = await QUEUE.addCodes(ta.value, 'paste');
        ta.value = '';
        const bits = [`${r.added} added`];
        if (r.invalid) bits.push(`${r.invalid} invalid ignored`);
        if (r.capped) bits.push(`${r.capped} over 999 limit ignored`);
        UI.status(bits.join(' • '));
      };
      q('#bscountq').onclick = () => UI.togglePanel('queue');
      q('#bscounth').onclick = () => UI.togglePanel('history');
      q('#bsdrawerlist').onclick = e => UI.toggleHistoryReveal(e);
      q('#bsdrawerclear').onclick = () => {
        const p = q('#bsdrawer');
        if (p && !p.hidden && p.dataset.type) UI.openClear(p.dataset.type);
      };
      q('#bsconfirmcancel').onclick = () => UI.closeClear();
      q('#bsconfirmok').onclick = () => UI.confirmClear();

      if (UI._docPanelHandler) document.removeEventListener('pointerdown', UI._docPanelHandler, true);
      if (UI._keyPanelHandler) document.removeEventListener('keydown', UI._keyPanelHandler, true);
      if (UI._resizePanelHandler) window.removeEventListener('resize', UI._resizePanelHandler);
      UI._docPanelHandler = e => {
        const d = q('#bsdrawer'), c = q('#bsconfirm');
        const open = (d && !d.hidden) || (c && !c.hidden);
        if (!open) return;
        if (d && !d.hidden && d.contains(e.target)) return;
        if (c && !c.hidden && c.contains(e.target)) return;
        if (q('#bscountq')?.contains(e.target) || q('#bscounth')?.contains(e.target)) return;
        UI.closePanel();
        UI.closeClear();
      };
      UI._keyPanelHandler = e => {
        if (e.key === 'Escape') {
          UI.closePanel();
          UI.closeClear();
        }
      };
      UI._resizePanelHandler = () => {
        const d = q('#bsdrawer'), c = q('#bsconfirm');
        if (d && !d.hidden) UI.placeFloat(d, true);
        if (c && !c.hidden) UI.placeFloat(c, false);
      };
      document.addEventListener('pointerdown', UI._docPanelHandler, true);
      document.addEventListener('keydown', UI._keyPanelHandler, true);
      window.addEventListener('resize', UI._resizePanelHandler);

      UI.auto();
      UI.running(!!window._bsRunning);
      UI.renderQueue();
      UI.counts();
    },
    ensure() {
      if (!q('#bsp')) UI.mount();
      q('#bsp').style.display = 'block';
      UI.auto();
      UI.running(!!window._bsRunning);
      UI.renderQueue();
      UI.counts();
    },
    status(m = 'Ready') {
      const b = q('#bsstatus');
      if (b) b.textContent = m;
    },
    running(on) {
      const b = q('#bsa');
      if (!b) return;
      b.dataset.running = on ? '1' : '0';
      b.textContent = on ? '⏸' : '▶';
      b.title = on ? 'Stop / pause workflow' : 'Start / resume workflow';
    },
    auto() {
      const b = q('#bsauto');
      if (!b) return;
      const on = APPCTL.auto();
      b.dataset.on = on ? '1' : '0';
      b.textContent = `Auto-Redeem: ${on ? 'ON' : 'OFF'}`;
    },
    counts() {
      const qn = QUEUE.load().length;
      const hn = HIST.load().length;
      const qc = q('#bscountq');
      const hc = q('#bscounth');
      if (qc) qc.textContent = `queue ${qn}/${CFG.queueMax}`;
      if (hc) hc.textContent = `history ${hn}/${CFG.histMax}`;
      UI.progress();
      UI.renderPanel();
    },
    placeFloat(el, withList = false) {
      if (!el || el.hidden) return;
      const host = q('#bsp');
      if (!host) return;
      const r = host.getBoundingClientRect();
      const gap = 6;
      const below = Math.max(0, innerHeight - r.bottom - gap - 8);
      const above = Math.max(0, r.top - gap - 8);
      const desired = withList ? 632 : 170;
      const useAbove = below < Math.min(desired, above) && above > below;
      el.dataset.side = useAbove ? 'above' : 'below';
      if (withList) {
        const list = q('#bsdrawerlist');
        if (list) {
          const available = useAbove ? above : below;
          const chrome = 96;
          list.style.maxHeight = `${Math.max(54, Math.min(540, available - chrome))}px`;
        }
      }
    },
    togglePanel(type) {
      const p = q('#bsdrawer');
      if (!p) return;
      const same = !p.hidden && p.dataset.type === type;
      UI.closeClear();
      if (same) return UI.closePanel();
      p.dataset.type = type;
      p.hidden = false;
      UI.renderPanel();
      UI.placeFloat(p, true);
    },
    closePanel() {
      const p = q('#bsdrawer');
      if (p) {
        p.hidden = true;
        delete p.dataset.type;
        delete p.dataset.side;
      }
      const list = q('#bsdrawerlist');
      if (list) list.style.maxHeight = '';
      UI._historyReveal = null;
      const qc = q('#bscountq'), hc = q('#bscounth');
      if (qc) delete qc.dataset.open;
      if (hc) delete hc.dataset.open;
    },
    toggleHistoryReveal(e) {
      const p = q('#bsdrawer');
      if (!p || p.hidden || p.dataset.type !== 'history') return;
      const row = e.target?.closest?.('.bsdraweritem[data-hkey]');
      if (!row || !p.contains(row)) return;
      if (row.dataset.revealable !== '1') {
        UI.status('Full code unavailable for this legacy history entry');
        return;
      }
      UI._historyReveal = UI._historyReveal === row.dataset.hkey ? null : row.dataset.hkey;
      UI.renderPanel();
    },
    renderPanel() {
      const p = q('#bsdrawer');
      if (!p || p.hidden || !p.dataset.type) return;
      const type = p.dataset.type;
      const title = q('#bsdrawertitle'), count = q('#bsdrawercount'), list = q('#bsdrawerlist'), clear = q('#bsdrawerclear');
      const qc = q('#bscountq'), hc = q('#bscounth');
      if (qc) qc.dataset.open = type === 'queue' ? '1' : '0';
      if (hc) hc.dataset.open = type === 'history' ? '1' : '0';
      if (!title || !count || !list || !clear) return;
      const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      if (type === 'history') {
        const a = HIST.load().slice().reverse();
        title.textContent = 'Redemption History';
        count.textContent = `${a.length}/${CFG.histMax}`;
        clear.textContent = 'Clear History';
        clear.disabled = !a.length;
        if (!a.length) {
          list.innerHTML = '<div id="bsdrawerempty">No cached redemption history</div>';
          UI.placeFloat(p, true);
          return;
        }
        list.innerHTML = a.map((x, i) => {
          const d = x.ts ? new Date(x.ts) : null;
          const when = d && !Number.isNaN(d.getTime()) ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
          const last4 = x.last4 || x.code?.slice(-4) || x.last8?.slice(-4) || '????';
          const key = String(x.h || `${x.ts || 0}-${i}`);
          const revealable = /^\d{30}$/.test(x.code || '');
          const revealed = revealable && UI._historyReveal === key;
          const shown = revealed ? x.code : `•••• ${last4}`;
          const tip = revealable ? (revealed ? 'Click to hide full code' : 'Click to reveal full code') : 'Full code unavailable for legacy entry';
          return `<div class="bsdraweritem" data-hkey="${esc(key)}" data-revealable="${revealable ? '1' : '0'}" data-revealed="${revealed ? '1' : '0'}" title="${esc(tip)}"><span class="bsdot s-complete">●</span><span class="code">${esc(shown)}</span><span class="meta">${esc(when)}</span></div>`;
        }).join('');
      } else {
        const a = QUEUE.load();
        const label = { queued: 'queued', processing: 'processing', pending: 'pending / verify', complete: 'complete', duplicate: 'duplicate', error: 'error' };
        title.textContent = 'Current Queue';
        count.textContent = `${a.length}/${CFG.queueMax}`;
        clear.textContent = 'Clear Queue';
        clear.disabled = !a.length;
        if (!a.length) {
          list.innerHTML = '<div id="bsdrawerempty">Queue empty</div>';
          UI.placeFloat(p, true);
          return;
        }
        list.innerHTML = a.map(x => `<div class="bsdraweritem" title="${esc(x.note || '')}"><span class="bsdot s-${esc(x.state)}">●</span><span class="code">${esc(x.code || '')}</span><span class="meta">${esc(label[x.state] || x.state)}</span></div>`).join('');
      }
      UI.placeFloat(p, true);
    },
    openClear(type) {
      if (window._bsRunning) return UI.status(`Stop workflow before clearing ${type === 'history' ? 'history' : 'the queue'}`);
      const p = q('#bsconfirm'), title = q('#bsconfirmtitle'), msg = q('#bsconfirmmsg'), ok = q('#bsconfirmok');
      if (!p || !title || !msg || !ok) return;
      UI.closePanel();
      if (type === 'history') {
        const n = HIST.load().length;
        if (!n) return UI.status('History is already empty');
        p.dataset.type = 'history';
        title.textContent = 'Clear redemption history?';
        msg.textContent = `${n} cached redemption record${n === 1 ? '' : 's'} will be removed. Duplicate protection for those entries will be lost.`;
        ok.textContent = 'Clear History';
      } else {
        const a = QUEUE.load(), n = a.length;
        if (!n) return UI.status('Queue is already empty');
        const risky = a.some(x => x.state === 'pending');
        p.dataset.type = 'queue';
        title.textContent = 'Clear current queue?';
        msg.textContent = `${n} queue item${n === 1 ? '' : 's'} will be removed.${risky ? ' A pending/ambiguous item is present; clearing removes its visible verification record.' : ''}`;
        ok.textContent = 'Clear Queue';
      }
      p.hidden = false;
      UI.placeFloat(p, false);
      ok.focus();
    },
    closeClear() {
      const p = q('#bsconfirm');
      if (!p) return;
      p.hidden = true;
      delete p.dataset.type;
      delete p.dataset.side;
    },
    confirmClear() {
      const p = q('#bsconfirm');
      if (!p || p.hidden) return;
      const type = p.dataset.type;
      UI.closeClear();
      if (type === 'history') {
        UI._historyReveal = null;
        HIST.clear();
        UI.status('Redemption history cleared');
      } else if (type === 'queue') {
        QUEUE.clear();
        UI.status('Queue cleared');
      }
    },
    progress() {
      const b = q('#bsprog');
      if (!b) return;
      const a = QUEUE.load();
      const n = s => a.filter(x => x.state === s).length;
      const complete = n('complete'), dup = n('duplicate'), err = n('error'), pending = n('pending'), queued = n('queued'), processing = n('processing');
      b.textContent = a.length ? `${complete}/${a.length} complete • ${queued} queued • ${processing + pending} pending • ${dup} duplicate • ${err} error` : 'Queue empty';
    },
    renderQueue() {
      const b = q('#bslist');
      if (!b) return;
      const a = QUEUE.load();
      if (!a.length) {
        b.innerHTML = '<div class="bsitem"><span class="bsdot s-queued">•</span><span class="code">No queued barcodes</span><span class="st">idle</span></div>';
        UI.progress();
        return;
      }
      const label = { queued: 'queued', processing: 'processing', pending: 'pending / verify', complete: 'complete', duplicate: 'duplicate', error: 'error' };
      const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      b.innerHTML = a.map(x => `<div class="bsitem" title="${esc(x.note || '')}"><span class="bsdot s-${esc(x.state)}">●</span><span class="code">${esc(x.code || '')}</span><span class="st">${esc(label[x.state] || x.state)}</span></div>`).join('');
      UI.progress();
    }
  };

  const CAP = {
    on: () => qa('iframe[src*="/recaptcha/api2/bframe"],iframe[title*="recaptcha challenge" i]').some(V),
    async wait(pre) {
      UI.status('CAPTCHA — complete it normally');
      while (!window._bsStop && CAP.on()) await D(200);
      if (window._bsStop) return false;
      UI.status('CAPTCHA solved — waiting for verification...');
      let end = Date.now() + CFG.capMax;
      while (!window._bsStop && Date.now() < end) {
        if (CAP.on()) {
          UI.status('CAPTCHA — complete it normally');
          while (!window._bsStop && CAP.on()) await D(200);
          end = Date.now() + CFG.capMax;
          continue;
        }
        if (DOM.err() || DOM.done() || DOM.sig() !== pre || DOM.submit()) {
          await D(R());
          return true;
        }
        await D(CFG.poll);
      }
      UI.status('CAPTCHA closed/incomplete — press ▶ to retry');
      return false;
    }
  };

  const CLIP = {
    async read() {
      if (q('#bsc')?.dataset.on !== '1' || !navigator.clipboard) return '';
      try {
        return bar(await navigator.clipboard.readText());
      } catch {
        UI.status('Clipboard blocked');
        return '';
      }
    },
    async seedQueue() {
      const c = await CLIP.read();
      if (!c) return false;
      const a = QUEUE.load();
      if (a.some(x => x.code === c)) return false;
      await QUEUE.addCodes(c, 'clipboard');
      return true;
    }
  };

  const MAN = {
    wait(c) {
      return new Promise(res => {
        const step0 = DOM.step(), href0 = location.href;
        let done = false;
        const msg = 'Enter barcode manually or add items to the queue';
        UI.status(msg);
        c?.focus();
        const end = v => {
          if (done) return;
          done = true;
          clearInterval(iv);
          c?.removeEventListener('keydown', key, true);
          document.removeEventListener('click', clk, true);
          res(v);
        };
        const key = e => e.key === 'Enter' && end('enter');
        const clk = e => {
          const b = e.target?.closest?.('input,button,a');
          if (b && txt(b).toUpperCase() === 'NEXT') end('next');
        };
        c?.addEventListener('keydown', key, true);
        document.addEventListener('click', clk, true);
        const iv = setInterval(() => {
          if (window._bsStop) return end('stop');
          if (CAP.on()) return end('cap');
          if (location.href !== href0 || DOM.step() !== step0) return end('change');
          const n = DOM.next();
          if (!c?.isConnected || !n) return end('change');
          if (QUEUE.next()) return end('queue');
        }, 250);
      });
    }
  };

  const ACT = {
    async wait(pre) {
      const end = Date.now() + CFG.actMax;
      while (!window._bsStop && Date.now() < end) {
        if (CAP.on()) return 'cap';
        if (DOM.err()) return 'err';
        if (DOM.sig() !== pre) return 'change';
        await D(CFG.poll);
      }
      return 'timeout';
    }
  };

  const OUT = {
    async wait() {
      let end = Date.now() + CFG.submitMax;
      while (!window._bsStop && Date.now() < end) {
        if (DOM.done()) return 'done';
        if (DOM.err()) return 'err';
        if (CAP.on()) {
          const pre = DOM.sig();
          if (!await CAP.wait(pre)) return window._bsStop ? 'stop' : 'timeout';
          end = Date.now() + CFG.submitMax;
          continue;
        }
        await D(CFG.poll);
      }
      return window._bsStop ? 'stop' : 'timeout';
    }
  };

  const APPCTL = {
    auto() {
      return localStorage.getItem(K.auto) === '1';
    },
    setAuto(on) {
      localStorage.setItem(K.auto, on ? '1' : '0');
      UI.auto();
    },
    async invoke() {
      UI.ensure();
      if (window._bsRunning) {
        APPCTL.setAuto(false);
        APPCTL.stop(true);
        UI.status('Killed by reinvoke — Auto-Redeem OFF');
        return;
      }
      QUEUE.recover();
      await QUEUE.markHistoryDuplicates();
      if (APPCTL.auto()) WF.run(true);
      else UI.status('Ready — add barcodes, then press ▶ or enable Auto-Redeem');
    },
    stop(kill = false) {
      if (!window._bsRunning) return;
      window._bsStop = true;
      UI.status(kill ? 'Killing workflow...' : 'Stopping...');
    }
  };

  const WF = {
    async prepareItem() {
      await QUEUE.markHistoryDuplicates();
      const pending = QUEUE.unresolved();
      if (pending) {
        QUEUE.setActive(pending);
        if (DOM.done()) return pending;
        UI.status(`Pending/ambiguous ••••${pending.code.slice(-8)} — verify before continuing`);
        return null;
      }

      let item = QUEUE.next();
      if (!item) {
        await CLIP.seedQueue();
        item = QUEUE.next();
      }
      if (!item) return null;

      if (await HIST.has(item.code)) {
        QUEUE.patch(item.id, { state: 'duplicate', note: 'already in history' });
        return WF.prepareItem();
      }

      item = QUEUE.patch(item.id, { state: 'processing', note: '' });
      QUEUE.setActive(item);
      return item;
    },
    async confirmDone() {
      let item = QUEUE.current();
      if (!item) item = QUEUE.unresolved();
      if (!item) {
        UI.status('Success page detected, but no active queue item is known — stopped for verification');
        return false;
      }
      await HIST.add(item.code, { queueId: item.id });
      QUEUE.patch(item.id, { state: 'complete', note: 'confirmed by success page' });
      QUEUE.setActive(null);
      UI.status(`Complete ••••${item.code.slice(-8)}`);
      return true;
    },
    async failCurrent(note) {
      const item = QUEUE.current();
      if (item && item.state !== 'pending') {
        QUEUE.patch(item.id, { state: 'error', note: note || 'page error' });
        QUEUE.setActive(null);
      }
    },
    async run(autoStart = false) {
      if (window._bsRunning) return UI.status('Already running');
      UI.ensure();
      QUEUE.recover();
      await QUEUE.markHistoryDuplicates();

      if (!LOCK.acquire()) {
        UI.status('Another tab is currently running this workflow');
        return;
      }

      window._bsRunning = true;
      window._bsStop = false;
      UI.running(true);
      const beat = setInterval(LOCK.beat, CFG.lockBeat);
      let cur = '';

      try {
        while (!window._bsStop) {
          if (!APP.ok()) {
            UI.status('Unexpected page');
            break;
          }

          if (CAP.on()) {
            if (!await CAP.wait(DOM.sig())) break;
            continue;
          }

          if (DOM.err()) {
            const item = QUEUE.current();
            if (item?.state === 'pending') {
              UI.status(`Page error after submission ••••${item.code.slice(-8)} — verify before retrying`);
            } else {
              await WF.failCurrent((DOM.err()?.textContent || 'Page error detected').trim().slice(0, 180));
              UI.status('Page error detected — item marked error; press ▶ after resolving the page');
            }
            break;
          }

          let done = DOM.done();
          if (done) {
            if (!await WF.confirmDone()) break;
            UI.status('Complete — opening next redemption...');
            await D(R());
            if (window._bsStop) break;
            done = DOM.done();
            if (done) {
              done.click();
              cur = '';
              await D(R());
              continue;
            }
            UI.status('Claim Another Bonus unavailable');
            break;
          }

          const unresolved = QUEUE.unresolved();
          if (unresolved) {
            QUEUE.setActive(unresolved);
            UI.status(`Pending/ambiguous ••••${unresolved.code.slice(-8)} — verify before continuing`);
            break;
          }

          let item = QUEUE.current();
          if (!item || item.state !== 'processing') item = await WF.prepareItem();

          if (!item) {
            const all = QUEUE.load();
            if (!all.length && !autoStart && !APPCTL.auto()) {
              const mc = DOM.code();
              if (mc && ED(mc)) {
                const existing = bar(mc.value);
                if (existing) {
                  await QUEUE.addCodes(existing, 'manual');
                  continue;
                }
                const why = await MAN.wait(mc);
                if (why === 'cap') continue;
                if (why === 'stop') break;
                const manual = bar(mc.value);
                if (manual) await QUEUE.addCodes(manual, 'manual');
                continue;
              }
            }
            if (autoStart || APPCTL.auto()) UI.status('Queue complete / no eligible queued barcodes');
            else UI.status('No eligible queued barcodes — add items or enter one manually');
            break;
          }
          cur = item.code;

          let g = DOM.get();
          if (g && V(g)) {
            if (g.disabled || g.getAttribute('aria-disabled') === 'true') {
              UI.status('Waiting for Get My Bonus...');
              await D(CFG.poll);
              continue;
            }
            const pre = DOM.sig();
            g.click();
            UI.status(`Clicked Get My Bonus ••••${cur.slice(-8)}`);
            await D(R());
            const st = await ACT.wait(pre);
            if (st === 'cap') continue;
            if (st === 'err') continue;
            continue;
          }

          const n = DOM.next(), c = DOM.code();
          if (n && V(n)) {
            const raw = (c?.value || '').trim();
            const sn = bar(raw);

            if (!n.disabled) {
              const code = sn || cur;
              if (code && code !== cur) {
                UI.status(`Page contains a different barcode ••••${code.slice(-8)} — stopped`);
                break;
              }
              const pre = DOM.sig();
              n.click();
              UI.status(`Clicked Next ••••${cur.slice(-8)}`);
              await D(R());
              const st = await ACT.wait(pre);
              if (st === 'cap') continue;
              continue;
            }

            if (!ED(c)) {
              UI.status('Preparing barcode input...');
              await D(CFG.poll);
              continue;
            }

            if (sn && sn !== cur) {
              UI.status(`Barcode field already contains another code ••••${sn.slice(-8)} — stopped`);
              break;
            }

            if (!sn) {
              c.focus();
              c.value = cur;
              eF(c, 'input', 'change');
              if (CFG.enter) Ent(c);
              UI.status(`Loaded barcode ••••${cur.slice(-8)}`);
              await D(R());
              continue;
            }

            c.focus();
            eF(c, 'input', 'change');
            if (CFG.enter) Ent(c);
            await D(R());
            continue;
          }

          const ei = DOM.email();
          if (ei) {
            const em = q('#bsi')?.value.trim() || '';
            const t = q('#workflow_data_terms_of_service');
            if (t && !t.checked) {
              t.checked = true;
              eF(t, 'change');
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
              q('#bsi')?.focus();
              UI.status('Enter a valid email address');
              break;
            }
            qa('input[type="email"]').forEach(i => {
              if (i.value !== em) {
                i.value = em;
                eF(i, 'input', 'change');
              }
            });

            if (await HIST.has(cur)) {
              QUEUE.patch(item.id, { state: 'duplicate', note: 'became duplicate before submission' });
              QUEUE.setActive(null);
              UI.status(`Duplicate stopped ••••${cur.slice(-8)}`);
              continue;
            }

            UI.status(`Preparing submission ••••${cur.slice(-8)}...`);
            await D(R());
            if (window._bsStop) break;
            if (CAP.on()) continue;
            const b = DOM.submit();
            if (!b) {
              UI.status('Submit unavailable — stopped');
              break;
            }

            item = QUEUE.patch(item.id, { state: 'pending', note: 'submission clicked; awaiting confirmation', submitted: Date.now() });
            QUEUE.setActive(item);
            b.click();
            UI.status(`Submitted ••••${cur.slice(-8)} — waiting for confirmation...`);
            const outcome = await OUT.wait();
            if (outcome === 'done' || outcome === 'err') continue;
            if (outcome === 'stop') break;
            UI.status(`Pending/ambiguous ••••${cur.slice(-8)} — verification timed out; confirm before retrying`);
            break;
          }

          const c2 = DOM.code();
          if (c2 && ED(c2)) {
            if (!cur) {
              const why = await MAN.wait(c2);
              if (why === 'cap') continue;
              if (why === 'stop') break;
              if (why === 'queue') continue;
            } else {
              c2.focus();
              c2.value = cur;
              eF(c2, 'input', 'change');
              if (CFG.enter) Ent(c2);
              await D(R());
            }
            continue;
          }

          UI.status('Waiting for page...');
          await D(CFG.poll);
        }
      } finally {
        clearInterval(beat);
        LOCK.release();
        const item = QUEUE.current();
        if (item?.state === 'processing') {
          QUEUE.patch(item.id, { state: 'queued', note: window._bsStop ? 'paused before submission' : item.note });
          QUEUE.setActive(null);
        }
        window._bsRunning = false;
        UI.running(false);
        UI.renderQueue();
        UI.counts();
        if (window._bsStop) UI.status('Stopped — queue preserved; press ▶ to resume');
      }
    }
  };

  const API = {
    invoke: APPCTL.invoke,
    stop: APPCTL.stop,
    run: WF.run,
    queue: QUEUE,
    history: HIST
  };
  window.__BS_REWARDS__ = API;

  QUEUE.recover();
  UI.mount();
  APPCTL.invoke();
})();
