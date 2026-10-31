#!/usr/bin/env node

import fs from 'fs';
import https from 'https';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const CACHE_DIR = path.join(ROOT, '.cache', 'latin');
const PARTS = [1, 2, 3, 4, 5];

// Passages Elwes separates that sit inside the preceding paragraph in the Latin.
const INLINE_LATIN_SPLITS = {
  'III.def.3.note': { from: 'III.def.3', marker: 'Si itaque alicujus' },
  'III.post.1.note': { from: 'III.post.1', marker: 'Hoc postulatum seu axioma' }
};

// Elwes labels this a corollary, but the Latin has it as a scholium.
const LATIN_NOTE_FOR_COROLLARY = new Set(['IV.prop.10.corollary']);

// Latin blocks with no English passage of their own, reviewed by hand. Any other
// skipped block means the alignment has lost text, so generation fails.
const EXPECTED_SKIPPED_LATIN = [
  // These three are missing from the English source text, so no passage can hold them.
  { before: 'II.prop.13.note', label: 'COROLLARIUM' },
  { before: 'IV.prop.50.note', label: 'COROLLARIUM' },
  { before: 'IV.prop.72.note', label: 'DEMONSTRATIO' }
];

// Elwes gives this proof inside the proposition: "... its attributes (Def. iv.)."
const LATIN_PROOF_IN_STATEMENT = new Set(['I.prop.9']);

const fetchBuffer = url =>
  new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          }
        },
        response => {
          if (response.statusCode !== 200) {
            response.resume();
            reject(new Error(`GET ${url} returned ${response.statusCode}`));
            return;
          }

          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        }
      )
      .on('error', reject);
  });

const readLatinSource = async partNumber => {
  const fileName = `spinoza.ethica${partNumber}.html`;
  const cachePath = path.join(CACHE_DIR, fileName);

  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath);
  }

  const buffer = await fetchBuffer(`https://www.thelatinlibrary.com/${fileName}`);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, buffer);
  return buffer;
};

