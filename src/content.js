/**
 * content.js — runs on imdb.com pages (isolated world).
 * Adds floating "Copy IMDb ID" / "Copy Title" buttons + transient toast, and
 * answers COPY_ID / GET_ID / GET_TITLE / PING messages from the background SW.
 */
(function () {
  'use strict';

  var Lib = (typeof IMDBId !== 'undefined') ? IMDBId
    : (typeof window !== 'undefined' && window.IMDBId) || null;

  var DEFAULTS = {
    idFormat: 'tt',
    titleFormat: 'title-year',
    showFloatingButton: true,
    showTitleButton: true,
    menuEnabled: true,
    toastDurationMs: 1400,
    historySize: 10
  };

  var state = {
    settings: Object.assign({}, DEFAULTS),
    pageTitle: document.title || '',
    id: null,
    titleInfo: null,
    ui: null // { host, idButton, titleButton, toast }
  };

  /* ---------------------------------------------------------------- settings */

  function loadSettings(cb) {
    if (!chrome.storage || !chrome.storage.sync) {
      if (typeof cb === 'function') cb(state.settings);
      return;
    }
    chrome.storage.sync.get(DEFAULTS, function (items) {
      state.settings = Object.assign({}, DEFAULTS, items);
      if (typeof cb === 'function') cb(state.settings);
    });
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'sync') return;
    var any = false;
    Object.keys(changes).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
        state.settings[k] = changes[k].newValue;
        any = true;
      }
    });
    if (any) render();
  });

  /* ---------------------------------------------------------------- resolve */

  function resolveId() {
    if (Lib && Lib.collectFromDocument) {
      var viaDoc = Lib.collectFromDocument(document);
      if (viaDoc) return viaDoc;
    }
    if (Lib && Lib.extractFromUrl) return Lib.extractFromUrl(document.location.href);
    return null;
  }

  function resolveTitle() {
    if (Lib && Lib.extractTitleInfoFromDocument) {
      return Lib.extractTitleInfoFromDocument(document);
    }
    return null;
  }

  state.id = resolveId();
  state.titleInfo = resolveTitle();

  /* ---------------------------------------------------------------- clipboard */

  function copyText(text, cb) {
    cb = cb || function () {};
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { cb(true); },
        function () { legacyCopy(text, cb); });
      return;
    }
    legacyCopy(text, cb);
  }

  function legacyCopy(text, cb) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      cb(ok);
    } catch (e) {
      cb(false);
    }
  }

  /* ---------------------------------------------------------------- toast/button UI */

  function makeButton(label, aria) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'iidc-btn';
    button.setAttribute('aria-label', aria);
    button.title = label;
    var star = document.createElement('span');
    star.className = 'iidc-star';
    star.textContent = '★';
    button.appendChild(star);
    var span = document.createElement('span');
    span.textContent = label;
    button.appendChild(span);
    return button;
  }

  function createUI() {
    if (state.ui) return state.ui;
    if (!document.body) return null;

    var host = document.createElement('div');
    host.id = 'imdb-id-copy-host';
    host.setAttribute('data-testid', 'imdb-id-copy-host');

    var shadow = host.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = [
      ':host { all: initial; }',
      '.iidc-stack {',
      '  position: fixed;',
      '  right: 16px;',
      '  bottom: 16px;',
      '  z-index: 2147483640;',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: flex-end;',
      '  gap: 8px;',
      '}',
      '.iidc-btn {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  padding: 9px 14px;',
      '  border: 1px solid rgba(245, 197, 24, .6);',
      '  border-radius: 20px;',
      '  background: #12141c;',
      '  color: #f5c518;',
      '  font: 600 13px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;',
      '  cursor: pointer;',
      '  box-shadow: 0 4px 16px rgba(0,0,0,.45);',
      '  transition: transform .12s ease, box-shadow .12s ease;',
      '}',
      '.iidc-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,.55); }',
      '.iidc-btn:active { transform: translateY(0); }',
      '.iidc-btn .iidc-star { color: #f5c518; font-size: 14px; }',
      '.iidc-toast {',
      '  position: fixed;',
      '  right: 16px;',
      '  bottom: 112px;',
      '  z-index: 2147483640;',
      '  max-width: 320px;',
      '  padding: 8px 14px;',
      '  border-radius: 10px;',
      '  background: rgba(18, 20, 28, .95);',
      '  color: #f5c518;',
      '  border: 1px solid rgba(245, 197, 24, .45);',
      '  font: 500 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;',
      '  box-shadow: 0 6px 22px rgba(0,0,0,.5);',
      '  opacity: 0;',
      '  transform: translateY(6px);',
      '  transition: opacity .18s ease, transform .18s ease;',
      '  pointer-events: none;',
      '}',
      '.iidc-toast.iidc-show { opacity: 1; transform: translateY(0); }',
      '.iidc-toast.iidc-error { color: #ff6b6b; border-color: rgba(255,107,107,.5); }'
    ].join('\n');
    shadow.appendChild(style);

    var stack = document.createElement('div');
    stack.className = 'iidc-stack';

    var idButton = makeButton('Copy IMDb ID', 'Copy IMDb ID of this page');
    var titleButton = makeButton('Copy Title', 'Copy movie or series title of this page');
    idButton.onclick = handleIdClick;
    titleButton.onclick = handleTitleClick;
    stack.appendChild(idButton);
    stack.appendChild(titleButton);
    shadow.appendChild(stack);

    var toast = document.createElement('div');
    toast.className = 'iidc-toast';
    toast.setAttribute('role', 'status');
    shadow.appendChild(toast);

    document.body.appendChild(host);

    state.ui = { host: host, idButton: idButton, titleButton: titleButton, toast: toast };
    return state.ui;
  }

  function removeUI() {
    if (!state.ui) return;
    if (state.ui.host && state.ui.host.parentNode) {
      state.ui.host.parentNode.removeChild(state.ui.host);
    }
    state.ui = null;
  }

  var toastTimer = null;
  function showToast(message, isError) {
    if (!state.ui || !state.ui.toast) return;
    var toast = state.ui.toast;
    toast.textContent = message;
    toast.classList.toggle('iidc-error', !!isError);
    toast.classList.add('iidc-show');
    if (toastTimer) clearTimeout(toastTimer);
    var dur = Math.max(600, Number(state.settings.toastDurationMs) || 1400);
    toastTimer = setTimeout(function () {
      toast.classList.remove('iidc-show');
    }, dur);
  }

  function handleIdClick() {
    var raw = state.id || resolveId();
    state.id = raw;
    if (!raw) { showToast('No IMDb ID found on this page', true); return; }
    var formatted = Lib ? Lib.formatId(raw, state.settings.idFormat) : raw;
    copyText(formatted, function (ok) {
      if (ok) {
        notifyCopied(raw, formatted, state.pageTitle);
        showToast('Copied ' + formatted);
      } else {
        showToast('Copy failed — try again', true);
      }
    });
  }

  function handleTitleClick() {
    var info = resolveTitle() || state.titleInfo;
    state.titleInfo = info;
    var fmt = state.settings.titleFormat || 'title-year';
    var text = (Lib && Lib.buildTitleString) ? Lib.buildTitleString(info, fmt) : '';
    if (!text) { showToast('No title found on this page', true); return; }
    copyText(text, function (ok) {
      if (ok) showToast('Copied ' + text);
      else showToast('Copy failed — try again', true);
    });
  }

  function notifyCopied(raw, formatted, pageTitle) {
    try {
      chrome.runtime.sendMessage({
        type: 'COPIED',
        rawId: raw, id: formatted, title: pageTitle || '',
        url: document.location.href
      });
    } catch (e) { /* popup/SW may be unavailable */ }
  }

  function render() {
    var showId = state.settings.showFloatingButton !== false && !!state.id;
    var showTitle = state.settings.showTitleButton !== false && !!(state.titleInfo && state.titleInfo.title);

    if ((showId || showTitle) && document.body) {
      var ui = createUI();
      if (ui) {
        ui.idButton.style.display = showId ? '' : 'none';
        ui.titleButton.style.display = showTitle ? '' : 'none';
      }
    } else if (state.ui) {
      removeUI();
    }
  }

  /* ---------------------------------------------------------------- messages */

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.cmd) {
      case 'COPY_ID':
      case 'GET_ID': {
        var raw = resolveId();
        var formatted = raw ? (Lib ? Lib.formatId(raw, state.settings.idFormat) : raw) : '';
        var payload = {
          ok: !!raw,
          raw: raw,
          id: formatted,
          title: document.title || ''
        };
        if (msg.cmd === 'COPY_ID' && raw) {
          copyText(formatted, function (ok) {
            if (ok) notifyCopied(raw, formatted, document.title || '');
            showToast(ok ? ('Copied ' + formatted) : 'Copy failed — try again', !ok);
            sendResponse(Object.assign({}, payload, { copied: ok }));
          });
          return true; // async response
        }
        sendResponse(payload);
        break;
      }
      case 'GET_TITLE': {
        var info = resolveTitle() || state.titleInfo;
        state.titleInfo = info;
        var format = msg.titleFormat || state.settings.titleFormat || 'title-year';
        var text = (Lib && Lib.buildTitleString) ? Lib.buildTitleString(info, format) : '';
        sendResponse({ ok: !!text, titleInfo: info, text: text });
        break;
      }
      case 'PING':
        sendResponse({ alive: true, id: state.id });
        break;
      default:
        break;
    }
    return undefined;
  });

  /* ---------------------------------------------------------------- boot */

  function updatePageState() {
    state.pageTitle = document.title || '';
    state.id = resolveId();
    state.titleInfo = resolveTitle();
    render();
  }

  function boot() {
    loadSettings(function () {
      updatePageState();

      // High-performance SPA navigation handling
      var lastHref = document.location.href;
      var navDebounce = null;

      function checkUrlChange() {
        if (document.location.href !== lastHref) {
          lastHref = document.location.href;
          if (navDebounce) clearTimeout(navDebounce);
          navDebounce = setTimeout(updatePageState, 80);
        }
      }

      window.addEventListener('popstate', checkUrlChange, { passive: true });
      if (typeof window.navigation !== 'undefined' && window.navigation.addEventListener) {
        window.navigation.addEventListener('navigate', function () {
          setTimeout(checkUrlChange, 60);
        }, { passive: true });
      }

      // Title observer for client-rendered transitions
      var titleTag = document.querySelector('title');
      if (titleTag && typeof MutationObserver !== 'undefined') {
        var obs = new MutationObserver(checkUrlChange);
        obs.observe(titleTag, { childList: true, characterData: true, subtree: true });
      }

      // Lightweight backup interval
      setInterval(checkUrlChange, 2000);
    });
  }

  boot();
})();
