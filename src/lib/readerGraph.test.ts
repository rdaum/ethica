import {
  buildSupplementalStore,
  CANONICAL_RELATION_PREDICATES,
  extractReferences,
  SUPPLEMENTAL_RELATION_PREDICATES
} from './readerGraph';
import { SpinozaElement } from '../types';

const triplesFromStore = (elements: Map<string, SpinozaElement>) =>
  buildSupplementalStore(elements)
    .getQuads(null, null, null, null)
    .map(quad => [quad.subject.value, quad.predicate.value, quad.object.value]);

describe('reader graph boundaries', () => {
  it('documents the canonical and supplemental relation families the reader expects', () => {
    expect(CANONICAL_RELATION_PREDICATES).toEqual([
      'cites',
      'partOf',
      'provedBy',
      'hasCorollary',
      'hasNote'
    ]);
    expect(SUPPLEMENTAL_RELATION_PREDICATES).toEqual(CANONICAL_RELATION_PREDICATES);
  });
});

describe('extractReferences', () => {
  it('finds local and cross-part proposition references in prose', () => {
    const references = extractReferences({
      id: 'II.prop.12.proof',
      type: 'proof',
      text: 'Whatsoever takes place in the object of any idea, the knowledge thereof is necessarily in God (II. ix. Coroll.), in so far as he is considered as affected by the idea of the said object, that is (II. xi.), in so far as he constitutes the mind of anything. Therefore, whatsoever takes place in the object constituting the idea of the human mind, the knowledge thereof is necessarily in God, in so far as he constitutes the essence of the human mind; that is (by II. xi. Coroll.) the knowledge of the said thing will necessarily be in the mind. Compare Pt. i., Prop. xxxvi.',
      sortIndex: 1,
      sectionKind: 'propositions',
      parentId: 'II.prop.12'
    });

    expect(references).toEqual(expect.arrayContaining(['II.prop.9', 'II.prop.11', 'I.prop.36']));
  });

  it('extracts definition, axiom, lemma, and postulate references from local prose', () => {
    const references = extractReferences({
      id: 'II.lemma.3.proof',
      type: 'proof',
      text: 'This follows from Def. ii and iii, Ax. i, Lemma iv, and Post. i.',
      sortIndex: 1,
      sectionKind: 'lemmas',
      parentId: 'II.lemma.3'
    });

    expect(references).toEqual(
      expect.arrayContaining(['II.def.2', 'II.def.3', 'II.ax.1', 'II.lemma.4', 'II.post.1'])
    );
  });
});

