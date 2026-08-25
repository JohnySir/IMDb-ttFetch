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
    showParentsGuideButton: true,
    showSneakPeekButton: true,
    peekCatNudity: true,
    peekCatViolence: true,
    peekCatProfanity: true,
    peekCatAlcohol: true,
    peekCatFrightening: true,
    menuEnabled: true,
    toastDurationMs: 1400,
    historySize: 10
  };

  var state = {
    settings: Object.assign({}, DEFAULTS),
    pageTitle: document.title || '',
    id: null,
    titleInfo: null,
    parentsGuideAvailable: true,
    peekOpen: false,
    peekLoading: false,
    peekData: null,
    ui: null // { host, idButton, titleButton, pgGroup, parentsGuideButton, peekButton, peekPanel, toast }
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
  state.parentsGuideAvailable = (Lib && Lib.detectParentsGuide) ? Lib.detectParentsGuide(document) : true;

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
      '.iidc-group-row {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 6px;',
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
      '  transition: transform .12s ease, box-shadow .12s ease, background .12s ease, color .12s ease;',
      '}',
      '.iidc-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,.55); }',
      '.iidc-btn:active { transform: translateY(0); }',
      '.iidc-btn .iidc-star { color: #f5c518; font-size: 14px; }',
      '.iidc-btn.iidc-disabled {',
      '  background: #181b24;',
      '  color: #656d82;',
      '  border-color: rgba(101, 109, 130, .35);',
      '  cursor: not-allowed !important;',
      '  box-shadow: none !important;',
      '  transform: none !important;',
      '  pointer-events: auto !important;',
      '}',
      '.iidc-btn.iidc-disabled:hover { transform: none !important; box-shadow: none !important; }',
      '.iidc-btn.iidc-disabled .iidc-star { color: #656d82 !important; }',
      '.iidc-btn-peek {',
      '  padding: 9px 12px;',
      '  font-size: 13px;',
      '}',
      '.iidc-peek-icon { font-size: 14px; }',
      '.iidc-peek-panel {',
      '  position: fixed;',
      '  right: 16px;',
      '  bottom: 160px;',
      '  z-index: 2147483640;',
      '  width: 320px;',
      '  border-radius: 12px;',
      '  background: #12141c;',
      '  border: 1px solid rgba(245, 197, 24, .45);',
      '  box-shadow: 0 12px 36px rgba(0,0,0,.75);',
      '  color: #fff;',
      '  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;',
      '  overflow: hidden;',
      '  opacity: 0;',
      '  transform: translateY(8px);',
      '  transition: opacity .18s ease, transform .18s ease;',
      '  pointer-events: none;',
      '}',
      '.iidc-peek-panel.iidc-open {',
      '  opacity: 1;',
      '  transform: translateY(0);',
      '  pointer-events: auto;',
      '}',
      '.iidc-peek-hd {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  padding: 12px 14px;',
      '  border-bottom: 1px solid rgba(255,255,255,.08);',
      '}',
      '.iidc-peek-title {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '  font-size: 14px;',
      '  font-weight: 700;',
      '  color: #f3f4f6;',
      '}',
      '.iidc-peek-bar {',
      '  display: inline-block;',
      '  width: 4px;',
      '  height: 16px;',
      '  background: #f5c518;',
      '  border-radius: 2px;',
      '}',
      '.iidc-peek-close {',
      '  background: transparent;',
      '  border: none;',
      '  color: #8c92a4;',
      '  font-size: 15px;',
      '  font-weight: 700;',
      '  cursor: pointer;',
      '  padding: 4px;',
      '  line-height: 1;',
      '}',
      '.iidc-peek-close:hover { color: #f3f4f6; }',
      '.iidc-peek-loading {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: center;',
      '  padding: 26px 16px;',
      '  gap: 10px;',
      '  color: #a1a7b8;',
      '  font-size: 13px;',
      '}',
      '.iidc-spinner {',
      '  width: 22px;',
      '  height: 22px;',
      '  border: 2px solid rgba(245, 197, 24, .2);',
      '  border-top-color: #f5c518;',
      '  border-radius: 50%;',
      '  animation: iidc-spin .7s linear infinite;',
      '}',
      '@keyframes iidc-spin { to { transform: rotate(360deg); } }',
      '.iidc-peek-list {',
      '  list-style: none;',
      '  margin: 0;',
      '  padding: 6px 0;',
      '}',
      '.iidc-peek-item {',
      '  display: flex;',
      '  align-items: center;',
      '  padding: 8px 14px;',
      '  gap: 8px;',
      '  cursor: pointer;',
      '  transition: background .12s ease;',
      '  border-bottom: 1px solid rgba(255,255,255,.03);',
      '}',
      '.iidc-peek-item:hover { background: rgba(255,255,255,.06); }',
      '.iidc-sev-bar {',
      '  width: 4px;',
      '  height: 18px;',
      '  border-radius: 2px;',
      '  flex-shrink: 0;',
      '}',
      '.iidc-sev-none, .iidc-sev-mild { background: #46d369; }',
      '.iidc-sev-moderate { background: #f5c518; }',
      '.iidc-sev-severe { background: #ff4d4f; }',
      '.iidc-sev-unknown { background: #6c7387; }',
      '.iidc-peek-lbl {',
      '  font-weight: 600;',
      '  font-size: 13px;',
      '  color: #f3f4f6;',
      '}',
      '.iidc-peek-sev {',
      '  font-weight: 400;',
      '  font-size: 13px;',
      '  color: #9ca3af;',
      '  margin-left: 2px;',
      '}',
      '.iidc-peek-arr {',
      '  margin-left: auto;',
      '  color: #6b7280;',
      '  font-size: 13px;',
      '}',
      '.iidc-peek-empty {',
      '  padding: 16px;',
      '  text-align: center;',
      '  color: #8c92a4;',
      '  font-size: 12px;',
      '}',
      '.iidc-peek-ft {',
      '  padding: 9px 14px;',
      '  background: rgba(0,0,0,.25);',
      '  text-align: center;',
      '  border-top: 1px solid rgba(255,255,255,.06);',
      '}',
      '.iidc-peek-link {',
      '  color: #f5c518;',
      '  font-size: 12px;',
      '  font-weight: 600;',
      '  text-decoration: none;',
      '  cursor: pointer;',
      '}',
      '.iidc-peek-link:hover { text-decoration: underline; }',
      '.iidc-toast {',
      '  position: fixed;',
      '  right: 16px;',
      '  bottom: 152px;',
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

    var pgGroup = document.createElement('div');
    pgGroup.className = 'iidc-group-row';

    var parentsGuideButton = makeButton('Parents Guide', 'Open Parents Guide for this title');
    var peekButton = document.createElement('button');
    peekButton.type = 'button';
    peekButton.className = 'iidc-btn iidc-btn-peek';
    peekButton.setAttribute('aria-label', 'Sneak peek content rating');
    peekButton.title = 'Sneak peek content rating';
    peekButton.innerHTML = '<span class="iidc-peek-icon">👁</span><span>Peek</span>';

    idButton.onclick = handleIdClick;
    titleButton.onclick = handleTitleClick;
    parentsGuideButton.onclick = handleParentsGuideClick;
    peekButton.onclick = handlePeekClick;

    pgGroup.appendChild(parentsGuideButton);
    pgGroup.appendChild(peekButton);

    stack.appendChild(idButton);
    stack.appendChild(titleButton);
    stack.appendChild(pgGroup);
    shadow.appendChild(stack);

    var peekPanel = document.createElement('div');
    peekPanel.className = 'iidc-peek-panel';
    peekPanel.setAttribute('role', 'dialog');
    peekPanel.setAttribute('aria-label', 'Content Advisory Sneak Peek');
    shadow.appendChild(peekPanel);

    var toast = document.createElement('div');
    toast.className = 'iidc-toast';
    toast.setAttribute('role', 'status');
    shadow.appendChild(toast);

    document.body.appendChild(host);

    state.ui = {
      host: host,
      idButton: idButton,
      titleButton: titleButton,
      pgGroup: pgGroup,
      parentsGuideButton: parentsGuideButton,
      peekButton: peekButton,
      peekPanel: peekPanel,
      toast: toast
    };
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

  function handleParentsGuideClick(e) {
    if (e && e.preventDefault) e.preventDefault();
    var raw = state.id || resolveId();
    if (!raw) { showToast('No IMDb ID found on this page', true); return; }
    var isAvail = (Lib && Lib.detectParentsGuide) ? Lib.detectParentsGuide(document) : state.parentsGuideAvailable;
    state.parentsGuideAvailable = isAvail;
    if (isAvail === false) {
      showToast('Parents Guide not available for this title', true);
      return;
    }
    window.location.href = 'https://www.imdb.com/title/' + raw + '/parentalguide/';
  }

  function handlePeekClick(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();

    var raw = state.id || resolveId();
    if (!raw) { showToast('No IMDb ID found on this page', true); return; }

    var isAvail = (Lib && Lib.detectParentsGuide) ? Lib.detectParentsGuide(document) : state.parentsGuideAvailable;
    state.parentsGuideAvailable = isAvail;
    if (isAvail === false) {
      showToast('Parents Guide not available for this title', true);
      return;
    }

    state.peekOpen = !state.peekOpen;
    if (!state.peekOpen) {
      renderPeekPanel();
      return;
    }

    if (!state.peekData) {
      var fromDoc = (Lib && Lib.extractParentsGuideRatings) ? Lib.extractParentsGuideRatings(document) : [];
      var hasKnown = fromDoc.some(function (c) { return c.level && c.level !== 'unknown'; });
      if (hasKnown) {
        state.peekData = fromDoc;
        state.peekLoading = false;
        renderPeekPanel();
        return;
      }

      state.peekLoading = true;
      renderPeekPanel();

      try {
        chrome.runtime.sendMessage({ cmd: 'FETCH_PARENTS_GUIDE', id: raw }, function (res) {
          state.peekLoading = false;
          if (res && res.ok && Array.isArray(res.categories)) {
            state.peekData = res.categories;
          } else {
            state.peekData = fromDoc;
          }
          if (state.peekOpen) renderPeekPanel();
        });
      } catch (err) {
        state.peekLoading = false;
        state.peekData = fromDoc;
        if (state.peekOpen) renderPeekPanel();
      }
    } else {
      state.peekLoading = false;
      renderPeekPanel();
    }
  }

  function renderPeekPanel() {
    if (!state.ui || !state.ui.peekPanel) return;
    var panel = state.ui.peekPanel;
    panel.classList.toggle('iidc-open', !!state.peekOpen);
    if (!state.peekOpen) return;

    panel.textContent = '';

    // Header
    var hd = document.createElement('div');
    hd.className = 'iidc-peek-hd';

    var titleBox = document.createElement('div');
    titleBox.className = 'iidc-peek-title';
    titleBox.innerHTML = '<span class="iidc-peek-bar"></span><span>Content rating</span>';

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'iidc-peek-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '✕';
    closeBtn.onclick = function (ev) {
      if (ev) ev.stopPropagation();
      state.peekOpen = false;
      renderPeekPanel();
    };

    hd.appendChild(titleBox);
    hd.appendChild(closeBtn);
    panel.appendChild(hd);

    // Body
    if (state.peekLoading) {
      var loadingBox = document.createElement('div');
      loadingBox.className = 'iidc-peek-loading';
      var spinner = document.createElement('div');
      spinner.className = 'iidc-spinner';
      var spinnerText = document.createElement('span');
      spinnerText.textContent = 'Fetching content rating...';
      loadingBox.appendChild(spinner);
      loadingBox.appendChild(spinnerText);
      panel.appendChild(loadingBox);
    } else {
      var list = document.createElement('ul');
      list.className = 'iidc-peek-list';

      var raw = state.id || resolveId();
      var guideUrl = raw ? ('https://www.imdb.com/title/' + raw + '/parentalguide/') : 'https://www.imdb.com/';

      var categories = Array.isArray(state.peekData) ? state.peekData : [];
      var categorySettingMap = {
        nudity: state.settings.peekCatNudity !== false,
        violence: state.settings.peekCatViolence !== false,
        profanity: state.settings.peekCatProfanity !== false,
        alcohol: state.settings.peekCatAlcohol !== false,
        frightening: state.settings.peekCatFrightening !== false
      };

      var visibleCategories = categories.filter(function (cat) {
        return categorySettingMap[cat.key] !== false;
      });

      if (!visibleCategories.length) {
        var emptyLi = document.createElement('li');
        emptyLi.className = 'iidc-peek-empty';
        emptyLi.textContent = 'No rating categories enabled in settings.';
        list.appendChild(emptyLi);
      } else {
        visibleCategories.forEach(function (cat) {
          var item = document.createElement('li');
          item.className = 'iidc-peek-item';
          item.title = 'Open full parents guide';
          item.onclick = function () {
            window.location.href = guideUrl;
          };

          var sevBar = document.createElement('span');
          sevBar.className = 'iidc-sev-bar iidc-sev-' + (cat.level || 'unknown');

          var lbl = document.createElement('span');
          lbl.className = 'iidc-peek-lbl';
          lbl.textContent = cat.label + ':';

          var sev = document.createElement('span');
          sev.className = 'iidc-peek-sev';
          sev.textContent = cat.severity || 'Not Rated';

          var arr = document.createElement('span');
          arr.className = 'iidc-peek-arr';
          arr.textContent = '›';

          item.appendChild(sevBar);
          item.appendChild(lbl);
          item.appendChild(sev);
          item.appendChild(arr);
          list.appendChild(item);
        });
      }

      panel.appendChild(list);

      // Footer
      var ft = document.createElement('div');
      ft.className = 'iidc-peek-ft';
      var link = document.createElement('a');
      link.className = 'iidc-peek-link';
      link.textContent = 'Open Full Parents Guide ↗';
      link.href = guideUrl;
      ft.appendChild(link);
      panel.appendChild(ft);
    }
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
    var showParentsGuide = state.settings.showParentsGuideButton !== false && !!state.id;
    var showPeek = state.settings.showSneakPeekButton !== false && showParentsGuide;

    if ((showId || showTitle || showParentsGuide) && document.body) {
      var ui = createUI();
      if (ui) {
        ui.idButton.style.display = showId ? '' : 'none';
        ui.titleButton.style.display = showTitle ? '' : 'none';
        ui.pgGroup.style.display = showParentsGuide ? '' : 'none';
        ui.peekButton.style.display = showPeek ? '' : 'none';

        var pgAvailable = state.parentsGuideAvailable !== false;
        ui.parentsGuideButton.classList.toggle('iidc-disabled', !pgAvailable);
        ui.peekButton.classList.toggle('iidc-disabled', !pgAvailable);

        var tooltip = pgAvailable
          ? 'Open Parents Guide'
          : 'Parents Guide not available for this title (Add content advisory)';
        ui.parentsGuideButton.title = tooltip;
        ui.peekButton.title = pgAvailable ? 'Sneak peek content rating' : tooltip;

        ui.parentsGuideButton.setAttribute('aria-disabled', pgAvailable ? 'false' : 'true');
        ui.peekButton.setAttribute('aria-disabled', pgAvailable ? 'false' : 'true');

        renderPeekPanel();
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

  /* ---------------------------------------------------------------- keyboard & outside dismiss */

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.peekOpen) {
      state.peekOpen = false;
      renderPeekPanel();
    }
  });

  document.addEventListener('click', function (e) {
    if (state.peekOpen && state.ui && state.ui.host) {
      if (!state.ui.host.contains(e.target)) {
        state.peekOpen = false;
        renderPeekPanel();
      }
    }
  }, { passive: true });

  /* ---------------------------------------------------------------- boot */

  function updatePageState() {
    state.pageTitle = document.title || '';
    state.id = resolveId();
    state.titleInfo = resolveTitle();
    state.parentsGuideAvailable = (Lib && Lib.detectParentsGuide) ? Lib.detectParentsGuide(document) : true;
    state.peekOpen = false;
    state.peekData = null;
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
