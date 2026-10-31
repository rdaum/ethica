import fs from 'fs';
import path from 'path';
import { mergeLatinText, parseSpinozaXml } from './ethica';
import { SpinozaElement } from '../types';

const publicFile = (name: string) => fs.readFileSync(path.join(process.cwd(), 'public', name), 'utf8');

const parts = [1, 2, 3, 4, 5].map(number => {
  const latin = JSON.parse(publicFile(`ethica_la_${number}.json`)).elements as Record<string, string>;
  return {
    number,
    xml: publicFile(`ethica_${number}.xml`),
    latin,
    elements: [...mergeLatinText(parseSpinozaXml(publicFile(`ethica_${number}.xml`)), latin).values()]
  };
});
const allElements = parts.flatMap(part => part.elements);

const count = (partNumber: number, predicate: (element: SpinozaElement) => boolean) =>
  parts[partNumber - 1].elements.filter(predicate).length;

const ofType =
  (type: SpinozaElement['type'], sectionKind?: string) =>
  (element: SpinozaElement) =>
    element.type === type && (!sectionKind || element.sectionKind === sectionKind);

// Translator's note with no Latin passage; see EDITORIAL_ELEMENT_IDS in generate-corpus.mjs.
const LATIN_EXEMPT = new Set(['II.ax.5.note']);

// I.prop.9 gives its proof inside the statement. IV.prop.72's proof is missing from the
// English source; what the source labels "Proof" there is the Latin scholium.
const PROPOSITIONS_WITHOUT_A_PROOF = new Set(['I.prop.9', 'IV.prop.72']);

describe('corpus structure', () => {
  test.each([
    [1, 36],
    [2, 49],
    [3, 59],
    [4, 73],
    [5, 42]
  ])('Part %i has %i propositions', (part, expected) => {
    expect(count(part, ofType('proposition'))).toBe(expected);
  });

  test('definitions, axioms, lemmas and postulates match the book', () => {
    expect(count(1, ofType('definition'))).toBe(8);
    expect(count(1, ofType('axiom'))).toBe(7);
    expect(count(2, ofType('definition', 'definitions'))).toBe(7);
    expect(count(2, ofType('axiom', 'axioms'))).toBe(5);
    expect(count(2, ofType('axiom', 'physical_axioms'))).toBe(5);
    expect(count(2, ofType('definition', 'physical_axioms'))).toBe(1);
    expect(count(2, ofType('lemma'))).toBe(7);
    expect(count(2, ofType('postulate'))).toBe(6);
    expect(count(3, ofType('definition', 'definitions'))).toBe(3);
    expect(count(3, ofType('postulate'))).toBe(2);
    expect(count(3, ofType('definition', 'definitions_of_emotions'))).toBe(48);
    expect(count(4, ofType('definition'))).toBe(8);
    expect(count(4, ofType('axiom'))).toBe(1);
    expect(count(4, element => /\.appendix\.chapter\.\d+$/.test(element.id))).toBe(32);
    expect(count(5, ofType('axiom'))).toBe(2);
  });

  test('ids are unique across the corpus', () => {
    const ids = parts.flatMap(part => [...part.xml.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  test('every proposition has a proof, apart from reviewed exceptions', () => {
    const withoutProof = allElements
      .filter(element => element.type === 'proposition')
      .filter(element => !allElements.some(child => child.parentId === element.id && child.type === 'proof'))
      .map(element => element.id);

    expect(new Set(withoutProof)).toEqual(PROPOSITIONS_WITHOUT_A_PROOF);
  });

  test('passage text holds no unsplit structural labels', () => {
    const label = /(?:^|\n)\s*(?:Proof|Another proof|Note|Coroll(?:ary|\.)?|Explanation|Axiom|Definition)(?:\s+[IVXLCDM]+)?\.?—/;
    const inlineLabel = /[.!?]\s+(?:Proof|Another proof|Note|Corollary)(?:\s+[IVXLCDM]+)?\.?—\s*[A-Z]/;

    expect(allElements.filter(element => label.test(element.text) || inlineLabel.test(element.text)).map(element => element.id)).toEqual([]);
  });

  test('corollary proofs belong to their corollary, and numbered proofs are true alternates', () => {
    const proof = allElements.find(element => element.id === 'II.prop.44.corollary2.proof');
    expect(proof?.parentId).toBe('II.prop.44.corollary2');

    const alternates = allElements.filter(element => element.type === 'proof' && /\.proof\d+$/.test(element.id)).map(element => element.id);
    expect(alternates).toEqual(['I.prop.11.proof2', 'I.prop.11.proof3', 'IV.prop.37.proof2', 'IV.prop.51.proof2', 'IV.prop.59.proof2']);
  });

  test('footnote bodies are separated from the text and every marker resolves', () => {
    const footnotes = allElements.flatMap(element => element.footnotes ?? []);
    expect(footnotes.map(footnote => Number(footnote.number)).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 17 }, (_, index) => index + 1)
    );

    allElements.forEach(element => {
      expect(element.text).not.toMatch(/(?:^|\n)\[\d+\]\s/);
      const markers = [...element.text.matchAll(/\[(\d+)\]/g)].map(match => match[1]);
      const bodies = (element.footnotes ?? []).map(footnote => footnote.number);
      expect([element.id, markers.sort()]).toEqual([element.id, [...bodies].sort()]);
    });
  });

  test('prefaces do not repeat the part title', () => {
    const preface = allElements.find(element => element.id === 'III.preface');
    expect(preface?.text.startsWith('Most writers')).toBe(true);
  });
});

describe('Latin alignment', () => {
  test('every non-exempt passage has Latin', () => {
    const missing = allElements.filter(element => !element.latinText).map(element => element.id);
    expect(new Set(missing)).toEqual(LATIN_EXEMPT);
  });

  test('no Latin belongs to an unknown passage', () => {
    const ids = new Set(allElements.map(element => element.id));
    expect(parts.flatMap(part => Object.keys(part.latin)).filter(id => !ids.has(id))).toEqual([]);
  });

  test('Latin passages hold no structural labels or stray numerals', () => {
    const leaks = allElements
      .filter(element => {
        const latin = element.latinText ?? '';
        return /\b(?:ALITER|DEMONSTRATIO|SCHOLIUM|COROLLARIUM|PROPOSITIO|AXIOMA|LEMMA)\b/.test(latin) || /^[IVXLCDM]+\s*:/.test(latin);
      })
      .map(element => element.id);

    expect(leaks).toEqual([]);
  });

  test('English and Latin passages stay within a plausible length ratio', () => {
    const outliers = allElements
      .filter(element => element.latinText && element.text.length >= 60)
      .map(element => ({ id: element.id, ratio: element.latinText!.length / element.text.length }))
      .filter(({ ratio }) => ratio < 0.4 || ratio > 1.6)
      .map(({ id, ratio }) => `${id} ${ratio.toFixed(2)}`);

    expect(outliers).toEqual([]);
  });
});
