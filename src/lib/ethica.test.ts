import { formatElementLabel, formatLocalizedLabel, formatPassageReference, getPassageText, getVisibleElementIds, matchesQuery, mergeFrenchText } from './ethica';
import { parseSpinozaXml } from './ethica';
import { SpinozaElement } from '../types';

describe('parseSpinozaXml', () => {
  it('preserves nested section content and continuations in reading order', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <part id="II" number="2" title="ON THE NATURE AND ORIGIN OF THE MIND">
        <section type="preface" id="II.preface">
          <text>Preface text.</text>
        </section>
        <section type="propositions" id="II.propositions">
          <prop id="II.prop.1" number="1">
            <text>First proposition.</text>
            <proof id="II.prop.1.proof">
              <text>First proof.</text>
              <continuation><text>More proof.</text></continuation>
            </proof>
          </prop>
          <section type="physical_axioms" id="II.physical_axioms">
            <axiom id="II.phys_ax.1" number="1">
              <text>All bodies move.</text>
              <note id="II.phys_ax.1.note" editorial="true">
                <text>Editorial note.</text>
              </note>
            </axiom>
          </section>
          <prop id="II.prop.2" number="2">
            <text>Second proposition.</text>
            <proof id="II.prop.2.proof2">
              <text>Alternate proof.</text>
            </proof>
          </prop>
        </section>
      </part>`;

    const elements = Array.from(parseSpinozaXml(xml).values()).sort((a, b) => a.sortIndex - b.sortIndex);

    expect(elements.map(element => element.id)).toEqual([
      'II.preface',
      'II.prop.1',
      'II.prop.1.proof',
      'II.phys_ax.1',
      'II.phys_ax.1.note',
      'II.prop.2',
      'II.prop.2.proof2'
    ]);
    expect(elements.find(element => element.id === 'II.prop.1.proof')?.text).toContain('More proof.');
    expect(elements.find(element => element.id === 'II.phys_ax.1')?.sectionKind).toBe('physical_axioms');
    expect(elements.find(element => element.id === 'II.prop.1')?.partNumber).toBe(2);
    expect(elements.find(element => element.id === 'II.prop.1')?.partNumeral).toBe('II');
    expect(elements.find(element => element.id === 'II.prop.1')?.canonicalLabel).toBe('Proposition I');
    expect(elements.find(element => element.id === 'II.phys_ax.1.note')?.isEditorial).toBe(true);
    expect(elements.find(element => element.id === 'II.phys_ax.1.note')?.editorialKind).toBe('english_only_addition');
    expect(elements.find(element => element.id === 'II.phys_ax.1.note')?.sourceAuthority).toBe('english_structural');
    expect(elements.find(element => element.id === 'II.prop.2.proof2')?.variantLabel).toBe('proof2');
  });

  it('marks synthesized appendix labels as normalization metadata instead of editorial additions', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <part id="IV" number="4" title="OF HUMAN BONDAGE">
        <section type="appendix" id="IV.appendix">
          <introduction id="IV.appendix.introduction">
            <text>Appendix introduction.</text>
          </introduction>
          <section type="chapter" id="IV.appendix.chapter.1" topic="I">
            <text>First appendix chapter.</text>
          </section>
        </section>
      </part>`;

    const elements = parseSpinozaXml(xml);

    expect(elements.get('IV.appendix.introduction')?.editorialKind).toBe('synthetic_heading');
    expect(elements.get('IV.appendix.introduction')?.isEditorial).toBe(false);
    expect(elements.get('IV.appendix.chapter.1')?.canonicalLabel).toBe('Caput I');
    expect(elements.get('IV.appendix.chapter.1')?.sourceAuthority).toBe('latin_governed');
  });
});

describe('nested passages', () => {
  const xml = `<part id="III" number="3" title="T">
    <section type="propositions" id="III.propositions">
      <prop id="III.prop.27" number="27">
        <text>Statement with a marker[6].</text>
        <footnote number="6"><text>The footnote.</text></footnote>
        <proof id="III.prop.27.proof"><text>Main proof.</text></proof>
        <proof id="III.prop.27.proof2"><text>Another way.</text></proof>
        <corollary id="III.prop.27.corollary2">
          <text>A corollary.</text>
          <proof id="III.prop.27.corollary2.proof"><text>Corollary demonstration about pity.</text></proof>
        </corollary>
        <note id="III.prop.27.note2"><text>A second note.</text></note>
      </prop>
      <prop id="III.prop.28" number="28"><text>Unrelated.</text></prop>
    </section>
  </part>`;
  const elements = parseSpinozaXml(xml);
  const list = [...elements.values()];

  test('keeps a corollary proof under its corollary, in reading order', () => {
    expect(elements.get('III.prop.27.corollary2.proof')?.parentId).toBe('III.prop.27.corollary2');
    expect(list.map(element => element.id)).toEqual([
      'III.prop.27',
      'III.prop.27.proof',
      'III.prop.27.proof2',
      'III.prop.27.corollary2',
      'III.prop.27.corollary2.proof',
      'III.prop.27.note2',
      'III.prop.28'
    ]);
  });

  test('labels passages by what they are', () => {
    const label = (id: string) => formatElementLabel(elements.get(id)!);
    expect(label('III.prop.27.proof')).toBe('Proof');
    expect(label('III.prop.27.proof2')).toBe('Alternate Proof');
    expect(label('III.prop.27.corollary2')).toBe('Corollary II');
    expect(label('III.prop.27.corollary2.proof')).toBe('Proof of Corollary II');
    expect(label('III.prop.27.note2')).toBe('Note II');
  });

  test('marks only true alternates as variants', () => {
    expect(elements.get('III.prop.27.proof2')?.variantLabel).toBe('proof2');
    expect(elements.get('III.prop.27.corollary2')?.variantLabel).toBeUndefined();
    expect(elements.get('III.prop.27.corollary2.proof')?.variantLabel).toBeUndefined();
  });

  test('separates footnotes from passage text', () => {
    const proposition = elements.get('III.prop.27');
    expect(proposition?.text).toBe('Statement with a marker[6].');
    expect(proposition?.footnotes).toEqual([{ number: '6', text: 'The footnote.' }]);
  });

  test('a search keeps ancestors of a match and everything under one', () => {
    expect([...getVisibleElementIds(list, 'pity')]).toEqual(
      expect.arrayContaining(['III.prop.27', 'III.prop.27.corollary2', 'III.prop.27.corollary2.proof'])
    );
    expect(getVisibleElementIds(list, 'pity').has('III.prop.27.proof')).toBe(false);
    expect(getVisibleElementIds(list, 'a corollary').has('III.prop.27.corollary2.proof')).toBe(true);
    expect(getVisibleElementIds(list, 'pity').has('III.prop.28')).toBe(false);
  });
});

