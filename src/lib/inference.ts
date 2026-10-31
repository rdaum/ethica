import { DataFactory, Quad_Subject, Store } from 'n3';

const ETHICS = 'http://spinoza.org/ethics#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

const { namedNode, quad } = DataFactory;

const ethicsNode = (value: string) => namedNode(`${ETHICS}${value}`);

type Edge = {
  from: string;
  to: string;
};

// Notes and prefaces may look ahead or argue in passing, so their citations are
// references rather than steps in the demonstration.
const NON_DEMONSTRATIVE_CLASSES = new Set(['Note', 'Explanation', 'Preface', 'Appendix']);

export const buildInferredStore = (explicitStore: Store): Store => {
  const inferredStore = new Store();

  projectDemonstrativeCitations(explicitStore, inferredStore);
  projectPredicate(explicitStore, inferredStore, 'provedBy', 'dependsUpon');
  invertPredicate(explicitStore, inferredStore, 'hasCorollary', 'derivedFrom');
  invertPredicate(explicitStore, inferredStore, 'hasCorollary', 'dependsUpon');
  invertPredicate(explicitStore, inferredStore, 'hasNote', 'explainsElement');
  addTransitiveDependencies(inferredStore);

  return inferredStore;
};

const projectDemonstrativeCitations = (source: Store, target: Store) => {
  const isDemonstrative = (subject: Quad_Subject) =>
    !source
      .getQuads(subject, namedNode(RDF_TYPE), null, null)
      .some(typeQuad => NON_DEMONSTRATIVE_CLASSES.has(typeQuad.object.value.replace(ETHICS, '')));

  source.getQuads(null, ethicsNode('cites'), null, null).forEach(candidate => {
    if (isDemonstrative(candidate.subject)) {
      target.addQuad(quad(candidate.subject, ethicsNode('dependsUpon'), candidate.object));
    }
  });
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
  adjacency.forEach((directTargets, origin) => {
    const directTargetSet = new Set(directTargets);
    const visited = new Set<string>([origin]);
    const queue = [...directTargets];

    while (queue.length > 0) {
      const current = queue.shift();

      if (!current || visited.has(current)) {
        continue;
      }

      visited.add(current);

      if (!directTargetSet.has(current)) {
        inferredStore.addQuad(quad(namedNode(origin), ethicsNode('transitivelyDependsOn'), namedNode(current)));
      }

      const nextNodes = adjacency.get(current) ?? [];
      nextNodes.forEach(next => {
        if (!visited.has(next)) {
          queue.push(next);
        }
      });
    }
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
