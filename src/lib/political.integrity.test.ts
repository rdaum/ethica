import fs from 'fs';
import path from 'path';
import { Parser, Store } from 'n3';
import { analyzeElement, loadGraph } from './analysis';
import { formatElementLabel, formatPassageReference, parsePoliticalChapter, parseSpinozaXml } from './ethica';
import { buildInferredStore } from './inference';
import { POLITICAL_CHAPTERS } from './works';

const ETHICS = 'http://spinoza.org/ethics#';
const publicFile = (name: string) => fs.readFileSync(path.join(process.cwd(), 'public', name), 'utf8');
const local = (value: string) => value.replace(ETHICS, '');

const chapters = Object.values(POLITICAL_CHAPTERS).map(chapter => {
  const data = JSON.parse(publicFile(`political_${chapter.number}.json`));
  return { chapter, data, elements: [...parsePoliticalChapter(data.elements, chapter).values()] };
});
const passages = chapters.flatMap(({ elements }) => elements);
const politicalGraph = publicFile('political-logic.n3');
const explicit = new Store(new Parser().parse(politicalGraph));
const ethicsIds = new Set(
  [1, 2, 3, 4, 5].flatMap(part => [...parseSpinozaXml(publicFile(`ethica_${part}.xml`)).keys()])
);
const politicalIds = new Set(passages.map(passage => passage.id));

const edges = (predicate: string) =>
  explicit.getQuads(null, `${ETHICS}${predicate}`, null, null).map(candidate => ({
    from: local(candidate.subject.value),
    to: local(candidate.object.value)
  }));

