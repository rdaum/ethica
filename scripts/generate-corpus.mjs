#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

const ROOT = process.cwd();
const RAW_TEXT_PATH = path.join(ROOT, 'ethica.txt');
const PUBLIC_DIR = path.join(ROOT, 'public');

const PARTS = {
  I: {
    number: 1,
    title: 'CONCERNING GOD'
  },
  II: {
    number: 2,
    title: 'ON THE NATURE AND ORIGIN OF THE MIND'
  },
  III: {
    number: 3,
    title: 'ON THE ORIGIN AND NATURE OF THE EMOTIONS'
  },
  IV: {
    number: 4,
    title: 'Of Human Bondage, or the Strength of the Emotions'
  },
  V: {
    number: 5,
    title: 'Of the Power of the Understanding, or of Human Freedom'
  }
};

const PART_NUMERALS = ['I', 'II', 'III', 'IV', 'V'];

const GENERATED_RULES = `
@prefix ethics: <http://spinoza.org/ethics#> .

{ ?x ethics:cites ?y } => { ?x ethics:dependsUpon ?y } .
{ ?x ethics:provedBy ?y } => { ?x ethics:dependsUpon ?y } .
{ ?x ethics:hasCorollary ?y } => { ?y ethics:derivedFrom ?x } .
{ ?x ethics:hasNote ?y } => { ?y ethics:explainsElement ?x } .
{ ?x ethics:dependsUpon ?y . ?y ethics:dependsUpon ?z } => { ?x ethics:transitivelyDependsOn ?z } .
{ ?x ethics:cites ?y . ?y ethics:cites ?z } => { ?x ethics:transitivelyDependsOn ?z } .
`.trim();

const main = async () => {
  const rawText = fs.readFileSync(RAW_TEXT_PATH, 'utf8').replace(/\r\n/g, '\n');
  const generatedParts = parseAllParts(rawText);

  generatedParts.forEach(part => {
    const xml = renderPartXml(part);
    fs.writeFileSync(path.join(PUBLIC_DIR, `ethica_${part.number}.xml`), xml);
  });

  const corpusParts = [1, 2, 3, 4, 5].flatMap(partNumber =>
    parseXmlFile(path.join(PUBLIC_DIR, `ethica_${partNumber}.xml`), partNumber)
  );

  const explicitGraph = buildExplicitGraph(corpusParts).join('\n');
  fs.writeFileSync(path.join(PUBLIC_DIR, 'ethica-logic.n3'), explicitGraph);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'ethica-logic-eye.n3'), `${explicitGraph}\n\n${GENERATED_RULES}\n`);

  console.log('Generated Parts I-V XML and regenerated graph data for Parts I-V.');
};

const parseAllParts = rawText => {
  const partHeadingRegex = /^PART\s+(I|II|III|IV|V)[.:](?:\s+(.*))?$/gm;
  const partStarts = [...rawText.matchAll(partHeadingRegex)].map(match => ({
    numeral: match[1],
    heading: match[0],
    index: match.index,
    inlineTitle: match[2]?.trim() || ''
  }));

  const corpusEnd = rawText.indexOf('End of the Ethics by Benedict de Spinoza');

  return partStarts.map((part, index) => {
    const nextStart = index < partStarts.length - 1 ? partStarts[index + 1].index : corpusEnd;
    const segment = rawText.slice(part.index, nextStart).trim();
    return parsePartSegment(part.numeral, segment, part.inlineTitle);
  });
};

