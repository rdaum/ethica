import { buildSupplementalStore, extractReferences } from './readerGraph';
import { SpinozaElement } from '../types';

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

    expect(references).toEqual(
      expect.arrayContaining(['II.prop.9', 'II.prop.11', 'I.prop.36'])
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
      ]
    ]);

    const store = buildSupplementalStore(elements);
    const triples = store.getQuads(null, null, null, null).map(quad => [
      quad.subject.value,
      quad.predicate.value,
      quad.object.value
    ]);

    expect(triples).toEqual(
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
});
