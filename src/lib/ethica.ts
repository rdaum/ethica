import { XMLParser } from 'fast-xml-parser';
import { Parser, Store } from 'n3';
import { EditorialKind, Footnote, Language, PartMetadata, ReaderSectionSummary, SourceAuthority, SpinozaElement } from '../types';

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
    description:
      'Part I establishes the metaphysical grammar of the Ethics: substance, attribute, mode, and the claim that whatever is, is in God.'
  },
  2: {
    number: 2,
    numeral: 'II',
    title: 'On the Nature and Origin of the Mind',
    description:
      'Part II turns from metaphysics to cognition and embodiment, tracing how the human mind follows from the same order that governs nature.'
  },
  3: {
    number: 3,
    numeral: 'III',
    title: 'On the Origin and Nature of the Emotions',
    description:
      'Part III treats human affects as natural phenomena, explaining passions and actions through the same order that governs bodies and ideas.'
  },
  4: {
    number: 4,
    numeral: 'IV',
    title: 'Of Human Bondage, or the Strength of the Emotions',
    description:
      'Part IV examines how inadequate ideas and external causes bind us, while sketching the practical demands of life under reason.'
  },
  5: {
    number: 5,
    numeral: 'V',
    title: 'Of the Power of the Understanding, or of Human Freedom',
    description:
      'Part V develops the ethical culmination of the work: understanding, freedom, and the durable joy that follows from adequate knowledge.'
  }
};

export const LANGUAGE_NAMES: Record<Language, string> = {
  english: 'English',
  french: 'Français',
  latin: 'Latin'
};

export const LANGUAGE_CODES: Record<Language, string> = {
  english: 'en',
  french: 'fr',
  latin: 'la'
};

export const TRANSLATION_CREDITS: Record<Language, string> = {
  english: 'Spinoza, translated by R.H.M. Elwes',
  french: 'Spinoza, traduit par Charles Appuhn',
  latin: 'Spinoza, Latin text'
};

const FRENCH_PARTS: Record<number, Pick<PartMetadata, 'title' | 'description'>> = {
  1: {
    title: 'De Dieu',
    description:
      'La première partie établit la grammaire métaphysique de l’Éthique : la substance, l’attribut, le mode, et la thèse que tout ce qui est, est en Dieu.'
  },
  2: {
    title: 'De la nature et de l’origine de l’âme',
    description:
      'La deuxième partie passe de la métaphysique à la connaissance et au corps, et montre comment l’âme humaine suit du même ordre qui régit la nature.'
  },
  3: {
    title: 'De l’origine et de la nature des affections',
    description:
      'La troisième partie traite les affections humaines comme des phénomènes naturels, et explique passions et actions par l’ordre qui régit les corps et les idées.'
  },
  4: {
    title: 'De la servitude de l’homme, ou des forces des affections',
    description:
      'La quatrième partie examine comment les idées inadéquates et les causes extérieures nous asservissent, et esquisse ce qu’exige une vie conduite par la raison.'
  },
  5: {
    title: 'De la puissance de l’entendement, ou de la liberté de l’homme',
    description:
      'La cinquième partie conduit l’œuvre à son terme : l’entendement, la liberté et la joie durable qui suit de la connaissance adéquate.'
  }
};

/** The part's title and introduction. Latin keeps the English ones, like its passage labels. */
export const getPartText = (part: PartMetadata, language: Language) =>
  language === 'french'
    ? { ...FRENCH_PARTS[part.number], heading: `Partie ${part.numeral}` }
    : { title: part.title, description: part.description, heading: `Part ${part.numeral}` };

const FRENCH_SECTION_LABELS: Record<string, string> = {
  preface: 'Préface',
  definitions: 'Définitions',
  definitions_of_emotions: 'Définitions des affections',
  general_definition: 'Définition générale',
  axioms: 'Axiomes',
  propositions: 'Propositions',
  physical_axioms: 'Axiomes sur les corps',
  lemmas: 'Lemmes',
  postulates: 'Postulats',
  appendix: 'Appendice'
};

const FRENCH_LABEL_WORDS: Array<[RegExp, string]> = [
  [/^Appendix Introduction$/, 'Appendice'],
  [/^Alternate Proof$/, 'Autre démonstration'],
  [/^Proof of Corollary/, 'Démonstration du Corollaire'],
  [/^Proof$/, 'Démonstration'],
  [/^Corollary/, 'Corollaire'],
  [/^Note/, 'Scolie'],
  [/^Explanation$/, 'Explication'],
  [/^Definition/, 'Définition'],
  [/^Axiom/, 'Axiome'],
  [/^Lemma/, 'Lemme'],
  [/^Postulate/, 'Postulat'],
  [/^Preface$/, 'Préface'],
  [/^Appendix$/, 'Appendice'],
  [/^Caput/, 'Chapitre'],
  [/^Affect/, 'Définition']
];

/** A passage's heading in the reading language. */
export const formatLocalizedLabel = (
  element: Pick<SpinozaElement, 'id' | 'type' | 'number' | 'heading'>,
  language: Language
): string => {
  const label = formatElementLabel(element);
  const rule = language === 'french' ? FRENCH_LABEL_WORDS.find(([pattern]) => pattern.test(label)) : undefined;
  return rule ? label.replace(rule[0], rule[1]) : label;
};

export const getLocalizedSectionLabel = (sectionKind: string, language: Language): string =>
  (language === 'french' ? FRENCH_SECTION_LABELS[sectionKind] : undefined) ?? getSectionLabel(sectionKind);

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

export const stripFootnoteMarkers = (text: string): string => text.replace(/\[\d+\]/g, '');

const romanOf = (digits: string): string => toRoman(Number.parseInt(digits, 10));