const parsePartSegment = (numeral, segment, inlineTitle = '') => {
  const metadata = PARTS[numeral];
  const lines = segment.split('\n').map(line => line.trimEnd());

  lines.shift();
  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }

  let title = inlineTitle;
  if (!title && lines.length && !isSectionHeading(lines[0] ?? '') && !/^PROP\.\s+[IVXLCDM]+\./.test(lines[0] ?? '')) {
    title = lines.shift()?.trim() || '';
  }
  if (!title) {
    title = metadata.title;
  }

  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }
  const sections = [];

  if (numeral === 'II') {
    if ((lines[0] ?? '').trim() === title) {
      lines.shift();
      while (lines.length && !lines[0].trim()) {
        lines.shift();
      }
    }
    if (normalizeHeading(lines[0] ?? '') === 'PREFACE') {
      lines.shift();
    }
    sections.push({
      type: 'preface',
      id: `${numeral}.preface`,
      text: paragraphsFromLines(collectUntilNextSection(lines, 'PREFACE')).join('\n\n')
    });
  }

  if (numeral === 'III') {
    const prefaceLines = collectUntilHeading(lines, 'DEFINITIONS', false);
    sections.push({
      type: 'preface',
      id: `${numeral}.preface`,
      text: paragraphsFromLines(prefaceLines).join('\n\n')
    });
  }

  while (lines.length) {
    const heading = lines.shift()?.trim();
    if (!heading) {
      continue;
    }

    if (/^PROP\.\s+[IVXLCDM]+\./.test(heading)) {
      const sectionLines = [heading, ...collectUntilNextSection(lines, 'PROPOSITIONS')];
      sections.push(parseSection(numeral, 'PROPOSITIONS', sectionLines));
      continue;
    }

    if (!isSectionHeading(heading)) {
      continue;
    }

    const sectionLines = collectUntilNextSection(lines, normalizeHeading(heading));
    sections.push(parseSection(numeral, heading, sectionLines));
  }

  return {
    numeral,
    number: metadata.number,
    title,
    sections
  };
};

const parseSection = (numeral, heading, lines) => {
  const normalizedHeading = normalizeHeading(heading);

  if (normalizedHeading === 'PREFACE') {
    return {
      type: 'preface',
      id: `${numeral}.preface`,
      text: paragraphsFromLines(lines).join('\n\n')
    };
  }

  if (normalizedHeading === 'APPENDIX') {
    return parseAppendixSection(numeral, lines);
  }

  if (normalizedHeading === 'GENERAL DEFINITION OF THE EMOTIONS') {
    return {
      type: 'general_definition',
      id: `${numeral}.general_definition`,
      note: {
        id: `${numeral}.general_definition.note`,
        text: paragraphsFromLines(lines).join('\n\n')
      }
    };
  }

  if (normalizedHeading === 'DEFINITIONS OF THE EMOTIONS') {
    return {
      type: 'definitions_of_emotions',
      id: `${numeral}.definitions_of_emotions`,
      items: parseNumberedItems(numeral, 'affect', lines, {
        itemTag: 'def',
        sectionType: 'definitions_of_emotions',
        markerRegex: /^(?:DEFINITION\s+)?([IVXLCDM]+)\.\s*(.*)$/i
      })
    };
  }

  if (normalizedHeading === 'DEFINITIONS') {
    return {
      type: 'definitions',
      id: `${numeral}.definitions`,
      items: parseNumberedItems(numeral, 'def', lines, {
        itemTag: 'def',
        sectionType: 'definitions',
        markerRegex: /^(?:DEFINITION\s+)?([IVXLCDM]+)\.\s*(.*)$/i
      })
    };
  }

  if (normalizedHeading === 'AXIOMS' || normalizedHeading === 'AXIOM') {
    return {
      type: 'axioms',
      id: `${numeral}.axioms`,
      items: parseNumberedItems(numeral, 'ax', lines, {
        itemTag: 'axiom',
        sectionType: 'axioms',
        allowImplicitFirst: true
      })
    };
  }

  if (normalizedHeading === 'POSTULATES') {
    return {
      type: 'postulates',
      id: `${numeral}.postulates`,
      items: parseNumberedItems(numeral, 'post', lines, {
        itemTag: 'postulate',
        sectionType: 'postulates'
      })
    };
  }

  if (normalizedHeading === 'PROPOSITIONS') {
    return {
      type: 'propositions',
      id: `${numeral}.propositions`,
      items: parsePropositionsSection(numeral, lines)
    };
  }

  return {
    type: humanizeHeading(normalizedHeading).toLowerCase().replace(/\s+/g, '_'),
    id: `${numeral}.${humanizeHeading(normalizedHeading).toLowerCase().replace(/\s+/g, '_')}`,
    text: paragraphsFromLines(lines).join('\n\n')
  };
};

