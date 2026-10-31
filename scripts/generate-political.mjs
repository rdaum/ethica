#!/usr/bin/env node

// Builds the Political Treatise. The English must be downloaded by hand into the cache; the
// Latin and French come from the Wikisource API. See the README for the sources.

import fs from 'fs';
import path from 'path';
import { applyCorrections } from './lib/french.mjs';
import {
  attachNotes,
  extractEnglishReferences,
  extractLatinReferences,
  parseEnglish,
  parseFrenchChapter,
  parseFrenchNotes,
  parseFrenchPreface,
  parseLatin,
  PREFACE_ID,
  sectionId
} from './lib/political.mjs';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const CACHE_DIR = path.join(ROOT, '.cache', 'political');
const ENGLISH_URL = 'https://constitution.org/2-Authors/bs/poltreat.txt';
const LATIN_PAGE = 'Tractatus_Politicus';
const FRENCH_WORK = 'Traité politique';

const SOURCE = {
  english: { translator: 'A.H. Gosset', editor: 'R.H.M. Elwes', year: 1883, url: ENGLISH_URL },
  latin: { url: `https://la.wikisource.org/wiki/${LATIN_PAGE}`, edition: 'not stated by the source' },
  french: {
    translator: 'Émile Saisset',
    year: 1861,
    url: `https://fr.wikisource.org/wiki/${FRENCH_WORK.replace(/ /g, '_')}`,
    proofread: 'mostly not; corrections and notes below were checked against the scan'
  }
};

// The treatise's pages on French Wikisource, in order: the letter, then the chapters.
const FRENCH_PAGES = [
  'Préface',
  'Introduction',
  'Du Droit naturel',
  'Du droit des pouvoirs souverains',
  'Des grandes affaires d’état',
  'De la meilleure condition possible pour un état',
  'De la monarchie',
  'De la monarchie (suite)',
  'De l’aristocratie',
  'De l’aristocratie (suite)',
  'De l’aristocratie (fin)',
  'De la démocratie'
];

// Reading errors in the uncorrected French, each checked against a scan of the 1861 page.
const FRENCH_CORRECTIONS = [
  { id: 'TP.III.14', from: 'État a Ie plein', to: 'État a le plein' },
  { id: 'TP.VI.5', from: '“ J’avais', to: '« J’avais' },
  { id: 'TP.VI.5', from: 'castrat. ”', to: 'castrat. »' },
  { id: 'TP.VI.6', from: 'car Ies bons', to: 'car les bons' },
  { id: 'TP.VII.1', from: 'lui- même', to: 'lui-même' },
  { id: 'TP.VII.5', from: 'soumis an Roi', to: 'soumis au Roi' },
  { id: 'TP.VII.9', from: 'parvenait â séduire', to: 'parvenait à séduire' },
  { id: 'TP.VIII.12', from: 'viennent â s’éteindre', to: 'viennent à s’éteindre' },
  { id: 'TP.IX.9', from: 'également â cette', to: 'également à cette' },
  { id: 'TP.X.1', from: '“ Il s’ajoute', to: '« Il s’ajoute' },
  { id: 'TP.X.1', from: 'mérite. ”', to: 'mérite. »' },
  { id: 'TP.X.2', from: 'chapitre Vl', to: 'chapitre VI' }
];

