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
  const dependsUpon = 'http://spinoza.org/ethics#dependsUpon';
  const node = (id: string) => `http://spinoza.org/ethics#${id}`;

  it('derives dependencies from citations, proofs and corollaries', async () => {
    const inferredStore = buildInferredStore(
      await parseStore(`
        @prefix ethics: <http://spinoza.org/ethics#> .

        ethics:I.prop.1 ethics:cites ethics:I.def.1 .
        ethics:I.prop.2 ethics:provedBy ethics:I.prop.2.proof .
        ethics:I.prop.2.proof ethics:cites ethics:I.prop.1 .
        ethics:I.prop.3 ethics:hasCorollary ethics:I.prop.3.corollary .
      `)
    );

    expect(inferredStore.countQuads(node('I.prop.1'), dependsUpon, node('I.def.1'), null)).toBe(1);
    expect(inferredStore.countQuads(node('I.prop.2'), dependsUpon, node('I.prop.2.proof'), null)).toBe(1);
    expect(inferredStore.countQuads(node('I.prop.2.proof'), dependsUpon, node('I.prop.1'), null)).toBe(1);
    expect(inferredStore.countQuads(node('I.prop.3.corollary'), dependsUpon, node('I.prop.3'), null)).toBe(1);
  });

  it('treats citations in notes as references rather than dependencies', async () => {
    const inferredStore = buildInferredStore(
      await parseStore(`
        @prefix ethics: <http://spinoza.org/ethics#> .

        ethics:I.prop.1.note a ethics:Note ; ethics:cites ethics:I.prop.9 .
        ethics:I.prop.1.proof a ethics:Proof ; ethics:cites ethics:I.def.1 .
      `)
    );

    expect(inferredStore.countQuads(node('I.prop.1.note'), dependsUpon, node('I.prop.9'), null)).toBe(0);
    expect(inferredStore.countQuads(node('I.prop.1.proof'), dependsUpon, node('I.def.1'), null)).toBe(1);
  });
});