const parseAppendixSection = (numeral, lines) => {
  const paragraphs = paragraphsFromLines(lines);
  const entries = splitRomanBlocks(paragraphs);

  if (entries.length === 0) {
    return {
      type: 'appendix',
      id: `${numeral}.appendix`,
      introduction: paragraphs.join('\n\n'),
      entries: []
    };
  }

  const intro = entries[0].number ? [] : entries.shift().paragraphs;

  return {
    type: 'appendix',
    id: `${numeral}.appendix`,
    introduction: intro.join('\n\n'),
    entries: entries.map(entry => ({
      id: `${numeral}.appendix.section.${romanToNumber(entry.number) ?? entry.number.toLowerCase()}`,
      heading: `Appendix ${entry.number}`,
      text: entry.paragraphs.join('\n\n')
    }))
  };
};

const parseNumberedItems = (numeral, prefix, lines, options) => {
  const paragraphs = paragraphsFromLines(lines);
  const blocks = splitNumberedBlocks(paragraphs, {
    markerRegex: options.markerRegex,
    allowImplicitFirst: options.allowImplicitFirst
  });

  return blocks.map((block, index) => {
    const number = block.number ? String(romanToNumber(block.number)) : String(index + 1);
    const id = `${numeral}.${prefix}.${number}`;
    const { text, children } = splitChildren(block.paragraphs, id, options.sectionType, options.itemTag === 'def');

    return {
      tag: options.itemTag,
      id,
      number,
      text,
      children
    };
  });
};

const parsePropositionsSection = (numeral, lines) => {
  const paragraphs = paragraphsFromLines(lines);
  const items = [];
  let index = 0;

  while (index < paragraphs.length) {
    const paragraph = paragraphs[index];

    if (/^PROP\.\s+[IVXLCDM]+\./.test(paragraph)) {
      const match = paragraph.match(/^PROP\.\s+([IVXLCDM]+)\.\s*(.*)$/);
      const block = [match[2].trim()];
      index += 1;

      while (
        index < paragraphs.length &&
        !/^PROP\.\s+[IVXLCDM]+\./.test(paragraphs[index]) &&
        !/^LEMMA\s+[IVXLCDM]+\./.test(paragraphs[index]) &&
        !/^AXIOM\s+[IVXLCDM]+\./.test(paragraphs[index]) &&
        !/^POSTULATES?$/i.test(paragraphs[index])
      ) {
        block.push(paragraphs[index]);
        index += 1;
      }

      const number = String(romanToNumber(match[1]));
      const id = `${numeral}.prop.${number}`;
      const { text, children } = splitChildren(block, id, 'propositions', false);
      items.push({ kind: 'prop', id, number, text, children });
      continue;
    }

    if (/^AXIOM\s+[IVXLCDM]+\./.test(paragraph)) {
      const physicalAxioms = [];
      while (index < paragraphs.length && /^AXIOM\s+[IVXLCDM]+\./.test(paragraphs[index])) {
        const match = paragraphs[index].match(/^AXIOM\s+([IVXLCDM]+)\.\s*(.*)$/);
        physicalAxioms.push({
          tag: 'axiom',
          id: `${numeral}.phys_ax.${romanToNumber(match[1])}`,
          number: String(romanToNumber(match[1])),
          text: match[2].trim(),
          children: []
        });
        index += 1;
      }
      items.push({ kind: 'section', type: 'physical_axioms', id: `${numeral}.physical_axioms`, items: physicalAxioms });
      continue;
    }

    if (/^LEMMA\s+[IVXLCDM]+\./.test(paragraph)) {
      const lemmas = [];
      while (index < paragraphs.length && /^LEMMA\s+[IVXLCDM]+\./.test(paragraphs[index])) {
        const match = paragraphs[index].match(/^LEMMA\s+([IVXLCDM]+)\.\s*(.*)$/);
        const block = [match[2].trim()];
        index += 1;

        while (
          index < paragraphs.length &&
          !/^PROP\.\s+[IVXLCDM]+\./.test(paragraphs[index]) &&
          !/^LEMMA\s+[IVXLCDM]+\./.test(paragraphs[index]) &&
          !/^POSTULATES$/i.test(paragraphs[index])
        ) {
          block.push(paragraphs[index]);
          index += 1;
        }

        const number = String(romanToNumber(match[1]));
        const id = `${numeral}.lemma.${number}`;
        const { text, children } = splitChildren(block, id, 'lemmas', false);
        lemmas.push({ tag: 'lemma', id, number, text, children });
      }
      items.push({ kind: 'section', type: 'lemmas', id: `${numeral}.lemmas`, items: lemmas });
      continue;
    }

    if (/^POSTULATES$/i.test(paragraph)) {
      const postulateParagraphs = paragraphs.slice(index + 1);
      const postulates = parseNumberedItems(numeral, 'post', postulateParagraphs, {
        itemTag: 'postulate',
        sectionType: 'postulates'
      });
      items.push({ kind: 'section', type: 'postulates', id: `${numeral}.postulates`, items: postulates });
      break;
    }

    index += 1;
  }

  return items;
};

