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

console.log('# detectParentsGuide');
{
  // 1. Missing: "Add content advisory" link
  const docMissingLink = {
    querySelectorAll: (sel) => {
      if (sel.indexOf('parentalguide') > -1) {
        return [{ textContent: 'Add content advisory' }];
      }
      return [];
    },
    querySelector: () => null,
    getElementById: () => null
  };
  check('detect missing advisory via link', Lib.detectParentsGuide(docMissingLink), false);

  // 2. Available: advisory section with categories
  const docAvailableDom = {
    querySelectorAll: () => [],
    querySelector: (sel) => {
      if (sel.indexOf('storyline-parents-guide') > -1) {
        return { textContent: 'Sex & Nudity: Mild | Violence & Gore: Severe' };
      }
      return null;
    },
    getElementById: () => null
  };
  check('detect available advisory via DOM', Lib.detectParentsGuide(docAvailableDom), true);

  // 3. Missing: __NEXT_DATA__ with totalCount: 0
  const docMissingNextData = {
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: (id) => {
      if (id === '__NEXT_DATA__') {
        return {
          textContent: JSON.stringify({
            props: {
              pageProps: {
                mainColumnData: {
                  parentsGuide: { totalCount: 0, categories: [] }
                }
              }
            }
          })
        };
      }
      return null;
    }
  };
  check('detect missing advisory via NEXT_DATA', Lib.detectParentsGuide(docMissingNextData), false);

  // 4. Available: __NEXT_DATA__ with categories
  const docAvailableNextData = {
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: (id) => {
      if (id === '__NEXT_DATA__') {
        return {
          textContent: JSON.stringify({
            props: {
              pageProps: {
                aboveTheFoldData: {
                  parentsGuide: { totalCount: 12, categories: [{ id: 'nudity', text: 'Mild' }] }
                }
              }
            }
          })
        };
      }
      return null;
    }
  };
  check('detect available advisory via NEXT_DATA', Lib.detectParentsGuide(docAvailableNextData), true);

  // 5. Default optimistic when doc is empty
  const docEmpty = { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null };
  check('detect default advisory state', Lib.detectParentsGuide(docEmpty), true);
}