// Past the first pages the transcription keeps a note's marker as a bare digit and drops its
// text. These are read from the foot of the scanned pages. The print restarts its numbers on
// each page, so the transcription's running numbers are kept.
const FRENCH_NOTES_MISSING_FROM_THE_PAGE = [
  { id: 'TP.II.6', after: 'quemque voluptas', number: '4', text: 'Virgile, Églogues, II, 65.' },
  { id: 'TP.II.22', after: 'usage vulgaire', number: '5', text: 'Saint Paul, Épître aux Romains, IX, 21, 22.' },
  { id: 'TP.II.24', after: 'notre Éthique', number: '6', text: 'Éthique, partie 3, Scholie de la Proposition 29.' },
  { id: 'TP.V.3', after: 'aucune sédition', number: '1', text: 'Voyez Justin, Hist., XXXII, 4, 12.' },
  { id: 'TP.VI.5', after: 'dit Orsinès', number: '1', text: 'Chez Quinte-Curce, liv. X, ch. 1.' },
  {
    id: 'TP.VII.5',
    after: 'à un autre',
    number: '1',
    text: 'Ces paroles sont tirées d’un écrit faussement attribué à Salluste. Voyez l’édition de Cortius, Leipzig, 1724.'
  },
  { id: 'TP.VII.6', after: 'mon Éthique', number: '2', text: 'Voyez Éthique, partie 3, Proposition 29 et suivantes.' },
  { id: 'TP.VII.14', after: 'parti d’Absalon', number: '3', text: 'Rois, II, ch. XV, sqq.' },
  { id: 'TP.VII.14', after: 'ils le firent', number: '4', text: 'Voyez Tacite, Histoires, livre I.' },
  { id: 'TP.VII.14', after: 'bien Perezius', number: '5', text: 'Jurisconsulte espagnol, qui était, vers 1585, professeur de droit à l’université de Louvain.' },
  { id: 'TP.VII.24', after: 'à Susacus', number: '6', text: 'Je lis avec Bruder Susacus et non Susanus. Voyez Rois, I, 14, 26, sqq. Comp. Josèphe, Ant., 8, 10, 2.' },
  { id: 'TP.X.1', after: 'très-pénétrant Florentin', number: '1', text: 'Nic. Machiavel, Discorsi sopra la prima deca di Tito-Livio, III, 1.' },
  { id: 'TP.X.1', after: 'de Cicéron', number: '2', text: 'Ad Quint. fratr., III, 8, 4.' },
  { id: 'TP.X.5', after: 'nous refuse', number: '3', text: 'Ovide, Les Amours, III, 4, 17.' }
];

// References the English prints but the Latin does not, each read in context. As with the
// Ethics, the Latin decides: II.15 and III.15 print 18 for 13, and the rest name another section.
// VIII.7's "ninth section" is the sixth chapter's, as the sentence says and the Latin confirms.
// Saisset's French agrees with the Latin on all of these but one. At X.2 both translators have
// the previous chapter, but the Latin's VIII.1-2 are about how many must govern, as the sentence
// requires, and IX.1-2 are about cities.
const ENGLISH_REFERENCES_THE_LATIN_CORRECTS = {
  'TP.II.15': ['TP.II.6', 'TP.II.18'],
  'TP.III.15': ['TP.III.18'],
  'TP.VIII.7': ['TP.VIII.9'],
  'TP.IX.5': ['TP.VI.38'],
  'TP.X.2': ['TP.IX.1', 'TP.IX.2']
};

// The Latin's own slips. III.7 cites the section on the man led by reason, II.11, which III.6
// cites correctly, and Saisset has "article 11". VIII.41 has lost its number, which the English
// and French both give ("the twenty-ninth section of the sixth chapter"), so that reference
// needs no correction here.
const LATIN_REFERENCE_CORRECTIONS = { 'TP.III.7': { 'TP.II.2': 'TP.II.11' } };

// The only references to the Ethics that name a passage are in editors' footnotes. Spinoza's
// own text says only "in our Ethics" (I.5, II.1, II.24, VII.6), so these are kept apart from
// his citations. Each is checked against the printed note. Where Saisset is only as precise
// as the 1883 note, or vaguer ("part 3 et 4" at I.5), it adds nothing here.
const SAISSET_REFERENCES_TO_THE_ETHICS = [
  { id: 'TP.II.1', note: '3', printed: 'Voyez l’Ethique, part. 2, Propos. 48, 49, et le Schol. de la Propos. 49.', targets: ['II.prop.49'] },
  { id: 'TP.II.24', note: '6', printed: 'Éthique, partie 3, Scholie de la Proposition 29.', targets: ['III.prop.29.note'] }
];

const EDITOR_REFERENCES_TO_THE_ETHICS = [
  { id: 'TP.I.5', note: '1', printed: 'Ethics, iv. 4, Coroll. iii. 31, note; 32, note.', targets: ['IV.prop.4.corollary', 'III.prop.31.note', 'III.prop.32.note'] },
  { id: 'TP.I.5', note: '2', printed: 'Ibid., v. 42, note.', targets: ['V.prop.42.note'] },
  { id: 'TP.II.1', note: '2', printed: 'Ethics, iv. 37, note 2.', targets: ['IV.prop.37.note2'] },
  { id: 'TP.II.1', note: '3', printed: 'Ibid., ii. 48, 49, note.', targets: ['II.prop.48', 'II.prop.49.note'] },
  { id: 'TP.VII.6', note: '4', printed: 'Ethics, iii. 29, &c.', targets: ['III.prop.29'] }
];