const splitChildren = (paragraphs, parentId, sectionType, allowExplanation) => {
  const textParts = [];
  const children = [];
  let currentChild = null;
  let proofCount = 0;
  let corollaryCount = 0;
  let noteCount = 0;
  let explanationCount = 0;

  const pushCurrent = () => {
    if (currentChild) {
      currentChild.text = currentChild.text.join('\n\n').trim();
      children.push(currentChild);
      currentChild = null;
    }
  };

  paragraphs.forEach(paragraph => {
    const proofMatch = paragraph.match(/^(Proof|Another proof)\.(?:—|-)?\s*(.*)$/i);
    const corollaryMatch = paragraph.match(/^Corollary(?:\s+([IVXLCDM]+))?\.(?:—|-)?\s*(.*)$/i);
    const noteMatch = paragraph.match(/^Note(?:\s+([IVXLCDM]+))?\.(?:—|-)?\s*(.*)$/i);
    const explanationMatch = paragraph.match(/^Explanation\.(?:—|-)?\s*(.*)$/i) || paragraph.match(/^Explanation(?:—|-)\s*(.*)$/i);
    const nbMatch = paragraph.match(/^N\.B\.\s*(.*)$/i);

    if (proofMatch) {
      pushCurrent();
      proofCount += 1;
      currentChild = {
        type: 'proof',
        id: proofCount === 1 ? `${parentId}.proof` : `${parentId}.proof${proofCount}`,
        text: [proofMatch[2].trim()]
      };
      return;
    }

    if (corollaryMatch) {
      pushCurrent();
      corollaryCount += 1;
      const suffix = corollaryMatch[1] ? romanToNumber(corollaryMatch[1]) : corollaryCount > 1 ? corollaryCount : '';
      currentChild = {
        type: 'corollary',
        id: suffix ? `${parentId}.corollary${suffix}` : `${parentId}.corollary`,
        text: [corollaryMatch[2].trim()]
      };
      return;
    }

    if (noteMatch || nbMatch) {
      pushCurrent();
      noteCount += 1;
      const numeral = noteMatch?.[1] ? romanToNumber(noteMatch[1]) : noteCount > 1 ? noteCount : '';
      currentChild = {
        type: 'note',
        id: numeral ? `${parentId}.note${numeral}` : `${parentId}.note`,
        text: [(noteMatch?.[2] ?? nbMatch?.[1] ?? '').trim()]
      };
      return;
    }

    if (allowExplanation && explanationMatch) {
      pushCurrent();
      explanationCount += 1;
      currentChild = {
        type: 'explanation',
        id: explanationCount === 1 ? `${parentId}.explanation` : `${parentId}.explanation${explanationCount}`,
        text: [explanationMatch[1].trim()]
      };
      return;
    }

    if (currentChild) {
      currentChild.text.push(paragraph.trim());
      return;
    }

    textParts.push(paragraph.trim());
  });

  pushCurrent();

  return {
    text: textParts.join('\n\n').trim(),
    children
  };
};

