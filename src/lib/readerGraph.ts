import { DataFactory, Store } from 'n3';
import { SpinozaElement } from '../types';

const ETHICS = 'http://spinoza.org/ethics#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

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

    extractReferences(element).forEach(reference => {
      store.addQuad(quad(subject, ethicsNode('cites'), ethicsNode(reference)));
    });
  });

  return store;
};

export const extractReferences = (element: SpinozaElement): string[] => {
  const text = element.text;
  const currentPart = element.id.split('.')[0];
  const references = new Set<string>();

  const explicitPropRegex =
    /(?:Pt\.?|Part)\s*([ivx]+)\.?,?\s*(?:Prop\.?|Proposition)\s*([ivxlcdm]+)(?:,?\s*Coroll?\.?\s*([ivxlcdm]+)?)?/gi;
  const compactPartPropRegex = /(?:^|[\s,(;])([ivx]+)\.\s*([ivxlcdm]+)(?:\.\s*Coroll?\.?\s*([ivxlcdm]+)?)?/gi;
  const localPropRegex =
    /(?:^|[\s,(;])(?:Prop\.?|Proposition)\s*([ivxlcdm]+)(?:,?\s*Coroll?\.?\s*([ivxlcdm]+)?)?/gi;
  const defRegex = /(?:^|[\s,(;])(?:Def\.?|Deff\.?|Definition)\s*([ivxlcdm]+)(?:\s*(?:and|,)\s*([ivxlcdm]+))?/gi;
  const axiomRegex = /(?:^|[\s,(;])(?:Ax\.?|Axiom)\s*([ivxlcdm]+)(?:\s*(?:and|,)\s*([ivxlcdm]+))?/gi;
  const lemmaRegex = /(?:^|[\s,(;])(?:Lemma)\s*([ivxlcdm]+)/gi;

  collectMatches(explicitPropRegex, text, match => {
    const part = romanToInteger(match[1]);
    const proposition = romanToInteger(match[2]);
    const corollary = match[3] ? romanToInteger(match[3]) : null;

    if (part && proposition) {
      references.add(referenceId(part, 'prop', proposition, corollary ? `corollary${corollary}` : undefined));
    }
  });

  collectMatches(compactPartPropRegex, text, match => {
    const part = romanToInteger(match[1]);
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
  kind: 'prop' | 'def' | 'ax' | 'lemma',
  number: number,
  suffix?: string
): string => {
  const numeral = typeof part === 'string' ? part : integerToRoman(part);
  return suffix ? `${numeral}.${kind}.${number}.${suffix}` : `${numeral}.${kind}.${number}`;
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
