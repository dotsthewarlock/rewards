(() => {
  'use strict';

  const SCRIPT_VERSION = '11';

  /*
   * ============================================================================
   * AI MAINTENANCE NOTES
   * ============================================================================
   *
   * VERSION
   * -------
   * 11
   *
   * PURPOSE
   * -------
   * This companion script automates the shared InComm-style rewards redemption
   * application used by multiple promotions/domains. Version 11 keeps the v8
   * interaction engine semantics while retaining slug-scoped caches and captures
   * gift-card credentials from the confirmed success page before navigation.
   * The visible branding and body[data-project] value are NOT reliable application
   * identifiers.
   *
   * PAGE IDENTITY
   * -------------
   * A supported page is identified by one of two structural fingerprints:
   *
   * Redemption-entry page:
   *   1. .bcr-redemption
   *   2. form#new_workflow_data inside that container
   *   3. .wizard-serial-number inside that form
   *
   * Redemption-success page:
   *   1. main.value-add.wizard
   *   2. .confirmation-block
   *   3. .codes-container with labeled reward credentials
   *   4. .btn-claim-another-code
   *
   * Do not replace this with a body[data-project] check. Project names vary by
   * promotion (for example, BonusCardRewards vs Walmart) while the redemption
   * application structure remains the same.
   *
   * PROMOTION IDENTITY
   * ------------------
   * currentSlug is derived only from document.body.dataset.slug and must match:
   *     ^CA\d{4}[A-Z]+$
   * Examples: CA1026VANW, CA0926CKVAN
   *
   * There are intentionally TWO slug concepts:
   *   - currentSlug: the promotion represented by the currently loaded page.
   *   - viewSlug:    the promotion cache currently selected in the UI dropdown.
   *
   * CRITICAL INVARIANT:
   * Live/operational actions MUST ALWAYS read/write currentSlug, never viewSlug.
   * viewSlug exists only for reviewing and explicitly clearing cached data.
   * Starting any live action automatically switches the UI back to currentSlug.
   *
   * STORAGE MODEL
   * -------------
   * localStorage is already isolated by browser origin. We additionally namespace
   * all promotion-specific state by slug so multiple promotions on one domain do
   * not share queue/history/settings.
   *
   * Example keys:
   *   bs_rewards:CA1026VANW:queue
   *   bs_rewards:CA1026VANW:history
   *   bs_rewards:CA1026VANW:giftcards
   *   bs_rewards:CA1026VANW:active
   *   bs_rewards:CA1026VANW:auto
   *
   * A per-origin slug index lets the dropdown list previously seen promotions on
   * the same domain. Cross-domain caches are intentionally invisible to each other
   * because localStorage cannot cross origins.
   *
   * GIFT-CARD CAPTURE
   * -----------------
   * A success page is not considered safely complete until the displayed reward
   * credentials have been scraped, validated, and persisted under currentSlug.
   * If success is visible but capture fails, automation MUST halt before clicking
   * "Claim another bonus" so the credential page is not discarded. Gift cards
   * are deduplicated by normalized GC Number + GC PIN.
   *
   * QUEUE SAFETY
   * ------------
   * Redemptions are strictly serial: one code at a time. An ambiguous/pending item
   * blocks automatic advancement because retrying an uncertain submission could
   * cause duplicate redemption attempts. Reinvoking the bookmarklet while running
   * is an emergency stop and disables Auto-Redeem.
   *
   * HISTORY PRIVACY
   * ---------------
   * New history records intentionally store the full 30-digit submitted code in
   * localStorage because the UI supports click-to-reveal. This is plaintext storage
   * under the current site origin. Clearing history/cache removes those records.
   *
   * SELECTOR MAINTENANCE
   * --------------------
   * Prefer semantic/structural selectors already present in both supported sites.
   * Avoid exact hashed asset filenames, body[data-project], or promotion-specific
   * URLs unless there is no structural alternative.
   * ============================================================================
   */

  const EXISTING = window.__BS_REWARDS__;
  if (EXISTING && typeof EXISTING.invoke === 'function') {
    EXISTING.invoke();
    return;
  }

  const CFG = Object.freeze({
    historyMax: 999,
    giftCardMax: 999,
    queueMax: 999,
    visibleDrawerRows: 20,
    rowHeightPx: 27,
    delayMin: 900,
    delayMax: 1250,
    pollMs: 120,
    actionTimeoutMs: 6500,
    captchaTimeoutMs: 15000,
    submitTimeoutMs: 30000,
    lockStaleMs: 15000,
    lockHeartbeatMs: 3000,
    slugPattern: /^CA\d{4}[A-Z]+$/
  });

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const jitter = () => CFG.delayMin + Math.floor(Math.random() * (CFG.delayMax - CFG.delayMin + 1));
  const norm = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const upper = value => norm(value).toUpperCase();
  const esc = value => String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[ch]);
  const visible = el => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const enabled = el => !!el && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  const actionable = el => visible(el) && enabled(el);
  const uid = () => (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const extractBarcode = value => (String(value || '').match(/\b\d{30}\b/) || [])[0] || '';

  // ---------------------------------------------------------------------------
  // Supported-page detection and promotion identity.
  // ---------------------------------------------------------------------------
  const PAGE = {
    root() {
      return $('.bcr-redemption');
    },
    form() {
      const root = PAGE.root();
      return root ? $('form#new_workflow_data', root) : null;
    },
    serial() {
      const form = PAGE.form();
      return form ? $('.wizard-serial-number', form) : null;
    },
    redemptionFingerprintOK() {
      return !!(PAGE.root() && PAGE.form() && PAGE.serial());
    },
    successRoot() {
      return $('main.value-add.wizard') || $('#main');
    },
    successFingerprintOK() {
      const root = PAGE.successRoot();
      if (!root) return false;
      const confirmation = $('.confirmation-block', root);
      const codes = confirmation ? $('.codes-container', confirmation) : null;
      const claim = $('.btn-claim-another-code', root);
      return !!(confirmation && codes && claim);
    },
    slug() {
      return norm(document.body && document.body.dataset ? document.body.dataset.slug : '').toUpperCase();
    },
    slugOK(slug) {
      return CFG.slugPattern.test(String(slug || ''));
    },
    supported() {
      const slug = PAGE.slug();
      return PAGE.slugOK(slug) && (PAGE.redemptionFingerprintOK() || PAGE.successFingerprintOK());
    }
  };

  const currentSlug = PAGE.slug();
  if (!PAGE.supported()) {
    alert('Rewards Redemption: supported redemption or success page not found for this promotion.');
    return;
  }

  // ---------------------------------------------------------------------------
  // Storage namespacing.
  // IMPORTANT: operational code must pass currentSlug explicitly. viewSlug is UI.
  // ---------------------------------------------------------------------------
  const STORE_PREFIX = 'bs_rewards';
  const ORIGIN_KEYS = Object.freeze({
    slugIndex: `${STORE_PREFIX}:slug_index_v1`,
    legacyMigration: `${STORE_PREFIX}:legacy_migration_v1`
  });

  const keyFor = (slug, name) => `${STORE_PREFIX}:${slug}:${name}`;

  const STORE = {
    getText(slug, name, fallback = '') {
      try {
        const value = localStorage.getItem(keyFor(slug, name));
        return value == null ? fallback : value;
      } catch (_) {
        return fallback;
      }
    },
    setText(slug, name, value) {
      try {
        localStorage.setItem(keyFor(slug, name), String(value));
        SLUGS.touch(slug);
        return true;
      } catch (_) {
        return false;
      }
    },
    getJSON(slug, name, fallback) {
      try {
        const raw = localStorage.getItem(keyFor(slug, name));
        if (raw == null) return fallback;
        const parsed = JSON.parse(raw);
        return parsed == null ? fallback : parsed;
      } catch (_) {
        return fallback;
      }
    },
    setJSON(slug, name, value) {
      try {
        localStorage.setItem(keyFor(slug, name), JSON.stringify(value));
        SLUGS.touch(slug);
        return true;
      } catch (_) {
        return false;
      }
    },
    getBool(slug, name, fallback = false) {
      const raw = STORE.getText(slug, name, fallback ? '1' : '0');
      return raw === '1' || raw === 'true';
    },
    setBool(slug, name, value) {
      return STORE.setText(slug, name, value ? '1' : '0');
    },
    remove(slug, name) {
      try {
        localStorage.removeItem(keyFor(slug, name));
      } catch (_) {}
    },
    clearSlug(slug) {
      // Keep this list explicit so future AI edits can audit exactly what a full
      // cache clear removes. Lock state is included; session tab IDs are separate.
      ['email', 'clipboard', 'history', 'giftcards', 'queue', 'active', 'auto', 'lock'].forEach(name => STORE.remove(slug, name));
    }
  };

  const SLUGS = {
    load() {
      try {
        const parsed = JSON.parse(localStorage.getItem(ORIGIN_KEYS.slugIndex) || '[]');
        return Array.isArray(parsed)
          ? parsed.map(x => norm(x).toUpperCase()).filter(x => PAGE.slugOK(x))
          : [];
      } catch (_) {
        return [];
      }
    },
    save(items) {
      const unique = [...new Set(items.filter(x => PAGE.slugOK(x)))];
      try {
        localStorage.setItem(ORIGIN_KEYS.slugIndex, JSON.stringify(unique));
      } catch (_) {}
      return unique;
    },
    touch(slug) {
      if (!PAGE.slugOK(slug)) return;
      const items = SLUGS.load();
      if (!items.includes(slug)) items.push(slug);
      SLUGS.save(items);
    },
    remove(slug) {
      if (slug === currentSlug) return;
      SLUGS.save(SLUGS.load().filter(x => x !== slug));
    }
  };

  SLUGS.touch(currentSlug);

  // One-time best-effort migration from the pre-slug version of this script.
  // The old cache had no promotion identity, so it can only be assigned safely to
  // the first valid promotion opened after upgrade. Values are COPIED, not deleted.
  // This prevents accidental loss and prevents the same legacy cache being copied
  // into every later slug on the same origin.
  (() => {
    try {
      if (localStorage.getItem(ORIGIN_KEYS.legacyMigration)) return;
      const map = {
        bs_bonus_email: 'email',
        bs_clip: 'clipboard',
        bs_hist: 'history',
        bs_queue_v2: 'queue',
        bs_active_v2: 'active',
        bs_auto_redeem_v2: 'auto'
      };
      let copied = 0;
      for (const [legacyKey, newName] of Object.entries(map)) {
        const legacy = localStorage.getItem(legacyKey);
        const target = keyFor(currentSlug, newName);
        if (legacy != null && localStorage.getItem(target) == null) {
          localStorage.setItem(target, legacy);
          copied++;
        }
      }
      localStorage.setItem(ORIGIN_KEYS.legacyMigration, JSON.stringify({ slug: currentSlug, copied, ts: Date.now() }));
    } catch (_) {}
  })();

  // ---------------------------------------------------------------------------
  // Promotion-specific settings.
  // ---------------------------------------------------------------------------
  const SETTINGS = {
    email(slug) {
      return STORE.getText(slug, 'email', '');
    },
    setEmail(slug, value) {
      STORE.setText(slug, 'email', norm(value));
    },
    clipboard(slug) {
      return STORE.getBool(slug, 'clipboard', false);
    },
    setClipboard(slug, value) {
      STORE.setBool(slug, 'clipboard', !!value);
    },
    auto(slug) {
      return STORE.getBool(slug, 'auto', false);
    },
    setAuto(slug, value) {
      STORE.setBool(slug, 'auto', !!value);
    }
  };

  // ---------------------------------------------------------------------------
  // Redemption history.
  // New records store full code + hash + last4. Legacy records without `code`
  // remain readable but cannot reveal a full code that was never stored.
  // ---------------------------------------------------------------------------
  const HIST = {
    load(slug) {
      const rows = STORE.getJSON(slug, 'history', []);
      return Array.isArray(rows) ? rows.slice(-CFG.historyMax) : [];
    },
    save(slug, rows) {
      STORE.setJSON(slug, 'history', Array.isArray(rows) ? rows.slice(-CFG.historyMax) : []);
    },
    async hash(code) {
      const s = String(code || '');
      try {
        if (window.crypto && window.crypto.subtle && typeof TextEncoder !== 'undefined') {
          const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
          return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
        }
      } catch (_) {}
      // Fallback is not cryptographic; it exists only for duplicate matching on
      // browsers where SubtleCrypto is unavailable.
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return `fallback_${(h >>> 0).toString(16)}_${s}`;
    },
    async has(slug, code) {
      const rows = HIST.load(slug);
      if (rows.some(row => row && row.code === code)) return true;
      const h = await HIST.hash(code);
      return rows.some(row => row && row.h === h);
    },
    async add(slug, code, meta = {}) {
      if (!extractBarcode(code)) return false;
      if (await HIST.has(slug, code)) return false;
      const rows = HIST.load(slug);
      rows.push({
        h: await HIST.hash(code),
        code,
        last4: code.slice(-4),
        ts: Date.now(),
        ...meta
      });
      HIST.save(slug, rows);
      return true;
    },
    clear(slug) {
      STORE.remove(slug, 'history');
    }
  };

  // ---------------------------------------------------------------------------
  // Gift-card cache.
  //
  // Visible/export schema is intentionally fixed to:
  //   Card Merchant | Value Recent | GC Number | GC PIN
  //
  // Internal records also retain timestamp, slug, source redemption code, and a
  // stable dedupe key. Credentials remain strings to preserve leading zeroes and
  // avoid JavaScript/Excel numeric precision assumptions.
  // ---------------------------------------------------------------------------
  const GIFTS = {
    load(slug) {
      const rows = STORE.getJSON(slug, 'giftcards', []);
      return Array.isArray(rows) ? rows.slice(-CFG.giftCardMax) : [];
    },
    save(slug, rows) {
      STORE.setJSON(slug, 'giftcards', Array.isArray(rows) ? rows.slice(-CFG.giftCardMax) : []);
      UI.counts();
    },
    normalizeCredential(value) {
      return norm(value).replace(/\s+/g, '');
    },
    dedupeKey(card) {
      const number = GIFTS.normalizeCredential(card && card.gcNumber).toUpperCase();
      const pin = GIFTS.normalizeCredential(card && card.gcPin).toUpperCase();
      return `${number}|${pin}`;
    },
    valid(card) {
      if (!card) return false;
      return !!(
        norm(card.cardMerchant) &&
        /^\d+(?:\.\d{2})$/.test(String(card.valueRecent || '')) &&
        GIFTS.normalizeCredential(card.gcNumber) &&
        GIFTS.normalizeCredential(card.gcPin)
      );
    },
    add(slug, card) {
      if (!GIFTS.valid(card)) return { ok: false, added: false, reason: 'Gift-card data is incomplete' };
      const rows = GIFTS.load(slug);
      const key = GIFTS.dedupeKey(card);
      const existing = rows.find(row => row && (row.key || GIFTS.dedupeKey(row)) === key);
      if (existing) return { ok: true, added: false, row: existing };
      const row = {
        key,
        cardMerchant: norm(card.cardMerchant),
        valueRecent: String(card.valueRecent),
        gcNumber: norm(card.gcNumber),
        gcPin: norm(card.gcPin),
        sourceRedemptionCode: extractBarcode(card.sourceRedemptionCode || ''),
        slug,
        ts: Date.now()
      };
      rows.push(row);
      GIFTS.save(slug, rows);
      return { ok: true, added: true, row };
    },
    clear(slug) {
      STORE.remove(slug, 'giftcards');
      UI.counts();
    },
    tsv(slug) {
      const clean = value => String(value == null ? '' : value).replace(/[\t\r\n]+/g, ' ').trim();
      return GIFTS.load(slug).map(row => [
        clean(row.cardMerchant),
        clean(row.valueRecent),
        clean(row.gcNumber),
        clean(row.gcPin)
      ].join('\t')).join('\n');
    },
    csv(slug) {
      const quote = value => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
      const lines = [['Card Merchant', 'Value Recent', 'GC Number', 'GC PIN']];
      for (const row of GIFTS.load(slug)) {
        lines.push([row.cardMerchant, row.valueRecent, row.gcNumber, row.gcPin]);
      }
      return lines.map(cols => cols.map(quote).join(',')).join('\r\n');
    }
  };

  // ---------------------------------------------------------------------------
  // Queue state machine.
  // queued -> processing -> pending -> complete
  //                    \-> error
  // duplicate is terminal and never processed.
  //
  // `pending` means a submission may have reached the server but the browser did
  // not obtain a definitive outcome. Any pending item blocks further automation.
  // ---------------------------------------------------------------------------
  const QUEUE = {
    load(slug) {
      const rows = STORE.getJSON(slug, 'queue', []);
      return Array.isArray(rows) ? rows.slice(-CFG.queueMax) : [];
    },
    save(slug, rows) {
      STORE.setJSON(slug, 'queue', Array.isArray(rows) ? rows.slice(-CFG.queueMax) : []);
      UI.counts();
    },
    active(slug) {
      const value = STORE.getJSON(slug, 'active', null);
      return value && typeof value === 'object' ? value : null;
    },
    setActive(slug, value) {
      if (value) STORE.setJSON(slug, 'active', value);
      else STORE.remove(slug, 'active');
    },
    find(slug, id) {
      return QUEUE.load(slug).find(x => x && x.id === id) || null;
    },
    findByCode(slug, code) {
      return QUEUE.load(slug).find(x => x && x.code === code) || null;
    },
    patch(slug, id, patch) {
      const rows = QUEUE.load(slug);
      const i = rows.findIndex(x => x && x.id === id);
      if (i < 0) return null;
      rows[i] = { ...rows[i], ...patch, updated: Date.now() };
      QUEUE.save(slug, rows);
      return rows[i];
    },
    next(slug) {
      return QUEUE.load(slug).find(x => x && x.state === 'queued') || null;
    },
    unresolvedPending(slug) {
      return QUEUE.load(slug).find(x => x && x.state === 'pending') || null;
    },
    current(slug) {
      const active = QUEUE.active(slug);
      return active && active.id ? QUEUE.find(slug, active.id) : null;
    },
    async addCodes(slug, rawText) {
      const sourceLines = String(rawText || '').split(/\r?\n/);
      const candidates = [];
      for (const line of sourceLines) {
        const matches = line.match(/\b\d{30}\b/g) || [];
        candidates.push(...matches);
      }
      if (!candidates.length) {
        const one = extractBarcode(rawText);
        if (one) candidates.push(one);
      }

      const rows = QUEUE.load(slug);
      let inserted = 0;
      let queued = 0;
      let duplicates = 0;

      for (const code of candidates) {
        if (rows.length >= CFG.queueMax) break;
        const duplicateInQueue = rows.some(x => x && x.code === code && x.state !== 'error');
        const duplicateInHistory = await HIST.has(slug, code);
        const isDuplicate = duplicateInQueue || duplicateInHistory;
        rows.push({
          id: uid(),
          code,
          state: isDuplicate ? 'duplicate' : 'queued',
          note: isDuplicate ? (duplicateInHistory ? 'Already in redemption history' : 'Already in queue') : '',
          created: Date.now(),
          updated: Date.now()
        });
        inserted++;
        if (isDuplicate) duplicates++;
        else queued++;
      }

      QUEUE.save(slug, rows);
      return { inserted, queued, duplicates };
    },
    async markHistoryDuplicates(slug) {
      const rows = QUEUE.load(slug);
      let changed = false;
      for (const row of rows) {
        if (row && row.state === 'queued' && await HIST.has(slug, row.code)) {
          row.state = 'duplicate';
          row.note = 'Already in redemption history';
          row.updated = Date.now();
          changed = true;
        }
      }
      if (changed) QUEUE.save(slug, rows);
    },
    recover(slug) {
      /*
       * Recovery rule:
       * - `processing` is always pre-submit and can safely return to queued.
       * - A true submitted `pending` item remains blocked.
       * - Version 10 incorrectly marked one PRE-submit CAPTCHA timeout path as
       *   pending. That exact known-bad state is safe to repair to queued. This
       *   one-time behavioral repair prevents an old v10 cache from permanently
       *   blocking the v11 workflow with "pending item must be verified".
       */
      const active = QUEUE.active(slug);
      const rows = QUEUE.load(slug);
      let changed = false;
      let repairedPendingId = '';

      for (const row of rows) {
        if (!row) continue;
        if (row.state === 'processing') {
          const isSubmittedActive = active && active.id === row.id && active.phase === 'submitted';
          row.state = isSubmittedActive ? 'pending' : 'queued';
          row.note = isSubmittedActive ? 'Previous submitted state was not verified' : 'Recovered after reload';
          row.updated = Date.now();
          changed = true;
          continue;
        }

        if (row.state === 'pending' && /CAPTCHA state could not be verified/i.test(String(row.note || ''))) {
          row.state = 'queued';
          row.note = 'Recovered v10 pre-submit CAPTCHA state';
          row.updated = Date.now();
          repairedPendingId = row.id;
          changed = true;
        }
      }

      if (changed) QUEUE.save(slug, rows);
      if (active && (active.phase !== 'submitted' || active.id === repairedPendingId)) QUEUE.setActive(slug, null);
    },
    clear(slug) {
      STORE.remove(slug, 'queue');
      STORE.remove(slug, 'active');
      UI.counts();
    }
  };

  // ---------------------------------------------------------------------------
  // Cross-tab execution lock. Locks are also slug-scoped, so two different
  // promotions on the same origin do not falsely block each other.
  // ---------------------------------------------------------------------------
  const LOCK = {
    timer: null,
    tabId(slug) {
      const k = `${STORE_PREFIX}:${slug}:tab_session`;
      let id = '';
      try { id = sessionStorage.getItem(k) || ''; } catch (_) {}
      if (!id) {
        id = uid();
        try { sessionStorage.setItem(k, id); } catch (_) {}
      }
      return id;
    },
    read(slug) {
      return STORE.getJSON(slug, 'lock', null);
    },
    write(slug) {
      STORE.setJSON(slug, 'lock', { tab: LOCK.tabId(slug), ts: Date.now() });
    },
    acquire(slug) {
      const current = LOCK.read(slug);
      const mine = LOCK.tabId(slug);
      if (current && current.tab !== mine && Date.now() - Number(current.ts || 0) < CFG.lockStaleMs) return false;
      LOCK.write(slug);
      const verify = LOCK.read(slug);
      if (!verify || verify.tab !== mine) return false;
      clearInterval(LOCK.timer);
      LOCK.timer = setInterval(() => LOCK.write(slug), CFG.lockHeartbeatMs);
      return true;
    },
    release(slug) {
      clearInterval(LOCK.timer);
      LOCK.timer = null;
      const current = LOCK.read(slug);
      if (current && current.tab === LOCK.tabId(slug)) STORE.remove(slug, 'lock');
    }
  };

  // ---------------------------------------------------------------------------
  // DOM adapter. Keep site-specific selectors concentrated here.
  // ---------------------------------------------------------------------------
  const DOM = {
    form: () => PAGE.form(),
    activeStep() {
      return $('.step.step_active', PAGE.root() || document) || $('.step_active', PAGE.root() || document);
    },
    controls(root = DOM.activeStep() || PAGE.form() || document) {
      return $$('input,button', root).filter(visible);
    },
    byLabel(label, root = DOM.activeStep() || PAGE.form() || document) {
      const wanted = upper(label);
      return DOM.controls(root).find(el => upper(el.value || el.textContent) === wanted) || null;
    },
    greeting() {
      return DOM.byLabel('GET MY BONUS');
    },
    codeInput() {
      const active = DOM.activeStep();
      return (active && $('.wizard-serial-number', active)) || $('.wizard-serial-number', PAGE.form() || document);
    },
    next() {
      return DOM.byLabel('NEXT');
    },
    email() {
      const form = PAGE.form() || document;
      return $('#workflow_data_email', form) || $('input[name="workflow_data[email]"]', form);
    },
    emailConfirm() {
      const form = PAGE.form() || document;
      return $('#workflow_data_email_confirmation', form) || $('input[name="workflow_data[email_confirmation]"]', form);
    },
    terms() {
      const form = PAGE.form() || document;
      return $('#workflow_data_terms_of_service', form) || $('input[name="workflow_data[terms_of_service]"][type="checkbox"]', form);
    },
    submit() {
      const form = PAGE.form() || document;
      const direct = $$('#target_submit input[type="submit"], #target_submit button[type="submit"]', form)
        .find(visible);
      if (direct) return direct;
      return $$('input[type="submit"],button[type="submit"]', form).find(el =>
        visible(el) && (el.name === 'commit' || /SHOW\s*&?\s*EMAIL\s*CODE|SUBMIT/i.test(norm(el.value || el.textContent)))
      ) || null;
    },
    successGiftCard() {
      const root = $('.confirmation-block', PAGE.successRoot() || document);
      if (!root || !visible(root)) return { ok: false, reason: 'Success confirmation is not visible' };

      const codes = $('.codes-container', root);
      if (!codes) return { ok: false, reason: 'Gift-card code container was not found' };

      // Pair each semantic label with the next credential value in DOM order.
      // This is intentionally label-driven rather than based on digit length so
      // future merchants can use different credential formats.
      const fields = {};
      const children = Array.from(codes.children || []);
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!child.classList || !child.classList.contains('title')) continue;
        const label = upper(child.textContent);
        let value = '';
        for (let j = i + 1; j < children.length; j++) {
          const next = children[j];
          if (next.classList && next.classList.contains('title')) break;
          if (next.classList && next.classList.contains('text')) {
            value = norm(next.textContent);
            break;
          }
        }
        if (label) fields[label] = value;
      }

      const product = norm(($('.h5', root) || {}).textContent);
      const merchant = product
        .replace(/\s+E?GIFT\s*CARD.*$/i, '')
        .replace(/\s+GIFT\s*CARD.*$/i, '')
        .trim() || norm(document.body && document.body.dataset ? document.body.dataset.project : '');

      const heading = norm(($('h3', root) || {}).textContent);
      const amountMatch = heading.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
      const amount = amountMatch ? Number(amountMatch[1]) : NaN;
      const valueRecent = Number.isFinite(amount) ? amount.toFixed(2) : '';

      const gcNumber = fields['BONUS CODE'] || fields['GIFT CARD NUMBER'] || fields['CARD NUMBER'] || fields['CODE'] || '';
      const gcPin = fields['PIN'] || fields['GIFT CARD PIN'] || fields['CARD PIN'] || '';

      // The success page includes "Eligible Card:" below the confirmation block.
      // A 30-digit match is a stronger association to the submitted redemption
      // than relying only on the currently active queue item.
      const context = root.closest('.redemption-form') || PAGE.successRoot() || document;
      const sourceRedemptionCode = extractBarcode(norm(context.textContent));

      const card = { cardMerchant: merchant, valueRecent, gcNumber, gcPin, sourceRedemptionCode };
      if (!GIFTS.valid(card)) {
        const missing = [];
        if (!merchant) missing.push('merchant');
        if (!valueRecent) missing.push('value');
        if (!gcNumber) missing.push('GC number');
        if (!gcPin) missing.push('GC PIN');
        return { ok: false, reason: `Missing ${missing.join(', ') || 'gift-card fields'}`, card };
      }
      return { ok: true, card };
    },
    claimAnother() {
      const root = PAGE.root() || PAGE.successRoot() || document;
      return $('.btn-claim-another-code', root) ||
        DOM.controls(root).find(el => /CLAIM\s+ANOTHER/i.test(upper(el.value || el.textContent))) || null;
    },
    done() {
      const root = PAGE.root() || PAGE.successRoot() || document;
      const confirmation = $('.confirmation-block', root);
      if (confirmation && visible(confirmation)) return true;
      const claim = DOM.claimAnother();
      return !!(claim && visible(claim));
    },
    errorText() {
      const root = PAGE.root() || document;
      const candidates = [
        ...$$('#target_errors .form-error-inner, #target_errors .alert, #target_errors .error, .form-error-inner', root)
      ];
      const visibleTexts = candidates.filter(visible).map(x => norm(x.textContent)).filter(Boolean);
      return visibleTexts.join(' | ');
    },
    fireValueEvents(el) {
      if (!el) return;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    pressEnter(el) {
      if (!el) return;
      for (const type of ['keydown', 'keypress', 'keyup']) {
        el.dispatchEvent(new KeyboardEvent(type, {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
        }));
      }
    },
    setValue(el, value, { enter = false } = {}) {
      if (!el) return;
      el.focus();
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      const setter = descriptor && descriptor.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      DOM.fireValueEvents(el);
      if (enter) DOM.pressEnter(el);
    },
    click(el) {
      if (!actionable(el)) return false;
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.click();
      return true;
    }
  };

  // ---------------------------------------------------------------------------
  // CAPTCHA watcher. It never attempts to solve/bypass reCAPTCHA; it only waits
  // for a visible challenge to disappear after normal site interaction.
  // ---------------------------------------------------------------------------
  const CAP = {
    challengeVisible() {
      return $$('iframe[src*="recaptcha"][src*="bframe"], iframe[title*="challenge"], iframe[title*="recaptcha challenge"]')
        .some(frame => visible(frame));
    },
    async waitIfNeeded() {
      if (!CAP.challengeVisible()) return true;
      UI.status('CAPTCHA challenge detected — complete it in the page', 'pending');
      const start = Date.now();
      while (APPCTL.running && Date.now() - start < CFG.captchaTimeoutMs) {
        if (!CAP.challengeVisible()) return true;
        await sleep(CFG.pollMs);
      }
      return !CAP.challengeVisible();
    }
  };

  // ---------------------------------------------------------------------------
  // UI. viewSlug is intentionally UI-only. Any live action calls ensureCurrentView
  // before touching queue/settings so there is no path where a dropdown selection
  // can redirect a redemption into the wrong promotion cache.
  // ---------------------------------------------------------------------------
  const UI = {
    viewSlug: currentSlug,
    historyTab: 'redemptions',
    historyReveal: null,
    giftReveal: null,
    root: null,
    style: null,
    docPanelHandler: null,
    keyPanelHandler: null,
    resizePanelHandler: null,

    mount() {
      if ($('#bsp')) {
        UI.root = $('#bsp');
        UI.renderAll();
        return;
      }

      const style = document.createElement('style');
      style.id = 'bsstyle';
      style.textContent = `
#bsp{--bg:rgba(18,20,23,.82);--surface:rgba(27,30,35,.82);--surface2:rgba(35,39,46,.80);--line:rgba(84,92,105,.72);--text:#f4f6f8;--muted:#a8b0bc;--dim:#747d89;--blue:#4c8dff;--green:#35c76f;--amber:#e6ae3a;--red:#f05b61;position:fixed;top:18px;right:18px;width:460px;max-height:calc(100vh - 36px);overflow:visible;z-index:2147483647;color:var(--text);font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
#bsp *{box-sizing:border-box}
#bsm{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:var(--bg);box-shadow:0 18px 55px rgba(0,0,0,.48);backdrop-filter:saturate(115%) blur(4px);-webkit-backdrop-filter:saturate(115%) blur(4px)}
#bshead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border-bottom:1px solid var(--line);background:rgba(27,30,35,.78)}
#bstitle{font-weight:700;font-size:13px;letter-spacing:.1px}
#bsslugtools{display:flex;align-items:center;gap:6px;min-width:0}
#bsslugselect{min-width:165px;max-width:220px;height:28px;border:1px solid var(--line);border-radius:7px;background:rgba(12,14,17,.75);color:var(--text);font:11px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:0 24px 0 8px;outline:none}
#bsclearcache{height:28px;padding:0 8px;border:1px solid rgba(240,91,97,.55);border-radius:7px;background:rgba(240,91,97,.10);color:#ffb8bb;font-size:11px;cursor:pointer}
#bsclearcache:hover{background:rgba(240,91,97,.18)}
#bsviewnote{padding:6px 10px;border-bottom:1px solid var(--line);background:rgba(15,17,20,.58);color:var(--muted);font-size:11px}
#bsviewnote.cached{color:#ffd783;background:rgba(110,77,16,.22)}
#bsbody{padding:10px}
#bsinput{width:100%;height:110px;resize:vertical;min-height:72px;max-height:220px;border:1px solid var(--line);border-radius:9px;background:rgba(12,14,17,.70);color:var(--text);outline:none;padding:9px 10px;white-space:pre;overflow:auto;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
#bsinput:focus,#bsemail:focus,#bsslugselect:focus{border-color:rgba(76,141,255,.85);box-shadow:0 0 0 2px rgba(76,141,255,.12)}
.bsrow{display:flex;align-items:center;gap:8px;margin-top:8px}
.bsbtn{height:32px;border:1px solid var(--line);border-radius:8px;background:var(--surface2);color:var(--text);padding:0 10px;cursor:pointer;font-weight:600}
.bsbtn:hover{filter:brightness(1.08)}
.bsbtn:disabled{opacity:.45;cursor:not-allowed}
#bsactions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
#bsauto.on{background:rgba(53,199,111,.22);border-color:rgba(53,199,111,.62);color:#bff3d0}
#bsadd{background:rgba(76,141,255,.28);border-color:rgba(76,141,255,.70);color:#dce9ff}
#bsemail{flex:1;height:32px;min-width:0;border:1px solid var(--line);border-radius:8px;background:rgba(12,14,17,.70);color:var(--text);padding:0 9px;outline:none}
#bsclip{min-width:104px}
#bsclip.on{background:rgba(76,141,255,.18);border-color:rgba(76,141,255,.48)}
#bsplay{width:100%;height:34px;background:rgba(76,141,255,.22);border-color:rgba(76,141,255,.58)}
#bsplay.running{background:rgba(230,174,58,.22);border-color:rgba(230,174,58,.65);color:#ffe2a1}
#bsstatus{min-height:30px;margin-top:8px;padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:rgba(15,17,20,.60);color:var(--muted);font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere}
#bsstatus.ok{color:#bff3d0;border-color:rgba(53,199,111,.36)}
#bsstatus.pending{color:#ffe2a1;border-color:rgba(230,174,58,.40)}
#bsstatus.error{color:#ffc1c4;border-color:rgba(240,91,97,.40)}
#bsfoot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-top:1px solid var(--line);background:rgba(27,30,35,.76)}
#bscredit{opacity:1;color:var(--text);font-size:10px}
#bscounts{display:flex;align-items:center;gap:5px;color:var(--muted);font:10px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.bscounter{border:0;background:transparent;color:inherit;padding:2px 1px;cursor:pointer;font:inherit}
.bscounter:hover{color:var(--text);text-decoration:underline}
#bssep{color:var(--dim)}
#bsdrawer{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:4;border:1px solid var(--line);border-radius:10px;background:rgba(20,23,27,.82);box-shadow:0 12px 30px rgba(0,0,0,.48);display:flex;flex-direction:column;min-height:0;overflow:hidden;backdrop-filter:saturate(115%) blur(3px);-webkit-backdrop-filter:saturate(115%) blur(3px)}
#bsdrawer[data-side="above"]{top:auto;bottom:calc(100% + 6px)}
#bsdrawer[hidden]{display:none}
#bsdrawerhead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border-bottom:1px solid var(--line);background:rgba(27,30,35,.80)}
#bsdrawertitle{font-weight:700}
#bsdrawercount{color:var(--muted);font:10px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
#bsdrawertabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:7px 8px;border-bottom:1px solid var(--line);background:rgba(27,30,35,.74)}
#bsdrawertabs[hidden]{display:none}
.bstab{height:27px;border:1px solid var(--line);border-radius:7px;background:rgba(12,14,17,.52);color:var(--muted);cursor:pointer;font-size:10px;font-weight:600}
.bstab.active{background:rgba(76,141,255,.20);border-color:rgba(76,141,255,.55);color:var(--text)}
#bsdrawerlist{overflow:auto;max-height:${CFG.visibleDrawerRows * CFG.rowHeightPx}px;background:rgba(15,17,20,.72);overscroll-behavior:contain}
.bsdraweritem{display:grid;grid-template-columns:14px 1fr auto;align-items:center;gap:7px;min-height:${CFG.rowHeightPx}px;padding:4px 9px;border-bottom:1px solid rgba(84,92,105,.32);font:10px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.bsdraweritem:last-child{border-bottom:0}
.bsdraweritem.clickable{cursor:pointer}
.bsdraweritem.clickable:hover{background:rgba(255,255,255,.04)}
.bsdraweritem .code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bsdraweritem .meta{color:var(--muted);white-space:nowrap}
.bsdot{font-size:10px}.s-queued{color:#87919e}.s-processing,.s-pending{color:var(--amber)}.s-complete{color:var(--green)}.s-duplicate,.s-error{color:var(--red)}
#bsdrawerempty{padding:18px 10px;text-align:center;color:var(--muted)}
#bsdraweractions{display:grid;grid-template-columns:1fr;gap:6px;padding:8px;border-top:1px solid var(--line);background:rgba(27,30,35,.80)}
#bsdraweractions.gifts{grid-template-columns:1fr 1fr 1.25fr}
#bsdrawercopy,#bsdrawercsv{font-size:10px}
#bsdrawerclear{width:100%;color:#ffc1c4;border-color:rgba(240,91,97,.45);background:rgba(240,91,97,.10);font-size:10px}
#bsconfirm{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:5;border:1px solid var(--line);border-radius:10px;padding:10px 9px;background:rgba(27,30,35,.84);box-shadow:0 12px 30px rgba(0,0,0,.48);backdrop-filter:saturate(115%) blur(3px);-webkit-backdrop-filter:saturate(115%) blur(3px)}
#bsconfirm[data-side="above"]{top:auto;bottom:calc(100% + 6px)}
#bsconfirm[hidden]{display:none}
#bsconfirmtitle{font-weight:700;margin-bottom:5px}
#bsconfirmmsg{color:var(--muted);margin-bottom:9px}
#bsconfirmactions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#bsconfirmok{background:rgba(240,91,97,.20);border-color:rgba(240,91,97,.55);color:#ffc1c4}
@media(max-width:520px){#bsp{left:8px;right:8px;top:8px;width:auto;max-height:calc(100vh - 16px)}#bsslugselect{min-width:130px}}
      `;
      document.documentElement.appendChild(style);
      UI.style = style;

      const host = document.createElement('div');
      host.id = 'bsp';
      host.innerHTML = `
<div id="bsm">
  <div id="bshead">
    <div id="bstitle">Rewards Redemption</div>
    <div id="bsslugtools">
      <select id="bsslugselect" aria-label="Cached promotion"></select>
      <button id="bsclearcache" type="button" title="Clear all cached data for selected promotion">Clear cache</button>
    </div>
  </div>
  <div id="bsviewnote"></div>
  <div id="bsbody">
    <textarea id="bsinput" spellcheck="false" wrap="off" placeholder="Paste 30-digit codes, one per line"></textarea>
    <div id="bsactions">
      <button id="bsauto" class="bsbtn" type="button">Auto-Redeem: OFF</button>
      <button id="bsadd" class="bsbtn" type="button">Add to Queue</button>
    </div>
    <div class="bsrow">
      <input id="bsemail" type="email" autocomplete="email" placeholder="Email for current promotion">
      <button id="bsclip" class="bsbtn" type="button">Clipboard: OFF</button>
    </div>
    <div class="bsrow"><button id="bsplay" class="bsbtn" type="button">▶ Start / Resume</button></div>
    <div id="bsstatus">Ready</div>
  </div>
  <div id="bsfoot">
    <span id="bscredit">courtesy of dotsthewarlock</span>
    <span id="bscounts">
      <button id="bscountq" class="bscounter" type="button" title="View queue">queue 0/999</button>
      <span id="bssep">•</span>
      <button id="bscounth" class="bscounter" type="button" title="View redemption history">history 0/999</button>
    </span>
  </div>
</div>
<div id="bsdrawer" hidden>
  <div id="bsdrawerhead"><span id="bsdrawertitle"></span><span id="bsdrawercount"></span></div>
  <div id="bsdrawertabs" hidden>
    <button id="bstabredemptions" class="bstab active" type="button">Redemption Codes</button>
    <button id="bstabgifts" class="bstab" type="button">Gift Cards</button>
  </div>
  <div id="bsdrawerlist"></div>
  <div id="bsdraweractions">
    <button id="bsdrawercopy" class="bsbtn" type="button" hidden>Copy</button>
    <button id="bsdrawercsv" class="bsbtn" type="button" hidden>CSV</button>
    <button id="bsdrawerclear" class="bsbtn" type="button"></button>
  </div>
</div>
<div id="bsconfirm" hidden>
  <div id="bsconfirmtitle"></div><div id="bsconfirmmsg"></div>
  <div id="bsconfirmactions"><button id="bsconfirmcancel" class="bsbtn" type="button">Cancel</button><button id="bsconfirmok" class="bsbtn" type="button">Clear</button></div>
</div>`;
      document.body.appendChild(host);
      UI.root = host;

      $('#bsslugselect').addEventListener('change', e => {
        const slug = upper(e.target.value);
        if (!PAGE.slugOK(slug) || !SLUGS.load().includes(slug)) return;
        UI.viewSlug = slug;
        UI.historyReveal = null;
        UI.giftReveal = null;
        UI.closePanel();
        UI.closeClear();
        UI.renderAll();
      });

      $('#bsclearcache').addEventListener('click', () => UI.openClear('all'));

      $('#bsadd').addEventListener('click', async () => {
        UI.ensureCurrentView('queue action');
        const result = await QUEUE.addCodes(currentSlug, $('#bsinput').value);
        $('#bsinput').value = '';
        UI.status(`Added ${result.queued} queued${result.duplicates ? ` • ${result.duplicates} duplicate` : ''}`, result.duplicates ? 'pending' : 'ok');
        UI.counts();
      });

      $('#bsauto').addEventListener('click', () => {
        UI.ensureCurrentView('Auto-Redeem setting');
        SETTINGS.setAuto(currentSlug, !SETTINGS.auto(currentSlug));
        UI.auto();
        if (SETTINGS.auto(currentSlug) && !APPCTL.running && QUEUE.next(currentSlug)) APPCTL.run();
      });

      $('#bsclip').addEventListener('click', () => {
        UI.ensureCurrentView('clipboard setting');
        SETTINGS.setClipboard(currentSlug, !SETTINGS.clipboard(currentSlug));
        UI.clip();
      });

      $('#bsemail').addEventListener('focus', () => UI.ensureCurrentView('email setting'));
      $('#bsemail').addEventListener('change', e => {
        UI.ensureCurrentView('email setting');
        SETTINGS.setEmail(currentSlug, e.target.value);
      });

      $('#bsplay').addEventListener('click', () => {
        UI.ensureCurrentView('redemption action');
        if (APPCTL.running) APPCTL.stop(false);
        else APPCTL.run();
      });

      $('#bscountq').addEventListener('click', e => { e.stopPropagation(); UI.togglePanel('queue'); });
      $('#bscounth').addEventListener('click', e => { e.stopPropagation(); UI.togglePanel('history'); });
      $('#bstabredemptions').addEventListener('click', () => {
        UI.historyTab = 'redemptions';
        UI.historyReveal = null;
        UI.giftReveal = null;
        UI.renderPanel();
      });
      $('#bstabgifts').addEventListener('click', () => {
        UI.historyTab = 'gifts';
        UI.historyReveal = null;
        UI.giftReveal = null;
        UI.renderPanel();
      });
      $('#bsdrawercopy').addEventListener('click', () => UI.copyGiftCards());
      $('#bsdrawercsv').addEventListener('click', () => UI.exportGiftCardsCSV());
      $('#bsdrawerclear').addEventListener('click', () => {
        const type = $('#bsdrawerclear').dataset.clearType || $('#bsdrawer').dataset.type;
        UI.openClear(type);
      });
      $('#bsconfirmcancel').addEventListener('click', () => UI.closeClear());
      $('#bsconfirmok').addEventListener('click', () => UI.confirmClear());

      UI.docPanelHandler = event => {
        const drawer = $('#bsdrawer');
        const confirm = $('#bsconfirm');
        if (drawer && !drawer.hidden && !drawer.contains(event.target) && !$('#bscountq').contains(event.target) && !$('#bscounth').contains(event.target)) UI.closePanel();
        if (confirm && !confirm.hidden && !confirm.contains(event.target) && !$('#bsclearcache').contains(event.target)) UI.closeClear();
      };
      UI.keyPanelHandler = event => {
        if (event.key === 'Escape') {
          UI.closePanel();
          UI.closeClear();
        }
      };
      UI.resizePanelHandler = () => {
        const drawer = $('#bsdrawer');
        const confirm = $('#bsconfirm');
        if (drawer && !drawer.hidden) UI.placeFloat(drawer, true);
        if (confirm && !confirm.hidden) UI.placeFloat(confirm, false);
      };
      document.addEventListener('pointerdown', UI.docPanelHandler, true);
      document.addEventListener('keydown', UI.keyPanelHandler, true);
      window.addEventListener('resize', UI.resizePanelHandler);

      UI.renderAll();
    },

    renderSlugs() {
      SLUGS.touch(currentSlug);
      const select = $('#bsslugselect');
      if (!select) return;
      const slugs = SLUGS.load();
      if (!slugs.includes(UI.viewSlug)) UI.viewSlug = currentSlug;
      slugs.sort((a, b) => a === currentSlug ? -1 : b === currentSlug ? 1 : a.localeCompare(b));
      select.innerHTML = slugs.map(slug => `<option value="${esc(slug)}">${esc(slug)}${slug === currentSlug ? ' (current)' : ''}</option>`).join('');
      select.value = UI.viewSlug;
    },

    renderViewNote() {
      const el = $('#bsviewnote');
      if (!el) return;
      if (UI.viewSlug === currentSlug) {
        el.className = '';
        el.textContent = `Current promotion: ${currentSlug} • live actions and cache are aligned`;
      } else {
        el.className = 'cached';
        el.textContent = `Cached data only: ${UI.viewSlug} • live actions still target ${currentSlug}`;
      }
    },

    ensureCurrentView() {
      if (UI.viewSlug !== currentSlug) {
        UI.viewSlug = currentSlug;
        UI.historyReveal = null;
        UI.giftReveal = null;
        UI.closePanel();
        UI.closeClear();
      }
      UI.renderSlugs();
      UI.renderViewNote();
      UI.counts();
    },

    renderAll() {
      UI.renderSlugs();
      UI.renderViewNote();
      const email = $('#bsemail');
      if (email && document.activeElement !== email) email.value = SETTINGS.email(currentSlug);
      UI.auto();
      UI.clip();
      UI.play();
      UI.counts();
      const drawer = $('#bsdrawer');
      if (drawer && !drawer.hidden) UI.renderPanel();
    },

    auto() {
      const btn = $('#bsauto');
      if (!btn) return;
      const on = SETTINGS.auto(currentSlug);
      btn.textContent = `Auto-Redeem: ${on ? 'ON' : 'OFF'}`;
      btn.classList.toggle('on', on);
    },

    clip() {
      const btn = $('#bsclip');
      if (!btn) return;
      const on = SETTINGS.clipboard(currentSlug);
      btn.textContent = `Clipboard: ${on ? 'ON' : 'OFF'}`;
      btn.classList.toggle('on', on);
    },

    play() {
      const btn = $('#bsplay');
      if (!btn) return;
      btn.textContent = APPCTL.running ? 'Ⅱ Pause / Stop' : '▶ Start / Resume';
      btn.classList.toggle('running', APPCTL.running);

      // While live processing is active, cache browsing is intentionally locked to
      // currentSlug. This enforces the currentSlug/viewSlug invariant visually as
      // well as in storage logic and prevents confusing mid-run cache switching.
      const select = $('#bsslugselect');
      const clearCache = $('#bsclearcache');
      if (select) select.disabled = APPCTL.running;
      if (clearCache) clearCache.disabled = APPCTL.running;
    },

    status(message, kind = '') {
      const el = $('#bsstatus');
      if (!el) return;
      el.className = kind || '';
      el.textContent = message;
    },

    counts() {
      const slug = UI.viewSlug || currentSlug;
      const q = QUEUE.load(slug).length;
      const h = HIST.load(slug).length;
      const qEl = $('#bscountq');
      const hEl = $('#bscounth');
      if (qEl) qEl.textContent = `queue ${q}/${CFG.queueMax}`;
      if (hEl) hEl.textContent = `history ${h}/${CFG.historyMax}`;
      const drawer = $('#bsdrawer');
      if (drawer && !drawer.hidden) UI.renderPanel();
    },

    placeFloat(el, withList = false) {
      if (!el || el.hidden) return;
      const host = $('#bsp');
      if (!host) return;
      const r = host.getBoundingClientRect();
      const gap = 6;
      const below = Math.max(0, innerHeight - r.bottom - gap - 8);
      const above = Math.max(0, r.top - gap - 8);
      const maxList = CFG.visibleDrawerRows * CFG.rowHeightPx;
      const desired = withList ? maxList + 96 : 170;
      const useAbove = below < Math.min(desired, above) && above > below;
      el.dataset.side = useAbove ? 'above' : 'below';
      if (withList) {
        const list = $('#bsdrawerlist');
        if (list) {
          const available = useAbove ? above : below;
          const chrome = 96;
          list.style.maxHeight = `${Math.max(CFG.rowHeightPx * 2, Math.min(maxList, available - chrome))}px`;
        }
      }
    },

    togglePanel(type) {
      UI.closeClear();
      const panel = $('#bsdrawer');
      if (!panel) return;
      if (!panel.hidden && panel.dataset.type === type) {
        UI.closePanel();
        return;
      }
      panel.dataset.type = type;
      panel.hidden = false;
      UI.renderPanel();
      UI.placeFloat(panel, true);
    },

    closePanel() {
      const panel = $('#bsdrawer');
      if (panel) {
        panel.hidden = true;
        delete panel.dataset.type;
        delete panel.dataset.side;
      }
      const list = $('#bsdrawerlist');
      if (list) list.style.maxHeight = '';
      UI.historyReveal = null;
      UI.giftReveal = null;
    },

    async copyGiftCards() {
      const slug = UI.viewSlug;
      const text = GIFTS.tsv(slug);
      if (!text) {
        UI.status(`No gift cards cached for ${slug}`, 'pending');
        return;
      }
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(text);
        } else {
          const temp = document.createElement('textarea');
          temp.value = text;
          temp.style.position = 'fixed';
          temp.style.opacity = '0';
          document.body.appendChild(temp);
          temp.select();
          document.execCommand('copy');
          temp.remove();
        }
        UI.status(`Copied ${GIFTS.load(slug).length} gift card${GIFTS.load(slug).length === 1 ? '' : 's'} as TSV`, 'ok');
      } catch (error) {
        UI.status(`Copy failed: ${error.message}`, 'error');
      }
    },

    exportGiftCardsCSV() {
      const slug = UI.viewSlug;
      const rows = GIFTS.load(slug);
      if (!rows.length) {
        UI.status(`No gift cards cached for ${slug}`, 'pending');
        return;
      }
      try {
        const blob = new Blob(['\uFEFF', GIFTS.csv(slug)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const day = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `gift_cards_${slug}_${day}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        UI.status(`Exported ${rows.length} gift card${rows.length === 1 ? '' : 's'} as CSV`, 'ok');
      } catch (error) {
        UI.status(`CSV export failed: ${error.message}`, 'error');
      }
    },

    renderPanel() {
      const panel = $('#bsdrawer');
      const list = $('#bsdrawerlist');
      const title = $('#bsdrawertitle');
      const count = $('#bsdrawercount');
      const tabs = $('#bsdrawertabs');
      const redTab = $('#bstabredemptions');
      const giftTab = $('#bstabgifts');
      const actions = $('#bsdraweractions');
      const copy = $('#bsdrawercopy');
      const csv = $('#bsdrawercsv');
      const clear = $('#bsdrawerclear');
      if (!panel || panel.hidden || !list) return;
      const slug = UI.viewSlug;
      const type = panel.dataset.type;

      if (type === 'history') {
        tabs.hidden = false;
        redTab.classList.toggle('active', UI.historyTab === 'redemptions');
        giftTab.classList.toggle('active', UI.historyTab === 'gifts');

        if (UI.historyTab === 'gifts') {
          const rows = GIFTS.load(slug).slice().reverse();
          title.textContent = `Gift Cards — ${slug}`;
          count.textContent = `${rows.length}/${CFG.giftCardMax}`;
          actions.classList.add('gifts');
          copy.hidden = false;
          csv.hidden = false;
          clear.textContent = 'Clear Gift Cards';
          clear.dataset.clearType = 'giftcards';

          if (!rows.length) {
            list.innerHTML = '<div id="bsdrawerempty">No cached gift cards</div>';
            UI.placeFloat(panel, true);
            return;
          }

          list.innerHTML = rows.map((row, i) => {
            const id = `${slug}:${row.key || row.ts || i}`;
            const revealed = UI.giftReveal === id;
            const number = norm(row.gcNumber);
            const pin = norm(row.gcPin);
            const last4 = number.slice(-4) || '----';
            const value = norm(row.valueRecent) || '0.00';
            const merchant = norm(row.cardMerchant) || 'Gift Card';
            const display = revealed
              ? `${esc(merchant)} • $${esc(value)} • ${esc(number)} • PIN ${esc(pin)}`
              : `${esc(merchant)} • $${esc(value)} • •••• ${esc(last4)}`;
            const when = row.ts ? new Date(row.ts).toLocaleString() : '';
            const titleText = revealed ? 'Click to hide gift-card credentials' : 'Click to reveal gift-card credentials';
            return `<div class="bsdraweritem clickable" data-gift-id="${esc(id)}" title="${esc(titleText)}"><span class="bsdot s-complete">●</span><span class="code">${display}</span><span class="meta">${esc(when)}</span></div>`;
          }).join('');

          $$('.bsdraweritem[data-gift-id]', list).forEach(el => el.addEventListener('click', () => {
            UI.giftReveal = UI.giftReveal === el.dataset.giftId ? null : el.dataset.giftId;
            UI.renderPanel();
          }));
        } else {
          const rows = HIST.load(slug).slice().reverse();
          title.textContent = `Redemption Codes — ${slug}`;
          count.textContent = `${rows.length}/${CFG.historyMax}`;
          actions.classList.remove('gifts');
          copy.hidden = true;
          csv.hidden = true;
          clear.textContent = 'Clear Redemption Codes';
          clear.dataset.clearType = 'history';
          if (!rows.length) {
            list.innerHTML = '<div id="bsdrawerempty">No cached redemption history</div>';
            UI.placeFloat(panel, true);
            return;
          }
          list.innerHTML = rows.map((row, i) => {
            const id = `${slug}:${row.h || row.ts || i}`;
            const canReveal = /^\d{30}$/.test(String(row.code || ''));
            const revealed = UI.historyReveal === id;
            const display = revealed && canReveal ? row.code : `•••• ${esc(row.last4 || String(row.code || '').slice(-4) || '----')}`;
            const when = row.ts ? new Date(row.ts).toLocaleString() : '';
            return `<div class="bsdraweritem ${canReveal ? 'clickable' : ''}" data-history-id="${esc(id)}" data-can-reveal="${canReveal ? '1' : '0'}" title="${canReveal ? 'Click to show/hide full code' : 'Full code unavailable for this legacy history entry'}"><span class="bsdot s-complete">●</span><span class="code">${display}</span><span class="meta">${esc(when)}</span></div>`;
          }).join('');
          $$('.bsdraweritem[data-history-id]', list).forEach(el => el.addEventListener('click', () => {
            if (el.dataset.canReveal !== '1') {
              UI.status('Full code unavailable for this legacy history entry', 'pending');
              return;
            }
            UI.historyReveal = UI.historyReveal === el.dataset.historyId ? null : el.dataset.historyId;
            UI.renderPanel();
          }));
        }
      } else {
        const rows = QUEUE.load(slug);
        const labels = { queued: 'queued', processing: 'processing', pending: 'pending', complete: 'complete', duplicate: 'duplicate', error: 'error' };
        tabs.hidden = true;
        actions.classList.remove('gifts');
        copy.hidden = true;
        csv.hidden = true;
        title.textContent = `Queue — ${slug}`;
        count.textContent = `${rows.length}/${CFG.queueMax}`;
        clear.textContent = 'Clear Queue';
        clear.dataset.clearType = 'queue';
        if (!rows.length) {
          list.innerHTML = '<div id="bsdrawerempty">Queue empty</div>';
          UI.placeFloat(panel, true);
          return;
        }
        list.innerHTML = rows.map(row => `<div class="bsdraweritem" title="${esc(row.note || '')}"><span class="bsdot s-${esc(row.state)}">●</span><span class="code">${esc(row.code || '')}</span><span class="meta">${esc(labels[row.state] || row.state || '')}</span></div>`).join('');
      }
      UI.placeFloat(panel, true);
    },

    openClear(type) {
      UI.closePanel();
      const panel = $('#bsconfirm');
      if (!panel) return;
      const slug = UI.viewSlug;
      panel.dataset.type = type;
      panel.dataset.slug = slug;
      const title = $('#bsconfirmtitle');
      const msg = $('#bsconfirmmsg');
      const ok = $('#bsconfirmok');
      if (type === 'history') {
        title.textContent = `Clear history for ${slug}?`;
        msg.textContent = 'This permanently removes cached redemption-history records for the selected promotion.';
        ok.textContent = 'Clear History';
      } else if (type === 'queue') {
        title.textContent = `Clear queue for ${slug}?`;
        msg.textContent = 'This removes queued, processing, and pending cache records for the selected promotion.';
        ok.textContent = 'Clear Queue';
      } else if (type === 'giftcards') {
        title.textContent = `Clear gift cards for ${slug}?`;
        msg.textContent = 'This permanently removes cached gift-card numbers and PINs for the selected promotion.';
        ok.textContent = 'Clear Gift Cards';
      } else {
        title.textContent = `Clear all cache for ${slug}?`;
        msg.textContent = 'This removes queue, redemption history, gift cards, pending state, email, clipboard preference, Auto-Redeem preference, and lock state for the selected promotion.';
        ok.textContent = 'Clear Cache';
      }
      panel.hidden = false;
      UI.placeFloat(panel, false);
      ok.focus();
    },

    closeClear() {
      const panel = $('#bsconfirm');
      if (!panel) return;
      panel.hidden = true;
      delete panel.dataset.type;
      delete panel.dataset.slug;
      delete panel.dataset.side;
    },

    confirmClear() {
      const panel = $('#bsconfirm');
      if (!panel || panel.hidden) return;
      const type = panel.dataset.type;
      const slug = panel.dataset.slug;
      if (!PAGE.slugOK(slug)) return UI.closeClear();

      if (type === 'history') HIST.clear(slug);
      else if (type === 'giftcards') GIFTS.clear(slug);
      else if (type === 'queue') QUEUE.clear(slug);
      else {
        // If the current promotion is actively running, clearing its cache mid-run
        // would break state invariants. Stop first, then clear.
        if (slug === currentSlug && APPCTL.running) APPCTL.stop(false);
        STORE.clearSlug(slug);
        if (slug !== currentSlug) {
          SLUGS.remove(slug);
          UI.viewSlug = currentSlug;
        } else {
          SLUGS.touch(currentSlug);
        }
      }

      UI.closeClear();
      UI.renderAll();
      UI.status(`Cleared ${type === 'all' ? 'cache' : type} for ${slug}`, 'ok');
    }
  };

  // ---------------------------------------------------------------------------
  // Clipboard import is opt-in and always seeds the CURRENT promotion queue.
  // Browsers may reject readText() unless the bookmarklet invocation counts as a
  // user gesture; failure is non-fatal and does not interrupt manual operation.
  // ---------------------------------------------------------------------------
  const CLIP = {
    async importOnce() {
      if (!SETTINGS.clipboard(currentSlug)) return;
      if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') return;
      try {
        const text = await navigator.clipboard.readText();
        if (!extractBarcode(text)) return;
        UI.ensureCurrentView();
        const result = await QUEUE.addCodes(currentSlug, text);
        if (result.queued || result.duplicates) UI.status(`Clipboard: ${result.queued} queued${result.duplicates ? ` • ${result.duplicates} duplicate` : ''}`, result.duplicates ? 'pending' : 'ok');
      } catch (_) {
        // Clipboard permission failures are expected on some browser/page states.
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Workflow helpers.
  // ---------------------------------------------------------------------------
  async function waitFor(predicate, timeoutMs, intervalMs = CFG.pollMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!APPCTL.running) return null;
      try {
        const value = predicate();
        if (value) return value;
      } catch (_) {}
      await sleep(intervalMs);
    }
    return null;
  }

  async function advanceToCodeInput() {
    const existing = DOM.codeInput();
    if (existing && visible(existing)) return existing;
    const start = Date.now();
    while (APPCTL.running && Date.now() - start < CFG.actionTimeoutMs) {
      const code = DOM.codeInput();
      if (code && visible(code)) return code;

      // Preserve the proven v8 order: click the visible GET MY BONUS/Next control,
      // then let the site's own wizard activate the barcode step.
      const greeting = DOM.greeting();
      if (actionable(greeting)) {
        UI.status('Clicking Get My Bonus…', 'pending');
        DOM.click(greeting);
        await sleep(jitter());
        continue;
      }

      const next = DOM.next();
      if (actionable(next)) {
        UI.status('Advancing to barcode entry…', 'pending');
        DOM.click(next);
        await sleep(jitter());
        continue;
      }
      await sleep(CFG.pollMs);
    }
    return null;
  }

  async function waitForBarcodeNext(codeInput, expectedCode) {
    const start = Date.now();
    let lastNudge = 0;
    while (APPCTL.running && Date.now() - start < CFG.actionTimeoutMs) {
      if (CAP.challengeVisible()) {
        if (!(await CAP.waitIfNeeded())) return null;
      }

      const next = DOM.next();
      if (actionable(next)) return next;

      // The redemption app's validation has historically reacted to keyboard
      // events as well as input/change. v8 emitted Enter after barcode fill; keep
      // that behavior and periodically re-emit the events while Next is disabled.
      if (codeInput && visible(codeInput) && norm(codeInput.value) === expectedCode && Date.now() - lastNudge >= 450) {
        DOM.fireValueEvents(codeInput);
        DOM.pressEnter(codeInput);
        lastNudge = Date.now();
      }
      await sleep(CFG.pollMs);
    }
    return null;
  }

  async function advanceToEmail() {
    const existing = DOM.email();
    if (existing && visible(existing)) return existing;
    const start = Date.now();
    while (APPCTL.running && Date.now() - start < CFG.actionTimeoutMs) {
      const email = DOM.email();
      if (email && visible(email)) return email;
      if (!(await CAP.waitIfNeeded())) return null;
      const next = DOM.next();
      if (actionable(next)) {
        DOM.click(next);
        await sleep(jitter());
        continue;
      }
      await sleep(CFG.pollMs);
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Application controller.
  // ---------------------------------------------------------------------------
  const APPCTL = {
    running: false,
    stopRequested: false,

    invoke() {
      UI.mount();
      if (APPCTL.running) {
        // Reinvocation is intentionally an emergency kill switch. Unlike the UI
        // pause button, it also disables Auto-Redeem so another invoke cannot
        // immediately restart processing.
        SETTINGS.setAuto(currentSlug, false);
        UI.auto();
        APPCTL.stop(true);
        UI.status('Emergency stop — Auto-Redeem disabled', 'error');
        return;
      }
      UI.ensureCurrentView();

      // Fresh invocation on a success page is a recovery path. Capture the reward
      // immediately, but do not navigate away automatically; the user may be
      // invoking the script specifically to recover/cache the displayed card.
      if (DOM.done()) {
        APPCTL.captureSuccess(null).catch(error => {
          UI.status(`Gift-card capture failed: ${error.message}`, 'error');
          console.error(error);
        });
        return;
      }

      CLIP.importOnce();
      if (SETTINGS.auto(currentSlug) && QUEUE.next(currentSlug)) APPCTL.run();
    },

    async prepareItem() {
      const pending = QUEUE.unresolvedPending(currentSlug);
      if (pending) {
        UI.status(`Pending verification blocks queue: …${pending.code.slice(-4)}`, 'pending');
        return null;
      }

      await QUEUE.markHistoryDuplicates(currentSlug);
      let item = QUEUE.next(currentSlug);
      while (item && await HIST.has(currentSlug, item.code)) {
        QUEUE.patch(currentSlug, item.id, { state: 'duplicate', note: 'Already in redemption history' });
        item = QUEUE.next(currentSlug);
      }
      if (!item) return null;

      QUEUE.patch(currentSlug, item.id, { state: 'processing', note: '' });
      QUEUE.setActive(currentSlug, { id: item.id, code: item.code, phase: 'processing', ts: Date.now() });
      return QUEUE.find(currentSlug, item.id);
    },

    async captureSuccess(item = null) {
      const scraped = DOM.successGiftCard();
      if (!scraped.ok) {
        if (item && item.id) {
          QUEUE.patch(currentSlug, item.id, {
            state: 'pending',
            note: `Success visible but gift-card capture failed: ${scraped.reason}`
          });
          QUEUE.setActive(currentSlug, { id: item.id, code: item.code, phase: 'submitted', ts: Date.now() });
        }
        UI.status(`Success detected, but gift-card capture failed — ${scraped.reason}. Queue halted.`, 'pending');
        return { ok: false, reason: scraped.reason };
      }

      const card = scraped.card;
      const giftResult = GIFTS.add(currentSlug, card);
      if (!giftResult.ok) {
        if (item && item.id) {
          QUEUE.patch(currentSlug, item.id, { state: 'pending', note: `Gift-card cache failed: ${giftResult.reason}` });
          QUEUE.setActive(currentSlug, { id: item.id, code: item.code, phase: 'submitted', ts: Date.now() });
        }
        UI.status(`Success detected, but gift-card cache failed — ${giftResult.reason}. Queue halted.`, 'pending');
        return { ok: false, reason: giftResult.reason };
      }

      const successCode = extractBarcode(card.sourceRedemptionCode || '') || extractBarcode(item && item.code || '');
      if (successCode) await HIST.add(currentSlug, successCode, { giftKey: giftResult.row.key });

      // When the success page exposes Eligible Card, it is authoritative. A mismatch
      // means our queue state and the visible server result disagree; preserve the
      // captured gift card but halt rather than marking the wrong queue item complete.
      if (item && card.sourceRedemptionCode && item.code !== card.sourceRedemptionCode) {
        QUEUE.patch(currentSlug, item.id, {
          state: 'pending',
          note: `Success page belongs to …${card.sourceRedemptionCode.slice(-4)}, not this item`
        });
        QUEUE.setActive(currentSlug, { id: item.id, code: item.code, phase: 'submitted', ts: Date.now() });
        UI.status(`Gift card captured, but success-code mismatch — queue halted`, 'pending');
        UI.counts();
        return { ok: false, reason: 'Success-code mismatch', card, giftResult };
      }

      // Prefer the explicit item from the live workflow. During standalone recovery,
      // locate any cached queue row that matches Eligible Card and reconcile it.
      const target = item || (successCode ? QUEUE.findByCode(currentSlug, successCode) : null);
      if (target && (!successCode || target.code === successCode)) {
        QUEUE.patch(currentSlug, target.id, { state: 'complete', note: 'Confirmed redemption success + gift card captured' });
        const active = QUEUE.active(currentSlug);
        if (active && active.id === target.id) QUEUE.setActive(currentSlug, null);
      }

      UI.status(
        `${giftResult.added ? 'Captured' : 'Already cached'}: ${card.cardMerchant} $${card.valueRecent} ••••${card.gcNumber.slice(-4)}`,
        'ok'
      );
      UI.counts();
      return { ok: true, card, giftResult, successCode };
    },

    async redeem(item) {
      UI.status(`Processing …${item.code.slice(-4)}`, 'pending');

      if (DOM.done()) {
        const captured = await APPCTL.captureSuccess(item);
        if (!captured.ok) return false;
        const another = DOM.claimAnother();
        if (another && enabled(another)) {
          DOM.click(another);
          await sleep(jitter());
        }
        return true;
      }

      const codeInput = await advanceToCodeInput();
      if (!codeInput) throw new Error('Could not reach barcode entry step');
      DOM.setValue(codeInput, item.code, { enter: true });
      UI.status(`Loaded barcode …${item.code.slice(-4)}`, 'pending');
      await sleep(jitter());

      const next = await waitForBarcodeNext(codeInput, item.code);
      if (!next) throw new Error('Barcode Next button did not become available');
      UI.status(`Clicking Next …${item.code.slice(-4)}`, 'pending');
      DOM.click(next);
      await sleep(jitter());

      if (!(await CAP.waitIfNeeded())) {
        // CAPTCHA occurs before submission. Do NOT mark this as pending/ambiguous:
        // no redeeming submit has been clicked yet, so the item is safe to retry.
        QUEUE.patch(currentSlug, item.id, { state: 'queued', note: 'CAPTCHA incomplete before submission; safe to retry' });
        QUEUE.setActive(currentSlug, null);
        UI.status(`CAPTCHA incomplete before submission — …${item.code.slice(-4)} requeued`, 'pending');
        return false;
      }

      const emailInput = await advanceToEmail();
      if (!emailInput) throw new Error('Could not reach email step');
      const email = SETTINGS.email(currentSlug);
      if (!email) throw new Error('Email is required before redemption');
      DOM.setValue(emailInput, email);
      const confirm = DOM.emailConfirm();
      if (confirm) DOM.setValue(confirm, email);
      const terms = DOM.terms();
      if (terms && !terms.checked) {
        terms.click();
        terms.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await sleep(jitter());

      const submit = await waitFor(() => {
        const el = DOM.submit();
        return actionable(el) ? el : null;
      }, CFG.actionTimeoutMs);
      if (!submit) throw new Error('Submit button did not become available');

      // Mark pending BEFORE submit. Once submit is clicked, a browser/network
      // failure can leave the server outcome unknown. The only safe automatic
      // behavior in that case is to block further queue advancement.
      UI.status(`Submitting …${item.code.slice(-4)}`, 'pending');
      QUEUE.patch(currentSlug, item.id, { state: 'pending', note: 'Submitted; awaiting confirmation' });
      QUEUE.setActive(currentSlug, { id: item.id, code: item.code, phase: 'submitted', ts: Date.now() });
      if (!DOM.click(submit)) {
        // If the control stopped being actionable between detection and click, no
        // submission occurred. Requeue rather than manufacturing a pending block.
        QUEUE.patch(currentSlug, item.id, { state: 'queued', note: 'Submit control changed before click; safe to retry' });
        QUEUE.setActive(currentSlug, null);
        throw new Error('Submit button changed before click');
      }

      const started = Date.now();
      while (APPCTL.running && Date.now() - started < CFG.submitTimeoutMs) {
        if (DOM.done()) {
          const captured = await APPCTL.captureSuccess(item);
          if (!captured.ok) return false;
          const another = DOM.claimAnother();
          if (another && enabled(another)) {
            DOM.click(another);
            await sleep(jitter());
          }
          return true;
        }
        const error = DOM.errorText();
        if (error) {
          QUEUE.patch(currentSlug, item.id, { state: 'error', note: error });
          QUEUE.setActive(currentSlug, null);
          UI.status(`Redemption error: ${error}`, 'error');
          return false;
        }
        if (!(await CAP.waitIfNeeded())) break;
        await sleep(CFG.pollMs);
      }

      // No definitive success/error signal. Keep pending and halt.
      QUEUE.patch(currentSlug, item.id, { state: 'pending', note: 'Outcome not confirmed before timeout' });
      UI.status(`Pending verification: …${item.code.slice(-4)} — queue halted`, 'pending');
      return false;
    },

    async run() {
      if (APPCTL.running) return;
      UI.ensureCurrentView();
      QUEUE.recover(currentSlug);
      if (!LOCK.acquire(currentSlug)) {
        UI.status('Another tab is already processing this promotion', 'error');
        return;
      }

      // Match v8 safety ordering: a visible success page is authoritative and
      // should be reconciled BEFORE a cached pending item is allowed to block run.
      if (DOM.done()) {
        const pending = QUEUE.unresolvedPending(currentSlug);
        const captured = await APPCTL.captureSuccess(pending);
        if (captured.ok) {
          const another = DOM.claimAnother();
          if (actionable(another)) {
            DOM.click(another);
            await sleep(jitter());
          }
        }
      }

      if (QUEUE.unresolvedPending(currentSlug)) {
        LOCK.release(currentSlug);
        UI.status('A submitted item is still pending verification; clear it only after confirming the prior redemption outcome', 'pending');
        return;
      }
      if (!QUEUE.next(currentSlug)) {
        LOCK.release(currentSlug);
        UI.status('Queue is empty', '');
        return;
      }
      if (!SETTINGS.email(currentSlug)) {
        LOCK.release(currentSlug);
        UI.status('Enter an email before starting', 'error');
        return;
      }

      APPCTL.running = true;
      APPCTL.stopRequested = false;
      UI.play();
      UI.status(`Running ${currentSlug}`, 'pending');

      try {
        while (APPCTL.running) {
          const item = await APPCTL.prepareItem();
          if (!item) break;
          const continueQueue = await APPCTL.redeem(item);
          if (!continueQueue) break;
          await sleep(jitter());
        }
      } catch (error) {
        const active = QUEUE.active(currentSlug);
        if (active && active.id) {
          const row = QUEUE.find(currentSlug, active.id);
          if (row && row.state === 'processing') {
            QUEUE.patch(currentSlug, active.id, { state: 'queued', note: `Recovered after error: ${error.message}` });
            QUEUE.setActive(currentSlug, null);
          }
        }
        UI.status(`Stopped: ${error.message}`, 'error');
        console.error(error);
      } finally {
        APPCTL.running = false;
        LOCK.release(currentSlug);
        UI.play();
        UI.counts();
        if (!QUEUE.unresolvedPending(currentSlug) && !QUEUE.next(currentSlug) && !APPCTL.stopRequested) UI.status('Queue complete / no eligible items', 'ok');
      }
    },

    stop(emergency = false) {
      APPCTL.stopRequested = true;
      APPCTL.running = false;
      if (emergency) SETTINGS.setAuto(currentSlug, false);

      const active = QUEUE.active(currentSlug);
      if (active && active.id) {
        const row = QUEUE.find(currentSlug, active.id);
        // Only pre-submit `processing` is safe to requeue. Submitted/pending state
        // must remain pending because the server outcome may be unknown.
        if (row && row.state === 'processing' && active.phase !== 'submitted') {
          QUEUE.patch(currentSlug, active.id, { state: 'queued', note: 'Paused before submission' });
          QUEUE.setActive(currentSlug, null);
        }
      }

      LOCK.release(currentSlug);
      UI.auto();
      UI.play();
      UI.counts();
      if (!emergency) UI.status('Paused', 'pending');
    }
  };

  // Only recover the promotion represented by the current page. Other slug caches
  // are inspection-only until that promotion is actually opened in a page.
  QUEUE.recover(currentSlug);

  window.__BS_REWARDS__ = {
    invoke: () => APPCTL.invoke(),
    run: () => APPCTL.run(),
    stop: () => APPCTL.stop(false),
    currentSlug,
    get viewSlug() { return UI.viewSlug; },
    queue: {
      current: () => QUEUE.load(currentSlug),
      view: () => QUEUE.load(UI.viewSlug)
    },
    history: {
      current: () => HIST.load(currentSlug),
      view: () => HIST.load(UI.viewSlug)
    },
    giftCards: {
      current: () => GIFTS.load(currentSlug),
      view: () => GIFTS.load(UI.viewSlug)
    },
    version: SCRIPT_VERSION
  };

  UI.mount();
  APPCTL.invoke();
})();
