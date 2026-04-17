import { XMLParser } from 'fast-xml-parser';
import { Parser, Store } from 'n3';
import { PartMetadata, ReaderSectionSummary, SpinozaElement } from '../types';

const SECTION_LABELS: Record<string, string> = {
  preface: 'Preface',
  definitions: 'Definitions',
  axioms: 'Axioms',
  propositions: 'Propositions',
  physical_axioms: 'Physical Axioms',
  lemmas: 'Lemmas',
  postulates: 'Postulates',
  appendix: 'Appendix'
};

const APPENDIX_TOPIC_LABELS: Record<string, string> = {
  teleological_prejudice: 'On Teleological Prejudice',
  abstract_notions: 'On Common Abstract Notions',
  nature_of_abstractions: 'On the Origin of Error'
};

export const PARTS: Record<number, PartMetadata> = {
  1: {
    number: 1,
    numeral: 'I',
    title: 'Concerning God',
    strapline: 'Substance, attributes, and the necessity of the divine nature.',
    description:
      'Part I establishes the metaphysical grammar of the Ethics: substance, attribute, mode, and the claim that whatever is, is in God.'
  },
  2: {
    number: 2,
    numeral: 'II',
    title: 'On the Nature and Origin of the Mind',
    strapline: 'Mind, body, adequacy, and the order and connection of ideas.',
    description:
      'Part II turns from metaphysics to cognition and embodiment, tracing how the human mind follows from the same order that governs nature.'
  }
};

interface OrderedNode {
  [key: string]: unknown;
  ':@'?: Record<string, string>;
}

export const getSectionLabel = (sectionKind: string): string =>
  SECTION_LABELS[sectionKind] ?? humanizeToken(sectionKind);

export const humanizeToken = (value: string): string =>
  value
    .split(/[_\-.]+/)
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');

export const toRoman = (num: number): string => {
  const values = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const symbols = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
  let remainder = num;
  let result = '';

  values.forEach((value, index) => {
    while (remainder >= value) {
      result += symbols[index];
      remainder -= value;
    }
  });

  return result;
};

export const formatElementLabel = (element: Pick<SpinozaElement, 'id' | 'type' | 'number' | 'heading'>): string => {
  if (element.heading) {
    return element.heading;
  }

  if (element.type === 'preface') {
    return 'Preface';
  }

  if (element.type === 'appendix') {
    return 'Appendix';
  }

  const parts = element.id.split('.');
  const subElement = parts[3];
  const numberToken = element.number ?? parts[2];
  const number = numberToken ? Number.parseInt(numberToken, 10) : Number.NaN;
  const romanNumber = Number.isFinite(number) ? toRoman(number) : '';

  const base =
    element.type === 'definition'
      ? `Definition ${romanNumber}`
      : element.type === 'axiom'
        ? `Axiom ${romanNumber}`
        : element.type === 'proposition'
          ? `Proposition ${romanNumber}`
          : element.type === 'lemma'
            ? `Lemma ${romanNumber}`
            : element.type === 'postulate'
              ? `Postulate ${romanNumber}`
              : element.type === 'proof'
                ? 'Proof'
                : element.type === 'corollary'
                  ? 'Corollary'
                  : element.type === 'note'
                    ? 'Note'
                    : element.type === 'explanation'
                      ? 'Explanation'
                      : humanizeToken(element.type);

  if (!subElement || ['proof', 'corollary', 'note', 'explanation'].includes(element.type)) {
    return base.trim();
  }

  return `${base} ${humanizeToken(subElement)}`.trim();
};

export const matchesQuery = (element: SpinozaElement, query: string): boolean => {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [element.text, formatElementLabel(element), element.heading, element.id]
    .filter(Boolean)
    .some(value => value!.toLowerCase().includes(normalizedQuery));
};

export const summarizeSections = (elements: SpinozaElement[]): ReaderSectionSummary[] => {
  const counts = new Map<string, number>();

  elements.forEach(element => {
    if (element.parentId) {
      return;
    }

    counts.set(element.sectionKind, (counts.get(element.sectionKind) ?? 0) + 1);
  });

  return Array.from(counts.entries()).map(([kind, count]) => ({
    kind,
    count,
    label: getSectionLabel(kind)
  }));
};

