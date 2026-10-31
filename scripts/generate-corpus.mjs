#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { extractCitations } from './lib/citations.mjs';

const ROOT = process.cwd();
const RAW_TEXT_PATH = path.join(ROOT, 'ethica.txt');
const PUBLIC_DIR = path.join(ROOT, 'public');
// Where the English source misprints a reference. Checked against the Latin, which
// reads "per propositionem 4 partis III" here.
const CITATION_CORRECTIONS = { 'IV.prop.1.proof': { 'IV.prop.3': 'III.prop.4' } };

// Elwes adds this cross-reference as a separate note. In the Latin it is only a
// parenthesis inside the axiom, so it has no passage of its own to align to.
const EDITORIAL_ELEMENT_IDS = new Set(['II.ax.5.note']);

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

  const { lines, citationProblems } = buildExplicitGraph(corpusParts);
  const explicitGraph = lines.join('\n');
  fs.writeFileSync(path.join(PUBLIC_DIR, 'ethica-logic.n3'), explicitGraph);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'ethica-logic-eye.n3'), `${explicitGraph}\n\n${GENERATED_RULES}\n`);

  console.log('Generated Parts I-V XML and regenerated graph data for Parts I-V.');

  if (process.argv.includes('--report-citations')) {
    citationProblems.forEach(problem => console.log(JSON.stringify(problem)));
  } else if (citationProblems.length) {
    console.log(`${citationProblems.length} citations were unresolved or approximate; rerun with --report-citations to list them.`);
  }
};

const parseAllParts = rawText => {
  const partHeadingRegex = /^PART[ \t]+(I|II|III|IV|V)[.:](?:[ \t]+(.*))?$/gm;
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
    sections: uniquifySectionIds(sections)
  };
};

// Part II's propositions resume after the postulates, giving two sections of one type.
const uniquifySectionIds = sections => {
  const seen = new Map();

  return sections.map(section => {
    const count = (seen.get(section.id) ?? 0) + 1;
    seen.set(section.id, count);
    return count === 1 ? section : { ...section, id: `${section.id}.${count}` };
  });
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
      id: `${numeral}.appendix.chapter.${romanToNumber(entry.number) ?? entry.number.toLowerCase()}`,
      heading: `Caput ${entry.number}`,
      topic: entry.number,
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
    const { text, footnotes, children } = splitChildren(block.paragraphs, id, options.sectionType, options.itemTag === 'def');

    return {
      tag: options.itemTag,
      id,
      number,
      text,
      footnotes,
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
      const { text, footnotes, children } = splitChildren(block, id, 'propositions', false);
      items.push({ kind: 'prop', id, number, text, footnotes, children });
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
          !/^POSTULATES$/i.test(paragraphs[index]) &&
          !startsMidLemmaGroup(paragraphs[index])
        ) {
          block.push(paragraphs[index]);
          index += 1;
        }

        const number = String(romanToNumber(match[1]));
        const id = `${numeral}.lemma.${number}`;
        const { text, footnotes, children } = splitChildren(block, id, 'lemmas', false);
        lemmas.push({ tag: 'lemma', id, number, text, footnotes, children });
      }
      items.push({ kind: 'section', type: 'lemmas', id: `${numeral}.lemmas`, items: lemmas });
      continue;
    }

    if (startsMidLemmaGroup(paragraph)) {
      // Spinoza pauses after Lemma III for further axioms and a definition of the individual.
      const groupItems = [];

      while (
        index < paragraphs.length &&
        !/^PROP\.\s+[IVXLCDM]+\./.test(paragraphs[index]) &&
        !/^LEMMA\s+[IVXLCDM]+\./.test(paragraphs[index]) &&
        !/^POSTULATES$/i.test(paragraphs[index])
      ) {
        const current = paragraphs[index];
        const axiomMatch = current.match(MID_LEMMA_AXIOM);
        const definitionMatch = current.match(MID_LEMMA_DEFINITION);

        if (axiomMatch) {
          const number = String(romanToNumber(axiomMatch[1]));
          groupItems.push({ tag: 'axiom', id: `${numeral}.phys_ax2.${number}`, number, text: [axiomMatch[2].trim()], children: [] });
        } else if (definitionMatch) {
          groupItems.push({ tag: 'def', id: `${numeral}.phys_def.1`, number: '1', text: [definitionMatch[1].trim()], children: [] });
        } else {
          groupItems[groupItems.length - 1].text.push(current.trim());
        }

        index += 1;
      }

      items.push({
        kind: 'section',
        type: 'physical_axioms',
        id: `${numeral}.physical_axioms`,
        items: groupItems.map(item => ({ ...item, text: item.text.join('\n\n') }))
      });
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

  return uniquifySectionIds(items);
};

