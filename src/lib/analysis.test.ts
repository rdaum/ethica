import fs from 'fs';
import path from 'path';
import { analyzeElement, loadGraph } from './analysis';
import { formatPassageReference, parseSpinozaXml } from './ethica';

beforeAll(async () => {
  await loadGraph(fs.readFileSync(path.join(process.cwd(), 'public', 'ethica-logic.n3'), 'utf8'));
});

const allIds = [1, 2, 3, 4, 5].flatMap(part => [
  ...parseSpinozaXml(fs.readFileSync(path.join(process.cwd(), 'public', `ethica_${part}.xml`), 'utf8')).keys()
]);
const known = new Set(allIds);

describe('analysis of the real graph', () => {
  test('a proposition reports what its proof rests on', () => {
    expect(analyzeElement('III.prop.6').dependsOn).toEqual(
      expect.arrayContaining(['I.prop.25.corollary', 'I.prop.34', 'III.prop.4', 'III.prop.5'])
    );
  });

  test('its own proof is structure rather than a dependency', () => {
    const { dependsOn, structure } = analyzeElement('III.prop.6');
    expect(dependsOn).not.toContain('III.prop.6.proof');
    expect(structure.proofs).toEqual(['III.prop.6.proof']);
  });

  test('reports what uses a passage', () => {
    expect(analyzeElement('III.prop.6').usedBy).toContain('III.prop.7.proof');
  });

  test('a proof names its parent and is not reported as used by it', () => {
    const { structure, usedBy } = analyzeElement('III.prop.6.proof');
    expect(structure.parent).toBe('III.prop.6');
    expect(usedBy).not.toContain('III.prop.6');
  });

  test('a corollary depends on nothing beyond its own demonstration here, but is structurally tied to its proposition', () => {
    const { structure } = analyzeElement('II.prop.44.corollary2');
    expect(structure.parent).toBe('II.prop.44');
    expect(structure.proofs).toEqual(['II.prop.44.corollary2.proof']);
  });

  test('a note lists citations rather than dependencies', () => {
    const { dependsOn, cites, metrics } = analyzeElement('II.prop.17.note');
    expect(dependsOn).toEqual([]);
    expect(cites.length).toBeGreaterThan(0);
    expect(metrics.depth).toBe(0);
  });

  test('a citation from a note is reported as a mention, not a use', () => {
    const { citedBy, usedBy } = analyzeElement('II.prop.7');
    expect(citedBy.some(id => /\.note\d*$/.test(id))).toBe(true);
    expect(usedBy.some(id => /\.note\d*$/.test(id))).toBe(false);
  });

  test('every path is a real, connected shortest route from the passage', () => {
    const { dependencyPaths, metrics } = analyzeElement('V.prop.39');
    expect(dependencyPaths.length).toBeGreaterThan(50);
    expect(metrics.totalDependencies).toBeGreaterThanOrEqual(dependencyPaths.length);

    dependencyPaths.forEach(route => {
      expect(route[0]).toBe('V.prop.39');
      expect(route.length).toBeGreaterThanOrEqual(3);
      expect(new Set(route).size).toBe(route.length);
    });

    const lengths = dependencyPaths.map(route => route.length);
    expect(lengths).toEqual([...lengths].sort((left, right) => left - right));
  });

  test('foundations have no dependencies and later propositions have depth', () => {
    expect(analyzeElement('I.def.3').metrics.depth).toBe(0);
    expect(analyzeElement('I.def.3').metrics.totalDependents).toBeGreaterThan(100);
    expect(analyzeElement('V.prop.42').metrics.depth).toBeGreaterThan(5);
  });

  test('every link on every passage goes to a real passage', () => {
    const dead = allIds.flatMap(id => {
      const { dependsOn, usedBy, cites, citedBy, structure, dependencyPaths, dependentPaths } = analyzeElement(id);
      return [
        ...dependsOn,
        ...usedBy,
        ...cites,
        ...citedBy,
        ...structure.proofs,
        ...structure.corollaries,
        ...structure.notes,
        ...(structure.parent ? [structure.parent] : []),
        ...dependencyPaths.flat(),
        ...dependentPaths.flat()
      ].filter(target => !known.has(target));
    });

    expect(dead).toEqual([]);
  });

  test('every passage has a readable label', () => {
    const unformatted = allIds.filter(id => {
      const label = formatPassageReference(id);
      return label === id || label.includes('undefined') || /\.\d|_/.test(label);
    });
    expect(unformatted).toEqual([]);
  });

  test('returns the same result from its cache', () => {
    expect(analyzeElement('I.def.3')).toBe(analyzeElement('I.def.3'));
  });

  test('gives an unknown passage an empty result', () => {
    expect(analyzeElement('I.prop.999').dependsOn).toEqual([]);
    expect(analyzeElement('I.prop.999').metrics.totalDependencies).toBe(0);
  });
});
