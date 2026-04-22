import { parseSpinozaXml, stripRulesFromN3 } from './ethica';

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

describe('stripRulesFromN3', () => {
  it('removes active rule lines while keeping explicit triples', () => {
    const content = `
      @prefix ethics: <http://spinoza.org/ethics#> .
      ethics:II.prop.1 ethics:cites ethics:I.def.5 .
      { ?x ethics:cites ?y }
          => { ?x ethics:dependsUpon ?y } .
    `;

    expect(stripRulesFromN3(content)).toContain('ethics:II.prop.1 ethics:cites ethics:I.def.5 .');
    expect(stripRulesFromN3(content)).not.toContain('dependsUpon');
  });
});