const readEnglish = () => {
  const cachePath = path.join(CACHE_DIR, 'poltreat.txt');

  if (!fs.existsSync(cachePath)) {
    throw new Error(`Download ${ENGLISH_URL} by hand and save it as ${cachePath}.`);
  }

  // The file predates UTF-8: its one accented letter is a Latin-1 byte.
  return fs.readFileSync(cachePath, 'latin1');
};

const readLatin = async () => {
  const cachePath = path.join(CACHE_DIR, 'tp_la.html');

  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf8');
  }

  const url = new URL('https://la.wikisource.org/w/api.php');
  url.search = new URLSearchParams({ action: 'parse', page: LATIN_PAGE, prop: 'text', format: 'json', formatversion: '2' });

  const response = await fetch(url, { headers: { 'User-Agent': 'ethica-reader/0.1 (https://rdaum.github.io/ethica/)' } });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  const html = (await response.json()).parse.text;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, html);
  return html;
};

const readFrenchPage = async (page, index) => {
  const cachePath = path.join(CACHE_DIR, 'fr', `${String(index).padStart(2, '0')}.html`);

  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf8');
  }

  const url = new URL('https://fr.wikisource.org/w/api.php');
  url.search = new URLSearchParams({ action: 'parse', page: `${FRENCH_WORK}/${page}`, prop: 'text', format: 'json', formatversion: '2' });

  const response = await fetch(url, { headers: { 'User-Agent': 'ethica-reader/0.1 (https://rdaum.github.io/ethica/)' } });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  const html = (await response.json()).parse.text;
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, html);
  return html;
};

/** Returns each French passage by ID, with its notes attached and its reading errors fixed. */
const readFrench = async () => {
  const pages = [];

  for (const [index, page] of FRENCH_PAGES.entries()) {
    pages.push(await readFrenchPage(page, index));
  }

  const raw = { [PREFACE_ID]: parseFrenchPreface(pages[0]) };
  pages.slice(1).forEach((html, index) => {
    parseFrenchChapter(html).forEach(section => {
      raw[sectionId(index + 1, section.number)] = section.text;
    });
  });

  // A note's digit becomes the "[n]" marker the rest of the book uses.
  const markers = FRENCH_NOTES_MISSING_FROM_THE_PAGE.map(({ id, after, number }) => ({ id, from: `${after} ${number}`, to: `${after}[${number}]` }));
  const corrected = applyCorrections(raw, [...FRENCH_CORRECTIONS, ...markers]);
  const passages = new Map();
  const attach = (ids, html, chapterId) => {
    const notes = new Map(parseFrenchNotes(html).map((text, index) => [String(index + 1), text]));
    FRENCH_NOTES_MISSING_FROM_THE_PAGE.filter(({ id }) => id.startsWith(`${chapterId}.`)).forEach(({ number, text }) => notes.set(number, text));
    attachNotes(ids.map(id => ({ id, text: corrected[id] })), notes).forEach(passage => passages.set(passage.id, passage));
  };

  attach([PREFACE_ID], pages[0], PREFACE_ID);
  pages.slice(1).forEach((html, index) => {
    const prefix = sectionId(index + 1, 1).replace(/\.1$/, '');
    attach(Object.keys(corrected).filter(id => id.startsWith(`${prefix}.`)), html, prefix);
  });

  return passages;
};

const ids = references => references.map(([chapter, section]) => sectionId(chapter, section));