const SUFFIX_LABELS: Record<string, string> = {
  corollary: 'Corollary',
  note: 'Note',
  explanation: 'Explanation'
};

const formatReferenceSuffix = (segment: string): string => {
  const match = segment.match(/^(proof|corollary|note|explanation)(\d*)$/);

  if (!match) {
    return humanizeToken(segment);
  }

  const [, kind, digits] = match;

  if (kind === 'proof') {
    return digits ? 'Alternate Proof' : 'Proof';
  }

  return digits ? `${SUFFIX_LABELS[kind]} ${romanOf(digits)}` : SUFFIX_LABELS[kind];
};

/** A label that names a passage from anywhere in the book, such as "I, Prop. XXV, Corollary". */
export const formatPassageReference = (id: string): string => {
  const [part, kind, number, ...rest] = id.split('.');

  const base = (() => {
    switch (kind) {
      case 'prop':
        return `Prop. ${romanOf(number)}`;
      case 'def':
        return `Def. ${romanOf(number)}`;
      case 'ax':
        return `Ax. ${romanOf(number)}`;
      case 'post':
        return `Post. ${romanOf(number)}`;
      case 'lemma':
        return `Lemma ${romanOf(number)}`;
      case 'phys_ax':
        return `Physical Ax. ${romanOf(number)}`;
      case 'phys_ax2':
        return `Ax. ${romanOf(number)} after Lemma III`;
      case 'phys_def':
        return 'Def. after Lemma III';
      case 'affect':
        return `Def. of the Emotions ${romanOf(number)}`;
      case 'general_definition':
        return 'General Def. of the Emotions';
      case 'preface':
        return 'Preface';
      case 'appendix':
        return number === 'chapter' ? `Appendix ${romanOf(rest[0])}` : 'Appendix';
      default:
        return id;
    }
  })();

  const suffixes = kind === 'prop' || kind === 'def' || kind === 'ax' || kind === 'post' || kind === 'lemma' || kind === 'affect' ? rest : [];
  return [part, base, ...suffixes.map(formatReferenceSuffix)].join(', ');
};

const missingTextMessage = (language: Language, { isEditorial }: Pick<SpinozaElement, 'isEditorial'>): string => {
  if (language === 'english') {
    return 'This passage is missing from the English source text. Choose French or Latin to read it.';
  }

  if (isEditorial) {
    return `This note was added by the English edition and has no separate ${language === 'french' ? 'French' : 'Latin'} passage.`;
  }

  return `${language === 'french' ? 'French' : 'Latin'} text is not available for this passage.`;
};

export interface PassageText {
  text: string;
  /** False when the text is an explanation, in English, of why the passage is missing. */
  available: boolean;
  footnotes?: Footnote[];
}

/** A passage's text in one language, or a message saying why there is none. */
export const getPassageText = (element: SpinozaElement, language: Language): PassageText => {
  const text = { english: element.text, french: element.frenchText, latin: element.latinText }[language];
  const footnotes = { english: element.footnotes, french: element.frenchFootnotes, latin: undefined }[language];
  return text ? { text, available: true, footnotes } : { text: missingTextMessage(language, element), available: false };
};

// So "ame" finds "âme", and a typed apostrophe finds the book's curly one.
const normalizeForSearch = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/’/g, "'")
    .replace(/\u00a0/g, ' ')
    .toLowerCase();

export const matchesQuery = (element: SpinozaElement, query: string): boolean => {
  const normalizedQuery = normalizeForSearch(query.trim());

  if (!normalizedQuery) {
    return true;
  }

  return [element.text, element.latinText, element.frenchText, element.canonicalLabel ?? formatElementLabel(element), element.heading, element.id]
    .filter(Boolean)
    .some(value => normalizeForSearch(value!).includes(normalizedQuery));
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

const typeFromId = (id: string): SpinozaElement['type'] =>
  /\.proof\d*$/.test(id) ? 'proof' : /\.corollary\d*$/.test(id) ? 'corollary' : 'note';

/**
 * Adds the French text. A few passages exist only in the French and Latin; they join the
 * book under their parent, before its notes, where the printed editions have them.
 */
export const mergeFrenchText = (
  elements: Map<string, SpinozaElement>,
  frenchById: Record<string, string>,
  footnotesById: Record<string, Footnote[]> = {}
): Map<string, SpinozaElement> => {
  const merged = new Map<string, SpinozaElement>();

  elements.forEach((element, id) => {
    merged.set(id, {
      ...element,
      frenchText: frenchById[id]?.trim() || undefined,
      frenchFootnotes: footnotesById[id]
    });
  });

  Object.entries(frenchById)
    .filter(([id]) => !elements.has(id))
    .forEach(([id, text]) => {
      const parentId = id.slice(0, id.lastIndexOf('.'));
      const parent = elements.get(parentId);

      if (!parent) {
        return;
      }

      const siblings = [...elements.values()]
        .filter(element => element.parentId === parentId)
        .sort((left, right) => left.sortIndex - right.sortIndex);
      const firstNote = siblings.find(element => element.type === 'note');

      merged.set(id, {
        id,
        type: typeFromId(id),
        text: '',
        frenchText: text.trim(),
        parentId,
        sectionKind: parent.sectionKind,
        partNumber: parent.partNumber,
        partNumeral: parent.partNumeral,
        sortIndex: firstNote ? firstNote.sortIndex - 0.5 : (siblings.at(-1) ?? parent).sortIndex + 0.5
      });
    });

  return merged;
};

export const summarizeSections = (elements: SpinozaElement[], language: Language = 'english'): ReaderSectionSummary[] => {
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
    label: getLocalizedSectionLabel(kind, language)
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
