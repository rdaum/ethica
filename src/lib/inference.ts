import { DataFactory, Quad_Subject, Store } from 'n3';

const ETHICS = 'http://spinoza.org/ethics#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

const { namedNode, quad } = DataFactory;

const ethicsNode = (value: string) => namedNode(`${ETHICS}${value}`);

// Notes and prefaces may look ahead or argue in passing, so their citations are
// references rather than steps in the demonstration.
const NON_DEMONSTRATIVE_CLASSES = new Set(['Note', 'Explanation', 'Preface', 'Appendix']);

export const buildInferredStore = (explicitStore: Store): Store => {
  const inferredStore = new Store();

  projectDemonstrativeCitations(explicitStore, inferredStore);
  projectPredicate(explicitStore, inferredStore, 'provedBy', 'dependsUpon');
  invertPredicate(explicitStore, inferredStore, 'hasCorollary', 'dependsUpon');

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
