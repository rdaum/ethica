import fs from 'fs';
import path from 'path';
import { analyzeElement, loadGraph } from './analysis';

beforeAll(async () => {
  await loadGraph(fs.readFileSync(path.join(process.cwd(), 'public', 'ethica-logic.n3'), 'utf8'));
});

const objectsOf = (id: string, predicate: string) =>
  analyzeElement(id)
    .reasoning.filter(relation => relation.predicate === predicate && relation.subject === id)
    .map(relation => relation.object);

const subjectsOf = (id: string, predicate: string) =>
  analyzeElement(id)
    .reasoning.filter(relation => relation.predicate === predicate && relation.object === id)
    .map(relation => relation.subject);

describe('analysis of the real graph', () => {
  test('finds the citations of a proof across parts', () => {
    expect(objectsOf('III.prop.6.proof', 'cites')).toEqual(
      expect.arrayContaining(['I.prop.25.corollary', 'I.prop.34', 'III.prop.4', 'III.prop.5'])
    );
  });

  test('finds what cites a passage', () => {
    expect(subjectsOf('III.prop.6', 'citedBy')).toContain('III.prop.7.proof');
  });

  test('follows dependencies through a proof', () => {
    expect(objectsOf('III.prop.6', 'dependsUpon')).toContain('III.prop.6.proof');
    expect(objectsOf('III.prop.6', 'transitivelyDependsOn')).toEqual(expect.arrayContaining(['I.prop.34', 'I.ax.4']));
  });

  test('keeps a note out of its proposition dependencies', () => {
    expect(objectsOf('I.prop.8.note1', 'dependsUpon')).toEqual([]);
  });

  test('returns the same result from its cache', () => {
    expect(analyzeElement('I.def.3')).toBe(analyzeElement('I.def.3'));
  });

  test('gives an unknown passage an empty result', () => {
    expect(analyzeElement('I.prop.999').reasoning).toEqual([]);
  });
});