const main = async () => {
  const english = parseEnglish(readEnglish());
  const latin = parseLatin(await readLatin());
  const french = await readFrench();
  const known = new Set(english.chapters.flatMap(chapter => chapter.sections.map(section => sectionId(chapter.number, section.number))));
  const graph = [
    '# Generated by scripts/generate-political.mjs. Do not hand-edit.',
    '@prefix ethics: <http://spinoza.org/ethics#> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '',
    'ethics:Section a rdfs:Class .',
    '',
    `ethics:${PREFACE_ID} a ethics:Preface ;`,
    '    ethics:partNumber 1 .',
    ''
  ];
  const editorEdges = new Map();
  const usedEnglishCorrections = new Set();

  for (const { id, note, printed, targets } of EDITOR_REFERENCES_TO_THE_ETHICS) {
    const chapterNumber = english.chapters.find(chapter => chapter.sections.some(section => sectionId(chapter.number, section.number) === id)).number;
    const section = english.chapters[chapterNumber - 1].sections.find(candidate => sectionId(chapterNumber, candidate.number) === id);
    const footnote = section.footnotes?.find(candidate => candidate.number === note);

    if (footnote?.text !== printed) {
      throw new Error(`${id} note ${note} no longer reads: ${printed}`);
    }

    editorEdges.set(id, [...(editorEdges.get(id) ?? []), ...targets]);
  }

  for (const { id, note, printed, targets } of SAISSET_REFERENCES_TO_THE_ETHICS) {
    if (french.get(id)?.footnotes?.find(candidate => candidate.number === note)?.text !== printed) {
      throw new Error(`The French ${id} note ${note} no longer reads: ${printed}`);
    }

    editorEdges.set(id, [...(editorEdges.get(id) ?? []), ...targets]);
  }

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  let citationCount = 0;

  english.chapters.forEach(chapter => {
    const latinChapter = latin.chapters[chapter.number - 1];

    if (chapter.sections.length !== latinChapter?.sections.length) {
      throw new Error(`Chapter ${chapter.number}: ${chapter.sections.length} English sections, ${latinChapter?.sections.length} Latin`);
    }

    const elements = chapter.sections.map((section, index) => {
      const latinSection = latinChapter.sections[index];
      const id = sectionId(chapter.number, section.number);

      if (latinSection.number !== section.number) {
        throw new Error(`${id} lines up with Latin section ${latinSection.number}`);
      }

      if (!french.has(id)) {
        throw new Error(`${id} has no French`);
      }

      const latinTargets = ids(extractLatinReferences(latinSection.text, chapter.number, section.number)).map(
        target => LATIN_REFERENCE_CORRECTIONS[id]?.[target] ?? target
      );
      const englishTargets = ids(extractEnglishReferences(section.text, chapter.number, section.number));
      const rejected = ENGLISH_REFERENCES_THE_LATIN_CORRECTS[id] ?? [];
      rejected.forEach(target => {
        if (!englishTargets.includes(target) || latinTargets.includes(target)) {
          throw new Error(`Reviewed correction no longer applies: ${id} -> ${target}`);
        }

        usedEnglishCorrections.add(`${id} ${target}`);
      });
      const targets = [...new Set([...latinTargets, ...englishTargets.filter(target => !rejected.includes(target))])].filter(target => target !== id);
      const unknown = targets.filter(target => !known.has(target));

      if (unknown.length) {
        throw new Error(`${id} refers to sections that do not exist: ${unknown.join(', ')}`);
      }

      citationCount += targets.length;
      const predicates = [`ethics:partNumber ${chapter.number}`, `ethics:number ${section.number}`];

      if (targets.length) {
        predicates.push(`ethics:cites ${targets.map(target => `ethics:${target}`).join(', ')}`);
      }

      if (editorEdges.has(id)) {
        predicates.push(`ethics:editorCites ${editorEdges.get(id).map(target => `ethics:${target}`).join(', ')}`);
      }

      graph.push(`ethics:${id} a ethics:Section ;\n    ${predicates.join(' ;\n    ')} .`, '');

      return {
        id,
        number: String(section.number),
        text: section.text,
        latinText: latinSection.text,
        frenchText: french.get(id).text,
        ...(section.footnotes ? { footnotes: section.footnotes } : {}),
        ...(french.get(id).footnotes ? { frenchFootnotes: french.get(id).footnotes } : {})
      };
    });

    const preface =
      chapter.number === 1
        ? [{ id: PREFACE_ID, text: english.preface, latinText: latin.preface, frenchText: french.get(PREFACE_ID).text, frenchFootnotes: french.get(PREFACE_ID).footnotes }]
        : [];
    fs.writeFileSync(
      path.join(PUBLIC_DIR, `political_${chapter.number}.json`),
      `${JSON.stringify({ source: SOURCE, chapter: chapter.number, title: chapter.title, elements: [...preface, ...elements] }, null, 2)}\n`
    );
  });

  fs.writeFileSync(path.join(PUBLIC_DIR, 'political-logic.n3'), `${graph.join('\n')}\n`);

  console.log(
    `Generated ${known.size} sections in ${english.chapters.length} chapters, ${citationCount} citations, ` +
      `${[...editorEdges.values()].flat().length} editor references to the Ethics, ${french.size} French passages, ` +
      `${usedEnglishCorrections.size} English references corrected by the Latin.`
  );
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