describe('buildSupplementalStore', () => {
  it('adds structural and citation triples for parsed elements', () => {
    const elements = new Map<string, SpinozaElement>([
      [
        'II.prop.1',
        {
          id: 'II.prop.1',
          type: 'proposition',
          text: 'First proposition.',
          sortIndex: 1,
          sectionKind: 'propositions',
          number: '1'
        }
      ],
      [
        'II.prop.1.proof',
        {
          id: 'II.prop.1.proof',
          type: 'proof',
          text: 'Proof.—This is clear from Prop. i. and Pt. i., Prop. xxxvi.',
          sortIndex: 2,
          sectionKind: 'propositions',
          parentId: 'II.prop.1'
        }
      ],
      [
        'I.prop.36',
        {
          id: 'I.prop.36',
          type: 'proposition',
          text: 'External reference target.',
          sortIndex: 3,
          sectionKind: 'propositions',
          number: '36'
        }
      ]
    ]);

    expect(triplesFromStore(elements)).toEqual(
      expect.arrayContaining([
        [
          'http://spinoza.org/ethics#II.prop.1.proof',
          'http://spinoza.org/ethics#partOf',
          'http://spinoza.org/ethics#II.prop.1'
        ],
        [
          'http://spinoza.org/ethics#II.prop.1',
          'http://spinoza.org/ethics#provedBy',
          'http://spinoza.org/ethics#II.prop.1.proof'
        ],
        [
          'http://spinoza.org/ethics#II.prop.1.proof',
          'http://spinoza.org/ethics#cites',
          'http://spinoza.org/ethics#I.prop.36'
        ]
      ])
    );
  });

  it('backfills multiple proofs, corollaries, and notes for a proposition family', () => {
    const elements = new Map<string, SpinozaElement>([
      [
        'I.prop.11',
        {
          id: 'I.prop.11',
          type: 'proposition',
          text: 'God exists, necessarily.',
          sortIndex: 1,
          sectionKind: 'propositions',
          number: '11'
        }
      ],
      [
        'I.prop.11.proof',
        {
          id: 'I.prop.11.proof',
          type: 'proof',
          text: 'First proof.',
          sortIndex: 2,
          sectionKind: 'propositions',
          parentId: 'I.prop.11'
        }
      ],
      [
        'I.prop.11.proof2',
        {
          id: 'I.prop.11.proof2',
          type: 'proof',
          text: 'Second proof.',
          sortIndex: 3,
          sectionKind: 'propositions',
          parentId: 'I.prop.11'
        }
      ],
      [
        'I.prop.11.note',
        {
          id: 'I.prop.11.note',
          type: 'note',
          text: 'A clarifying note.',
          sortIndex: 4,
          sectionKind: 'propositions',
          parentId: 'I.prop.11'
        }
      ],
      [
        'I.prop.11.corollary1',
        {
          id: 'I.prop.11.corollary1',
          type: 'corollary',
          text: 'A direct consequence.',
          sortIndex: 5,
          sectionKind: 'propositions',
          parentId: 'I.prop.11'
        }
      ]
    ]);

    expect(triplesFromStore(elements)).toEqual(
      expect.arrayContaining([
        [
          'http://spinoza.org/ethics#I.prop.11',
          'http://spinoza.org/ethics#provedBy',
          'http://spinoza.org/ethics#I.prop.11.proof'
        ],
        [
          'http://spinoza.org/ethics#I.prop.11',
          'http://spinoza.org/ethics#provedBy',
          'http://spinoza.org/ethics#I.prop.11.proof2'
        ],
        [
          'http://spinoza.org/ethics#I.prop.11',
          'http://spinoza.org/ethics#hasNote',
          'http://spinoza.org/ethics#I.prop.11.note'
        ],
        [
          'http://spinoza.org/ethics#I.prop.11',
          'http://spinoza.org/ethics#hasCorollary',
          'http://spinoza.org/ethics#I.prop.11.corollary1'
        ]
      ])
    );
  });

  it('only backfills citation targets that already exist in the parsed reader corpus', () => {
    const elements = new Map<string, SpinozaElement>([
      [
        'IV.prop.18',
        {
          id: 'IV.prop.18',
          type: 'proposition',
          text: 'This follows from Prop. xvii. and Pt. v., Prop. xlii.',
          sortIndex: 1,
          sectionKind: 'propositions',
          number: '18'
        }
      ],
      [
        'IV.prop.17',
        {
          id: 'IV.prop.17',
          type: 'proposition',
          text: 'A prior proposition.',
          sortIndex: 2,
          sectionKind: 'propositions',
          number: '17'
        }
      ]
    ]);

    expect(triplesFromStore(elements)).toEqual(
      expect.arrayContaining([
        [
          'http://spinoza.org/ethics#IV.prop.18',
          'http://spinoza.org/ethics#cites',
          'http://spinoza.org/ethics#IV.prop.17'
        ]
      ])
    );
    expect(triplesFromStore(elements)).not.toEqual(
      expect.arrayContaining([
        [
          'http://spinoza.org/ethics#IV.prop.18',
          'http://spinoza.org/ethics#cites',
          'http://spinoza.org/ethics#V.prop.42'
        ]
      ])
    );
  });
});
