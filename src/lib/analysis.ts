import { DataFactory, Store } from 'n3';
import { buildInferredStore } from './inference';
import { parseN3ToStore } from './ethica';
import { PassageAnalysis } from '../types';

const ETHICS = 'http://spinoza.org/ethics#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const NON_DEMONSTRATIVE_CLASSES = new Set(['Note', 'Explanation', 'Preface', 'Appendix']);

type Adjacency = Map<string, string[]>;

let explicitStore = new Store();
let dependsOn: Adjacency = new Map();
let dependedOnBy: Adjacency = new Map();
let depthCache = new Map<string, number>();
let analysisCache = new Map<string, PassageAnalysis>();

const localName = (value: string): string => value.replace(ETHICS, '');

const buildAdjacency = (store: Store, predicate: string, invert = false): Adjacency => {
  const adjacency: Adjacency = new Map();

  store.getQuads(null, `${ETHICS}${predicate}`, null, null).forEach(quad => {
    const from = localName(invert ? quad.object.value : quad.subject.value);
    const to = localName(invert ? quad.subject.value : quad.object.value);
    adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  });

  return adjacency;
};

export const loadGraph = async (n3Content: string): Promise<void> => {
  explicitStore = await parseN3ToStore(n3Content);
  const inferredStore = buildInferredStore(explicitStore);
  dependsOn = buildAdjacency(inferredStore, 'dependsUpon');
  dependedOnBy = buildAdjacency(inferredStore, 'dependsUpon', true);
  depthCache = new Map();
  analysisCache = new Map();
};

const objectsOf = (id: string, predicate: string): string[] =>
  explicitStore.getQuads(DataFactory.namedNode(`${ETHICS}${id}`), `${ETHICS}${predicate}`, null, null).map(quad => localName(quad.object.value));

const subjectsOf = (id: string, predicate: string): string[] =>
  explicitStore.getQuads(null, `${ETHICS}${predicate}`, DataFactory.namedNode(`${ETHICS}${id}`), null).map(quad => localName(quad.subject.value));

const isDemonstrative = (id: string): boolean =>
  !explicitStore
    .getQuads(DataFactory.namedNode(`${ETHICS}${id}`), RDF_TYPE, null, null)
    .some(quad => NON_DEMONSTRATIVE_CLASSES.has(localName(quad.object.value)));

const unique = (values: string[]): string[] => [...new Set(values)];

/** Breadth-first, so each path is a shortest one and nearer passages come first. */
const shortestPaths = (start: string, adjacency: Adjacency): string[][] => {
  const paths = new Map<string, string[]>([[start, [start]]]);
  const queue = [start];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];

    for (const next of adjacency.get(current) ?? []) {
      if (!paths.has(next)) {
        paths.set(next, [...(paths.get(current) ?? []), next]);
        queue.push(next);
      }
    }
  }

  paths.delete(start);
  return [...paths.values()];
};

const longestChain = (id: string, visiting: Set<string> = new Set()): number => {
  const cached = depthCache.get(id);

  if (cached !== undefined) {
    return cached;
  }

  if (visiting.has(id)) {
    return 0;
  }

  visiting.add(id);
  const depth = Math.max(0, ...(dependsOn.get(id) ?? []).map(next => 1 + longestChain(next, visiting)));
  visiting.delete(id);
  depthCache.set(id, depth);
  return depth;
};

export const analyzeElement = (id: string): PassageAnalysis => {
  const cached = analysisCache.get(id);

  if (cached) {
    return cached;
  }

  const proofs = objectsOf(id, 'provedBy');
  const corollaries = objectsOf(id, 'hasCorollary');
  const notes = objectsOf(id, 'hasNote');
  const [parent = null] = objectsOf(id, 'partOf');
  const structural = new Set([id, ...proofs, ...corollaries, ...notes, ...(parent ? [parent] : [])]);
  const notStructural = (other: string) => !structural.has(other);

  // A proposition rests on what its proofs cite, so report that directly rather than
  // only saying that the proposition depends on its own proof.
  const direct = unique([...(dependsOn.get(id) ?? []), ...proofs.flatMap(proof => dependsOn.get(proof) ?? [])]).filter(notStructural);
  const dependents = (dependedOnBy.get(id) ?? []).filter(notStructural);
  const cites = isDemonstrative(id) ? [] : objectsOf(id, 'cites').filter(notStructural);
  const citedBy = subjectsOf(id, 'cites').filter(source => !isDemonstrative(source) && notStructural(source));

  const dependencyPaths = shortestPaths(id, dependsOn).filter(path => notStructural(path[path.length - 1]));
  const dependentPaths = shortestPaths(id, dependedOnBy).filter(path => notStructural(path[path.length - 1]));
  const directSet = new Set(direct);
  const dependentSet = new Set(dependents);

  const analysis: PassageAnalysis = {
    dependsOn: direct,
    usedBy: dependents,
    cites,
    citedBy,
    structure: { parent, proofs, corollaries, notes },
    dependencyPaths: dependencyPaths.filter(path => !directSet.has(path[path.length - 1])),
    dependentPaths: dependentPaths.filter(path => !dependentSet.has(path[path.length - 1])),
    metrics: {
      cites: direct.length + cites.length,
      citedBy: dependents.length + citedBy.length,
      totalDependencies: dependencyPaths.length,
      totalDependents: dependentPaths.length,
      depth: longestChain(id)
    }
  };

  analysisCache.set(id, analysis);
  return analysis;
};