describe('Political Treatise text', () => {
  test('has every chapter and section, in order, in both languages', () => {
    expect(chapters.map(({ elements }) => elements.filter(element => element.type === 'section').length)).toEqual([7, 24, 18, 6, 7, 40, 31, 49, 15, 10, 4]);

    chapters.forEach(({ chapter, elements }) => {
      elements
        .filter(element => element.type === 'section')
        .forEach((element, index) => {
          expect(element.id).toBe(`TP.${chapter.numeral}.${index + 1}`);
          expect(element.text.trim()).not.toBe('');
          expect(element.latinText?.trim()).toBeTruthy();
        });
    });
  });

  test('the file titles match the chapter list', () => {
    chapters.forEach(({ chapter, data }) => expect(data.title).toBe(chapter.title));
  });

  test('credits the translator, not only the editor', () => {
    expect(chapters[0].data.source.english.translator).toBe('A.H. Gosset');
    expect(chapters[0].data.source.english.editor).toBe('R.H.M. Elwes');
  });

  test('keeps the source’s words, and none of its page furniture', () => {
    const all = passages.flatMap(passage => [passage.text, passage.latinText ?? '']);
    expect(all.filter(text => /recensere|\(\d+\)|`|�/.test(text))).toEqual([]);
    expect(passages.find(passage => passage.id === 'TP.II.12')?.text).toContain('versâ');
  });

  test('no paragraph opens in the printed capitals', () => {
    const openers = passages.filter(passage => passage.type === 'section').flatMap(passage => passage.text.split('\n\n')).filter(text => /^[A-Z]{2,}\b/.test(text));
    expect(openers).toEqual([]);
  });

  test('has a preface carrying Spinoza’s letter in both languages', () => {
    const preface = passages.find(passage => passage.id === 'TP.preface');
    expect(preface?.text).toContain('Dear Friend');
    expect(preface?.latinText).toContain('Amice dilecte');
    expect(preface?.latinText).not.toContain('In quo demonstratur');
  });

  test('keeps every footnote with its marker', () => {
    const footnotes = passages.flatMap(passage => passage.footnotes ?? []);
    expect(footnotes.length).toBeGreaterThan(30);
    passages.forEach(passage => {
      const markers = [...passage.text.matchAll(/\[(\d+)\]/g)].map(match => match[1]);
      expect((passage.footnotes ?? []).map(note => note.number)).toEqual(markers);
    });
  });

  test('labels and reference names read properly', () => {
    const section = passages.find(passage => passage.id === 'TP.VII.6')!;
    expect(formatElementLabel(section)).toBe('Section 6');
    expect(formatPassageReference('TP.VII.6')).toBe('Pol. Treatise VII, § 6');
    expect(formatPassageReference('TP.preface', 'french')).toBe('Traité pol., Préface');
  });
});

describe('Political Treatise graph', () => {
  test('every passage has a type, and every citation stays in the treatise', () => {
    const typed = new Set(
      explicit.getQuads(null, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', null, null).map(candidate => local(candidate.subject.value))
    );
    expect(passages.filter(passage => !typed.has(passage.id))).toEqual([]);
    expect(edges('cites').filter(({ from, to }) => !politicalIds.has(from) || !politicalIds.has(to))).toEqual([]);
    expect(edges('cites').length).toBeGreaterThan(150);
  });

  test('the Latin corrects misprinted English references', () => {
    const from = (id: string) => edges('cites').filter(edge => edge.from === id).map(edge => edge.to);
    expect(from('TP.II.15')).toEqual(expect.arrayContaining(['TP.II.9', 'TP.II.13']));
    expect(from('TP.II.15')).not.toContain('TP.II.18');
    expect(from('TP.III.7')).toContain('TP.II.11');
    expect(from('TP.VIII.7')).toContain('TP.VI.9');
    expect(from('TP.VIII.7')).not.toContain('TP.VIII.9');
  });

  test('a reference the Latin has lost comes from the English', () => {
    expect(edges('cites')).toContainEqual({ from: 'TP.VIII.41', to: 'TP.VI.29' });
  });

  test('the editor’s references into the Ethics are exactly those printed, and all exist', () => {
    expect(edges('editorCites').map(({ from, to }) => `${from} ${to}`).sort()).toEqual([
      'TP.I.5 III.prop.31.note',
      'TP.I.5 III.prop.32.note',
      'TP.I.5 IV.prop.4.corollary',
      'TP.I.5 V.prop.42.note',
      'TP.II.1 II.prop.48',
      'TP.II.1 II.prop.49.note',
      'TP.II.1 IV.prop.37.note2',
      'TP.VII.6 III.prop.29'
    ]);
    expect(edges('editorCites').filter(({ to }) => !ethicsIds.has(to))).toEqual([]);
  });

  test('the treatise adds no dependencies to the Ethics', () => {
    const ethics = new Parser().parse(publicFile('ethica-logic.n3'));
    const count = (store: Store) => store.getQuads(null, `${ETHICS}dependsUpon`, null, null).length;
    const alone = count(buildInferredStore(new Store(ethics)));
    const together = count(buildInferredStore(new Store([...ethics, ...explicit.getQuads(null, null, null, null)])));
    expect(together).toBe(alone);
    expect(count(buildInferredStore(explicit))).toBe(0);
  });
});

describe('analysis across works', () => {
  beforeAll(async () => {
    await loadGraph(`${publicFile('ethica-logic.n3')}\n${politicalGraph}`);
  });

  test('an Ethics passage lists the treatise section that points to it, apart from Spinoza’s own citations', () => {
    const analysis = analyzeElement('III.prop.29');
    expect(analysis.editorCitedBy).toEqual(['TP.VII.6']);
    expect(analysis.citedBy).not.toContain('TP.VII.6');
    expect(analysis.usedBy).not.toContain('TP.VII.6');
  });

  test('a treatise section reports its own citations, editor references, and no demonstration', () => {
    const analysis = analyzeElement('TP.VII.6');
    expect(analysis.editorCites).toEqual(['III.prop.29']);
    expect(analysis.dependsOn).toEqual([]);
    expect(analysis.metrics.depth).toBe(0);
    expect(analyzeElement('TP.II.15').cites).toContain('TP.II.13');
    expect(analyzeElement('TP.II.13').citedBy).toContain('TP.II.15');
  });
});
