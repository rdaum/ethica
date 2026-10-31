// Parses Appuhn's French Ethics, as rendered by French Wikisource, into passages keyed by
// the same IDs as the English text. Passage labels in the source drive the assignment.

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100 };

const fromRoman = numeral => {
  let total = 0;
  [...numeral].forEach((letter, index) => {
    const value = ROMAN[letter];
    const next = ROMAN[numeral[index + 1]] ?? 0;
    total += value < next ? -value : value;
  });
  return total;
};

const decodeEntities = text =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

/** Removes markup but keeps French non-breaking spaces, which the generic \s would collapse. */
export const cleanInline = html =>
  decodeEntities(
    html
      .replace(/<sup[^>]*>o<\/sup>/g, '°')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();

const removeNoise = html =>
  html
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(?:&#32;)?<span><span class="pagenum[^>]*><\/span><\/span>/g, ' ');

const BLOCK =
  /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>|<div style="[^"]*text-align:center[^"]*">([\s\S]*?)<\/div>|<p\b[^>]*>([\s\S]*?)<\/p>/g;

/** Returns the labels and paragraphs in reading order. */
export const parseBlocks = html => {
  const source = removeNoise(html);
  const blocks = [];

  for (const match of source.matchAll(BLOCK)) {
    const [, heading, centered, paragraph] = match;
    const text = cleanInline(heading ?? centered ?? paragraph);

    if (text) {
      blocks.push({ kind: paragraph === undefined ? 'label' : 'paragraph', text });
    }
  }

  return blocks;
};

const normalizeLabel = label =>
  label
    .toUpperCase()
    .replace(/\u00a0/g, ' ')
    .replace(/[.:]+$/g, '')
    .trim();

// Titles and end-of-part lines that belong to no passage.
const STRUCTURAL_LABEL = /PARTIE DE L.[ÉE]THIQUE$|^FIN\b/;

/**
 * Assigns blocks to passage IDs. Unrecognised labels and text with no passage are returned
 * rather than dropped, so the report shows everything that failed to line up.
 */
export const assignPassages = (blocks, numeral) => {
  // The first label names the part, the second is its subtitle.
  const titleLabels = new Set(blocks.filter(block => block.kind === 'label').slice(0, 2).map(block => block.text));
  const passages = new Map();
  const unassigned = [];
  const unknownLabels = [];
  let section = null;
  // The proposition or lemma that proofs, corollaries and notes attach to.
  let owner = null;
  let corollary = null;
  let target = null;
  let proofCount = 0;
  let corollaryCount = 0;
  let noteCount = 0;
  let physicalAxiomGroup = 0;

  const open = id => {
    target = id;
    if (!passages.has(id)) {
      passages.set(id, []);
    }
  };

  const startOwner = id => {
    owner = id;
    corollary = null;
    proofCount = 0;
    corollaryCount = 0;
    noteCount = 0;
    open(id);
  };

  const startSection = name => {
    section = name;
    owner = null;
    corollary = null;
    target = null;
  };

  for (const block of blocks) {
    if (block.kind === 'label') {
      const label = normalizeLabel(block.text);
      let match;

      if ((match = label.match(/^PROPOSITION ([IVXLC]+)$/))) {
        section = 'propositions';
        startOwner(`${numeral}.prop.${fromRoman(match[1])}`);
      } else if ((match = label.match(/^LEMME ([IVXLC]+)$/))) {
        section = 'physics';
        startOwner(`${numeral}.lemma.${fromRoman(match[1])}`);
      } else if (/^D[ÉE]FINITIONS$/.test(label)) {
        startSection('def');
      } else if (/^AXIOMES?$/.test(label)) {
        startSection('ax');
      } else if (/^POSTULATS?$/.test(label)) {
        startSection('post');
      } else if ((match = label.match(/^AXIOME ([IVXLC]+)$/))) {
        // After II.xiii: two runs of axioms on bodies, with the third axiom of the second run.
        const number = fromRoman(match[1]);
        physicalAxiomGroup += number === 1 ? 1 : 0;
        section = 'physics';
        owner = null;
        open(`${numeral}.phys_ax${physicalAxiomGroup > 1 ? physicalAxiomGroup : ''}.${number}`);
      } else if (label === 'DÉFINITION' && section === 'physics') {
        owner = null;
        open(`${numeral}.phys_def.1`);
      } else if (/^D[ÉE]FINITIONS DES AFFECTIONS$/.test(label)) {
        startSection('affect');
      } else if (section === 'affect' && /^[IVXLC]+$/.test(label)) {
        open(`${numeral}.affect.${fromRoman(label)}`);
      } else if (/^D[ÉE]FINITION G[ÉE]N[ÉE]RALE DES AFFECTIONS$/.test(label)) {
        startSection('general');
        open(`${numeral}.general_definition.note`);
      } else if (label === 'APPENDICE') {
        startSection('appendix');
        open(`${numeral}.appendix.introduction`);
      } else if (section === 'appendix' && (match = label.match(/^CHAPITRE ([IVXLC]+)$/))) {
        open(`${numeral}.appendix.chapter.${fromRoman(match[1])}`);
      } else if (/^PR[ÉE]FACE$/.test(label)) {
        startSection('preface');
        open(`${numeral}.preface`);
      } else if (label === 'EXPLICATION' && section === 'general') {
        // The English keeps the general definition and its explanation as one passage.
      } else if (label === 'EXPLICATION' && target && !owner) {
        open(`${target.replace(/\.explanation$/, '')}.explanation`);
      } else if (owner && (match = label.match(/^COROLLAIRE(?: ([IVXLC]+))?$/))) {
        corollaryCount += 1;
        const number = match[1] ? fromRoman(match[1]) : corollaryCount > 1 ? corollaryCount : '';
        corollary = `${owner}.corollary${number}`;
        open(corollary);
      } else if (owner && /^D[ÉE]MONSTRATION$/.test(label)) {
        if (corollary) {
          open(`${corollary}.proof`);
        } else {
          proofCount += 1;
          open(`${owner}.proof${proofCount > 1 ? proofCount : ''}`);
        }
      } else if (owner && /^AUTRE D[ÉE]MONSTRATION$/.test(label)) {
        proofCount += 1;
        open(`${owner}.proof${proofCount > 1 ? proofCount : ''}`);
      } else if (owner && (match = label.match(/^SCOLIE(?: ([IVXLC]+))?$/))) {
        noteCount += 1;
        const number = match[1] ? fromRoman(match[1]) : noteCount;
        open(`${owner}.note${number > 1 || match[1] ? number : ''}`);
      } else if (!STRUCTURAL_LABEL.test(label) && !(titleLabels.has(block.text) && !section)) {
        unknownLabels.push(block.text);
      }

      continue;
    }

    const numbered = ['def', 'ax', 'post'].includes(section) && block.text.match(/^([IVXLC]+)\.\s+([\s\S]*)$/);

    if (numbered) {
      open(`${numeral}.${section}.${fromRoman(numbered[1])}`);
      passages.get(target).push(numbered[2]);
      continue;
    }

    if (!target && section === null) {
      // Parts II and III open with an unlabelled preface.
      open(`${numeral}.preface`);
    } else if (!target && section === 'ax') {
      // Part IV has a single, unnumbered axiom.
      open(`${numeral}.ax.1`);
    }

    if (target) {
      passages.get(target).push(block.text);
    } else {
      unassigned.push(block.text);
    }
  }

  return {
    passages: Object.fromEntries([...passages].map(([id, paragraphs]) => [id, paragraphs.join('\n\n')])),
    unassigned,
    unknownLabels
  };
};

/** Appends each source passage to its target, as a new paragraph. */
export const mergePassages = (passages, merges) => {
  const merged = { ...passages };

  Object.entries(merges).forEach(([source, target]) => {
    if (source in merged && target in merged) {
      merged[target] = `${merged[target]}\n\n${merged[source]}`;
      delete merged[source];
    }
  });

  return merged;
};

/**
 * Returns each passage's footnotes, leaving the "[n]" markers in the text as the English
 * does. Fails if a marker has no note or a note has no marker, so nothing is lost silently.
 */
export const collectFootnotes = (html, passages) => {
  const list = html.match(/<ol class="references">([\s\S]*?)<\/ol>/)?.[1] ?? '';
  const notes = [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(match => cleanInline(match[1]).replace(/^↑\s*/, ''));
  const footnotes = {};
  const used = new Set();

  Object.entries(passages).forEach(([id, text]) => {
    for (const [, number] of text.matchAll(/\[(\d+)\]/g)) {
      const note = notes[Number(number) - 1];

      if (note === undefined) {
        throw new Error(`${id} has marker [${number}] with no note`);
      }

      used.add(Number(number));
      footnotes[id] = [...(footnotes[id] ?? []), { number, text: note }];
    }
  });

  if (used.size !== notes.length) {
    throw new Error(`${notes.length} notes but ${used.size} markers`);
  }

  return footnotes;
};

/** Moves a passage to the ID the English uses for it. */
export const renamePassages = (passages, renames) =>
  Object.fromEntries(Object.entries(passages).map(([id, text]) => [renames[id] ?? id, text]));

/** Splits a passage where a paragraph begins with the marker, failing if none does. */
export const splitPassages = (passages, splits) => {
  const result = { ...passages };

  splits.forEach(({ from, to, marker }) => {
    const index = (result[from] ?? '').indexOf(`\n\n${marker}`);

    if (index < 0) {
      throw new Error(`No paragraph in ${from} begins with: ${marker}`);
    }

    result[to] = result[from].slice(index + 2);
    result[from] = result[from].slice(0, index);
  });

  return result;
};

/** Applies corrections, failing if one no longer matches exactly once. */
export const applyCorrections = (passages, corrections) => {
  const corrected = { ...passages };

  corrections.forEach(({ id, from, to }) => {
    const occurrences = (corrected[id] ?? '').split(from).length - 1;

    if (occurrences !== 1) {
      throw new Error(`Correction for ${id} matched ${occurrences} times: ${from}`);
    }

    corrected[id] = corrected[id].replace(from, to);
  });

  return corrected;
};