// A label ends in a period, a dash, or both: "Proof.—", "Proof—", "Note I.—".
const LABEL_END = String.raw`(?:\.(?:—|-)?|—|-)`;
const PROOF_LABEL = new RegExp(`^(Proof|Another proof)${LABEL_END}\\s*(.*)$`, 'i');
const COROLLARY_LABEL = new RegExp(`^Coroll(?:ary|\\.)?(?:\\s+([IVXLCDM]+))?${LABEL_END}\\s*(.*)$`, 'i');
const NOTE_LABEL = new RegExp(`^Note(?:\\s+([IVXLCDM]+))?${LABEL_END}\\s*(.*)$`, 'i');
const EXPLANATION_LABEL = new RegExp(`^Explanation${LABEL_END}\\s*(.*)$`, 'i');
const NB_LABEL = /^N\.B\.\s*(.*)$/i;
const FOOTNOTE_BODY = /^\[(\d+)\]\s+(.*)$/;
const MID_LEMMA_AXIOM = /^Axiom\s+([IVXLCDM]+)\.—\s*(.*)$/;
const MID_LEMMA_DEFINITION = /^Definition\.—\s*(.*)$/;
const startsMidLemmaGroup = paragraph => MID_LEMMA_AXIOM.test(paragraph) || MID_LEMMA_DEFINITION.test(paragraph);

// The source labels this passage "Proof", but it translates the Latin scholium. The
// English of the actual demonstration is missing from the source text.
const MISLABELLED_AS_PROOF = new Set(['IV.prop.72']);