const paragraphsFromLines = lines => {
  const paragraphs = [];
  let current = [];

  lines.forEach(line => {
    const trimmed = line.trim();

    if (!trimmed) {
      if (current.length) {
        paragraphs.push(current.join(' ').replace(/\s+/g, ' ').trim());
        current = [];
      }
      return;
    }

    current.push(trimmed);
  });

  if (current.length) {
    paragraphs.push(current.join(' ').replace(/\s+/g, ' ').trim());
  }

  return paragraphs;
};

const splitRomanBlocks = (paragraphs, allowImplicitFirst = false) => {
  return splitNumberedBlocks(paragraphs, {
    markerRegex: /^([IVXLCDM]+)\.\s*(.*)$/i,
    allowImplicitFirst
  });
};

const splitNumberedBlocks = (paragraphs, options = {}) => {
  const blocks = [];
  let current = null;
  const markerRegex = options.markerRegex ?? /^([IVXLCDM]+)\.\s*(.*)$/i;
  const allowImplicitFirst = options.allowImplicitFirst ?? false;

  paragraphs.forEach((paragraph, index) => {
    const match = paragraph.match(markerRegex);

    if (match) {
      if (current) {
        blocks.push(current);
      }
      current = {
        number: match[1],
        paragraphs: [match[2].trim()]
      };
      return;
    }

    if (!current) {
      if (allowImplicitFirst && index === 0) {
        current = {
          number: 'I',
          paragraphs: [paragraph.trim()]
        };
      } else {
        current = {
          number: null,
          paragraphs: [paragraph.trim()]
        };
      }
      return;
    }

    current.paragraphs.push(paragraph.trim());
  });

  if (current) {
    blocks.push(current);
  }

  return blocks;
};

const collectUntilHeading = (lines, heading, consumeHeading = true) => {
  const collected = [];
  while (lines.length && normalizeHeading(lines[0]) !== heading) {
    collected.push(lines.shift());
  }
  if (consumeHeading && lines.length && normalizeHeading(lines[0]) === heading) {
    lines.shift();
  }
  return collected;
};

const collectUntilNextSection = (lines, currentHeading) => {
  const collected = [];
  while (
    lines.length &&
    !isSectionHeading(lines[0].trim()) &&
    !(currentHeading !== 'PROPOSITIONS' && /^PROP\.\s+[IVXLCDM]+\./.test(lines[0].trim()))
  ) {
    collected.push(lines.shift());
  }
  return collected;
};

const isSectionHeading = line => {
  const heading = normalizeHeading(line);
  return [
    'PREFACE',
    'DEFINITIONS',
    'AXIOMS',
    'AXIOM',
    'PROPOSITIONS',
    'POSTULATES',
    'APPENDIX',
    'DEFINITIONS OF THE EMOTIONS',
    'GENERAL DEFINITION OF THE EMOTIONS'
  ].includes(heading);
};

const normalizeHeading = value => value.replace(/[.:]+$/g, '').trim().toUpperCase();

const humanizeHeading = value => value.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());

const romanToNumber = value => {
  const digits = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let previous = 0;
  const normalized = value.toUpperCase();

  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const current = digits[normalized[index]];
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

const renderPartXml = part => {
  const sections = part.sections.map(section => renderSection(section)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<part id="${part.numeral}" number="${part.number}" title="${escapeXml(
    part.title
  )}">\n${sections}\n</part>\n`;
};

const renderSection = section => {
  if (section.type === 'preface') {
    return `  <section type="preface" id="${section.id}">\n    <text>${escapeXml(section.text)}</text>\n  </section>`;
  }

  if (section.type === 'appendix') {
    const intro = section.introduction
      ? `    <introduction id="${section.id}.introduction">\n      <text>${escapeXml(section.introduction)}</text>\n    </introduction>\n`
      : '';
    const entries = section.entries
      .map(
        entry =>
          `    <section type="argument" topic="${entry.id.split('.').pop()}">\n      <text>${escapeXml(entry.text)}</text>\n    </section>`
      )
      .join('\n');
    return `  <section type="appendix" id="${section.id}">\n${intro}${entries ? `${entries}\n` : ''}  </section>`;
  }

  if (section.type === 'general_definition') {
    return `  <section type="general_definition" id="${section.id}">\n    <note id="${section.note.id}">\n      <text>${escapeXml(
      section.note.text
    )}</text>\n    </note>\n  </section>`;
  }

  if (section.items) {
    const tagMap = {
      definitions: 'def',
      definitions_of_emotions: 'def',
      axioms: 'axiom',
      postulates: 'postulate'
    };

    if (section.type === 'propositions') {
      return `  <section type="propositions" id="${section.id}">\n${section.items
        .map(item => renderPropositionItem(item))
        .join('\n')}\n  </section>`;
    }

    const tag = tagMap[section.type];
    return `  <section type="${section.type}" id="${section.id}">\n${section.items
      .map(item => renderSimpleItem(tag, item))
      .join('\n')}\n  </section>`;
  }

  return `  <section type="${section.type}" id="${section.id}">\n    <text>${escapeXml(section.text ?? '')}</text>\n  </section>`;
};

