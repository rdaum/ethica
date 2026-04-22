import { DataFactory, Store } from 'n3';
import { SpinozaElement } from '../types';

const ETHICS = 'http://spinoza.org/ethics#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const PART_NUMERALS = new Set(['I', 'II', 'III', 'IV', 'V']);

const { namedNode, quad } = DataFactory;

const TYPE_TO_CLASS: Partial<Record<SpinozaElement['type'], string>> = {
  preface: 'Note',
  definition: 'Definition',
  axiom: 'Axiom',
  proposition: 'Proposition',
  proof: 'Proof',
  corollary: 'Corollary',
  note: 'Note',
  lemma: 'Proposition',
  postulate: 'Axiom',
  explanation: 'Explanation',
  appendix: 'Note'
};

const CHILD_RELATIONS: Partial<Record<SpinozaElement['type'], string>> = {
  proof: 'provedBy',
  corollary: 'hasCorollary',
  note: 'hasNote',
  explanation: 'hasNote'
};

// These predicates are expected to be present in the generated graph files.
// The runtime supplemental store exists only to backfill them when the corpus graph
// does not yet carry a structurally obvious edge for a parsed element.
export const CANONICAL_RELATION_PREDICATES = ['cites', 'partOf', 'provedBy', 'hasCorollary', 'hasNote'] as const;

// These predicates are synthesized from parsed XML only when the canonical graph
// lacks the corresponding triple for an element already present in the reader model.
export const SUPPLEMENTAL_RELATION_PREDICATES = ['cites', 'partOf', 'provedBy', 'hasCorollary', 'hasNote'] as const;

export const buildSupplementalStore = (elements: Map<string, SpinozaElement>): Store => {
  const store = new Store();
  const ordered = Array.from(elements.values()).sort((left, right) => left.sortIndex - right.sortIndex);

  ordered.forEach(element => {
    const subject = ethicsNode(element.id);
    const typeClass = TYPE_TO_CLASS[element.type];

    if (typeClass) {
      store.addQuad(quad(subject, namedNode(RDF_TYPE), ethicsNode(typeClass)));
    }

    if (element.parentId) {
      store.addQuad(quad(subject, ethicsNode('partOf'), ethicsNode(element.parentId)));

      const relation = CHILD_RELATIONS[element.type];
      if (relation) {
        store.addQuad(quad(ethicsNode(element.parentId), ethicsNode(relation), subject));
      }
    }

    extractReferences(element)
      .filter(reference => elements.has(reference))
      .forEach(reference => {
      store.addQuad(quad(subject, ethicsNode('cites'), ethicsNode(reference)));
      });
  });

  return store;
};

