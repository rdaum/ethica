import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseSpinozaXml } from './ethica';

const publicFile = (name: string) => readFileSync(path.join(process.cwd(), 'public', name), 'utf8');

const parts = [1, 2, 3, 4, 5];
const english = parts.flatMap(part => [...parseSpinozaXml(publicFile(`ethica_${part}.xml`)).values()]);
const files = parts.map(part => JSON.parse(publicFile(`ethica_fr_${part}.json`)));
const french: Record<string, string> = Object.assign({}, ...files.map(file => file.elements));
const footnotes: Record<string, Array<{ number: string; text: string }>> = Object.assign(
  {},
  ...files.map(file => file.footnotes)
);

// A translator's note in the English edition, with nothing to translate.
const ENGLISH_ONLY = ['II.ax.5.note'];

// Passages in Appuhn and the Latin that the English source text lacks.
const FRENCH_ONLY = ['II.prop.13.corollary', 'IV.prop.50.corollary', 'IV.prop.72.proof'];

const LENGTH_RATIO_EXCEPTIONS = new Set([
  // Elwes gives this proof inside the proposition, so the French holds both here.
  'I.prop.9',
  // Appuhn spells out the citations that Elwes abbreviates.
  'IV.appendix.chapter.18'
]);

describe('French alignment', () => {
  test('every English passage has French, apart from the reviewed differences', () => {
    const englishIds = english.filter(element => element.text).map(element => element.id);
    const expected = [...englishIds.filter(id => !ENGLISH_ONLY.includes(id)), ...FRENCH_ONLY].sort();
    expect(Object.keys(french).sort()).toEqual(expected);
  });

  test('passages hold no structural labels', () => {
    const offending = Object.entries(french).filter(([, text]) =>
      /\b(?:PROPOSITION|D[ÉE]MONSTRATION|COROLLAIRE|SCOLIE|AXIOME|LEMME|CHAPITRE)\b/.test(text)
    );
    expect(offending.map(([id]) => id)).toEqual([]);
  });

  test('the three footnotes stay with their passages', () => {
    const marked = Object.entries(french).filter(([, text]) => /\[\d+\]/.test(text)).map(([id]) => id);
    expect(marked.sort()).toEqual(['II.prop.3.proof', 'III.prop.29', 'III.prop.51.note']);
    expect(Object.keys(footnotes).sort()).toEqual(marked);
    expect(footnotes['III.prop.29'][0].text).toMatch(/^N\. B\. .*\(Note de l’Auteur\.\)$/);
  });

  test('no sentence is left joined by a transcription slip', () => {
    // A sentence opener with a capital after a comma is usually a misread period.
    const slip = /, (?:Mais|Car|En|La|Le|Les|Et|Or|Si|Une?|Il|Je|Nous|On|Donc|De|Ce|Cette|Ces|Par|Pour|Comme|Ainsi)\s/;
    expect(Object.entries(french).filter(([, text]) => slip.test(text)).map(([id]) => id)).toEqual([]);
  });

  test('English and French passages stay within a plausible length ratio', () => {
    const outliers = english
      .filter(element => element.text.length > 80 && element.id in french && !LENGTH_RATIO_EXCEPTIONS.has(element.id))
      .filter(element => {
        const ratio = french[element.id].length / element.text.length;
        return ratio < 0.6 || ratio > 1.6;
      })
      .map(element => element.id);
    expect(outliers).toEqual([]);
  });
});
