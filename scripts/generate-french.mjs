#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { applyCorrections, assignPassages, collectFootnotes, mergePassages, parseBlocks, renamePassages, splitPassages } from './lib/french.mjs';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const CACHE_DIR = path.join(ROOT, '.cache', 'french');
const WORK = 'Éthique (Appuhn, 1913)';
const API = 'https://fr.wikisource.org/w/api.php';

// Elwes runs these together; Appuhn labels them separately. Passage IDs follow the English.
const MERGED_PASSAGES = {
  'I.prop.6.proof2': 'I.prop.6.corollary',
  'I.prop.9.proof': 'I.prop.9'
};

// Transcription slips in Wikisource, each checked against the scan of the 1913 printing.
// "Toute choses" in the Part I appendix is left alone because the printing has it too.
const CORRECTIONS = [
  { id: 'I.prop.8.note2', from: 'montré ici, Mais', to: 'montré ici. Mais' },
  { id: 'I.prop.31.note', from: 'clairement, Car', to: 'clairement. Car' },
  { id: 'I.prop.33.note1', from: 'Impossible, Une', to: 'Impossible. Une' },
  { id: 'I.appendix.introduction', from: 'de soi, Et', to: 'de soi. Et' },
  { id: 'I.appendix.introduction', from: 'premières, Les', to: 'premières. Les' },
  { id: 'II.prop.17.note', from: '13), En outre', to: '13). En outre' },
  { id: 'II.prop.45.note', from: 'en Dieu, Car', to: 'en Dieu. Car' },
  { id: 'II.prop.47.note', from: 'd’autrui, En réalité', to: 'd’autrui. En réalité' },
  { id: 'II.prop.49.note', from: 'sus-visées, La première', to: 'sus-visées. La première' },
  { id: 'III.prop.40.corollary1', from: 'l’Amour, En tant', to: 'l’Amour. En tant' },
  { id: 'IV.appendix.chapter.31', from: 'la Joie, Mais', to: 'la Joie. Mais' },
  { id: 'V.prop.30.proof', from: 'I), Concevoir', to: 'I). Concevoir' }
];

// Passages Appuhn and Elwes label differently, keyed to the English IDs.
const RENAMED_PASSAGES = {
  'III.prop.27.note': 'III.prop.27.note1',
  // Elwes labels this a corollary; Appuhn and the Latin have a scholium.
  'IV.prop.10.note': 'IV.prop.10.corollary'
};

// Elwes makes these separate passages; Appuhn has them as unlabelled paragraphs.
const SPLIT_PASSAGES = [
  { from: 'III.def.3', to: 'III.def.3.note', marker: 'Quand nous pouvons être' },
  { from: 'III.post.1', to: 'III.post.1.note', marker: 'Ce Postulat ou Axiome' }
];

// A translator's note in the English edition, with nothing to translate.
const ENGLISH_ONLY = new Set(['II.ax.5.note']);

// In Appuhn and the Latin, but missing from the English source text.
const FRENCH_ONLY = new Set(['II.prop.13.corollary', 'IV.prop.50.corollary', 'IV.prop.72.proof']);

const SOURCE = {
  translator: 'Charles Appuhn',
  edition: 'Garnier Frères, Paris, 1913',
  transcription: 'French Wikisource',
  url: 'https://fr.wikisource.org/wiki/%C3%89thique_(Appuhn,_1913)'
};

const PARTS = [
  { number: 1, numeral: 'I', page: 'Première partie : De Dieu' },
  { number: 2, numeral: 'II', page: 'Deuxième partie : De la nature et de l’origine de l’âme' },
  { number: 3, numeral: 'III', page: 'Troisième partie : De l’origine et de la nature des affections' },
  { number: 4, numeral: 'IV', page: 'Quatrième partie : De la servitude de l’homme' },
  { number: 5, numeral: 'V', page: 'Cinquième partie : De la liberté de l’homme' }
];

