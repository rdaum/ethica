import { Parser } from 'n3';
import { buildInferredStore } from './inference';

const parseStore = async (content: string) => {
  const parser = new Parser();
  const store = new (await import('n3')).Store();

  return new Promise<typeof store>((resolve, reject) => {
    parser.parse(content, (error, quad) => {
      if (error) {
        reject(error);
        return;
      }

      if (quad) {
        store.addQuad(quad);
        return;
      }

      resolve(store);
    });
  });
};

describe('buildInferredStore', () => {
  it('derives direct and transitive dependencies from the explicit graph', async () => {
    const explicitStore = await parseStore(`
      @prefix ethics: <http://spinoza.org/ethics#> .

      ethics:I.prop.1 ethics:cites ethics:I.def.1 .
      ethics:I.prop.2 ethics:provedBy ethics:I.prop.2.proof .
      ethics:I.prop.2.proof ethics:cites ethics:I.prop.1 .
      ethics:I.prop.3 ethics:hasCorollary ethics:I.prop.3.corollary .
      ethics:I.prop.4 ethics:hasNote ethics:I.prop.4.note .
    `);

    const inferredStore = buildInferredStore(explicitStore);
    const triples = inferredStore.getQuads(null, null, null, null).map(quad => [
      quad.subject.value,
      quad.predicate.value,
      quad.object.value
    ]);

    expect(triples).toEqual(
      expect.arrayContaining([
        [
          'http://spinoza.org/ethics#I.prop.1',
          'http://spinoza.org/ethics#dependsUpon',
          'http://spinoza.org/ethics#I.def.1'
        ],
        [
          'http://spinoza.org/ethics#I.prop.2',
          'http://spinoza.org/ethics#dependsUpon',
          'http://spinoza.org/ethics#I.prop.2.proof'
        ],
        [
          'http://spinoza.org/ethics#I.prop.2.proof',
          'http://spinoza.org/ethics#dependsUpon',
          'http://spinoza.org/ethics#I.prop.1'
        ],
        [
          'http://spinoza.org/ethics#I.prop.2',
          'http://spinoza.org/ethics#transitivelyDependsOn',
          'http://spinoza.org/ethics#I.prop.1'
        ],
        [
          'http://spinoza.org/ethics#I.prop.2',
          'http://spinoza.org/ethics#transitivelyDependsOn',
          'http://spinoza.org/ethics#I.def.1'
        ],
        [
          'http://spinoza.org/ethics#I.prop.3.corollary',
          'http://spinoza.org/ethics#derivedFrom',
          'http://spinoza.org/ethics#I.prop.3'
        ],
        [
          'http://spinoza.org/ethics#I.prop.4.note',
          'http://spinoza.org/ethics#explainsElement',
          'http://spinoza.org/ethics#I.prop.4'
        ]
      ])
    );
  });

  it('treats citations in notes as references rather than dependencies', async () => {
    const explicitStore = await parseStore(`
      @prefix ethics: <http://spinoza.org/ethics#> .

      ethics:I.prop.1.note a ethics:Note ; ethics:cites ethics:I.prop.9 .
      ethics:I.prop.1.proof a ethics:Proof ; ethics:cites ethics:I.def.1 .
      ethics:I.prop.1 ethics:hasCorollary ethics:I.prop.1.corollary .
    `);
    const inferredStore = buildInferredStore(explicitStore);
    const dependsUpon = 'http://spinoza.org/ethics#dependsUpon';
    const node = (id: string) => `http://spinoza.org/ethics#${id}`;

    expect(inferredStore.countQuads(node('I.prop.1.note'), dependsUpon, node('I.prop.9'), null)).toBe(0);
    expect(inferredStore.countQuads(node('I.prop.1.proof'), dependsUpon, node('I.def.1'), null)).toBe(1);
    expect(inferredStore.countQuads(node('I.prop.1.corollary'), dependsUpon, node('I.prop.1'), null)).toBe(1);
  });

  it('handles dependency cycles without creating self-dependencies', async () => {
    const explicitStore = await parseStore(`
      @prefix ethics: <http://spinoza.org/ethics#> .

      ethics:I.prop.1 ethics:cites ethics:I.prop.2 .
      ethics:I.prop.2 ethics:cites ethics:I.prop.3 .
      ethics:I.prop.3 ethics:cites ethics:I.prop.1 .
    `);

    const inferredStore = buildInferredStore(explicitStore);
    const triples = inferredStore.getQuads(null, null, null, null).map(quad => [
      quad.subject.value,
      quad.predicate.value,
      quad.object.value
    ]);

    expect(triples).toEqual(
      expect.arrayContaining([
        [
          'http://spinoza.org/ethics#I.prop.1',
          'http://spinoza.org/ethics#transitivelyDependsOn',
          'http://spinoza.org/ethics#I.prop.3'
        ],
        [
          'http://spinoza.org/ethics#I.prop.2',
          'http://spinoza.org/ethics#transitivelyDependsOn',
          'http://spinoza.org/ethics#I.prop.1'
        ],
        [
          'http://spinoza.org/ethics#I.prop.3',
          'http://spinoza.org/ethics#transitivelyDependsOn',
          'http://spinoza.org/ethics#I.prop.2'
        ]
      ])
    );
    expect(triples).not.toEqual(
      expect.arrayContaining([
        [
          'http://spinoza.org/ethics#I.prop.1',
          'http://spinoza.org/ethics#transitivelyDependsOn',
          'http://spinoza.org/ethics#I.prop.1'
        ]
      ])
    );
  });
});
