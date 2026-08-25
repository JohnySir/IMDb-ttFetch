/**
 * imdb-id.js — single source of truth for IMDb ID + title extraction.
 *
 * Attaches `window.IMDBLib` (content script / popup) and `globalThis.IMDBLib`
 * (service worker via importScripts). Written as a classic script on purpose so
 * the exact same file can run in all three MV3 contexts without a bundler.
 */
(function () {
  'use strict';

  var ID_REGEX = /\btt\d{7,8}\b/;
  // URL-path extraction: first /title/<id> segment is the page's primary subject;
  // this deliberately ignores any *second* tt-number in the path (episode/related links).
  var TITLE_PATH_REGEX = /\/title\/(tt\d{7,8})\b/;
  var SERIES_TYPE_RE = /series|miniseries|tvseries|tvmini|tvepisode/i;
  var ORIGINAL_PREFIX_RE = /^\s*original\s*title\s*:\s*/i;

  function isImdbUrl(url) {
    if (!url) return false;
    try {
      var parsed = new URL(url, 'https://www.imdb.com');
      return /(^|\.)imdb\.com$/.test(parsed.hostname);
    } catch (e) {
      return false;
    }
  }

  function extractFromUrl(url) {
    if (!isImdbUrl(url)) return null;
    try {
      var parsed = new URL(url);
      var m = parsed.pathname.match(TITLE_PATH_REGEX);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  function extractFromText(text) {
    if (!text) return null;
    var m = String(text).match(ID_REGEX);
    return m ? m[0] : null;
  }

  /**
   * Gather the page's own IMDb id from the document using canonical-source order:
   *   1) link[rel=canonical] href
   *   2) meta[property=og:url] content
   *   3) meta[property=og:title] / twitter:title content
   *   4) __NEXT_DATA__ JSON (IMDb is a Next.js app)
   *   5) document.title
   *   6) document.location.href
   */
  /**
   * Gather the page's own IMDb id from the document using canonical-source order:
   *   1) link[rel=canonical] href
   *   2) meta[property=og:url] content
   *   3) meta[property=og:title] / twitter:title content
   *   4) __NEXT_DATA__ JSON (IMDb is a Next.js app)
   *   5) document.title
   *   6) document.location.href
   */
  function collectFromDocument(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    var url = typeof doc.location !== 'undefined' ? doc.location.href : '';

    // 1) link[rel=canonical]
    var canonical = doc.querySelector && doc.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href) {
      var hitCan = extractFromText(canonical.href);
      if (hitCan) return hitCan;
    }

    // 2) meta[property=og:url]
    var ogUrl = doc.querySelector && doc.querySelector('meta[property="og:url"]');
    if (ogUrl) {
      var hitOg = extractFromText(ogUrl.getAttribute('content') || '');
      if (hitOg) return hitOg;
    }

    // 3) meta[property=og:title] / twitter:title
    var titleMetas = doc.querySelectorAll && doc.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]');
    if (titleMetas && titleMetas.length) {
      for (var i = 0; i < titleMetas.length; i++) {
        var hitMeta = extractFromText(titleMetas[i].getAttribute('content') || '');
        if (hitMeta) return hitMeta;
      }
    }

    // 4) __NEXT_DATA__
    var nextData = doc.getElementById && doc.getElementById('__NEXT_DATA__');
    if (nextData && nextData.textContent) {
      var parsed = null;
      try { parsed = JSON.parse(nextData.textContent); } catch (e) { /* ignore */ }
      if (parsed && parsed.props && parsed.props.pageProps) {
        var pp = parsed.props.pageProps;
        var ab = pp.aboveTheFold || pp.aboveTheFoldData;
        if (ab && ab.id && ID_REGEX.test(ab.id)) return ab.id;
        if (pp.id && ID_REGEX.test(pp.id)) return pp.id;
        var foundId = null;
        var seenSet = (typeof Set !== 'undefined') ? new Set() : null;
        var walk = function (node, depth) {
          if (depth > 6 || !node || foundId) return;
          if (typeof node === 'string') {
            var m = node.match(ID_REGEX);
            if (m) { foundId = m[0]; }
            return;
          }
          if (Array.isArray(node)) {
            for (var i2 = 0; i2 < node.length && !foundId; i2++) walk(node[i2], depth + 1);
            return;
          }
          if (typeof node === 'object') {
            if (seenSet) {
              if (seenSet.has(node)) return;
              seenSet.add(node);
            }
            var keys = ['id', 'titleId', 'tconst', 'title'];
            for (var k = 0; k < keys.length; k++) {
              var v = node[keys[k]];
              if (typeof v === 'string') {
                var mv = v.match(ID_REGEX);
                if (mv) { foundId = mv[0]; return; }
              }
            }
            for (var key in node) {
              if (foundId) return;
              if (Object.prototype.hasOwnProperty.call(node, key)) walk(node[key], depth + 1);
            }
          }
        };
        if (pp.aboveTheFold) walk(pp.aboveTheFold, 0);
        if (!foundId && pp.meta) walk(pp.meta, 0);
        if (!foundId) walk(pp, 0);
        if (foundId) return foundId;
      }
    }

    // 5) document.title
    if (doc.title) {
      var hitTitle = extractFromText(doc.title);
      if (hitTitle) return hitTitle;
    }

    // 6) location.href
    if (url) {
      var hitUrl = extractFromUrl(url);
      if (hitUrl) return hitUrl;
    }

    return null;
  }

  function formatId(id, format) {
    if (!id) return '';
    if (format === 'digits') {
      return id.replace(/^tt/, '');
    }
    return /^tt/.test(id) ? id : 'tt' + id;
  }

  /* ---------------------------------------------------------------- title copy */

  function normalizeWs(s) {
    if (!s) return '';
    return String(s).replace(/[\s\u00a0]+/g, ' ').trim();
  }

  function stripOriginalPrefix(s) {
    return normalizeWs(String(s || '').replace(ORIGINAL_PREFIX_RE, ''));
  }

  function parseYearFields(text) {
    if (!text) return { year: null, endYear: null, isRange: false };
    var s = String(text);
    var iso = /^\s*(\d{4})-\d{2}-\d{2}/.exec(s);
    if (iso) return { year: iso[1], endYear: null, isRange: false };
    var range = /\b(\d{4})\s*[–-]\s*(\d{4})\b/.exec(s);
    if (range) return { year: range[1], endYear: range[2], isRange: true };
    var openRange = /\b(\d{4})\s*[–—]\s*(?!\d)/.exec(s);
    if (openRange) return { year: openRange[1], endYear: null, isRange: true };
    var y = /\b(18\d{2}|19\d{2}|20\d{2})\b/.exec(s) || /\b(\d{4})\b/.exec(s);
    return { year: y ? y[1] : null, endYear: null, isRange: false };
  }

  function emptyInfo() {
    return { title: null, originalTitle: null, year: null, endYear: null, isSeriesLike: false };
  }

  function mergeInfo(into, src) {
    if (!src) return into;
    if (!into.title && src.title) into.title = src.title;
    if (!into.originalTitle && src.originalTitle) into.originalTitle = src.originalTitle;
    if (!into.year && src.year) into.year = src.year;
    if (!into.endYear && src.endYear) into.endYear = src.endYear;
    if (src.isSeriesLike) into.isSeriesLike = true;
    return into;
  }

  function finalizeInfo(info) {
    if (!info || !info.title) return null;
    info.title = normalizeWs(info.title);
    info.originalTitle = info.originalTitle ? stripOriginalPrefix(info.originalTitle) : null;
    if (info.originalTitle && info.originalTitle.toLowerCase() === info.title.toLowerCase()) {
      info.originalTitle = null;
    }
    if (info.endYear && info.year && info.endYear !== info.year) info.isSeriesLike = true;
    return info.title ? info : null;
  }

  /**
   * Extract title info from the document.
   * Returns { title, originalTitle, year, endYear, isSeriesLike } or null.
   * Sources are merged (first non-null field wins) in this order:
   *   1) JSON-LD script (name / alternateName / datePublished / @type)
   *   2) DOM hero block
   *   3) __NEXT_DATA__ GraphQL payload (titleText / originalTitleText / releaseYear)
   *   4) document.title / og:title fallback
   */
  function extractTitleInfoFromDocument(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;

    var merged = emptyInfo();

    // 1) Fast JSON-LD check (small ~1KB metadata)
    mergeInfo(merged, infoFromJsonLd(parseJsonLd(doc)));
    if (merged.title && merged.year) return finalizeInfo(merged);

    // 2) Fast DOM hero elements
    mergeInfo(merged, infoFromDom(doc));
    if (merged.title && merged.year) return finalizeInfo(merged);

    // 3) __NEXT_DATA__ JSON
    var nextData = doc.getElementById && doc.getElementById('__NEXT_DATA__');
    if (nextData && nextData.textContent) {
      var parsed = null;
      try { parsed = JSON.parse(nextData.textContent); } catch (e) { /* ignore */ }
      if (parsed) mergeInfo(merged, findNextDataTitle(parsed));
    }
    if (merged.title && merged.year) return finalizeInfo(merged);

    // 4) Fallback
    mergeInfo(merged, infoFromFallback(doc));

    return finalizeInfo(merged);
  }

  function findNextDataTitle(parsed) {
    if (!parsed || typeof parsed !== 'object') return null;

    var out = emptyInfo();

    var pp = parsed.props && parsed.props.pageProps;
    if (pp) {
      var ab = pp.aboveTheFold || pp.aboveTheFoldData || pp.mainColumnData;
      if (ab) {
        if (ab.titleText && ab.titleText.text) out.title = String(ab.titleText.text);
        if (ab.originalTitleText && ab.originalTitleText.text) out.originalTitle = String(ab.originalTitleText.text);
        if (ab.releaseYear) {
          if (typeof ab.releaseYear === 'object') {
            if (ab.releaseYear.year != null) out.year = String(ab.releaseYear.year);
            if (ab.releaseYear.endYear != null) {
              out.endYear = String(ab.releaseYear.endYear);
              out.isSeriesLike = true;
            }
          } else {
            out.year = String(ab.releaseYear);
          }
        }
        var t = ab.titleType || ab.seriesType || ab['@type'] || ab.type;
        if (t && SERIES_TYPE_RE.test(String(typeof t === 'object' ? (t.id || t.text || '') : t))) {
          out.isSeriesLike = true;
        }
        if (out.title && out.year) return out;
      }
    }

    var seenSet = (typeof Set !== 'undefined') ? new Set() : null;

    function walk(node, depth) {
      if (depth > 8 || node == null || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) walk(node[i], depth + 1);
        return;
      }
      if (seenSet) {
        if (seenSet.has(node) || seenSet.size > 1500) return;
        seenSet.add(node);
      }

      if (!out.title && node.titleText && typeof node.titleText === 'object' && node.titleText.text) {
        out.title = String(node.titleText.text);
      }
      if (!out.originalTitle && node.originalTitleText && typeof node.originalTitleText === 'object' && node.originalTitleText.text) {
        out.originalTitle = String(node.originalTitleText.text);
      }
      if (!out.year && node.releaseYear) {
        if (typeof node.releaseYear === 'object') {
          if (node.releaseYear.year != null) out.year = String(node.releaseYear.year);
          if (node.releaseYear.endYear != null) {
            out.endYear = String(node.releaseYear.endYear);
            out.isSeriesLike = true;
          }
        } else if (typeof node.releaseYear === 'number' || typeof node.releaseYear === 'string') {
          out.year = String(node.releaseYear);
        }
      }
      if (!out.year && (node.startYear != null || node.year != null)) {
        var yr = node.startYear != null ? node.startYear : node.year;
        if (typeof yr === 'number' || (typeof yr === 'string' && /^\d{4}$/.test(String(yr).trim()))) {
          out.year = String(yr).trim();
        }
      }
      if (!out.isSeriesLike) {
        var typ = node.titleType || node.seriesType || node['@type'] || node.type;
        if (typ && SERIES_TYPE_RE.test(String(typeof typ === 'object' ? (typ.id || typ.text || '') : typ))) {
          out.isSeriesLike = true;
        }
      }

      if (out.title && out.year && out.originalTitle) return;

      var keys = Object.keys(node);
      for (var k = 0; k < keys.length; k++) {
        var v = node[keys[k]];
        if (v && typeof v === 'object') walk(v, depth + 1);
      }
    }

    walk(parsed, 0);
    return out.title ? out : null;
  }

  function parseJsonLd(doc) {
    var scripts = doc && doc.querySelectorAll && doc.querySelectorAll('script[type="application/ld+json"]');
    if (!scripts) return null;
    for (var i = 0; i < scripts.length; i++) {
      try {
        var data = JSON.parse(scripts[i].textContent || '{}');
        if (Array.isArray(data)) data = data[0];
        if (data && data['@graph'] && Array.isArray(data['@graph'])) {
          for (var g = 0; g < data['@graph'].length; g++) {
            var node = data['@graph'][g];
            if (node && (node.name || node.alternateName || node.alternativeName)) return node;
          }
        }
        if (data && (data.name || data.alternateName || data.alternativeName)) return data;
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  function infoFromJsonLd(ld) {
    if (!ld) return null;
    var title = ld.name || null;
    if (!title) return null;
    var original = ld.alternateName || ld.alternativeName || ld.altName || null;
    var years = parseYearFields(ld.datePublished || ld.copyrightYear || ld.startDate || '');
    var type = String(ld['@type'] || '');
    return {
      title: normalizeWs(title),
      originalTitle: original ? normalizeWs(original) : null,
      year: years.year,
      endYear: years.endYear,
      isSeriesLike: SERIES_TYPE_RE.test(type) || years.isRange
    };
  }

  function infoFromDom(doc) {
    if (!doc || !doc.querySelector) return null;
    var h1 = doc.querySelector('h1[data-testid="hero__pageTitle"]') ||
             doc.querySelector('h1[data-testid="hero-title-block__title"]') ||
             doc.querySelector('h1');
    if (!h1) return null;

    var primary = h1.querySelector && (h1.querySelector('[data-testid="hero__primary-text"]') || h1.querySelector('.hero__primary-text'));
    var title = normalizeWs((primary && primary.textContent) || h1.textContent || '');
    if (!title) return null;

    var original = null;
    var origEl = doc.querySelector('[data-testid*="original-title"], [data-testid*="originalTitle"], .originalTitle');
    if (origEl) original = stripOriginalPrefix(origEl.textContent || '');

    if (!original && h1.parentNode && h1.parentNode.querySelectorAll) {
      var nearby = h1.parentNode.querySelectorAll('div, span, li');
      for (var i = 0; i < nearby.length && i < 40; i++) {
        var raw = nearby[i].textContent || '';
        if (ORIGINAL_PREFIX_RE.test(raw)) {
          original = stripOriginalPrefix(raw);
          break;
        }
      }
    }

    var year = null, endYear = null, isSeriesLike = false;
    var meta = doc.querySelector('[data-testid="hero-title-block__metadata"]') ||
               doc.querySelector('[data-testid="hero__metadata"]') ||
               doc.querySelector('[data-testid="title-pc-metadata"]') ||
               doc.querySelector('[data-testid="hero-subnav-bar-left-block"]') ||
               doc.querySelector('ul.ipc-inline-list');
    if (meta) {
      var years = parseYearFields(meta.textContent || '');
      year = years.year;
      endYear = years.endYear;
      isSeriesLike = years.isRange;
    }

    if (!year && h1.parentNode && h1.parentNode.querySelectorAll) {
      var tags = h1.parentNode.querySelectorAll('a, span, li');
      for (var j = 0; j < tags.length && j < 30; j++) {
        var tText = tags[j].textContent || '';
        var p = parseYearFields(tText);
        if (p.year) {
          year = p.year;
          endYear = p.endYear;
          if (p.isRange) isSeriesLike = true;
          break;
        }
      }
    }

    return {
      title: title,
      originalTitle: original || null,
      year: year,
      endYear: endYear,
      isSeriesLike: isSeriesLike
    };
  }

  function infoFromFallback(doc) {
    if (!doc) return null;
    var raw = '';
    if (doc.querySelector) {
      var og = doc.querySelector('meta[property="og:title"]');
      if (og) raw = og.getAttribute('content') || '';
    }
    if (!raw && doc.title) raw = String(doc.title);
    raw = normalizeWs(raw);
    if (!raw) return null;

    var isSeriesLike = /TV\s*(Mini\s*)?Series/i.test(raw);
    raw = raw.replace(/\s*[-–—]\s*IMDb\s*$/i, '').trim();
    var years = parseYearFields(raw);
    var title = raw
      .replace(/\s*\((?:TV\s*(?:Mini\s*)?Series\s*)?\d{4}(?:\s*[–-]\s*\d{4})?\)\s*$/i, '')
      .replace(/\s*\(\d{4}\)\s*$/, '')
      .trim();
    if (!title) return null;
    return {
      title: title,
      originalTitle: null,
      year: years.year,
      endYear: years.endYear,
      isSeriesLike: isSeriesLike || years.isRange
    };
  }

  /**
   * Build the clipboard string for a title info object.
   * Rules:
   *  - if format is 'title': "Title" + original (if present and different), no year.
   *  - else ('title-year' or default): "Title" + original (if present and different) + year (if present).
   */
  function buildTitleString(info, format) {
    if (!info || !info.title) return '';
    var parts = [normalizeWs(info.title)];
    var orig = stripOriginalPrefix(info.originalTitle || '');
    if (orig && orig.toLowerCase() !== parts[0].toLowerCase()) parts.push(orig);
    var includeYear = (format !== 'title' && format !== 'title-only');
    if (includeYear && info.year) parts.push(String(info.year));
    return parts.join(' ');
  }

  /**
   * Detect whether the Parents Guide / Content Advisory is present on the page.
   * Returns: true (available) or false (missing / "Add content advisory").
   */
  function detectParentsGuide(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return true;

    // 1) Explicit check for "Add content advisory" in links, buttons, and story elements
    if (doc.querySelectorAll) {
      var links = doc.querySelectorAll('a[href*="parentalguide"], a[href*="advisories"], [data-testid*="advisory"], [data-testid*="parents-guide"], [data-testid*="content-rating"]');
      for (var i = 0; i < links.length; i++) {
        var text = (links[i].textContent || '').trim().toLowerCase();
        if (text.indexOf('add content advisory') > -1 || text.indexOf('be the first to add') > -1 || text.indexOf('add to guide') > -1) {
          return false;
        }
      }

      // Check if advisory sections exist with populated severity categories
      var advisorySection = doc.querySelector('[data-testid="storyline-parents-guide"], [data-testid="storyline-advisory"], [data-testid="title-advisory"]');
      if (advisorySection) {
        var advText = (advisorySection.textContent || '').trim().toLowerCase();
        if (advText.indexOf('add content advisory') > -1 || advText.indexOf('be the first to add') > -1) {
          return false;
        }
        if (/\b(nudity|violence|profanity|alcohol|drugs|smoking|frightening|severe|moderate|mild|none)\b/i.test(advText)) {
          return true;
        }
      }
    }

    // 2) Check __NEXT_DATA__
    var nextData = doc.getElementById && doc.getElementById('__NEXT_DATA__');
    if (nextData && nextData.textContent) {
      try {
        var parsed = JSON.parse(nextData.textContent);
        if (parsed && parsed.props && parsed.props.pageProps) {
          var pp = parsed.props.pageProps;
          var main = pp.mainColumnData || pp.aboveTheFoldData || pp.aboveTheFold;
          if (main) {
            var pg = main.parentsGuide || main.parentalGuide || main.advisories;
            if (pg) {
              if (Array.isArray(pg.categories)) {
                if (pg.categories.length === 0 && (!pg.certificates || !pg.certificates.length) && pg.totalCount === 0) {
                  return false;
                }
                if (pg.categories.length > 0) return true;
              }
              if (typeof pg.totalCount === 'number') {
                return pg.totalCount > 0;
              }
              if (typeof pg.total === 'number') {
                return pg.total > 0;
              }
            }
          }
        }
      } catch (e) { /* ignore */ }
    }

    // 3) Check document body text
    if (doc.body && doc.body.textContent) {
      var body = doc.body.textContent;
      if (body.indexOf('Add content advisory') > -1 && body.indexOf('Parents Guide') === -1) {
        return false;
      }
    }

    return true;
  }

  var CATEGORY_DEFS = [
    {
      key: 'nudity',
      label: 'Sex & Nudity',
      idMatch: /nudity|sex/i,
      textMatch: /\b(sex\s*(?:&|and)\s*nudity|nudity)\b/i,
      scanRe: /(?:sex\s*(?:&|and)\s*nudity|\bnudity\b)[^a-zA-Z0-9<>{}\[\]]{0,20}\s*\b(Severe|Moderate|Mild|None)\b/i
    },
    {
      key: 'violence',
      label: 'Violence & Gore',
      idMatch: /violence|gore/i,
      textMatch: /\b(violence\s*(?:&|and)\s*gore|violence)\b/i,
      scanRe: /(?:violence\s*(?:&|and)\s*gore|\bviolence\b)[^a-zA-Z0-9<>{}\[\]]{0,20}\s*\b(Severe|Moderate|Mild|None)\b/i
    },
    {
      key: 'profanity',
      label: 'Profanity',
      idMatch: /profanity|language/i,
      textMatch: /\b(profanity|language)\b/i,
      scanRe: /(?:profanity|\blanguage\b)[^a-zA-Z0-9<>{}\[\]]{0,20}\s*\b(Severe|Moderate|Mild|None)\b/i
    },
    {
      key: 'alcohol',
      label: 'Alcohol, Drugs & Smoking',
      idMatch: /alcohol|drug|smoking|substance/i,
      textMatch: /\b(alcohol.*drugs?|drugs?.*smoking|alcohol)\b/i,
      scanRe: /(?:alcohol(?:\s*,|\s*and|\s*&)?\s*drugs?(?:\s*,|\s*and|\s*&)?\s*smoking|\balcohol\b)[^a-zA-Z0-9<>{}\[\]]{0,20}\s*\b(Severe|Moderate|Mild|None)\b/i
    },
    {
      key: 'frightening',
      label: 'Frightening & Intense Scenes',
      idMatch: /frighten|intense/i,
      textMatch: /\b(frightening\s*(?:&|and)\s*intense|frightening)\b/i,
      scanRe: /(?:frightening\s*(?:&|and)\s*intense(?:\s*scenes)?|\bfrightening\b)[^a-zA-Z0-9<>{}\[\]]{0,20}\s*\b(Severe|Moderate|Mild|None)\b/i
    }
  ];

  function normalizeSeverity(raw) {
    if (!raw) return { severity: 'Not Rated', level: 'unknown' };
    var s = String(raw).trim();
    if (/\bsevere\b/i.test(s)) return { severity: 'Severe', level: 'severe' };
    if (/\bmoderate\b/i.test(s)) return { severity: 'Moderate', level: 'moderate' };
    if (/\bmild\b/i.test(s)) return { severity: 'Mild', level: 'mild' };
    if (/\bnone\b/i.test(s)) return { severity: 'None', level: 'none' };
    return { severity: s, level: 'unknown' };
  }

  function inspectNextDataItem(item, results) {
    if (!item || typeof item !== 'object') return;
    var idStr = '';
    if (typeof item.id === 'string') idStr += ' ' + item.id;
    if (typeof item.name === 'string') idStr += ' ' + item.name;
    if (typeof item.label === 'string') idStr += ' ' + item.label;
    if (typeof item.category === 'string') idStr += ' ' + item.category;
    else if (item.category && typeof item.category === 'object') {
      idStr += ' ' + (item.category.id || '') + ' ' + (item.category.text || '') + ' ' + (item.category.name || '');
    }
    if (typeof item.text === 'string') idStr += ' ' + item.text;

    var sevStr = '';
    if (typeof item.severity === 'string') sevStr += ' ' + item.severity;
    else if (item.severity && typeof item.severity === 'object') {
      sevStr += ' ' + (item.severity.text || '') + ' ' + (item.severity.id || '') + ' ' + (item.severity.value || '');
    }
    if (typeof item.rating === 'string') sevStr += ' ' + item.rating;
    else if (item.rating && typeof item.rating === 'object') {
      sevStr += ' ' + (item.rating.text || '') + ' ' + (item.rating.id || '');
    }
    if (typeof item.severityType === 'string') sevStr += ' ' + item.severityType;
    else if (item.severityType && typeof item.severityType === 'object') {
      sevStr += ' ' + (item.severityType.text || '') + ' ' + (item.severityType.id || '');
    }
    if (item.displayableProperty && item.displayableProperty.value) {
      sevStr += ' ' + (item.displayableProperty.value.plainText || '');
    }
    if (typeof item.text === 'string' && /\b(severe|moderate|mild|none)\b/i.test(item.text)) {
      sevStr += ' ' + item.text;
    }

    if (idStr && sevStr) {
      CATEGORY_DEFS.forEach(function (def) {
        if (def.idMatch.test(idStr) || def.textMatch.test(idStr)) {
          var norm = normalizeSeverity(sevStr);
          if (norm.level !== 'unknown') {
            results[def.key] = { key: def.key, label: def.label, severity: norm.severity, level: norm.level };
          }
        }
      });
    }
  }

  function findCategoriesInNextData(obj, results, depth) {
    if (!obj || typeof obj !== 'object' || (depth || 0) > 8) return;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) {
        inspectNextDataItem(obj[i], results);
        findCategoriesInNextData(obj[i], results, (depth || 0) + 1);
      }
      return;
    }
    inspectNextDataItem(obj, results);
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k) && typeof obj[k] === 'object') {
        findCategoriesInNextData(obj[k], results, (depth || 0) + 1);
      }
    }
  }

  /**
   * Extract ratings for all 5 Parents Guide categories from DOM, HTML string, or JSON-LD/NextData.
   */
  function extractParentsGuideRatings(docOrHtml) {
    var results = {};
    CATEGORY_DEFS.forEach(function (def) {
      results[def.key] = { key: def.key, label: def.label, severity: 'Not Rated', level: 'unknown' };
    });

    if (!docOrHtml) {
      return CATEGORY_DEFS.map(function (d) { return results[d.key]; });
    }

    // Tier 1: __NEXT_DATA__ JSON
    var nextDataJson = null;
    if (typeof docOrHtml === 'string') {
      var match = docOrHtml.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
      if (match && match[1]) {
        try { nextDataJson = JSON.parse(match[1]); } catch (e) {}
      }
    } else if (docOrHtml.getElementById) {
      var nextTag = docOrHtml.getElementById('__NEXT_DATA__');
      if (nextTag && nextTag.textContent) {
        try { nextDataJson = JSON.parse(nextTag.textContent); } catch (e) {}
      }
    }

    if (nextDataJson && nextDataJson.props && nextDataJson.props.pageProps) {
      findCategoriesInNextData(nextDataJson.props.pageProps, results, 0);
    }

    // Tier 2: DOM-based target inspection
    if (typeof docOrHtml !== 'string' && docOrHtml.querySelectorAll) {
      CATEGORY_DEFS.forEach(function (def) {
        if (results[def.key].level !== 'unknown') return;

        var el = docOrHtml.querySelector('[data-testid*="' + def.key + '"], [id*="' + def.key + '"], [data-testid*="advisory-' + def.key + '"]');
        if (el) {
          var badge = el.querySelector('[class*="content-item"], [class*="list-content"], [class*="badge"], [class*="status"], [class*="rating"], [data-testid*="severity"]');
          var textToCheck = (badge ? badge.textContent : el.textContent) || '';
          var norm = normalizeSeverity(textToCheck);
          if (norm.level !== 'unknown') {
            results[def.key] = { key: def.key, label: def.label, severity: norm.severity, level: norm.level };
            return;
          }
        }

        var listItems = docOrHtml.querySelectorAll('li[data-testid*="advisory"], li.ipc-metadata-list__item, [data-testid="storyline-advisory"] li');
        for (var j = 0; j < listItems.length; j++) {
          var li = listItems[j];
          var lblEl = li.querySelector('[class*="label"], [class*="title"], dt, strong');
          var lblText = lblEl ? lblEl.textContent : '';
          if (def.textMatch.test(lblText) || def.idMatch.test(li.getAttribute('data-testid') || '')) {
            var valEl = li.querySelector('[class*="content-item"], [class*="value"], [class*="list-content"], dd, span:last-child');
            var valText = (valEl ? valEl.textContent : li.textContent) || '';
            var normLi = normalizeSeverity(valText);
            if (normLi.level !== 'unknown') {
              results[def.key] = { key: def.key, label: def.label, severity: normLi.severity, level: normLi.level };
              break;
            }
          }
        }
      });
    }

    // Tier 3: Proximity regex scan across text
    var textSource = '';
    if (typeof docOrHtml === 'string') {
      textSource = docOrHtml;
    } else if (docOrHtml.body && docOrHtml.body.textContent) {
      textSource = docOrHtml.body.textContent;
    }

    if (textSource) {
      CATEGORY_DEFS.forEach(function (def) {
        if (results[def.key].level !== 'unknown') return;
        var m = textSource.match(def.scanRe);
        if (m && m[1]) {
          var sev = normalizeSeverity(m[1]);
          if (sev.level !== 'unknown') {
            results[def.key] = { key: def.key, label: def.label, severity: sev.severity, level: sev.level };
          }
        }
      });
    }

    return CATEGORY_DEFS.map(function (d) { return results[d.key]; });
  }

  var NS = {};
  NS.isImdbUrl = isImdbUrl;
  NS.extractFromUrl = extractFromUrl;
  NS.extractFromText = extractFromText;
  NS.collectFromDocument = collectFromDocument;
  NS.formatId = formatId;
  NS.extractTitleInfoFromDocument = extractTitleInfoFromDocument;
  NS.buildTitleString = buildTitleString;
  NS.detectParentsGuide = detectParentsGuide;
  NS.extractParentsGuideRatings = extractParentsGuideRatings;
  NS.CATEGORY_DEFS = CATEGORY_DEFS;
  NS.ID_REGEX = ID_REGEX;

  var target = (typeof globalThis !== 'undefined') ? globalThis : window;
  target.IMDBId = NS;
})();