const splitChildren = (paragraphs, parentId, sectionType, allowExplanation) => {
  const textParts = [];
  const children = [];
  const ownFootnotes = [];
  const proofCounts = new Map();
  let currentChild = null;
  let lastCorollary = null;
  let corollaryCount = 0;
  let noteCount = 0;
  let explanationCount = 0;

  const startChild = (child, siblings = children) => {
    currentChild = { ...child, text: [child.text], footnotes: [], children: [] };
    siblings.push(currentChild);
    return currentChild;
  };

  const nextProofId = ownerId => {
    const count = (proofCounts.get(ownerId) ?? 0) + 1;
    proofCounts.set(ownerId, count);
    return count === 1 ? `${ownerId}.proof` : `${ownerId}.proof${count}`;
  };

  paragraphs.forEach(paragraph => {
    const footnoteMatch = paragraph.match(FOOTNOTE_BODY);
    const mislabelledNote = MISLABELLED_AS_PROOF.has(parentId) ? paragraph.match(PROOF_LABEL) : null;
    const proofMatch = mislabelledNote ? null : paragraph.match(PROOF_LABEL);
    const corollaryMatch = paragraph.match(COROLLARY_LABEL);
    const noteMatch = paragraph.match(NOTE_LABEL);
    const explanationMatch = paragraph.match(EXPLANATION_LABEL);
    const nbMatch = paragraph.match(NB_LABEL);

    if (footnoteMatch) {
      (currentChild?.footnotes ?? ownFootnotes).push({ number: footnoteMatch[1], text: footnoteMatch[2].trim() });
      return;
    }

    if (proofMatch) {
      // A plain "Proof" right after a corollary demonstrates that corollary. Only
      // "Another proof" is an alternate demonstration of the proposition itself.
      const isAlternate = /^another/i.test(proofMatch[1]);
      const ownsProof = !isAlternate && lastCorollary && currentChild === lastCorollary;
      const owner = ownsProof ? lastCorollary : null;
      const ownerId = owner?.id ?? parentId;
      startChild({ type: 'proof', id: nextProofId(ownerId), text: proofMatch[2].trim() }, owner?.children ?? children);
      return;
    }

    if (corollaryMatch) {
      corollaryCount += 1;
      const suffix = corollaryMatch[1] ? romanToNumber(corollaryMatch[1]) : corollaryCount > 1 ? corollaryCount : '';
      lastCorollary = startChild({
        type: 'corollary',
        id: suffix ? `${parentId}.corollary${suffix}` : `${parentId}.corollary`,
        text: corollaryMatch[2].trim()
      });
      return;
    }

    if (noteMatch || nbMatch || mislabelledNote) {
      noteCount += 1;
      const numeral = noteMatch?.[1] ? romanToNumber(noteMatch[1]) : noteCount > 1 ? noteCount : '';
      startChild({
        type: 'note',
        id: numeral ? `${parentId}.note${numeral}` : `${parentId}.note`,
        text: (noteMatch?.[2] ?? nbMatch?.[1] ?? mislabelledNote?.[2] ?? '').trim()
      });
      return;
    }

    if (allowExplanation && explanationMatch) {
      explanationCount += 1;
      startChild({
        type: 'explanation',
        id: explanationCount === 1 ? `${parentId}.explanation` : `${parentId}.explanation${explanationCount}`,
        text: explanationMatch[1].trim()
      });
      return;
    }

    if (currentChild) {
      currentChild.text.push(paragraph.trim());
      return;
    }

    textParts.push(paragraph.trim());
  });

  const finalize = child => ({
    ...child,
    text: child.text.join('\n\n').trim(),
    children: child.children.map(finalize)
  });

  return {
    text: textParts.join('\n\n').trim(),
    footnotes: ownFootnotes,
    children: children.map(finalize)
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
          `    <section type="chapter" id="${entry.id}" topic="${entry.topic}">\n      <text>${escapeXml(entry.text)}</text>\n    </section>`
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
      .map(child => renderSimpleItem(child.tag ?? tag, child, 6))
      .join('\n')}\n    </section>`;
  }

  const tag = item.kind === 'prop' ? 'prop' : 'lemma';
  return renderSimpleItem(tag, item, 4);
};

const renderFootnotes = (footnotes, indent) => {
  const spacing = ' '.repeat(indent);
  return (footnotes ?? []).map(
    footnote => `${spacing}<footnote number="${footnote.number}">\n${spacing}  <text>${escapeXml(footnote.text)}</text>\n${spacing}</footnote>`
  );
};

const renderSimpleItem = (tag, item, indent = 4) => {
  const spacing = ' '.repeat(indent);
  const body = [
    ...renderFootnotes(item.footnotes, indent + 2),
    ...(item.children ?? []).map(child => renderChild(child, indent + 2))
  ];
  return `${spacing}<${tag} id="${item.id}" number="${item.number}">\n${spacing}  <text>${escapeXml(item.text)}</text>${
    body.length ? `\n${body.join('\n')}` : ''
  }\n${spacing}</${tag}>`;
};

const renderChild = (child, indent) => {
  const spacing = ' '.repeat(indent);
  const editorial = EDITORIAL_ELEMENT_IDS.has(child.id) ? ' editorial="true"' : '';
  const body = [
    ...renderFootnotes(child.footnotes, indent + 2),
    ...(child.children ?? []).map(grandchild => renderChild(grandchild, indent + 2))
  ];
  return `${spacing}<${child.type} id="${child.id}"${editorial}>\n${spacing}  <text>${escapeXml(child.text)}</text>${
    body.length ? `\n${body.join('\n')}` : ''
  }\n${spacing}</${child.type}>`;
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

  const addEntry = (tag, attrs, content, sectionKind, parentId, partNumberForEntry) => {
    entries.push({
      id: attrs['@_id'],
      tag,
      partNumber: partNumberForEntry,
      number: attrs['@_number'],
      sectionKind,
      text: collectOwnText(content),
      parentId
    });
  };

  const walk = (children, sectionKind, parentId) => {
    for (const node of children) {
      const tag = Object.keys(node).find(key => key !== ':@');
      const attrs = node[':@'] ?? {};
      const content = node[tag] ?? [];

      if (tag === 'section') {
        const type = attrs['@_type'] ?? sectionKind;

        if (type === 'preface' || type === 'chapter') {
          addEntry(type, attrs, content, type, null, partNumber);
        } else {
          walk(content, type, null);
        }
      }

      if (['def', 'axiom', 'postulate', 'prop', 'lemma', 'proof', 'corollary', 'note', 'explanation', 'introduction'].includes(tag)) {
        addEntry(tag, attrs, content, sectionKind, parentId, partNumber);
        walk(content, sectionKind, attrs['@_id']);
      }
    }
  };

  walk(partChildren, '', null);
  return entries.filter(entry => entry.id);
};

// Only the passage's own words: a parent must not inherit its children's citations,
// and footnotes are the translator's rather than Spinoza's.
const collectOwnText = nodes =>
  nodes
    .filter(node => node.text || node.continuation)
    .flatMap(node => node.text ?? node.continuation)
    .map(node => String(node['#text'] ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildExplicitGraph = entries => {
  const validIds = new Set(entries.map(entry => entry.id).filter(Boolean));
  const citationProblems = [];
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
    'ethics:Preface a rdfs:Class .',
    'ethics:Appendix a rdfs:Class .',
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
                  : entry.tag === 'preface'
                    ? 'Preface'
                    : entry.tag === 'chapter' || entry.tag === 'introduction'
                      ? 'Appendix'
                      : 'Note';

    const triples = [`ethics:${entry.id} a ethics:${className} ;`, `    ethics:partNumber ${entry.partNumber} ;`];

    if (entry.number) {
      triples.push(`    ethics:number ${entry.number} ;`);
    }

    if (entry.parentId) {
      triples.push(`    ethics:partOf ethics:${entry.parentId} ;`);
    }

    const { citations: extracted, problems } = extractCitations(entry.text, entry.id, validIds);
    const citations = extracted.map(citation => CITATION_CORRECTIONS[entry.id]?.[citation] ?? citation);
    citationProblems.push(...problems);
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

  return { lines, citationProblems };
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
