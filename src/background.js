/**
 * background.js — MV3 service worker.
 * Owns the context menu, the keyboard command, history, and clipboard writes.
 */
'use strict';

importScripts('imdb-id.js');

var Lib = globalThis.IMDBId;

var DEFAULTS = {
  idFormat: 'tt',
  titleFormat: 'title-year',
  showFloatingButton: true,
  showTitleButton: true,
  menuEnabled: true,
  toastDurationMs: 1400,
  historySize: 10
};

var settings = Object.assign({}, DEFAULTS);
var MENU_ID = 'copy-imdb-id';

/* ---------------------------------------------------------------- settings */

function loadSettings(cb) {
  chrome.storage.sync.get(DEFAULTS, function (items) {
    settings = Object.assign({}, DEFAULTS, items);
    if (typeof cb === 'function') cb(settings);
  });
}

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== 'sync') return;
  var changed = false;
  Object.keys(changes).forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
      settings[k] = changes[k].newValue;
      changed = true;
    }
  });
  if (changed) refreshMenu();
});

/* ---------------------------------------------------------------- history */

function pushHistory(entry) {
  chrome.storage.local.get({ history: [] }, function (res) {
    var list = Array.isArray(res.history) ? res.history.slice() : [];
    // dedupe by raw id
    list = list.filter(function (e) { return e && e.id !== entry.id; });
    list.unshift(entry);
    var cap = Math.max(0, Number(settings.historySize) || 10);
    if (list.length > cap) list.length = cap;
    chrome.storage.local.set({ history: list });
  });
}

/* ---------------------------------------------------------------- clipboard */

function copyViaClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(
      function () { return true; },
      function () { return false; }
    );
  }
  return Promise.resolve(false);
}

/* ---------------------------------------------------------------- context menu */

function refreshMenu() {
  chrome.contextMenus.removeAll(function () {
    if (!settings.menuEnabled) return;
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Copy IMDb ID',
      contexts: ['page', 'selection', 'link']
    });
  });
}

chrome.runtime.onInstalled.addListener(function () {
  loadSettings(function () { refreshMenu(); });
});
chrome.runtime.onStartup.addListener(function () {
  loadSettings(function () { refreshMenu(); });
});

/* ---------------------------------------------------------------- resolution helpers */

function resolveFromUrl(url) {
  return Lib ? Lib.extractFromUrl(url) : null;
}

function resolveFromText(text) {
  return Lib ? Lib.extractFromText(text) : null;
}

/* ---------------------------------------------------------------- context menu click */

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (!info || info.menuItemId !== MENU_ID) return;

  var raw = null;
  if (info.selectionText) raw = resolveFromText(info.selectionText);
  if (!raw && info.linkUrl) raw = resolveFromUrl(info.linkUrl);
  if (!raw && info.pageUrl) raw = resolveFromUrl(info.pageUrl);
  if (!raw) return;

  var formatted = Lib.formatId(raw, settings.idFormat);
  copyViaClipboard(formatted).then(function (ok) {
    if (ok) {
      var title = (info.selectionText && resolveFromText(info.selectionText) === raw)
        ? (info.selectionText.length > 60 ? info.selectionText.slice(0, 57) + '…' : info.selectionText)
        : (tab && tab.title) || '';
      pushHistory({ id: formatted, title: title.startsWith('tt') ? '' : title, copiedAt: Date.now() });
    }
  });
});

/* ---------------------------------------------------------------- keyboard command */

chrome.commands.onCommand.addListener(function (command) {
  if (command !== 'copy-imdb-id') return;

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs && tabs[0];
    if (!tab || !tab.id || tab.id === chrome.tabs.TAB_ID_NONE) return;

    var url = tab.url || '';
    var rawFromUrl = resolveFromUrl(url);
    var title = tab.title || '';

    function notifyResult(ok, id) {
      try {
        chrome.runtime.sendMessage({
          type: 'COMMAND_RESULT',
          ok: ok,
          id: id || null,
          reason: ok ? null : 'not-imdb'
        });
      } catch (e) { /* popup closed */ }
    }
    var notify = notifyResult;

    if (!rawFromUrl && url.indexOf('imdb.com') > -1) {
      // IMDb page whose URL lacks a title id — ask the content script.
      chrome.tabs.sendMessage(tab.id, { cmd: 'COPY_ID' }, function (resp) {
        if (chrome.runtime.lastError || !resp) {
          notify(false);
        } else {
          notify(!!resp.ok);
        }
      });
      return;
    }

    if (!rawFromUrl) { notify(false); return; }

    // Fast path: we have the id from the URL. Let the content script do the
    // copy (it shows the toast); fall back to SW clipboard if no content script.
    chrome.tabs.sendMessage(tab.id, { cmd: 'COPY_ID', explicitId: rawFromUrl }, function (resp) {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        var formatted = Lib ? Lib.formatId(rawFromUrl, settings.idFormat) : rawFromUrl;
        copyViaClipboard(formatted).then(function (ok) {
          if (ok) {
            pushHistory({ id: formatted, title: title, copiedAt: Date.now() });
            notify(true);
          } else {
            notify(false);
          }
        });
      } else {
        notify(true);
        // content script already recorded history via COPIED
      }
    });
    return;
  });
});

/* ---------------------------------------------------------------- COPIED ingestion */

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'COPIED') {
    var entry = {
      id: msg.id || msg.raw || '',
      rawId: msg.rawId || '',
      title: msg.title || '',
      url: msg.url || '',
      copiedAt: Date.now()
    };
    if (entry.id) pushHistory(entry);
    if (typeof sendResponse === 'function') sendResponse({ received: true });
  }
  return undefined;
});

/* ---------------------------------------------------------------- init */

loadSettings();