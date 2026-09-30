(() => {
  'use strict';

  const APP_VERSION = '0.2.0';
  const SESSION_KEY = 'mobileBarcodeScanner.codes.v1';
  const PREF_KEY = 'mobileBarcodeScanner.prefs.v1';
  const DEFAULT_PREFS = {
    autoAccept: true,
    autoAcceptDelay: 1000,
    beepEnabled: true,
    ignoreListDuplicates: true,
    preserveRefresh: true,
    ignoreImmediate: true,
    engine: 'auto'
  };

  const el = id => document.getElementById(id);
  const ui = {
    video: el('video'),
    cameraOff: el('cameraOff'),
    scanGuide: el('scanGuide'),
    statusDot: el('statusDot'),
    statusText: el('statusText'),
    engineLabel: el('engineLabel'),
    scanToggle: el('scanToggle'),
    count: el('count'),
    listCount: el('listCount'),
    codeList: el('codeList'),
    copyBtn: el('copyBtn'),
    shareBtn: el('shareBtn'),
    csvBtn: el('csvBtn'),
    clearBtn: el('clearBtn'),
    settingsBtn: el('settingsBtn'),
    settingsModal: el('settingsModal'),
    settingsClose: el('settingsClose'),
    secureWarning: el('secureWarning'),
    autoAccept: el('autoAccept'),
    autoAcceptDelay: el('autoAcceptDelay'),
    autoDelaySetting: el('autoDelaySetting'),
    beepEnabled: el('beepEnabled'),
    ignoreListDuplicates: el('ignoreListDuplicates'),
    preserveRefresh: el('preserveRefresh'),
    ignoreImmediate: el('ignoreImmediate'),
    engineSelect: el('engineSelect'),
    clearCacheBtn: el('clearCacheBtn'),
    dbgEngine: el('dbgEngine'),
    dbgNative: el('dbgNative'),
    dbgZxing: el('dbgZxing'),
    dbgSecure: el('dbgSecure'),
    dbgFormat: el('dbgFormat'),
    dbgDecode: el('dbgDecode'),
    dbgError: el('dbgError'),
    scanModal: el('scanModal'),
    scanModalTitle: el('scanModalTitle'),
    detectedLabel: el('detectedLabel'),
    detectedCode: el('detectedCode'),
    detectedFormat: el('detectedFormat'),
    countdown: el('countdown'),
    scanModalActions: el('scanModalActions'),
    retryBtn: el('retryBtn'),
    acceptBtn: el('acceptBtn'),
    confirmModal: el('confirmModal'),
    confirmTitle: el('confirmTitle'),
    confirmText: el('confirmText'),
    confirmCancel: el('confirmCancel'),
    confirmClear: el('confirmClear'),
    toast: el('toast')
  };

  let prefs = loadPrefs();
  let codes = loadCodes();
  let scanning = false;
  let scanLocked = false;
  let pending = null;
  let acceptTimer = null;
  let autoInterval = null;
  let nativeStream = null;
  let nativeDetector = null;
  let nativeLoopToken = 0;
  let zxingReader = null;
  let zxingControls = null;
  let zxingLoadPromise = null;
  let activeEngine = 'None';
  let audioCtx = null;
  let toastTimer = null;
  let confirmAction = null;
  let lastSeenCode = '';
  let lastSeenAt = 0;
  let lastNativeTick = 0;
  let nativeBusy = false;

  function normalizePrefs(raw) {
    const next = { ...DEFAULT_PREFS, ...raw };
    const delay = Number(next.autoAcceptDelay);
    next.autoAcceptDelay = Number.isFinite(delay) ? Math.min(2000, Math.max(0, Math.round(delay / 200) * 200)) : 1000;
    return next;
  }

  function loadPrefs() {
    try {
      return normalizePrefs(JSON.parse(localStorage.getItem(PREF_KEY) || '{}'));
    } catch (_) {
      return { ...DEFAULT_PREFS };
    }
  }

  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (_) {}
  }

  function loadCodes() {
    if (!prefs.preserveRefresh) return [];
    try {
      const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
      return Array.isArray(value) ? value.filter(v => typeof v === 'string') : [];
    } catch (_) {
      return [];
    }
  }

  function saveCodes() {
    try {
      if (prefs.preserveRefresh) sessionStorage.setItem(SESSION_KEY, JSON.stringify(codes));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }

  function setStatus(text, kind = '') {
    ui.statusText.textContent = text;
    ui.statusDot.className = 'dot' + (kind ? ' ' + kind : '');
  }

  function setError(message) {
    ui.dbgError.textContent = message || '-';
  }

  function updateDebug() {
    ui.dbgEngine.textContent = activeEngine;
    ui.dbgNative.textContent = ('BarcodeDetector' in window) ? 'Available' : 'Unavailable';
    ui.dbgZxing.textContent = window.ZXingBrowser ? 'Yes' : 'No';
    ui.dbgSecure.textContent = window.isSecureContext ? 'Yes' : 'No';
    ui.secureWarning.classList.toggle('show', !window.isSecureContext || !navigator.mediaDevices?.getUserMedia);
    ui.engineLabel.textContent = 'Engine: ' + (activeEngine === 'None' ? 'none' : activeEngine);
  }

  function setActionAvailability() {
    const empty = codes.length === 0;
    ui.copyBtn.disabled = empty;
    ui.shareBtn.disabled = empty;
    ui.csvBtn.disabled = empty;
    ui.clearBtn.disabled = empty;
  }

  function renderCodes() {
    ui.count.textContent = String(codes.length);
    ui.listCount.textContent = codes.length + (codes.length === 1 ? ' item' : ' items');
    setActionAvailability();

    if (!codes.length) {
      ui.codeList.innerHTML = '<div class="empty">Accepted codes will appear here.</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    codes.forEach((code, i) => {
      const row = document.createElement('div');
      row.className = 'code-row';

      const idx = document.createElement('div');
      idx.className = 'idx';
      idx.textContent = String(i + 1);

      const text = document.createElement('div');
      text.className = 'code';
      text.textContent = code;

      const del = document.createElement('button');
      del.className = 'delete';
      del.type = 'button';
      del.setAttribute('aria-label', 'Delete ' + code);
      del.title = 'Delete';
      del.innerHTML = '&times;';
      del.addEventListener('click', () => {
        codes.splice(i, 1);
        saveCodes();
        renderCodes();
      });

      row.append(idx, text, del);
      frag.append(row);
    });

    ui.codeList.replaceChildren(frag);
    ui.codeList.scrollTop = ui.codeList.scrollHeight;
  }

  function updateAutoDelayState() {
    const enabled = prefs.autoAccept;
    ui.autoAcceptDelay.disabled = !enabled;
    ui.autoDelaySetting.classList.toggle('disabled', !enabled);
  }

  function syncSettingsUI() {
    ui.autoAccept.checked = prefs.autoAccept;
    ui.autoAcceptDelay.value = String(prefs.autoAcceptDelay);
    ui.beepEnabled.checked = prefs.beepEnabled;
    ui.ignoreListDuplicates.checked = prefs.ignoreListDuplicates;
    ui.preserveRefresh.checked = prefs.preserveRefresh;
    ui.ignoreImmediate.checked = prefs.ignoreImmediate;
    ui.engineSelect.value = prefs.engine;
    updateAutoDelayState();
    updateDebug();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1700);
  }

  async function primeAudio() {
    if (!prefs.beepEnabled) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
    } catch (_) {}
  }

  async function beep(freq = 880, duration = 0.075) {
    if (!prefs.beepEnabled) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration + 0.01);
    } catch (_) {}
  }

  function immediateDuplicate(code) {
    const now = performance.now();
    const duplicate = prefs.ignoreImmediate && code === lastSeenCode && (now - lastSeenAt) < 1600;
    lastSeenCode = code;
    lastSeenAt = now;
    return duplicate;
  }

  function processCandidate(code, format = '', decodeMs = null) {
    code = String(code || '').trim();
    if (!code || scanLocked) return;
    if (immediateDuplicate(code)) return;

    scanLocked = true;
    pending = { code, format: format || 'Unknown' };
    ui.dbgFormat.textContent = pending.format;
    ui.dbgDecode.textContent = decodeMs == null ? '-' : Math.max(0, Math.round(decodeMs)) + ' ms';
    beep();

    if (prefs.ignoreListDuplicates && codes.includes(code)) {
      showDuplicateModal(code, pending.format);
      return;
    }
    showScanModal();
  }

  function showDuplicateModal(code, format) {
    clearAcceptTimers();
    ui.scanModalTitle.textContent = 'Already scanned';
    ui.detectedLabel.textContent = 'Ignored duplicate';
    ui.detectedCode.textContent = code;
    ui.detectedFormat.textContent = format;
    ui.countdown.textContent = 'This code is already in the holding list.';
    ui.scanModalActions.style.display = 'none';
    ui.scanModal.classList.add('show');
    acceptTimer = setTimeout(() => closeScanModal(true), 800);
  }

  function showScanModal() {
    clearAcceptTimers();
    ui.scanModalTitle.textContent = 'Barcode detected';
    ui.detectedLabel.textContent = 'Detected code';
    ui.detectedCode.textContent = pending.code;
    ui.detectedFormat.textContent = pending.format;
    ui.scanModalActions.style.display = 'grid';
    ui.scanModal.classList.add('show');

    if (!prefs.autoAccept) {
      ui.countdown.textContent = 'Review the code before accepting.';
      return;
    }

    const delay = prefs.autoAcceptDelay;
    if (delay === 0) {
      ui.countdown.textContent = 'Auto accepting...';
      acceptTimer = setTimeout(acceptPending, 0);
      return;
    }

    const started = performance.now();
    const refresh = () => {
      const left = Math.max(0, delay - (performance.now() - started));
      ui.countdown.textContent = 'Auto accepting in ' + (left / 1000).toFixed(1) + 's';
    };
    refresh();
    autoInterval = setInterval(refresh, 50);
    acceptTimer = setTimeout(acceptPending, delay);
  }

  function clearAcceptTimers() {
    clearTimeout(acceptTimer);
    clearInterval(autoInterval);
    acceptTimer = null;
    autoInterval = null;
  }

  function acceptPending() {
    if (!pending) return;
    clearAcceptTimers();
    const value = pending.code;
    if (!(prefs.ignoreListDuplicates && codes.includes(value))) {
      codes.push(value);
      saveCodes();
      renderCodes();
    }
    closeScanModal(true);
  }

  function closeScanModal(rearm = true) {
    clearAcceptTimers();
    ui.scanModal.classList.remove('show');
    ui.scanModalActions.style.display = 'grid';
    pending = null;
    if (rearm) setTimeout(() => { scanLocked = false; }, 180);
  }

  function retryPending() {
    closeScanModal(true);
  }

  function ensureZXing() {
    if (window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser);
    if (zxingLoadPromise) return zxingLoadPromise;

    zxingLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './zxing-browser.min.js';
      script.async = true;
      script.onload = () => {
        if (window.ZXingBrowser) {
          updateDebug();
          resolve(window.ZXingBrowser);
        } else {
          reject(new Error('ZXing loaded but did not initialize.'));
        }
      };
      script.onerror = () => reject(new Error('ZXing fallback failed to load. Confirm zxing-browser.min.js is in the same folder as index.html.'));
      document.head.appendChild(script);
    }).catch(err => {
      zxingLoadPromise = null;
      throw err;
    });

    return zxingLoadPromise;
  }

  async function nativeSupportedFormats() {
    if (!('BarcodeDetector' in window)) return [];
    try { return await BarcodeDetector.getSupportedFormats(); } catch (_) { return []; }
  }

  async function chooseEngine() {
    if (prefs.engine === 'zxing') return 'zxing';
    if (prefs.engine === 'native') {
      if (!('BarcodeDetector' in window)) throw new Error('Native BarcodeDetector is not available in this browser.');
      return 'native';
    }

    if ('BarcodeDetector' in window) {
      const formats = await nativeSupportedFormats();
      const useful = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
      if (formats.some(f => useful.includes(f))) return 'native';
    }
    return 'zxing';
  }

  function mediaConstraints() {
    return {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
  }

  async function startNative() {
    const formats = await nativeSupportedFormats();
    const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'codabar', 'itf', 'qr_code', 'data_matrix', 'pdf417'];
    const selected = wanted.filter(f => formats.includes(f));
    nativeDetector = selected.length ? new BarcodeDetector({ formats: selected }) : new BarcodeDetector();
    nativeStream = await navigator.mediaDevices.getUserMedia(mediaConstraints());
    ui.video.srcObject = nativeStream;
    await ui.video.play();
    activeEngine = 'Native';
    updateDebug();

    const token = ++nativeLoopToken;
    const loop = async ts => {
      if (!scanning || token !== nativeLoopToken) return;
      if (!nativeBusy && !scanLocked && ui.video.readyState >= 2 && ts - lastNativeTick >= 130) {
        lastNativeTick = ts;
        nativeBusy = true;
        const started = performance.now();
        try {
          const results = await nativeDetector.detect(ui.video);
          if (results && results.length) {
            processCandidate(results[0].rawValue, results[0].format, performance.now() - started);
          }
        } catch (err) {
          setError(err.message || String(err));
        } finally {
          nativeBusy = false;
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  async function startZXing() {
    await ensureZXing();
    zxingReader = new ZXingBrowser.BrowserMultiFormatReader();
    activeEngine = 'ZXing';
    updateDebug();

    zxingControls = await zxingReader.decodeFromConstraints(mediaConstraints(), ui.video, (result, error) => {
      if (!scanning || scanLocked) return;
      if (result) {
        let format = 'Unknown';
        try {
          const rawFormat = result.getBarcodeFormat ? result.getBarcodeFormat() : result.format;
          format = (window.ZXingBrowser.BarcodeFormat && window.ZXingBrowser.BarcodeFormat[rawFormat]) || String(rawFormat || 'Unknown');
        } catch (_) {}
        const text = result.getText ? result.getText() : result.text;
        processCandidate(text, format, null);
      } else if (error) {
        const name = error.name || error.constructor?.name || '';
        if (!/NotFound/i.test(name)) setError(error.message || name || String(error));
      }
    });
  }

  async function startScanner() {
    if (scanning) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Camera requires HTTPS or localhost', 'bad');
      setError('getUserMedia unavailable');
      updateDebug();
      return;
    }

    scanning = true;
    scanLocked = false;
    setError('-');
    await primeAudio();
    ui.scanToggle.disabled = true;
    setStatus('Starting camera...', 'warn');

    try {
      const chosen = await chooseEngine();
      if (chosen === 'native') {
        try {
          await startNative();
        } catch (nativeErr) {
          if (prefs.engine === 'native') throw nativeErr;
          setError('Native failed; ZXing fallback used: ' + (nativeErr.message || nativeErr));
          await stopCameraResources(false);
          scanning = true;
          await startZXing();
        }
      } else {
        await startZXing();
      }

      ui.cameraOff.style.display = 'none';
      ui.scanGuide.hidden = false;
      ui.scanToggle.textContent = 'Stop Scanner';
      ui.scanToggle.classList.add('stop');
      setStatus('Scanning', 'live');
    } catch (err) {
      scanning = false;
      activeEngine = 'None';
      setError(err.message || String(err));
      const message = err.name === 'NotAllowedError' ? 'Camera permission denied' : (err.message || 'Could not start scanner');
      setStatus(message, 'bad');
      await stopCameraResources(false);
    } finally {
      ui.scanToggle.disabled = false;
      updateDebug();
    }
  }

  async function stopCameraResources(updateUi = true) {
    nativeLoopToken++;
    nativeBusy = false;

    if (zxingControls) {
      try { zxingControls.stop(); } catch (_) {}
      zxingControls = null;
    }
    if (zxingReader) {
      try { zxingReader.reset?.(); } catch (_) {}
      zxingReader = null;
    }
    if (nativeStream) {
      nativeStream.getTracks().forEach(t => t.stop());
      nativeStream = null;
    }
    if (ui.video.srcObject) {
      try { ui.video.srcObject.getTracks?.().forEach(t => t.stop()); } catch (_) {}
      ui.video.srcObject = null;
    }
    nativeDetector = null;

    if (updateUi) {
      activeEngine = 'None';
      updateDebug();
      ui.cameraOff.style.display = 'grid';
      ui.scanGuide.hidden = true;
      ui.scanToggle.textContent = 'Start Scanner';
      ui.scanToggle.classList.remove('stop');
      setStatus('Ready');
    }
  }

  async function stopScanner() {
    scanning = false;
    scanLocked = false;
    closeScanModal(false);
    await stopCameraResources(true);
  }

  async function restartScannerIfRunning() {
    if (!scanning) return;
    await stopScanner();
    await startScanner();
  }

  function openSettings() {
    syncSettingsUI();
    ui.settingsModal.classList.add('show');
  }

  function closeSettings() {
    ui.settingsModal.classList.remove('show');
  }

  function askClear(source = 'list') {
    ui.confirmTitle.textContent = source === 'cache' ? 'Clear scan cache?' : 'Clear scanned codes?';
    ui.confirmText.textContent = 'This removes all currently stored scanned codes from this session. Scanner preferences are kept.';
    confirmAction = () => {
      codes = [];
      saveCodes();
      try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
      renderCodes();
      showToast('Scans cleared');
    };
    ui.confirmModal.classList.add('show');
  }

  function codesAsText() {
    return codes.join('\n');
  }

  async function copyText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
      return true;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showToast(successMessage);
        return true;
      } catch (err) {
        showToast('Copy failed');
        return false;
      } finally {
        ta.remove();
      }
    }
  }

  async function copyCodes() {
    if (!codes.length) { showToast('Nothing to copy'); return; }
    await copyText(codesAsText(), 'Copied ' + codes.length + ' code' + (codes.length === 1 ? '' : 's'));
  }

  async function shareCodes() {
    if (!codes.length) { showToast('Nothing to share'); return; }
    const text = codesAsText();

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        setError('Share failed: ' + (err?.message || err));
      }
    }

    await copyText(text, 'Share unavailable - codes copied');
  }

  function csvCell(value) {
    return '"' + String(value).replace(/"/g, '""') + '"';
  }

  function exportCsv() {
    if (!codes.length) { showToast('Nothing to export'); return; }
    const csv = codes.map(csvCell).join('\r\n') + '\r\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('') + '-' + [String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0'), String(d.getSeconds()).padStart(2, '0')].join('');
    a.href = url;
    a.download = 'scanned-codes-' + stamp + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('CSV exported');
  }

  function bindCheckbox(input, key, after) {
    input.addEventListener('change', async () => {
      prefs[key] = input.checked;
      savePrefs();
      if (after) await after();
    });
  }

  ui.scanToggle.addEventListener('click', () => scanning ? stopScanner() : startScanner());
  ui.settingsBtn.addEventListener('click', openSettings);
  ui.settingsClose.addEventListener('click', closeSettings);
  ui.settingsModal.addEventListener('click', e => { if (e.target === ui.settingsModal) closeSettings(); });
  ui.retryBtn.addEventListener('click', retryPending);
  ui.acceptBtn.addEventListener('click', acceptPending);
  ui.copyBtn.addEventListener('click', copyCodes);
  ui.shareBtn.addEventListener('click', shareCodes);
  ui.csvBtn.addEventListener('click', exportCsv);
  ui.clearBtn.addEventListener('click', () => askClear('list'));
  ui.clearCacheBtn.addEventListener('click', () => askClear('cache'));

  ui.confirmCancel.addEventListener('click', () => {
    confirmAction = null;
    ui.confirmModal.classList.remove('show');
  });
  ui.confirmClear.addEventListener('click', () => {
    const action = confirmAction;
    confirmAction = null;
    ui.confirmModal.classList.remove('show');
    if (action) action();
  });
  ui.confirmModal.addEventListener('click', e => {
    if (e.target === ui.confirmModal) {
      confirmAction = null;
      ui.confirmModal.classList.remove('show');
    }
  });

  bindCheckbox(ui.autoAccept, 'autoAccept', async () => updateAutoDelayState());
  ui.autoAcceptDelay.addEventListener('change', () => {
    prefs.autoAcceptDelay = Number(ui.autoAcceptDelay.value);
    savePrefs();
  });
  bindCheckbox(ui.beepEnabled, 'beepEnabled');
  bindCheckbox(ui.ignoreListDuplicates, 'ignoreListDuplicates');
  bindCheckbox(ui.ignoreImmediate, 'ignoreImmediate');
  bindCheckbox(ui.preserveRefresh, 'preserveRefresh', async () => {
    if (!prefs.preserveRefresh) {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
    } else {
      saveCodes();
    }
  });

  ui.engineSelect.addEventListener('change', async () => {
    prefs.engine = ui.engineSelect.value;
    savePrefs();
    await restartScannerIfRunning();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && prefs.preserveRefresh) saveCodes();
  });
  window.addEventListener('pagehide', saveCodes);

  syncSettingsUI();
  renderCodes();
  updateDebug();
  if (!window.isSecureContext) setStatus('Host over HTTPS to use camera', 'warn');
  console.info('Barcode Scanner v' + APP_VERSION);
})();