describe('reading languages', () => {
  const part = (): Map<string, SpinozaElement> =>
    parseSpinozaXml(`<part id="II" number="2" title="T"><section type="propositions" id="II.propositions">
      <prop id="II.prop.1" number="1"><text>Statement.</text>
        <proof id="II.prop.1.proof"><text>Proof.</text></proof>
        <note id="II.prop.1.note"><text>Note.</text></note>
      </prop></section></part>`);

  it('adds a French-only passage under its parent, before the notes', () => {
    const merged = mergeFrenchText(part(), { 'II.prop.1': 'Énoncé.', 'II.prop.1.corollary': 'Corollaire.' });
    const ordered = [...merged.values()].sort((left, right) => left.sortIndex - right.sortIndex).map(element => element.id);

    expect(ordered).toEqual(['II.prop.1', 'II.prop.1.proof', 'II.prop.1.corollary', 'II.prop.1.note']);
    expect(merged.get('II.prop.1.corollary')).toMatchObject({ type: 'corollary', parentId: 'II.prop.1', text: '' });
  });

  it('says why a passage is missing rather than showing nothing', () => {
    const merged = mergeFrenchText(part(), { 'II.prop.1.corollary': 'Corollaire.' });
    const corollary = merged.get('II.prop.1.corollary')!;

    expect(getPassageText(corollary, 'french')).toMatchObject({ text: 'Corollaire.', available: true });
    expect(getPassageText(corollary, 'english').available).toBe(false);
    expect(getPassageText(merged.get('II.prop.1')!, 'french').available).toBe(false);
  });

  it('searches French text, ignoring accents and apostrophe style', () => {
    const element = mergeFrenchText(part(), { 'II.prop.1': 'L’âme humaine.' }).get('II.prop.1')!;

    expect(matchesQuery(element, "l'ame")).toBe(true);
    expect(matchesQuery(element, 'âme')).toBe(true);
    expect(matchesQuery(element, 'corps')).toBe(false);
  });

  it.each([
    [{ id: 'I.prop.1.proof', type: 'proof' }, 'Démonstration'],
    [{ id: 'I.prop.1.proof2', type: 'proof' }, 'Autre démonstration'],
    [{ id: 'I.prop.1.corollary2.proof', type: 'proof' }, 'Démonstration du Corollaire II'],
    [{ id: 'I.prop.8.note2', type: 'note' }, 'Scolie II'],
    [{ id: 'I.prop.1', type: 'proposition' }, 'Proposition I'],
    [{ id: 'I.def.3', type: 'definition' }, 'Définition III'],
    [{ id: 'III.preface', type: 'preface' }, 'Préface']
  ] as const)('labels %o in French', (element, label) => {
    expect(formatLocalizedLabel(element, 'french')).toBe(label);
  });

  it.each([
    [{ id: 'I.prop.1.proof', type: 'proof' }, 'Demonstratio'],
    [{ id: 'I.prop.11.proof2', type: 'proof' }, 'Aliter'],
    [{ id: 'I.prop.8.note2', type: 'note' }, 'Scholium II'],
    [{ id: 'I.prop.1', type: 'proposition' }, 'Propositio I'],
    [{ id: 'I.def.3', type: 'definition' }, 'Definitio III'],
    [{ id: 'III.preface', type: 'preface' }, 'Praefatio']
  ] as const)('labels %o in Latin', (element, label) => {
    expect(formatLocalizedLabel(element, 'latin')).toBe(label);
  });

  it('writes missing-passage messages in the reading language', () => {
    const corollary = mergeFrenchText(part(), { 'II.prop.1.corollary': 'Corollaire.' }).get('II.prop.1.corollary')!;
    expect(getPassageText(corollary, 'english', 'french').text).toMatch(/^Ce passage manque/);
    expect(getPassageText(corollary, 'english', 'latin').text).toMatch(/^This passage is missing/);
  });

  it.each([
    ['III.prop.13.note', 'III, Prop. XIII, Scolie'],
    ['I.prop.11.proof2', 'I, Prop. XI, Autre démonstration'],
    ['III.affect.18', 'III, Déf. des affections XVIII'],
    ['IV.appendix.chapter.2', 'IV, Appendice II']
  ])('names %s in French', (id, reference) => {
    expect(formatPassageReference(id, 'french')).toBe(reference);
  });
});