const readSource = async part => {
  const cachePath = path.join(CACHE_DIR, `part${part.number}.html`);

  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf8');
  }

  const url = new URL(API);
  url.search = new URLSearchParams({
    action: 'parse',
    page: `${WORK}/${part.page}`,
    prop: 'text',
    format: 'json',
    formatversion: '2'
  });

  const response = await fetch(url, { headers: { 'User-Agent': 'ethica-reader/0.1 (https://rdaum.github.io/ethica/)' } });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  const html = (await response.json()).parse.text;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, html);
  return html;
};

const readEnglish = number => {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', preserveOrder: false });
  const root = parser.parse(fs.readFileSync(path.join(PUBLIC_DIR, `ethica_${number}.xml`), 'utf8'));
  const passages = new Map();

  const visit = node => {
    if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (node && typeof node === 'object') {
      if (node.id && typeof node.text === 'string') {
        passages.set(node.id, node.text);
      }
      Object.entries(node).forEach(([key, value]) => key !== 'text' && visit(value));
    }
  };

  visit(root);
  return passages;
};

const main = async () => {
  const reportOnly = process.argv.includes('--report');

  for (const part of PARTS) {
    const html = await readSource(part);
    const assigned = assignPassages(parseBlocks(html), part.numeral);
    const { unassigned, unknownLabels } = assigned;
    const corrections = CORRECTIONS.filter(({ id }) => id.split('.')[0] === part.numeral);
    const structured = splitPassages(
      renamePassages(mergePassages(assigned.passages, MERGED_PASSAGES), RENAMED_PASSAGES),
      SPLIT_PASSAGES.filter(({ from }) => from.split('.')[0] === part.numeral)
    );
    const passages = applyCorrections(structured, corrections);
    const footnotes = collectFootnotes(html, passages);
    const english = readEnglish(part.number);
    const french = Object.keys(passages);
    const missing = [...english.keys()].filter(id => !(id in passages) && !ENGLISH_ONLY.has(id));
    const extra = french.filter(id => !english.has(id) && !FRENCH_ONLY.has(id));
    const clean = missing.length + extra.length + unassigned.length + unknownLabels.length === 0;

    console.log(`Part ${part.numeral}: ${french.length} French, ${english.size} English passages; ${clean ? 'aligned' : 'NOT aligned'}`);

    if (!clean) {
      console.log(`  missing from French (${missing.length}): ${missing.join(', ')}`);
      console.log(`  no English passage (${extra.length}): ${extra.join(', ')}`);
      console.log(`  unknown labels (${unknownLabels.length}): ${unknownLabels.join(' | ')}`);
      console.log(`  unassigned text (${unassigned.length}): ${unassigned.map(text => text.slice(0, 70)).join(' | ')}`);
    }

    if (reportOnly) {
      const ratios = french
        .filter(id => english.has(id) && english.get(id).length > 80)
        .map(id => ({ id, ratio: passages[id].length / english.get(id).length }))
        .sort((left, right) => left.ratio - right.ratio);
      const format = ({ id, ratio }) => `${id} ${ratio.toFixed(2)}`;
      console.log(`  lowest French/English ratios: ${ratios.slice(0, 5).map(format).join(', ')}`);
      console.log(`  highest: ${ratios.slice(-8).reverse().map(format).join(', ')}`);
      french
        .filter(id => /, (?!Dieu\b|Déf\b|Mal\b)\p{Lu}\p{Ll}/u.test(passages[id]))
        .forEach(id => {
          for (const match of passages[id].matchAll(/, (?!Dieu\b|Déf\b|Mal\b)\p{Lu}\p{Ll}/gu)) {
            console.log(`  capital after comma: ${id}: …${passages[id].slice(Math.max(0, match.index - 25), match.index + 25)}`);
          }
        });
      continue;
    }

    if (!clean) {
      throw new Error(`French alignment failed for Part ${part.numeral}`);
    }

    fs.writeFileSync(
      path.join(PUBLIC_DIR, `ethica_fr_${part.number}.json`),
      `${JSON.stringify({ language: 'fr', part: part.number, source: SOURCE, elements: passages, footnotes }, null, 2)}\n`
    );
  }
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
