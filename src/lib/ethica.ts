import { XMLParser } from 'fast-xml-parser';
import { Parser, Store } from 'n3';
import { EditorialKind, Footnote, PartMetadata, ReaderSectionSummary, SourceAuthority, SpinozaElement } from '../types';

const SECTION_LABELS: Record<string, string> = {
  preface: 'Preface',
  definitions: 'Definitions',
  definitions_of_emotions: 'Definitions of the Emotions',
  general_definition: 'General Definition',
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
  },
  3: {
    number: 3,
    numeral: 'III',
    title: 'On the Origin and Nature of the Emotions',
    strapline: 'Desire, pleasure, pain, and the mechanics of the affects.',
    description:
      'Part III treats human affects as natural phenomena, explaining passions and actions through the same order that governs bodies and ideas.'
  },
  4: {
    number: 4,
    numeral: 'IV',
    title: 'Of Human Bondage, or the Strength of the Emotions',
    strapline: 'Conflict, bondage, utility, and the limits of finite power.',
    description:
      'Part IV examines how inadequate ideas and external causes bind us, while sketching the practical demands of life under reason.'
  },
  5: {
    number: 5,
    numeral: 'V',
    title: 'Of the Power of the Understanding, or of Human Freedom',
    strapline: 'The mind’s power, intellectual love of God, and blessedness.',
    description:
      'Part V develops the ethical culmination of the work: understanding, freedom, and the durable joy that follows from adequate knowledge.'
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

  const subElementLabel = formatSubElementLabel(element);

  if (subElementLabel) {
    return subElementLabel;
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
              : humanizeToken(element.type);

  if (!subElement) {
    return base.trim();
  }

  return `${base} ${humanizeToken(subElement)}`.trim();
};

const withNumeral = (label: string, digits: string | undefined): string =>
  digits ? `${label} ${toRoman(Number.parseInt(digits, 10))}` : label;

const formatSubElementLabel = ({ id, type }: Pick<SpinozaElement, 'id' | 'type'>): string | null => {
  if (type === 'proof') {
    const corollaryProof = id.match(/\.corollary(\d*)\.proof\d*$/);

    if (corollaryProof) {
      return `Proof of ${withNumeral('Corollary', corollaryProof[1])}`;
    }

    return /\.proof\d+$/.test(id) ? 'Alternate Proof' : 'Proof';
  }

  if (type === 'corollary' || type === 'note' || type === 'explanation') {
    const label = humanizeToken(type);
    return withNumeral(label, id.match(new RegExp(`\\.${type}(\\d+)$`))?.[1]);
  }

  return null;
};

export const missingLatinMessage = ({ isEditorial }: Pick<SpinozaElement, 'isEditorial'>): string =>
  isEditorial
    ? 'This note was added by the English edition and has no separate Latin passage.'
    : 'Latin text is not available for this passage.';

export const matchesQuery = (element: SpinozaElement, query: string): boolean => {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [element.text, element.latinText, element.canonicalLabel ?? formatElementLabel(element), element.heading, element.id]
    .filter(Boolean)
    .some(value => value!.toLowerCase().includes(normalizedQuery));
};

/**
 * The passages a search leaves on the page: anything that matches, everything under
 * a match, and the ancestors needed to reach a match.
 */
export const getVisibleElementIds = (elements: SpinozaElement[], query: string): Set<string> => {
  if (!query.trim()) {
    return new Set(elements.map(element => element.id));
  }

  const byId = new Map(elements.map(element => [element.id, element]));
  const matched = new Set(elements.filter(element => matchesQuery(element, query)).map(element => element.id));
  const visible = new Set(matched);

  matched.forEach(id => {
    for (let parentId = byId.get(id)?.parentId; parentId; parentId = byId.get(parentId)?.parentId) {
      visible.add(parentId);
    }
  });

  // Parents sort before their children, so a match cascades all the way down.
  [...elements]
    .sort((left, right) => left.sortIndex - right.sortIndex)
    .forEach(element => {
      if (element.parentId && matched.has(element.parentId)) {
        matched.add(element.id);
        visible.add(element.id);
      }
    });

  return visible;
};

export const mergeLatinText = (
  elements: Map<string, SpinozaElement>,
  latinById: Record<string, string>
): Map<string, SpinozaElement> => {
  const merged = new Map<string, SpinozaElement>();

  elements.forEach((element, id) => {
    merged.set(id, {
      ...element,
      latinText: latinById[id]?.trim() || undefined
    });
  });

  return merged;
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

    const partNumeral = partId;
    const partNumber = PARTS_BY_NUMERAL[partNumeral]?.number ?? romanNumeralToInteger(partNumeral);
    const isEditorial = Boolean(element.isEditorial);
    const editorialKind = element.editorialKind ?? inferEditorialKind(element);
    const sourceAuthority = element.sourceAuthority ?? inferSourceAuthority(isEditorial);
    const variantLabel = element.variantLabel ?? inferVariantLabel(element.id, element.type);
    const canonicalLabel = element.canonicalLabel ?? formatElementLabel(element);

    elements.set(element.id, {
      ...element,
      partNumeral,
      partNumber,
      canonicalLabel,
      isEditorial,
      editorialKind,
      sourceAuthority,
      variantLabel,
      sortIndex: element.sortIndex ?? nextSortIndex()
    });
  };

  const processInlineChildren = (node: OrderedNode, parentId: string, sectionKind: string) => {
    getChildren(node).forEach(child => {
      const tag = getTagName(child);

      if (tag !== 'proof' && tag !== 'corollary' && tag !== 'note' && tag !== 'explanation') {
        return;
      }

      const attrs = getAttributes(child);
      const text = extractNodeBody(child);

      if (!text) {
        return;
      }

      addElement({
        id: attrs['@_id'],
        type: tag,
        text,
        number: tag === 'note' ? attrs['@_number'] : undefined,
        parentId,
        sectionKind,
        footnotes: extractFootnotes(child),
        isEditorial: attrs['@_editorial'] === 'true'
      });
      processInlineChildren(child, attrs['@_id'], sectionKind);
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
      sectionKind,
      footnotes: extractFootnotes(node),
      isEditorial: attrs['@_editorial'] === 'true'
    });

    if (id) {
      processInlineChildren(node, id, sectionKind);
    }
  };

  const processAppendixSection = (node: OrderedNode, sectionKind: string, parentId: string) => {
    const attrs = getAttributes(node);
    const topic = attrs['@_topic'];
    const id = attrs['@_id'] ?? `${parentId}.argument.${appendixIndex + 1}`;
    appendixIndex += 1;

    addElement({
      id,
      type: 'appendix',
      text: extractRecursiveText(node),
      sectionKind,
      heading: topic
        ? /^[IVXLCDM]+$/i.test(topic)
          ? `Caput ${topic.toUpperCase()}`
          : APPENDIX_TOPIC_LABELS[topic] ?? humanizeToken(topic)
        : 'Appendix Section',
      editorialKind: topic ? undefined : 'synthetic_heading'
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
            heading: 'Appendix Introduction',
            editorialKind: 'synthetic_heading'
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
          sectionKind,
          isEditorial: getAttributes(child)['@_editorial'] === 'true'
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

const extractFootnotes = (node: OrderedNode): Footnote[] | undefined => {
  const footnotes = getChildren(node)
    .filter(child => getTagName(child) === 'footnote')
    .map(child => ({ number: getAttributes(child)['@_number'], text: extractNodeBody(child) }));

  return footnotes.length ? footnotes : undefined;
};

const extractRecursiveText = (node: OrderedNode): string => joinText(collectText(node));

const PARTS_BY_NUMERAL = Object.fromEntries(Object.values(PARTS).map(part => [part.numeral, part])) as Record<
  string,
  PartMetadata
>;

const romanNumeralToInteger = (value: string): number | undefined => {
  const numerals: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let previous = 0;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const current = numerals[value[index]];

    if (!current) {
      return undefined;
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

// Only "Another proof" passages are true alternates; numbered notes and corollaries
// carry their number in their label instead.
const inferVariantLabel = (id: string, type: SpinozaElement['type']): string | undefined => {
  if (type !== 'proof' || /\.corollary\d*\.proof/.test(id)) {
    return undefined;
  }

  const match = id.match(/\.proof(\d+)$/);
  return match ? `proof${match[1]}` : undefined;
};

const inferEditorialKind = (
  element: Pick<SpinozaElement, 'isEditorial'>
): EditorialKind | undefined => {
  if (element.isEditorial) {
    return 'english_only_addition';
  }

  return undefined;
};

const inferSourceAuthority = (isEditorial: boolean): SourceAuthority =>
  isEditorial ? 'english_structural' : 'latin_governed';
