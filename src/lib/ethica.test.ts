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
            </axiom>
          </section>
          <prop id="II.prop.2" number="2">
            <text>Second proposition.</text>
          </prop>
        </section>
      </part>`;

    const elements = Array.from(parseSpinozaXml(xml).values()).sort((a, b) => a.sortIndex - b.sortIndex);

    expect(elements.map(element => element.id)).toEqual([
      'II.preface',
      'II.prop.1',
      'II.prop.1.proof',
      'II.phys_ax.1',
      'II.prop.2'
    ]);
    expect(elements.find(element => element.id === 'II.prop.1.proof')?.text).toContain('More proof.');
    expect(elements.find(element => element.id === 'II.phys_ax.1')?.sectionKind).toBe('physical_axioms');
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