const renderPropositionItem = item => {
  if (item.kind === 'section') {
    const tag = item.type === 'lemmas' ? 'lemma' : item.type === 'physical_axioms' ? 'axiom' : 'postulate';
    return `    <section type="${item.type}" id="${item.id}">\n${item.items
      .map(child => renderSimpleItem(tag, child, 6))
      .join('\n')}\n    </section>`;
  }

  const tag = item.kind === 'prop' ? 'prop' : 'lemma';
  return renderSimpleItem(tag, item, 4);
};

const renderSimpleItem = (tag, item, indent = 4) => {
  const spacing = ' '.repeat(indent);
  const children = item.children?.map(child => renderChild(child, indent + 2)).join('\n') ?? '';
  return `${spacing}<${tag} id="${item.id}" number="${item.number}">\n${spacing}  <text>${escapeXml(item.text)}</text>${
    children ? `\n${children}` : ''
  }\n${spacing}</${tag}>`;
};

const renderChild = (child, indent) => {
  const spacing = ' '.repeat(indent);
  return `${spacing}<${child.type} id="${child.id}">\n${spacing}  <text>${escapeXml(child.text)}</text>\n${spacing}</${child.type}>`;
};

const escapeXml = value =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const parseXmlFile = (filePath, partNumber) => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: true,
    trimValues: false
  });
  const nodes = parser.parse(fs.readFileSync(filePath, 'utf8'));
  const partNode = nodes.find(node => Object.keys(node).includes('part'));
  if (!partNode) {
    return [];
  }
  const partChildren = partNode.part;
  const entries = [];

  const walk = (children, sectionKind = '') => {
    for (const node of children) {
      const tag = Object.keys(node).find(key => key !== ':@');
      const attrs = node[':@'] ?? {};
      const content = node[tag] ?? [];

      if (tag === 'section') {
        walk(content, attrs['@_type'] ?? sectionKind);
      }

      if (['def', 'axiom', 'postulate', 'prop', 'lemma', 'proof', 'corollary', 'note', 'explanation', 'introduction'].includes(tag)) {
        const text = collectText(content);
        entries.push({
          id: attrs['@_id'],
          tag,
          partNumber,
          number: attrs['@_number'],
          sectionKind,
          text,
          parentId: null
        });

        content.forEach(child => {
          const childTag = Object.keys(child).find(key => key !== ':@');
          if (['proof', 'corollary', 'note', 'explanation'].includes(childTag)) {
            const childAttrs = child[':@'] ?? {};
            entries.push({
              id: childAttrs['@_id'],
              tag: childTag,
              partNumber,
              sectionKind,
              text: collectText(child[childTag] ?? []),
              parentId: attrs['@_id']
            });
          }
        });

        walk(content, sectionKind);
      }
    }
  };

  walk(partChildren, '');
  return dedupeEntries(entries);
};

const collectText = nodes => {
  const chunks = [];
  const walk = items => {
    for (const node of items) {
      const tag = Object.keys(node).find(key => key !== ':@');
      if (tag === '#text') {
        const text = String(node['#text'] ?? '').trim();
        if (text) {
          chunks.push(text);
        }
        continue;
      }
      if (tag === 'text') {
        walk(node.text ?? []);
        continue;
      }
      if (tag === 'continuation') {
        walk(node.continuation ?? []);
        continue;
      }
      if (Array.isArray(node[tag])) {
        walk(node[tag]);
      }
    }
  };
  walk(nodes);
  return chunks.join(' ').replace(/\s+/g, ' ').trim();
};