export const parseSpinozaXml = (xmlText: string): Map<string, SpinozaElement> => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: true,
    trimValues: false
  });

  const documentNodes = parser.parse(xmlText) as OrderedNode[];
  const partNode = documentNodes.find(node => getTagName(node) === 'part');

  if (!partNode) {
    return new Map();
  }

  const partId = getAttributes(partNode)['@_id'] ?? 'I';
  const elements = new Map<string, SpinozaElement>();
  let sortIndex = 0;
  let appendixIndex = 0;

  const nextSortIndex = () => {
    sortIndex += 1;
    return sortIndex;
  };

  const addElement = (element: Omit<SpinozaElement, 'sortIndex'> & { sortIndex?: number }) => {
    if (!element.id || !element.text.trim()) {
      return;
    }

    elements.set(element.id, {
      ...element,
      sortIndex: element.sortIndex ?? nextSortIndex()
    });
  };

  const processInlineChildren = (node: OrderedNode, parentId: string, sectionKind: string) => {
    getChildren(node).forEach(child => {
      const tag = getTagName(child);
      const attrs = getAttributes(child);
      const text = extractNodeBody(child);

      if (!text) {
        return;
      }

      if (tag === 'proof') {
        addElement({
          id: attrs['@_id'],
          type: 'proof',
          text,
          parentId,
          sectionKind
        });
      }

      if (tag === 'corollary') {
        addElement({
          id: attrs['@_id'],
          type: 'corollary',
          text,
          parentId,
          sectionKind
        });
      }

      if (tag === 'note' || tag === 'footnote') {
        addElement({
          id: attrs['@_id'],
          type: 'note',
          text,
          number: attrs['@_number'],
          parentId,
          sectionKind
        });
      }

      if (tag === 'explanation') {
        addElement({
          id: attrs['@_id'],
          type: 'explanation',
          text,
          parentId,
          sectionKind
        });
      }
    });
  };

  const processTextualElement = (node: OrderedNode, type: SpinozaElement['type'], sectionKind: string) => {
    const attrs = getAttributes(node);
    const id = attrs['@_id'];
    const text = extractNodeBody(node);

    addElement({
      id,
      type,
      text,
      number: attrs['@_number'],
      sectionKind
    });

    if (id) {
      processInlineChildren(node, id, sectionKind);
    }
  };

  const processAppendixSection = (node: OrderedNode, sectionKind: string, parentId: string) => {
    const attrs = getAttributes(node);
    const topic = attrs['@_topic'];
    const id = `${parentId}.argument.${appendixIndex + 1}`;
    appendixIndex += 1;

    addElement({
      id,
      type: 'appendix',
      text: extractRecursiveText(node),
      sectionKind,
      heading: topic ? APPENDIX_TOPIC_LABELS[topic] ?? humanizeToken(topic) : 'Appendix Section'
    });
  };

  const processSection = (node: OrderedNode) => {
    const attrs = getAttributes(node);
    const sectionKind = attrs['@_type'] ?? 'section';
    const sectionId = attrs['@_id'] ?? `${partId}.${sectionKind}`;

    if (sectionKind === 'preface') {
      addElement({
        id: sectionId,
        type: 'preface',
        text: extractRecursiveText(node),
        sectionKind,
        heading: 'Preface'
      });
      return;
    }

    if (sectionKind === 'appendix') {
      getChildren(node).forEach(child => {
        const tag = getTagName(child);

        if (tag === 'introduction') {
          addElement({
            id: `${sectionId}.introduction`,
            type: 'appendix',
            text: extractRecursiveText(child),
            sectionKind,
            heading: 'Appendix Introduction'
          });
        }

        if (tag === 'section') {
          processAppendixSection(child, sectionKind, sectionId);
        }
      });
      return;
    }

    getChildren(node).forEach(child => {
      const tag = getTagName(child);

      if (tag === 'section') {
        processSection(child);
      }

      if (tag === 'def') {
        processTextualElement(child, 'definition', sectionKind);
      }

      if (tag === 'axiom') {
        processTextualElement(child, 'axiom', sectionKind);
      }

      if (tag === 'prop') {
        processTextualElement(child, 'proposition', sectionKind);
      }

      if (tag === 'lemma') {
        processTextualElement(child, 'lemma', sectionKind);
      }

      if (tag === 'postulate') {
        processTextualElement(child, 'postulate', sectionKind);
      }

      if (tag === 'note') {
        addElement({
          id: getAttributes(child)['@_id'],
          type: 'note',
          text: extractNodeBody(child),
          sectionKind
        });
      }
    });
  };

  getChildren(partNode)
    .filter(node => getTagName(node) === 'section')
    .forEach(processSection);

  return elements;
};

export const parseN3ToStore = async (content: string): Promise<Store> => {
  const store = new Store();
  const parser = new Parser();

  return new Promise((resolve, reject) => {
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

export const mergeStores = (...stores: Store[]): Store => {
  const merged = new Store();
  stores.forEach(store => {
    merged.addQuads(store.getQuads(null, null, null, null));
  });
  return merged;
};

export const stripRulesFromN3 = (content: string): string =>
  content
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith('{') && !trimmed.startsWith('=>');
    })
    .join('\n');

const getTagName = (node: OrderedNode): string => Object.keys(node).find(key => key !== ':@') ?? '';

const getChildren = (node: OrderedNode): OrderedNode[] => {
  const tag = getTagName(node);
  const value = node[tag];
  return Array.isArray(value) ? (value as OrderedNode[]) : [];
};

const getAttributes = (node: OrderedNode): Record<string, string> => node[':@'] ?? {};

const collectText = (node: OrderedNode): string[] => {
  const tag = getTagName(node);

  if (tag === '#text') {
    const text = String(node['#text'] ?? '').trim();
    return text ? [text] : [];
  }

  return getChildren(node).flatMap(collectText);
};

const joinText = (parts: string[]): string =>
  parts
    .map(part => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');

const extractNodeBody = (node: OrderedNode): string => {
  const segments: string[] = [];

  getChildren(node).forEach(child => {
    const tag = getTagName(child);

    if (['text', 'continuation', 'item'].includes(tag)) {
      segments.push(joinText(collectText(child)));
    }

    if (tag === 'enumeration') {
      getChildren(child)
        .filter(itemNode => getTagName(itemNode) === 'item')
        .forEach(itemNode => {
          const itemAttrs = getAttributes(itemNode);
          const itemNumber = itemAttrs['@_number'];
          const prefix = itemNumber ? `${itemNumber}. ` : '';
          segments.push(`${prefix}${joinText(collectText(itemNode))}`.trim());
        });
    }
  });

  return joinText(segments);
};

const extractRecursiveText = (node: OrderedNode): string => joinText(collectText(node));
