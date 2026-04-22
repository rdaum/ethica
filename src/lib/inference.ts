import { DataFactory, Store } from 'n3';

const ETHICS = 'http://spinoza.org/ethics#';

const { namedNode, quad } = DataFactory;

const ethicsNode = (value: string) => namedNode(`${ETHICS}${value}`);

type Edge = {
  from: string;
  to: string;
};

export const buildInferredStore = (explicitStore: Store): Store => {
  const inferredStore = new Store();

  projectPredicate(explicitStore, inferredStore, 'cites', 'dependsUpon');
  projectPredicate(explicitStore, inferredStore, 'provedBy', 'dependsUpon');
  invertPredicate(explicitStore, inferredStore, 'hasCorollary', 'derivedFrom');
  invertPredicate(explicitStore, inferredStore, 'hasNote', 'explainsElement');
  addTransitiveDependencies(inferredStore);

  return inferredStore;
};

const projectPredicate = (source: Store, target: Store, fromPredicate: string, toPredicate: string) => {
  source.getQuads(null, ethicsNode(fromPredicate), null, null).forEach(candidate => {
    target.addQuad(quad(candidate.subject, ethicsNode(toPredicate), candidate.object));
  });
};

const invertPredicate = (source: Store, target: Store, fromPredicate: string, toPredicate: string) => {
  source.getQuads(null, ethicsNode(fromPredicate), null, null).forEach(candidate => {
    if (candidate.object.termType !== 'NamedNode') {
      return;
    }

    target.addQuad(quad(candidate.object, ethicsNode(toPredicate), candidate.subject));
  });
};

const addTransitiveDependencies = (inferredStore: Store) => {
  const dependencyEdges = inferredStore
    .getQuads(null, ethicsNode('dependsUpon'), null, null)
    .map(candidate => ({
      from: candidate.subject.value,
      to: candidate.object.value
    }));

  const adjacency = buildAdjacency(dependencyEdges);

  dependencyEdges.forEach(edge => {
    const visited = new Set<string>([edge.from]);
    walkDependencies(edge.from, edge.to, edge.to, adjacency, visited, inferredStore);
  });
};

const walkDependencies = (
  origin: string,
  current: string,
  directTarget: string,
  adjacency: Map<string, string[]>,
  visited: Set<string>,
  inferredStore: Store
) => {
  if (visited.has(current)) {
    return;
  }

  visited.add(current);
  const nextNodes = adjacency.get(current) ?? [];

  nextNodes.forEach(next => {
    if (next !== directTarget) {
      inferredStore.addQuad(quad(namedNode(origin), ethicsNode('transitivelyDependsOn'), namedNode(next)));
    }

    walkDependencies(origin, next, directTarget, adjacency, new Set(visited), inferredStore);
  });
};

const buildAdjacency = (edges: Edge[]): Map<string, string[]> => {
  const adjacency = new Map<string, string[]>();

  edges.forEach(edge => {
    const entries = adjacency.get(edge.from) ?? [];
    entries.push(edge.to);
    adjacency.set(edge.from, entries);
  });

  return adjacency;
};