const dedupeEntries = entries => {
  const seen = new Set();
  return entries.filter(entry => {
    if (!entry.id || seen.has(entry.id)) {
      return false;
    }
    seen.add(entry.id);
    return true;
  });
};

const buildExplicitGraph = entries => {
  const validIds = new Set(entries.map(entry => entry.id).filter(Boolean));
  const lines = [
    '# Generated from XML corpus. Do not hand-edit.',
    '@prefix ethics: <http://spinoza.org/ethics#> .',
    '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '',
    'ethics:cites a rdf:Property .',
    'ethics:dependsUpon a rdf:Property .',
    'ethics:transitivelyDependsOn a rdf:Property .',
    'ethics:provedBy a rdf:Property .',
    'ethics:hasCorollary a rdf:Property .',
    'ethics:hasNote a rdf:Property .',
    'ethics:partOf a rdf:Property .',
    'ethics:derivedFrom a rdf:Property .',
    'ethics:explainsElement a rdf:Property .',
    'ethics:partNumber a rdf:Property .',
    'ethics:number a rdf:Property .',
    'ethics:Definition a rdfs:Class .',
    'ethics:Axiom a rdfs:Class .',
    'ethics:Proposition a rdfs:Class .',
    'ethics:Proof a rdfs:Class .',
    'ethics:Corollary a rdfs:Class .',
    'ethics:Note a rdfs:Class .',
    'ethics:Explanation a rdfs:Class .',
    ''
  ];

  entries.forEach(entry => {
    const className =
      entry.tag === 'def'
        ? 'Definition'
        : entry.tag === 'axiom' || entry.tag === 'postulate'
          ? 'Axiom'
          : entry.tag === 'prop' || entry.tag === 'lemma'
            ? 'Proposition'
            : entry.tag === 'proof'
              ? 'Proof'
              : entry.tag === 'corollary'
                ? 'Corollary'
                : entry.tag === 'explanation'
                  ? 'Explanation'
                  : 'Note';

    const triples = [`ethics:${entry.id} a ethics:${className} ;`, `    ethics:partNumber ${entry.partNumber} ;`];

    if (entry.number) {
      triples.push(`    ethics:number ${entry.number} ;`);
    }

    if (entry.parentId) {
      triples.push(`    ethics:partOf ethics:${entry.parentId} ;`);
    }

    const citations = extractCitations(entry.text, entry.id).filter(citation => validIds.has(citation));
    if (citations.length) {
      triples.push(`    ethics:cites ${citations.map(citation => `ethics:${citation}`).join(', ')} ;`);
    }

    const final = triples[triples.length - 1];
    triples[triples.length - 1] = final.replace(/;$/, ' .');
    lines.push(triples.join('\n'));

    if (entry.parentId && entry.tag === 'proof') {
      lines.push(`ethics:${entry.parentId} ethics:provedBy ethics:${entry.id} .`);
    }

    if (entry.parentId && entry.tag === 'corollary') {
      lines.push(`ethics:${entry.parentId} ethics:hasCorollary ethics:${entry.id} .`);
    }

    if (entry.parentId && ['note', 'explanation'].includes(entry.tag)) {
      lines.push(`ethics:${entry.parentId} ethics:hasNote ethics:${entry.id} .`);
    }

    lines.push('');
  });

  return lines;
};

