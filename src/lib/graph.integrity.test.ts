import fs from 'fs';
import path from 'path';
import { Parser, Store } from 'n3';
import { extractCitations } from '../../scripts/lib/citations.mjs';
import { buildInferredStore } from './inference';
import { parseSpinozaXml } from './ethica';

const ETHICS = 'http://spinoza.org/ethics#';
const publicFile = (name: string) => fs.readFileSync(path.join(process.cwd(), 'public', name), 'utf8');
const local = (value: string) => value.replace(ETHICS, '');

const explicit = new Store(new Parser().parse(publicFile('ethica-logic.n3')));
const inferred = buildInferredStore(explicit);
const elements = [1, 2, 3, 4, 5].flatMap(part => [...parseSpinozaXml(publicFile(`ethica_${part}.xml`)).values()]);
// Missing from the English source, but in the graph from the Latin and French.
const MISSING_FROM_ENGLISH = ['II.prop.13.corollary', 'IV.prop.50.corollary', 'IV.prop.72.proof'];
const validIds = new Set([...elements.map(element => element.id), ...MISSING_FROM_ENGLISH]);

const edges = (store: Store, predicate: string) =>
  store.getQuads(null, `${ETHICS}${predicate}`, null, null).map(candidate => ({
    from: local(candidate.subject.value),
    to: local(candidate.object.value)
  }));

const findCycles = (pairs: { from: string; to: string }[]): string[][] => {
  const adjacency = new Map<string, string[]>();
  pairs.forEach(({ from, to }) => adjacency.set(from, [...(adjacency.get(from) ?? []), to]));

  const state = new Map<string, 'visiting' | 'done'>();
  const cycles: string[][] = [];

  const visit = (node: string, trail: string[]) => {
    state.set(node, 'visiting');

    for (const next of adjacency.get(node) ?? []) {
      if (state.get(next) === 'visiting') {
        cycles.push([...trail.slice(trail.indexOf(next)), next]);
      } else if (!state.has(next)) {
        visit(next, [...trail, next]);
      }
    }

    state.set(node, 'done');
  };

  adjacency.forEach((_, node) => {
    if (!state.has(node)) {
      visit(node, [node]);
    }
  });

  return cycles;
};

const PART_ORDER: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };

const propositionPosition = (id: string): [number, number] | null => {
  const match = id.match(/^(I|II|III|IV|V)\.prop\.(\d+)/);
  return match ? [PART_ORDER[match[1]], Number(match[2])] : null;
};

describe('citation graph', () => {
  test('every graph node is a passage in the corpus', () => {
    const dangling = edges(explicit, 'cites').flatMap(({ from, to }) => [from, to]).filter(id => !validIds.has(id));
    expect([...new Set(dangling)]).toEqual([]);
  });

  test('every passage has a type, including prefaces and appendix chapters', () => {
    const typed = new Set(
      explicit.getQuads(null, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', null, null).map(candidate => local(candidate.subject.value))
    );
    expect(elements.filter(element => !typed.has(element.id)).map(element => element.id)).toEqual([]);
  });

  test('parents do not inherit the citations of their children', () => {
    const citedBy = (id: string) => edges(explicit, 'cites').filter(edge => edge.from === id);
    expect(citedBy('II.prop.7')).toEqual([]);
    expect(citedBy('II.prop.7.proof').map(edge => edge.to)).toContain('I.ax.4');
  });

  test('dependencies contain no cycles', () => {
    expect(findCycles(edges(inferred, 'dependsUpon'))).toEqual([]);
  });

  test('demonstrations only depend on earlier propositions', () => {
    const forward = edges(inferred, 'dependsUpon')
      .filter(({ from, to }) => {
        const source = propositionPosition(from);
        const target = propositionPosition(to);

        return source && target && (target[0] > source[0] || (target[0] === source[0] && target[1] > source[1]));
      })
      .map(({ from, to }) => `${from} -> ${to}`);

    expect(forward).toEqual([]);
  });

  test('a misprinted reference follows the Latin', () => {
    const targets = edges(explicit, 'cites').filter(edge => edge.from === 'IV.prop.1.proof').map(edge => edge.to);
    expect(targets).toContain('III.prop.4');
    expect(targets).not.toContain('IV.prop.3');
  });

  test('the emotion definitions and post-lemma axioms are cited', () => {
    const targets = new Set(edges(explicit, 'cites').map(edge => edge.to));
    expect([...targets].filter(id => id.startsWith('III.affect.')).length).toBeGreaterThan(20);
    expect(targets.has('II.phys_ax2.1')).toBe(true);
    expect(targets.has('II.phys_def.1')).toBe(true);
    expect(targets.has('III.general_definition.note')).toBe(true);
  });

  test('prefaces and appendices contribute citations', () => {
    expect(edges(explicit, 'cites').some(edge => edge.from.includes('.appendix.'))).toBe(true);
  });

  test('the number of imperfect citations cannot grow', () => {
    const problems = elements.flatMap(element => extractCitations(element.text, element.id, validIds).problems);

    // Each remaining case cites a suffix the source text lacks. Both resolve to the proposition.
    expect(problems.filter((problem: { status: string }) => problem.status === 'unresolved')).toEqual([]);
    expect(problems.length).toBeLessThanOrEqual(2);
  });

  test('passages missing from the English take part in the graph', () => {
    const cites = edges(explicit, 'cites');
    const proofTargets = cites.filter(edge => edge.from === 'IV.prop.72.proof').map(edge => edge.to);
    expect(proofTargets.sort()).toEqual(['IV.prop.24', 'IV.prop.31.corollary']);
    expect(edges(explicit, 'provedBy')).toContainEqual({ from: 'IV.prop.72', to: 'IV.prop.72.proof' });
    expect(edges(explicit, 'hasCorollary')).toContainEqual({ from: 'II.prop.13', to: 'II.prop.13.corollary' });
    expect(edges(explicit, 'hasCorollary')).toContainEqual({ from: 'IV.prop.50', to: 'IV.prop.50.corollary' });
    expect(cites).toContainEqual({ from: 'II.prop.17.note', to: 'II.prop.13.corollary' });
  });
});
