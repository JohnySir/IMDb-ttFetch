/**
 * id-lib.test.mjs — smoke tests for src/imdb-id.js (dev convenience only,
 * NOT part of the extension package). Run: node test/id-lib.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const libPath = resolve(__dirname, '../src/imdb-id.js');
const src = readFileSync(libPath, 'utf8');

// Evaluate the classic script in a fake global with a minimal URL/document shim.
globalThis.IMDBId = undefined;
const vm = await import('node:vm');
const sandbox = {
  URL,
  console,
  globalThis: null, // filled below
  window: null,     // filled below
  ID_REGEX: null
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const Lib = sandbox.IMDBId;
let pass = 0, fail = 0;

function check(name, actual, expected) {
  const ok = Object.is(actual, expected);
  if (ok) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.error('  ✘ ' + name + '\n    expected ' + JSON.stringify(expected) + '\n    got      ' + JSON.stringify(actual)); }
}

console.log('# extractFromUrl');
check('valid title url', Lib.extractFromUrl('https://www.imdb.com/title/tt0111161/'), 'tt0111161');
check('url with query', Lib.extractFromUrl('https://www.imdb.com/title/tt0111161/?ref_=nv_sr_srsg_0'), 'tt0111161');
check('episode chained path picks first', Lib.extractFromUrl('https://www.imdb.com/title/tt0944947/episodes?season=1'), 'tt0944947');
check('non-imdb host', Lib.extractFromUrl('https://example.com/title/tt0111161'), null);
check('no id in url', Lib.extractFromUrl('https://www.imdb.com/'), null);
check('null url', Lib.extractFromUrl(null), null);

console.log('# extractFromText');
check('bare in text', Lib.extractFromText('See tt0111161 for details'), 'tt0111161');
check('no id', Lib.extractFromText('nothing here'), null);
check('empty text', Lib.extractFromText(''), null);
check('null text', Lib.extractFromText(null), null);

console.log('# formatId');
check('tt default', Lib.formatId('tt0111161', 'tt'), 'tt0111161');
check('digits', Lib.formatId('tt0111161', 'digits'), '0111161');
check('adds tt', Lib.formatId('0111161', 'tt'), 'tt0111161');
check('null id', Lib.formatId(null, 'tt'), '');

console.log('# isImdbUrl');
check('www', Lib.isImdbUrl('https://www.imdb.com/title/tt0111161/'), true);
check('subdomain', Lib.isImdbUrl('https://m.imdb.com/title/tt0111161/'), true);
check('example', Lib.isImdbUrl('https://imdb.com.evil.com/'), false);

console.log('# extractTitleInfoFromDocument — NEXT_DATA');
{
  const doc = {
    getElementById: (id) => id === '__NEXT_DATA__' ? {
      textContent: JSON.stringify({
        props: { pageProps: {
          aboveTheFold: {
            titleText: { text: 'Parasite' },
            originalTitleText: { text: '기생충' },
            releaseYear: { year: 2019, endYear: null }
          }
        } }
      })
    } : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    title: ''
  };
  const i = Lib.extractTitleInfoFromDocument(doc);
  check('movie+orig+year', i && i.title, 'Parasite');
  check('movie+orig+year orig', i && i.originalTitle, '기생충');
  check('movie+orig+year year', i && i.year, '2019');
  check('movie+orig+year series', i && i.isSeriesLike, false);
  check('movie+orig+year build default', Lib.buildTitleString(i), 'Parasite 기생충 2019');
  check('movie+orig+year build title-year', Lib.buildTitleString(i, 'title-year'), 'Parasite 기생충 2019');
  check('movie+orig+year build just title', Lib.buildTitleString(i, 'title'), 'Parasite 기생충');
}

console.log('# extractTitleInfoFromDocument — JSON-LD Movie');
{
  const doc = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: (s) => s.includes('ld+json') ? [{ textContent: JSON.stringify({ '@type': 'Movie', name: 'Interstellar', datePublished: '2014-11-07' }) }] : [],
    title: ''
  };
  const i = Lib.extractTitleInfoFromDocument(doc);
  check('movie jsonld title', i && i.title, 'Interstellar');
  check('movie jsonld year', i && i.year, '2014');
  check('movie jsonld series', i && i.isSeriesLike, false);
  check('movie jsonld build default', Lib.buildTitleString(i), 'Interstellar 2014');
  check('movie jsonld build just title', Lib.buildTitleString(i, 'title'), 'Interstellar');
  check('movie jsonld build title-year', Lib.buildTitleString(i, 'title-year'), 'Interstellar 2014');
}

console.log('# extractTitleInfoFromDocument — JSON-LD TVSeries');
{
  const doc = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: (s) => s.includes('ld+json') ? [{ textContent: JSON.stringify({ '@type': 'TVSeries', name: 'Friends', datePublished: '1994-2004' }) }] : [],
    title: ''
  };
  const i = Lib.extractTitleInfoFromDocument(doc);
  check('series jsonld title', i && i.title, 'Friends');
  check('series jsonld series', i && i.isSeriesLike, true);
  check('series jsonld year', i && i.year, '1994');
  check('series jsonld build default', Lib.buildTitleString(i), 'Friends 1994');
  check('series jsonld build title-year', Lib.buildTitleString(i, 'title-year'), 'Friends 1994');
  check('series jsonld build just title', Lib.buildTitleString(i, 'title'), 'Friends');
}

console.log('# extractTitleInfoFromDocument — DOM hero');
{
  const doc = {
    getElementById: () => null,
    querySelector: (s) => {
      if (s === 'h1[data-testid="hero__pageTitle"]') return { textContent: 'Interstellar' };
      if (s === '[data-testid="hero-title-block__metadata"]') return { textContent: '2014' };
      return null;
    },
    querySelectorAll: () => [],
    title: ''
  };
  const i = Lib.extractTitleInfoFromDocument(doc);
  check('dom title', i && i.title, 'Interstellar');
  check('dom year', i && i.year, '2014');
  check('dom build default', Lib.buildTitleString(i), 'Interstellar 2014');
  check('dom build title-year', Lib.buildTitleString(i, 'title-year'), 'Interstellar 2014');
  check('dom build just title', Lib.buildTitleString(i, 'title'), 'Interstellar');
}

console.log('# extractTitleInfoFromDocument — fallback');
{
  const doc = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    title: 'Interstellar (2014) - IMDb'
  };
  const i = Lib.extractTitleInfoFromDocument(doc);
  check('fallback title', i && i.title, 'Interstellar');
  check('fallback year', i && i.year, '2014');
  check('fallback build default', Lib.buildTitleString(i), 'Interstellar 2014');
  check('fallback build title-year', Lib.buildTitleString(i, 'title-year'), 'Interstellar 2014');
  check('fallback build just title', Lib.buildTitleString(i, 'title'), 'Interstellar');
}

console.log('# extractTitleInfoFromDocument — fallback series range');
{
  const doc = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    title: 'Friends (TV Series 1994-2004) - IMDb'
  };
  const i = Lib.extractTitleInfoFromDocument(doc);
  check('fallback series title', i && i.title, 'Friends');
  check('fallback series series', i && i.isSeriesLike, true);
  check('fallback series year', i && i.year, '1994');
  check('fallback series build default', Lib.buildTitleString(i), 'Friends 1994');
  check('fallback series build title-year', Lib.buildTitleString(i, 'title-year'), 'Friends 1994');
  check('fallback series build just title', Lib.buildTitleString(i, 'title'), 'Friends');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);