const extractCitations = (text, currentId) => {
  const citations = new Set();
  const currentPart = currentId.split('.')[0];

  const explicitRef =
    /\b(?:Pt\.?|Part)\s*([ivx]+)\.?,?\s*(?:(Prop(?:osition)?|Def(?:inition)?s?|Deff\.?|Ax(?:iom)?|Lemma|Post(?:ulate)?)\.?\s*)?([ivxlcdm]+)(?:,?\s*Coroll?(?:ary)?\.?\s*([ivxlcdm]+)?)?/gi;
  const compactQualified =
    /(?:^|[\s,(;])((?:i{1,3}|iv|v))\.\s*(Prop(?:osition)?|Def(?:inition)?s?|Deff\.?|Ax(?:iom)?|Lemma|Post(?:ulate)?)\.?\s*([ivxlcdm]+)(?:\.\s*Coroll?(?:ary)?\.?\s*([ivxlcdm]+)?)?/gi;
  const compactProp = /(?:^|[\s,(;])((?:i{1,3}|iv|v))\.\s*([ivxlcdm]+)(?:\.\s*Coroll?(?:ary)?\.?\s*([ivxlcdm]+)?)?/gi;
  const localProp = /(?:^|[\s,(;])(?:Prop(?:osition)?\.?)\s*([ivxlcdm]+)(?:,?\s*Coroll?(?:ary)?\.?\s*([ivxlcdm]+)?)?/gi;
  const definitions = /(?:^|[\s,(;])(?:Def(?:inition)?s?|Deff\.?)\.?\s*([ivxlcdm]+)(?:\s*(?:and|,)\s*([ivxlcdm]+))?/gi;
  const axioms = /(?:^|[\s,(;])(?:Ax(?:iom)?)\.?\s*([ivxlcdm]+)(?:\s*(?:and|,)\s*([ivxlcdm]+))?/gi;
  const lemmas = /(?:^|[\s,(;])Lemma\s+([ivxlcdm]+)/gi;
  const posts = /(?:^|[\s,(;])(?:Post(?:ulate)?)\.?\s*([ivxlcdm]+)/gi;

  const push = (part, kind, number, suffix = '') => {
    if (!part || !number) {
      return;
    }
    const id = `${part}.${kind}.${number}${suffix ? `.${suffix}` : ''}`;
    if (id !== currentId) {
      citations.add(id);
    }
  };

  collectRegex(explicitRef, text, match => {
    const part = normalizePartNumeral(match[1]);
    const kindToken = (match[2] ?? 'Prop').toLowerCase();
    const number = romanToNumber(match[3]);
    const corollary = match[4] ? romanToNumber(match[4]) : null;

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

    push(part, kind, number, corollary && kind === 'prop' ? `corollary${corollary}` : '');
  });
  collectRegex(compactQualified, text, match => {
    const part = normalizePartNumeral(match[1]);
    const kindToken = match[2].toLowerCase();
    const number = romanToNumber(match[3]);
    const corollary = match[4] ? romanToNumber(match[4]) : null;

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

    push(part, kind, number, corollary && kind === 'prop' ? `corollary${corollary}` : '');
  });
  collectRegex(compactProp, text, match => {
    push(normalizePartNumeral(match[1]), 'prop', romanToNumber(match[2]), match[3] ? `corollary${romanToNumber(match[3])}` : '');
  });
  collectRegex(localProp, text, match => {
    push(currentPart, 'prop', romanToNumber(match[1]), match[2] ? `corollary${romanToNumber(match[2])}` : '');
  });
  collectRegex(definitions, text, match => {
    [match[1], match[2]].filter(Boolean).forEach(value => push(currentPart, 'def', romanToNumber(value)));
  });
  collectRegex(axioms, text, match => {
    [match[1], match[2]].filter(Boolean).forEach(value => push(currentPart, 'ax', romanToNumber(value)));
  });
  collectRegex(lemmas, text, match => {
    push(currentPart, 'lemma', romanToNumber(match[1]));
  });
  collectRegex(posts, text, match => {
    push(currentPart, 'post', romanToNumber(match[1]));
  });

  return [...citations];
};

const normalizePartNumeral = value => {
  const numeral = intToRoman(romanToNumber(value));
  return numeral && PART_NUMERALS.includes(numeral) ? numeral : null;
};

const collectRegex = (regex, text, callback) => {
  let match = regex.exec(text);
  while (match) {
    callback(match);
    match = regex.exec(text);
  }
};

const intToRoman = value => {
  if (!value) {
    return null;
  }
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
  ];
  let result = '';
  let remaining = value;
  lookup.forEach(([magnitude, symbol]) => {
    while (remaining >= magnitude) {
      result += symbol;
      remaining -= magnitude;
    }
  });
  return result;
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