console.log('# extractParentsGuideRatings');
{
  // 1. Full NEXT_DATA payload matching screenshot
  const docNextData = {
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: (id) => {
      if (id === '__NEXT_DATA__') {
        return {
          textContent: JSON.stringify({
            props: {
              pageProps: {
                mainColumnData: {
                  parentsGuide: {
                    totalCount: 5,
                    categories: [
                      { id: 'advisory-nudity', text: 'Mild' },
                      { id: 'advisory-violence', text: 'Severe' },
                      { id: 'advisory-profanity', text: 'Moderate' },
                      { id: 'advisory-alcohol', text: 'Mild' },
                      { id: 'advisory-frightening', text: 'Severe' }
                    ]
                  }
                }
              }
            }
          })
        };
      }
      return null;
    }
  };

  const ratings = Lib.extractParentsGuideRatings(docNextData);
  check('ratings count', ratings.length, 5);

  const nudity = ratings.find(r => r.key === 'nudity');
  check('nudity severity', nudity && nudity.severity, 'Mild');
  check('nudity level', nudity && nudity.level, 'mild');

  const violence = ratings.find(r => r.key === 'violence');
  check('violence severity', violence && violence.severity, 'Severe');
  check('violence level', violence && violence.level, 'severe');

  const profanity = ratings.find(r => r.key === 'profanity');
  check('profanity severity', profanity && profanity.severity, 'Moderate');
  check('profanity level', profanity && profanity.level, 'moderate');

  const alcohol = ratings.find(r => r.key === 'alcohol');
  check('alcohol severity', alcohol && alcohol.severity, 'Mild');
  check('alcohol level', alcohol && alcohol.level, 'mild');

  const frightening = ratings.find(r => r.key === 'frightening');
  check('frightening severity', frightening && frightening.severity, 'Severe');
  check('frightening level', frightening && frightening.level, 'severe');

  // 2. HTML string parse
  const htmlSample = '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"mainColumnData":{"parentsGuide":{"categories":[{"id":"nudity","text":"None"},{"id":"violence","text":"Moderate"}]}}}}}</script>';
  const htmlRatings = Lib.extractParentsGuideRatings(htmlSample);
  const htmlNudity = htmlRatings.find(r => r.key === 'nudity');
  check('html parse nudity none', htmlNudity && htmlNudity.severity, 'None');
  check('html parse nudity level none', htmlNudity && htmlNudity.level, 'none');

  // 3. Jackass scenario: NextData has Moderate & DOM text has "none of which"
  const docJackass = {
    querySelectorAll: (sel) => {
      if (sel.indexOf('advisory') > -1) {
        return [
          { textContent: 'Sex & Nudity: Several scenes contain male full-frontal nudity, none of which is sexual. Severity: Moderate' },
          { textContent: 'Profanity: Over 50 f-words, none censored. Severity: Moderate' }
        ];
      }
      return [];
    },
    querySelector: () => null,
    getElementById: (id) => {
      if (id === '__NEXT_DATA__') {
        return {
          textContent: JSON.stringify({
            props: {
              pageProps: {
                mainColumnData: {
                  parentsGuide: {
                    categories: [
                      { id: 'advisory-nudity', text: 'Moderate' },
                      { id: 'advisory-violence', text: 'Severe' },
                      { id: 'advisory-profanity', text: 'Moderate' },
                      { id: 'advisory-alcohol', text: 'Mild' },
                      { id: 'advisory-frightening', text: 'Severe' }
                    ]
                  }
                }
              }
            }
          })
        };
      }
      return null;
    }
  };

  const jackassRatings = Lib.extractParentsGuideRatings(docJackass);
  const jackassNudity = jackassRatings.find(r => r.key === 'nudity');
  check('jackass nudity is Moderate not None', jackassNudity && jackassNudity.severity, 'Moderate');
  check('jackass nudity level is moderate', jackassNudity && jackassNudity.level, 'moderate');

  // 4. GraphQL nested shape in NextData
  const docGraphQL = {
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: (id) => {
      if (id === '__NEXT_DATA__') {
        return {
          textContent: JSON.stringify({
            props: {
              pageProps: {
                contentRating: {
                  categories: [
                    { category: { id: 'nudity', text: 'Sex & Nudity' }, severity: { id: 'MODERATE', text: 'Moderate' } },
                    { category: { id: 'violence', text: 'Violence & Gore' }, severity: { id: 'SEVERE', text: 'Severe' } },
                    { category: { id: 'profanity', text: 'Profanity' }, severity: { id: 'MODERATE', text: 'Moderate' } },
                    { category: { id: 'alcohol', text: 'Alcohol, Drugs & Smoking' }, severity: { id: 'MILD', text: 'Mild' } },
                    { category: { id: 'frightening', text: 'Frightening & Intense Scenes' }, severity: { id: 'SEVERE', text: 'Severe' } }
                  ]
                }
              }
            }
          })
        };
      }
      return null;
    }
  };

  const gqlRatings = Lib.extractParentsGuideRatings(docGraphQL);
  check('gql nudity', gqlRatings.find(r => r.key === 'nudity')?.severity, 'Moderate');
  check('gql violence', gqlRatings.find(r => r.key === 'violence')?.severity, 'Severe');
  check('gql profanity', gqlRatings.find(r => r.key === 'profanity')?.severity, 'Moderate');
  check('gql alcohol', gqlRatings.find(r => r.key === 'alcohol')?.severity, 'Mild');
  check('gql frightening', gqlRatings.find(r => r.key === 'frightening')?.severity, 'Severe');

  // 5. Pure page body text fallback (no NextData)
  const docPureText = {
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    body: {
      textContent: 'Storyline Parents Guide: Sex & Nudity: Moderate · Violence & Gore: Severe · Profanity: Moderate · Alcohol, Drugs & Smoking: Mild · Frightening & Intense Scenes: Severe'
    }
  };

  const pureRatings = Lib.extractParentsGuideRatings(docPureText);
  check('pure text nudity', pureRatings.find(r => r.key === 'nudity')?.severity, 'Moderate');
  check('pure text violence', pureRatings.find(r => r.key === 'violence')?.severity, 'Severe');
  check('pure text profanity', pureRatings.find(r => r.key === 'profanity')?.severity, 'Moderate');
  check('pure text alcohol', pureRatings.find(r => r.key === 'alcohol')?.severity, 'Mild');
  check('pure text frightening', pureRatings.find(r => r.key === 'frightening')?.severity, 'Severe');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);