export const extractReferences = (element: SpinozaElement): string[] => {
  const text = element.text;
  const currentPart = element.id.split('.')[0];
  const references = new Set<string>();

  const explicitRefRegex =
    /\b(?:Pt\.?|Part)\s*([ivx]+)\.?,?\s*(?:(Prop(?:osition)?|Def(?:inition)?s?|Deff\.?|Ax(?:iom)?|Lemma|Post(?:ulate)?)\.?\s*)?([ivxlcdm]+)(?:,?\s*Coroll?(?:ary)?\.?\s*([ivxlcdm]+)?)?/gi;
  const compactQualifiedRegex =
    /(?:^|[\s,(;])((?:i{1,3}|iv|v))\.\s*(Prop(?:osition)?|Def(?:inition)?s?|Deff\.?|Ax(?:iom)?|Lemma|Post(?:ulate)?)\.?\s*([ivxlcdm]+)(?:\.\s*Coroll?(?:ary)?\.?\s*([ivxlcdm]+)?)?/gi;
  const compactPartPropRegex = /(?:^|[\s,(;])([ivx]+)\.\s*([ivxlcdm]+)(?:\.\s*Coroll?\.?\s*([ivxlcdm]+)?)?/gi;
  const localPropRegex =
    /(?:^|[\s,(;])(?:Prop(?:osition)?\.?)\s*([ivxlcdm]+)(?:,?\s*Coroll?(?:ary)?\.?\s*([ivxlcdm]+)?)?/gi;
  const defRegex = /(?:^|[\s,(;])(?:Def(?:inition)?s?|Deff\.?)\.?\s*([ivxlcdm]+)(?:\s*(?:and|,)\s*([ivxlcdm]+))?/gi;
  const axiomRegex = /(?:^|[\s,(;])(?:Ax(?:iom)?)\.?\s*([ivxlcdm]+)(?:\s*(?:and|,)\s*([ivxlcdm]+))?/gi;
  const lemmaRegex = /(?:^|[\s,(;])Lemma\s+([ivxlcdm]+)/gi;
  const postRegex = /(?:^|[\s,(;])(?:Post(?:ulate)?)\.?\s*([ivxlcdm]+)/gi;

  collectMatches(explicitRefRegex, text, match => {
    const part = normalizePartNumeral(match[1]);
    const kindToken = (match[2] ?? 'Prop').toLowerCase();
    const number = romanToInteger(match[3]);
    const corollary = match[4] ? romanToInteger(match[4]) : null;

    if (!part || !number) {
      return;
    }

    const kind =
      kindToken.startsWith('def')
        ? 'def'
        : kindToken.startsWith('ax')
          ? 'ax'
          : kindToken.startsWith('lemma')
            ? 'lemma'
            : kindToken.startsWith('post')
              ? 'post'
              : 'prop';

    references.add(referenceId(part, kind, number, corollary && kind === 'prop' ? `corollary${corollary}` : undefined));
  });

  collectMatches(compactQualifiedRegex, text, match => {
    const part = normalizePartNumeral(match[1]);
    const kindToken = match[2].toLowerCase();
    const number = romanToInteger(match[3]);
    const corollary = match[4] ? romanToInteger(match[4]) : null;

    if (!part || !number) {
      return;
    }

    const kind =
      kindToken.startsWith('def')
        ? 'def'
        : kindToken.startsWith('ax')
          ? 'ax'
          : kindToken.startsWith('lemma')
            ? 'lemma'
            : kindToken.startsWith('post')
              ? 'post'
              : 'prop';

    references.add(referenceId(part, kind, number, corollary && kind === 'prop' ? `corollary${corollary}` : undefined));
  });

  collectMatches(compactPartPropRegex, text, match => {
    const part = normalizePartNumeral(match[1]);
    const proposition = romanToInteger(match[2]);
    const corollary = match[3] ? romanToInteger(match[3]) : null;

    if (part && proposition) {
      references.add(referenceId(part, 'prop', proposition, corollary ? `corollary${corollary}` : undefined));
    }
  });

  collectMatches(localPropRegex, text, match => {
    const proposition = romanToInteger(match[1]);
    const corollary = match[2] ? romanToInteger(match[2]) : null;

    if (proposition) {
      references.add(referenceId(currentPart, 'prop', proposition, corollary ? `corollary${corollary}` : undefined));
    }
  });

  collectMatches(defRegex, text, match => {
    [match[1], match[2]].filter(Boolean).forEach(value => {
      const definition = romanToInteger(value);
      if (definition) {
        references.add(referenceId(currentPart, 'def', definition));
      }
    });
  });

  collectMatches(axiomRegex, text, match => {
    [match[1], match[2]].filter(Boolean).forEach(value => {
      const axiom = romanToInteger(value);
      if (axiom) {
        references.add(referenceId(currentPart, 'ax', axiom));
      }
    });
  });

  collectMatches(lemmaRegex, text, match => {
    const lemma = romanToInteger(match[1]);
    if (lemma) {
      references.add(referenceId(currentPart, 'lemma', lemma));
    }
  });

  collectMatches(postRegex, text, match => {
    const postulate = romanToInteger(match[1]);
    if (postulate) {
      references.add(referenceId(currentPart, 'post', postulate));
    }
  });

  return Array.from(references).filter(reference => reference !== element.id);
};

const collectMatches = (regex: RegExp, text: string, callback: (match: RegExpExecArray) => void) => {
  let match = regex.exec(text);

  while (match) {
    callback(match);
    match = regex.exec(text);
  }
};

const referenceId = (
  part: number | string,
  kind: 'prop' | 'def' | 'ax' | 'lemma' | 'post',
  number: number,
  suffix?: string
): string => {
  const numeral = typeof part === 'string' ? part : integerToRoman(part);
  return suffix ? `${numeral}.${kind}.${number}.${suffix}` : `${numeral}.${kind}.${number}`;
};

const normalizePartNumeral = (value: string): number | null => {
  const numeral = value.trim().toUpperCase();
  return PART_NUMERALS.has(numeral) ? romanToInteger(numeral) : null;
};

const ethicsNode = (value: string) => namedNode(`${ETHICS}${value}`);

const romanToInteger = (value: string): number | null => {
  const normalized = value.trim().toUpperCase();
  const numerals: Record<string, number> = {
    M: 1000,
    D: 500,
    C: 100,
    L: 50,
    X: 10,
    V: 5,
    I: 1
  };
  let total = 0;
  let previous = 0;

  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const current = numerals[normalized[index]];

    if (!current) {
      return null;
    }

    if (current < previous) {
      total -= current;
    } else {
      total += current;
      previous = current;
    }
  }

  return total;
};

const integerToRoman = (value: number): string => {
  const lookup = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I']
  ] as const;
  let remainder = value;
  let result = '';

  lookup.forEach(([magnitude, symbol]) => {
    while (remainder >= magnitude) {
      result += symbol;
      remainder -= magnitude;
    }
  });

  return result;
};