const decodeHtmlEntities = value =>
  value
    .replace(/&aelig;/gi, 'ae')
    .replace(/&AElig;/g, 'Ae')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, "'")
    .replace(/&#176;/g, '°')
    .replace(/&#160;/g, ' ')
    .replace(/&#198;/g, 'Ae')
    .replace(/&#230;/g, 'ae');

const cleanLatinParagraphs = async partNumber => {
  const html = (await readLatinSource(partNumber)).toString('latin1');

  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p\b[^>]*>/gi, '\n\n')
    .replace(/<\/?center\b[^>]*>/gi, '\n\n')
    .replace(/<\/?div\b[^>]*>/gi, '\n\n')
    .replace(/<\/?font\b[^>]*>/gi, '')
    .replace(/<\/?i\b[^>]*>/gi, '')
    .replace(/<\/?table\b[^>]*>/gi, '\n\n')
    .replace(/<\/?tr\b[^>]*>/gi, '\n')
    .replace(/<\/?td\b[^>]*>/gi, ' ')
    .replace(/<\/?hr\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');

  const paragraphs = decodeHtmlEntities(stripped)
    .replace(/\r/g, '')
    .split(/\n\s*\n+/)
    .map(paragraph => paragraph.replace(/[ \t]+/g, ' ').replace(/\n+/g, ' ').trim())
    .filter(Boolean)
    .filter(
      paragraph =>
        !/^Spinoza: Ethica/i.test(paragraph) &&
        !/^SPINOZAE ETHICA$/i.test(paragraph) &&
        !/^ORDINE GEOMETRICO DEMONSTRATA$/i.test(paragraph) &&
        !/^ET IN QUINQUE PARTES DISTINCTA$/i.test(paragraph) &&
        !/^Neo-Latin$/i.test(paragraph) &&
        !/^The Latin Library$/i.test(paragraph) &&
        !/^The Classics Homepage$/i.test(paragraph) &&
        !/^Finis /i.test(paragraph)
    );

  return expandMergedParagraphs(paragraphs);
};

const expandMergedParagraphs = paragraphs =>
  paragraphs.flatMap(paragraph => {
    const headingMatch = paragraph.match(
      /^(DEFINITIONES(?: AFFECTUUM)?|AXIOMATA|POSTULATA|PR(?:AE|Æ|E)FATIO)\s+([IVXLCDM]+)\.\s+([\s\S]+)$/i
    );

    if (headingMatch) {
      return [headingMatch[1].toUpperCase(), `${headingMatch[2]}. ${headingMatch[3]}`];
    }

    const reversedEmotionHeadingMatch = paragraph.match(/^AFFECTUUM DEFINITIONES\s+([IVXLCDM]+)\.\s+([\s\S]+)$/i);

    if (reversedEmotionHeadingMatch) {
      return ['DEFINITIONES AFFECTUUM', `${reversedEmotionHeadingMatch[1]}. ${reversedEmotionHeadingMatch[2]}`];
    }

    return [paragraph];
  });

const readEnglishElements = partNumber => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: true,
    trimValues: false
  });

  const filePath = path.join(PUBLIC_DIR, `ethica_${partNumber}.xml`);
  const documentNodes = parser.parse(fs.readFileSync(filePath, 'utf8'));
  const partNode = documentNodes.find(node => getTagName(node) === 'part');

  if (!partNode) {
    return [];
  }

  const elements = [];
  let appendixIndex = 0;

  const addElement = element => {
    if (!element.id || element.editorial) {
      return;
    }

    elements.push(element);
  };

  const processInlineChildren = (node, parentId, sectionKind) => {
    getChildren(node).forEach(child => {
      const tag = getTagName(child);
      const attrs = getAttributes(child);

      if (['proof', 'corollary', 'note', 'explanation'].includes(tag)) {
        addElement({
          id: attrs['@_id'],
          type: tag,
          sectionKind,
          parentId,
          editorial: attrs['@_editorial'] === 'true',
          hasOwnProof: getChildren(child).some(grandchild => getTagName(grandchild) === 'proof')
        });
        processInlineChildren(child, attrs['@_id'], sectionKind);
      }
    });
  };

  const processTextualElement = (node, type, sectionKind) => {
    const attrs = getAttributes(node);

    addElement({
      id: attrs['@_id'],
      type,
      sectionKind,
      number: attrs['@_number'],
      editorial: attrs['@_editorial'] === 'true'
    });

    if (attrs['@_id']) {
      processInlineChildren(node, attrs['@_id'], sectionKind);
    }
  };

  const processAppendixSection = (node, sectionKind, parentId) => {
    appendixIndex += 1;
    const attrs = getAttributes(node);
    addElement({
      id: attrs['@_id'] ?? `${parentId}.argument.${appendixIndex}`,
      type: 'appendix',
      sectionKind,
      heading: attrs['@_topic']
    });
  };

  const processSection = node => {
    const attrs = getAttributes(node);
    const sectionKind = attrs['@_type'] ?? 'section';
    const sectionId = attrs['@_id'] ?? sectionKind;

    if (sectionKind === 'preface') {
      addElement({ id: sectionId, type: 'preface', sectionKind });
      return;
    }

    if (sectionKind === 'appendix') {
      getChildren(node).forEach(child => {
        const tag = getTagName(child);

        if (tag === 'introduction') {
          addElement({
            id: `${sectionId}.introduction`,
            type: 'appendix',
            sectionKind
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

const alignPart = (partNumber, englishElements, latinParagraphs) => {
  const cursor = { index: 0, skipped: [] };
  const aligned = {};

  skipDocumentHeader(latinParagraphs, cursor);

  for (const element of englishElements) {
    if (INLINE_LATIN_SPLITS[element.id]) {
      continue;
    }

    const text = consumeElement(partNumber, element, latinParagraphs, cursor);

    if (text) {
      aligned[element.id] = text;
    }
  }

  applyInlineSplits(aligned, englishElements);

  // Text left after the last aligned element was also never placed.
  while (cursor.index < latinParagraphs.length) {
    cursor.skipped.push({ before: 'end of part', text: latinParagraphs[cursor.index] });
    cursor.index += 1;
  }

  return { aligned, skipped: cursor.skipped };
};

const applyInlineSplits = (aligned, englishElements) => {
  for (const element of englishElements) {
    const split = INLINE_LATIN_SPLITS[element.id];

    if (!split) {
      continue;
    }

    const parentText = aligned[split.from] ?? '';
    const index = parentText.indexOf(split.marker);

    if (index < 0) {
      throw new Error(`Could not find "${split.marker}" in the Latin of ${split.from}`);
    }

    aligned[split.from] = parentText.slice(0, index).trim();
    aligned[element.id] = parentText.slice(index).trim();
  }
};

const skipDocumentHeader = (paragraphs, cursor) => {
  while (cursor.index < paragraphs.length) {
    const current = paragraphs[cursor.index];

    if (/^PARS\b/i.test(current) || isTitleParagraph(current)) {
      cursor.index += 1;
      continue;
    }

    break;
  }
};

const isTitleParagraph = paragraph =>
  /^[A-ZÆŒ\s.;:'-]+$/.test(paragraph) &&
  !/^(DEFINITIONES(?: AFFECTUUM)?|AFFECTUUM DEFINITIONES|AXIOMATA|AXIOMA|POSTULATA|PR(?:AE|Æ|E)FATIO|PROPOSITIO|LEMMA|DEMONSTRATIO|ALITER|COROLLARIUM|SCHOLIUM|EXPLICATIO|APPENDIX|AFFECTUUM GENERALIS DEFINITIO)\b/i.test(
    paragraph
  );

const consumeElement = (partNumber, element, paragraphs, cursor) => {
  skipExpectedSectionHeadings(element, paragraphs, cursor);
  skipUnexpectedSupplementalBlocks(element, paragraphs, cursor);
  skipUnexpectedStructuralBlocks(element, paragraphs, cursor);

  try {
    if (element.type === 'preface') {
      return consumePreface(paragraphs, cursor);
    }

    if (element.type === 'appendix') {
      if (element.id.endsWith('.introduction')) {
        return consumeAppendixIntroduction(paragraphs, cursor);
      }

      if (/\.appendix\.chapter\.\d+$/.test(element.id)) {
        return consumeAppendixChapter(element, paragraphs, cursor);
      }

      return consumeAppendix(paragraphs, cursor, element.id);
    }

    if (element.id === 'III.general_definition.note') {
      return consumeGeneralDefinition(paragraphs, cursor);
    }

    if (/\.phys_def\.\d+$/.test(element.id)) {
      return consumeLabeledBlock(paragraphs, cursor, /^DEFINITIO\s*:?\s*(.*)$/i, element.id);
    }

    if (element.type === 'definition') {
      return consumeDefinition(element, paragraphs, cursor);
    }

    if (element.type === 'axiom') {
      return consumeAxiom(element, paragraphs, cursor);
    }

    if (element.type === 'postulate') {
      return consumeNumberedItem(paragraphs, cursor, 'postulate', element.number);
    }

    if (element.type === 'proposition') {
      const statement = consumeLabeledBlock(paragraphs, cursor, /^PROPOSITIO\s+[IVXLCDM]+\s*:?\s*(.*)$/i, element.id);
      return LATIN_PROOF_IN_STATEMENT.has(element.id) ? appendFollowingProof(statement, paragraphs, cursor, element.id) : statement;
    }

    if (element.type === 'lemma') {
      return consumeLabeledBlock(paragraphs, cursor, /^LEMMA\s+[IVXLCDM]+\s*:?\s*(.*)$/i, element.id);
    }

    if (element.type === 'proof') {
      return consumeOptionalLabeledBlock(paragraphs, cursor, /^(DEMONSTRATIO|ALITER)\s*:?\s*(.*)$/i, element.id, 2);
    }

    if (LATIN_NOTE_FOR_COROLLARY.has(element.id)) {
      return consumeOptionalLabeledBlock(paragraphs, cursor, /^SCHOLIUM(?:\s+[IVXLCDM]+)?\s*:?\s*(.*)$/i, element.id);
    }

    if (element.type === 'corollary') {
      const corollary = consumeOptionalLabeledBlock(
        paragraphs,
        cursor,
        /^COROLLARIUM(?:\s+[IVXLCDM]+)?\s*:?\s*(.*)$/i,
        element.id,
        1,
        isBoundaryExceptAliter
      );
      // Elwes often runs a corollary's demonstration into the corollary itself.
      const withProof = element.hasOwnProof ? corollary : appendFollowingProof(corollary, paragraphs, cursor, element.id);
      return withProof.replace(/^ALITER\s*:?\s*/gim, '');
    }

    if (element.type === 'note') {
      return consumeOptionalLabeledBlock(paragraphs, cursor, /^SCHOLIUM(?:\s+[IVXLCDM]+)?\s*:?\s*(.*)$/i, element.id);
    }

    if (element.type === 'explanation') {
      return consumeOptionalLabeledBlock(paragraphs, cursor, /^EXPLICATIO\s*:?\s*(.*)$/i, element.id);
    }

    throw new Error(`Unsupported element type for ${element.id}`);
  } catch (error) {
    console.warn(`Warning: Part ${partNumber} failed at ${element.id} (${element.type}): ${error.message}`);
    return '';
  }
};

const appendFollowingProof = (text, paragraphs, cursor, elementId) => {
  if (!/^DEMONSTRATIO\b/i.test(paragraphs[cursor.index] ?? '')) {
    return text;
  }

  const proof = consumeLabeledBlock(paragraphs, cursor, /^(DEMONSTRATIO)\s*:?\s*(.*)$/i, elementId, 2);
  return joinParts([text, proof]);
};

const skipUnexpectedSupplementalBlocks = (element, paragraphs, cursor) => {
  while (cursor.index < paragraphs.length) {
    const current = paragraphs[cursor.index] ?? '';
    const currentType = getSupplementalType(current);

    if (!currentType) {
      break;
    }

    if (
      (element.type === 'proof' && currentType === 'proof') ||
      (element.type === 'corollary' && (currentType === 'corollary' || (LATIN_NOTE_FOR_COROLLARY.has(element.id) && currentType === 'note'))) ||
      (element.type === 'note' && currentType === 'note') ||
      (element.type === 'explanation' && currentType === 'explanation')
    ) {
      break;
    }

    cursor.skipped.push({ before: element.id, text: current });
    cursor.index += 1;

    while (cursor.index < paragraphs.length && !isBoundary(paragraphs[cursor.index])) {
      cursor.skipped.push({ before: element.id, text: paragraphs[cursor.index] });
      cursor.index += 1;
    }
  }
};

const skipUnexpectedStructuralBlocks = (element, paragraphs, cursor) => {
  while (cursor.index < paragraphs.length) {
    const current = paragraphs[cursor.index] ?? '';

    if (/^AXIOMA\s+[IVXLCDM]+\b/i.test(current) && element.type !== 'axiom') {
      cursor.skipped.push({ before: element.id, text: current });
      cursor.index += 1;

      while (cursor.index < paragraphs.length && !isBoundary(paragraphs[cursor.index])) {
        cursor.skipped.push({ before: element.id, text: paragraphs[cursor.index] });
        cursor.index += 1;
      }

      continue;
    }

    if (/^DEFINITIO\b/i.test(current) && element.type !== 'definition') {
      cursor.skipped.push({ before: element.id, text: current });
      cursor.index += 1;

      while (cursor.index < paragraphs.length && !isBoundary(paragraphs[cursor.index])) {
        cursor.skipped.push({ before: element.id, text: paragraphs[cursor.index] });
        cursor.index += 1;
      }

      continue;
    }

    break;
  }
};

const getSupplementalType = paragraph => {
  if (/^(DEMONSTRATIO|ALITER)\b/i.test(paragraph)) {
    return 'proof';
  }

  if (/^COROLLARIUM(?:\s+[IVXLCDM]+)?\b/i.test(paragraph)) {
    return 'corollary';
  }

  if (/^SCHOLIUM(?:\s+[IVXLCDM]+)?\b/i.test(paragraph)) {
    return 'note';
  }

  if (/^EXPLICATIO\b/i.test(paragraph)) {
    return 'explanation';
  }

  return null;
};

const skipExpectedSectionHeadings = (element, paragraphs, cursor) => {
  while (cursor.index < paragraphs.length) {
    const current = paragraphs[cursor.index];

    if (element.type === 'preface' && /^PR(?:AE|Æ|E)FATIO$/i.test(current)) {
      cursor.index += 1;
      continue;
    }

    if (
      element.sectionKind === 'definitions' &&
      /^DEFINITIONES$/i.test(current)
    ) {
      cursor.index += 1;
      continue;
    }

    if (
      element.sectionKind === 'definitions_of_emotions' &&
      /^DEFINITIONES AFFECTUUM$/i.test(current)
    ) {
      cursor.index += 1;
      continue;
    }

    if (
      (element.sectionKind === 'axioms' || element.sectionKind === 'physical_axioms') &&
      /^AXIOMATA$/i.test(current)
    ) {
      cursor.index += 1;
      continue;
    }

    if (element.sectionKind === 'postulates' && /^POSTULATA$/i.test(current)) {
      cursor.index += 1;
      continue;
    }

    break;
  }
};

const consumePreface = (paragraphs, cursor) => {
  const parts = [];

  const current = paragraphs[cursor.index] ?? '';
  const inlineHeadingMatch = current.match(/^PR(?:AE|Æ|E)FATIO\s*:?\s*(.*)$/i);

  if (inlineHeadingMatch) {
    parts.push(inlineHeadingMatch[1].trim());
    cursor.index += 1;
  }

  while (cursor.index < paragraphs.length && !isStructuralBoundary(paragraphs[cursor.index])) {
    parts.push(paragraphs[cursor.index]);
    cursor.index += 1;
  }

  return joinParts(parts);
};

const consumeAppendix = (paragraphs, cursor) => {
  if (cursor.index >= paragraphs.length) {
    return '';
  }

  const current = paragraphs[cursor.index];
  const appendixMatch = current.match(/^APPENDIX\s*:?\s*(.*)$/i);

  if (!appendixMatch) {
    throw new Error(`Expected APPENDIX at paragraph ${cursor.index + 1}, found: ${current}`);
  }

  const parts = [appendixMatch[1].trim()].filter(Boolean);
  cursor.index += 1;

  while (cursor.index < paragraphs.length) {
    parts.push(paragraphs[cursor.index]);
    cursor.index += 1;
  }

  return joinParts(parts);
};

const consumeAppendixIntroduction = (paragraphs, cursor) => {
  const current = paragraphs[cursor.index] ?? '';
  const appendixMatch = current.match(/^APPENDIX\s*:?\s*(.*)$/i);

  if (!appendixMatch) {
    throw new Error(`Expected APPENDIX at paragraph ${cursor.index + 1}, found: ${current}`);
  }

  const parts = [appendixMatch[1].trim()].filter(Boolean);
  cursor.index += 1;

  while (cursor.index < paragraphs.length && !/^CAPUT\s+[IVXLCDM]+\s*:?\s*/i.test(paragraphs[cursor.index] ?? '')) {
    parts.push(paragraphs[cursor.index]);
    cursor.index += 1;
  }

  return joinParts(parts);
};

const consumeAppendixChapter = (element, paragraphs, cursor) => {
  const expectedNumber = element.id.split('.').pop();
  const expectedRoman = toRoman(Number(expectedNumber));

  return consumeLabeledBlock(
    paragraphs,
    cursor,
    new RegExp(`^CAPUT\\s+${expectedRoman}\\s*:?\\s*(.*)$`, 'i'),
    element.id
  );
};

const consumeGeneralDefinition = (paragraphs, cursor) => {
  const current = paragraphs[cursor.index] ?? '';

  if (/^AFFECTUUM GENERALIS DEFINITIO$/i.test(current)) {
    cursor.index += 1;
  } else {
    const inlineHeadingMatch = current.match(/^AFFECTUUM GENERALIS DEFINITIO\s*:?\s*(.*)$/i);

    if (inlineHeadingMatch) {
      cursor.index += 1;

      return joinParts([inlineHeadingMatch[1].trim()].filter(Boolean));
    }
  }

  const parts = [];

  while (cursor.index < paragraphs.length && !isStructuralBoundary(paragraphs[cursor.index])) {
    parts.push(paragraphs[cursor.index]);
    cursor.index += 1;
  }

  return joinParts(parts);
};

const consumeDefinition = (element, paragraphs, cursor) => consumeNumberedItem(paragraphs, cursor, 'definition', element.number);

const consumeAxiom = (element, paragraphs, cursor) => {
  const current = paragraphs[cursor.index] ?? '';
  const labelled = /^AXIOMA(?:TA)?(?:\s+[IVXLCDM]+)?\s*:?\s*(.*)$/i;

  if (labelled.test(current)) {
    return consumeLabeledBlock(paragraphs, cursor, labelled, element.id);
  }

  return consumeNumberedItem(paragraphs, cursor, 'axiom', element.number);
};

const consumeNumberedItem = (paragraphs, cursor, label, expectedNumber) => {
  const current = paragraphs[cursor.index] ?? '';
  const match = current.match(/^([IVXLCDM]+)\.\s*(.*)$/i);

  if (!match) {
    throw new Error(`Expected numbered ${label} at paragraph ${cursor.index + 1}, found: ${current}`);
  }

  if (expectedNumber) {
    const expectedRoman = toRoman(Number(expectedNumber));

    if (match[1].toUpperCase() !== expectedRoman) {
      throw new Error(
        `Expected ${label} ${expectedRoman} at paragraph ${cursor.index + 1}, found ${match[1].toUpperCase()}: ${current}`
      );
    }
  }

  const parts = [match[2].trim()].filter(Boolean);
  cursor.index += 1;

  while (cursor.index < paragraphs.length && !isBoundary(paragraphs[cursor.index])) {
    parts.push(paragraphs[cursor.index]);
    cursor.index += 1;
  }

  return joinParts(parts);
};

const consumeLabeledBlock = (paragraphs, cursor, regex, elementId, valueIndex = 1, boundaryFn = isBoundary) => {
  const current = paragraphs[cursor.index] ?? '';
  const match = current.match(regex);

  if (!match) {
    throw new Error(`Expected block for ${elementId} at paragraph ${cursor.index + 1}, found: ${current}`);
  }

  const parts = [match[valueIndex].trim()].filter(Boolean);
  cursor.index += 1;

  while (cursor.index < paragraphs.length && !boundaryFn(paragraphs[cursor.index])) {
    parts.push(paragraphs[cursor.index]);
    cursor.index += 1;
  }

  return joinParts(parts);
};

const consumeOptionalLabeledBlock = (paragraphs, cursor, regex, elementId, valueIndex = 1, boundaryFn = isBoundary) => {
  const current = paragraphs[cursor.index] ?? '';

  if (!current.match(regex)) {
    if (isBoundary(current) || isStructuralBoundary(current)) {
      return '';
    }
  }

  return consumeLabeledBlock(paragraphs, cursor, regex, elementId, valueIndex, boundaryFn);
};

const isStructuralBoundary = paragraph =>
  /^(DEFINITIONES(?: AFFECTUUM)?|DEFINITIO\b|AFFECTUUM DEFINITIONES|AXIOMATA|AXIOMA(?:\s+[IVXLCDM]+)?|POSTULATA|PROPOSITIO\s+[IVXLCDM]+|LEMMA\s+[IVXLCDM]+|APPENDIX|AFFECTUUM GENERALIS DEFINITIO)(?:\b|:)/i.test(
    paragraph
  );

const isBoundary = paragraph =>
  /^(DEFINITIONES(?: AFFECTUUM)?|DEFINITIO\b|AFFECTUUM DEFINITIONES|AXIOMATA|AXIOMA(?:\s+[IVXLCDM]+)?|POSTULATA|PROPOSITIO\s+[IVXLCDM]+|LEMMA\s+[IVXLCDM]+|DEMONSTRATIO|ALITER|COROLLARIUM(?:\s+[IVXLCDM]+)?|SCHOLIUM(?:\s+[IVXLCDM]+)?|EXPLICATIO|APPENDIX|CAPUT\s+[IVXLCDM]+|AFFECTUUM GENERALIS DEFINITIO|[IVXLCDM]+\.)/i.test(
    paragraph
  );

const isBoundaryExceptAliter = paragraph =>
  /^(DEFINITIONES(?: AFFECTUUM)?|DEFINITIO\b|AFFECTUUM DEFINITIONES|AXIOMATA|AXIOMA(?:\s+[IVXLCDM]+)?|POSTULATA|PROPOSITIO\s+[IVXLCDM]+|LEMMA\s+[IVXLCDM]+|DEMONSTRATIO|COROLLARIUM(?:\s+[IVXLCDM]+)?|SCHOLIUM(?:\s+[IVXLCDM]+)?|EXPLICATIO|APPENDIX|CAPUT\s+[IVXLCDM]+|AFFECTUUM GENERALIS DEFINITIO|[IVXLCDM]+\.)/i.test(
    paragraph
  );

const joinParts = parts =>
  parts
    .map(part => part.trim())
    .filter(Boolean)
    .join('\n\n');

const toRoman = number => {
  const numerals = [
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
  ];

  let remaining = Number(number);
  let result = '';

  for (const [value, symbol] of numerals) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }

  return result;
};

const getTagName = node => Object.keys(node).find(key => key !== ':@') ?? '';
const getChildren = node => {
  const tag = getTagName(node);
  const value = node[tag];
  return Array.isArray(value) ? value : [];
};
const getAttributes = node => node[':@'] ?? {};

const main = async () => {
  for (const partNumber of PARTS) {
    const englishElements = readEnglishElements(partNumber);
    const latinParagraphs = await cleanLatinParagraphs(partNumber);
    const { aligned, skipped } = alignPart(partNumber, englishElements, latinParagraphs);
    const unexpected = skipped.filter(
      block => !EXPECTED_SKIPPED_LATIN.some(entry => entry.before === block.before && block.text.startsWith(entry.label))
    );

    if (unexpected.length) {
      throw new Error(
        `Latin text was not placed in Part ${partNumber}:\n${unexpected
          .map(block => `  before ${block.before}: ${block.text.slice(0, 120)}`)
          .join('\n')}`
      );
    }

    const missing = englishElements
      .map(element => element.id)
      .filter(id => !Object.prototype.hasOwnProperty.call(aligned, id));

    if (missing.length) {
      throw new Error(`Latin structural alignment failed for Part ${partNumber}. Missing ids: ${missing.join(', ')}`);
    }

    fs.writeFileSync(
      path.join(PUBLIC_DIR, `ethica_la_${partNumber}.json`),
      JSON.stringify(
        {
          language: 'la',
          part: partNumber,
          elements: aligned
        },
        null,
        2
      ) + '\n'
    );

    console.log(`Generated Latin alignment for Part ${partNumber}: ${Object.keys(aligned).length} passages.`);
  }
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
