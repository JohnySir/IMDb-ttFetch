/**
 * options.js — settings page logic. Persists to chrome.storage.sync.
 */
(function () {
  'use strict';

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

  var VALIDATE = {
    toastDurationMs: { min: 500, max: 5000 },
    historySize: { min: 0, max: 50 }
  };

  function $(id) { return document.getElementById(id); }

  function load() {
    chrome.storage.sync.get(DEFAULTS, function (items) {
      $('id-format').value = items.idFormat === 'digits' ? 'digits' : 'tt';
      $('title-format').value = items.titleFormat === 'title' ? 'title' : 'title-year';
      $('show-floating').checked = !!items.showFloatingButton;
      $('show-title').checked = items.showTitleButton !== false;
      $('show-parents-guide').checked = items.showParentsGuideButton !== false;
      $('show-sneak-peek').checked = items.showSneakPeekButton !== false;
      $('peek-cat-nudity').checked = items.peekCatNudity !== false;
      $('peek-cat-violence').checked = items.peekCatViolence !== false;
      $('peek-cat-profanity').checked = items.peekCatProfanity !== false;
      $('peek-cat-alcohol').checked = items.peekCatAlcohol !== false;
      $('peek-cat-frightening').checked = items.peekCatFrightening !== false;
      $('menu-enabled').checked = !!items.menuEnabled;
      $('toast-ms').value = items.toastDurationMs;
      $('history-size').value = items.historySize;
      updatePreview();
    });
  }

  function updatePreview() {
    var fmt = $('id-format').value;
    $('format-preview').textContent = fmt === 'digits' ? '0111161' : 'tt0111161';

    var titleFmt = $('title-format').value;
    $('title-format-preview').textContent = titleFmt === 'title' ? 'The Shawshank Redemption' : 'The Shawshank Redemption 1994';
  }

  function showStatus(msg, isError) {
    var s = $('status');
    s.textContent = msg;
    s.classList.toggle('error', !!isError);
    s.hidden = false;
    setTimeout(function () { s.hidden = true; }, 2500);
  }

  function reloadExtension() {
    if (chrome.runtime && typeof chrome.runtime.reload === 'function') {
      chrome.runtime.reload();
    } else {
      location.reload();
    }
  }

  function collect() {
    var toast = parseInt($('toast-ms').value, 10);
    var hist = parseInt($('history-size').value, 10);
    var out = {
      idFormat: $('id-format').value,
      titleFormat: $('title-format').value,
      showFloatingButton: $('show-floating').checked,
      showTitleButton: $('show-title').checked,
      showParentsGuideButton: $('show-parents-guide').checked,
      showSneakPeekButton: $('show-sneak-peek').checked,
      peekCatNudity: $('peek-cat-nudity').checked,
      peekCatViolence: $('peek-cat-violence').checked,
      peekCatProfanity: $('peek-cat-profanity').checked,
      peekCatAlcohol: $('peek-cat-alcohol').checked,
      peekCatFrightening: $('peek-cat-frightening').checked,
      menuEnabled: $('menu-enabled').checked,
      toastDurationMs: isNaN(toast) ? DEFAULTS.toastDurationMs : toast,
      historySize: isNaN(hist) ? DEFAULTS.historySize : hist
    };
    var err = [];
    Object.keys(VALIDATE).forEach(function (k) {
      var v = out[k];
      if (typeof v === 'number' && (v < VALIDATE[k].min || v > VALIDATE[k].max)) {
        err.push(k + ' must be between ' + VALIDATE[k].min + ' and ' + VALIDATE[k].max);
      }
    });
    return { ok: err.length === 0, value: out, errors: err };
  }

  function save() {
    var res = collect();
    if (!res.ok) { showStatus(res.errors.join('; '), true); return; }
    chrome.storage.sync.set(res.value, function () {
      showStatus('Saved ✓ Reloading extension...');
      setTimeout(reloadExtension, 300);
    });
  }

  function reset() {
    chrome.storage.sync.set(DEFAULTS, function () {
      load();
      showStatus('Reset to defaults ✓ Reloading extension...');
      setTimeout(reloadExtension, 300);
    });
  }

  $('id-format').addEventListener('change', updatePreview);
  $('title-format').addEventListener('change', updatePreview);
  $('save').addEventListener('click', save);
  $('reset').addEventListener('click', reset);

  var manifest = chrome.runtime.getManifest();
  $('version').textContent = manifest.version || '?';

  load();
})();