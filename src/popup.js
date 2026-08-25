/**
 * popup.js — extension popup logic.
 * Shows the active tab's IMDb ID, copy buttons, and recent history.
 */
(function () {
  'use strict';

  var Lib = (typeof IMDBId !== 'undefined') ? IMDBId : null;

  var DEFAULTS = { idFormat: 'tt', titleFormat: 'title-year', historySize: 10 };
  var settings = Object.assign({}, DEFAULTS);

  /* ---------------------------------------------------------------- helpers */

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function relativeTime(ts) {
    if (!ts) return '';
    var diff = Date.now() - ts;
    if (diff < 60e3) return 'just now';
    if (diff < 3600e3) return Math.floor(diff / 60e3) + 'm ago';
    if (diff < 86400e3) return Math.floor(diff / 3600e3) + 'h ago';
    return Math.floor(diff / 86400e3) + 'd ago';
  }

  function copyToClipboard(text, cb) {
    cb = cb || function () {};
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { cb(true); },
        function () { legacyCopy(text, cb); }
      );
      return;
    }
    legacyCopy(text, cb);
  }

  function legacyCopy(text, cb) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      cb(ok);
    } catch (e) { cb(false); }
  }

  function flashCopied(btn, originalLabel) {
    if (!btn) return;
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(function () {
      btn.textContent = originalLabel || '⧉ Copy';
      btn.classList.remove('copied');
    }, 1100);
  }

  /* ---------------------------------------------------------------- current tab */

  function getActiveTab(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      cb((tabs && tabs[0]) || null);
    });
  }

  function renderCurrentTab() {
    getActiveTab(function (tab) {
      var url = (tab && tab.url) || '';
      var title = (tab && tab.title) || '';
      var raw = Lib ? Lib.extractFromUrl(url) : null;

      if (raw) {
        renderCurrent(Lib.formatId(raw, settings.idFormat), title);
        return;
      }

      // URL didn't contain an id — ask the content script for doc-level resolution.
      if (tab && tab.id !== undefined && tab.id !== chrome.tabs.TAB_ID_NONE) {
        try {
          chrome.tabs.sendMessage(tab.id, { cmd: 'GET_ID' }, function (resp) {
            if (chrome.runtime.lastError || !resp || !resp.ok) {
              renderCurrent('', title);
            } else {
              renderCurrent(resp.id || '', resp.title || title);
            }
          });
        } catch (e) { renderCurrent('', title); }
      } else {
        renderCurrent('', title);
      }
    });
  }

  function renderCurrent(id, title) {
    var inp = $('current-id');
    inp.value = id || '—';
    var sub = $('current-title');
    sub.textContent = title || (id ? '' : 'Open an IMDb title page to copy its ID.');
    var status = $('current-status');
    if (id) {
      status.hidden = true;
    } else {
      status.hidden = false;
      status.textContent = 'No IMDb ID found on this page.';
    }
  }

  /* ---------------------------------------------------------------- history */

  function renderHistory() {
    chrome.storage.local.get({ history: [] }, function (res) {
      var list = Array.isArray(res.history) ? res.history.slice() : [];
      var cap = Math.max(0, Number(settings.historySize) || 10);
      if (list.length > cap) list.length = cap;
      var ul = $('history-list');
      ul.textContent = '';

      if (!list.length) {
        ul.appendChild(el('li', 'history-empty', 'Nothing copied yet.'));
        return;
      }

      var frag = document.createDocumentFragment();
      list.forEach(function (entry) {
        var li = el('li');
        var item = el('div', 'history-item');

        item.appendChild(el('div', 'history-id', entry.id || ''));
        var meta = (entry.title || '') + ((entry.title && entry.copiedAt) ? ' · ' + relativeTime(entry.copiedAt) : '');
        item.appendChild(el('div', 'history-meta', meta));

        var btn = el('button', 'history-copy', '⧉ Copy');
        btn.addEventListener('click', function () {
          copyToClipboard(entry.id, function (ok) {
            if (ok) flashCopied(btn, '⧉ Copy');
          });
        });

        li.appendChild(item);
        li.appendChild(btn);
        frag.appendChild(li);
      });
      ul.appendChild(frag);
    });
  }

  /* ---------------------------------------------------------------- wiring */

  function init() {
    $('copy-current').addEventListener('click', function () {
      var val = ($('current-id').value || '').trim();
      if (!val || val === '—') return;
      copyToClipboard(val, function (ok) {
        if (ok) flashCopied($('copy-current'), '⧉ Copy');
      });
    });

    $('clear-history').addEventListener('click', function () {
      chrome.storage.local.set({ history: [] }, renderHistory);
    });

    $('open-options').addEventListener('click', function () {
      chrome.runtime.openOptionsPage();
    });

    chrome.storage.sync.get(DEFAULTS, function (items) {
      settings = Object.assign({}, DEFAULTS, items);
      renderCurrentTab();
      renderHistory();
    });
  }

  init();
})();