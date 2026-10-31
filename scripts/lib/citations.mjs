// The one place citations are read out of the text. The scanner moves left to right and
// consumes each reference whole, so "Part i., Ax. iv." can never also count as a local
// axiom. Every form handled here occurs in the corpus; see citations.test.mjs.

const PART_NUMBERS = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
const PART_NUMERALS = Object.keys(PART_NUMBERS);
const VALID_ROMAN = /^(?=[ivxlc])c{0,3}(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/;

const romanToNumber = value => {
  const digits = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  let total = 0;
  let previous = 0;

  for (const letter of [...value].reverse()) {
    const current = digits[letter];
    total += current < previous ? -current : current;
    previous = Math.max(previous, current);
  }

  return total;
};

const parseNumber = token => {
  if (/^\d+$/.test(token)) {
    return Number(token);
  }

  const lower = token.toLowerCase();
  return VALID_ROMAN.test(lower) ? romanToNumber(lower) : null;
};

const NUM = String.raw`(?:[ivxlc]+|\d+)`;
const PART = String.raw`(?:I{1,3}|IV|V)`;
const LOWER_PART = String.raw`(?:i{1,3}|iv|v)`;
const KIND = String.raw`Props?|Propositions?|Deff|Defs?|Definitions?|Axioms?|Ax|Postulates?|Post|Lemmas?`;

const kindFromToken = token => {
  const lower = token.toLowerCase();

  if (lower.startsWith('prop')) return 'prop';
  if (lower.startsWith('def')) return 'def';
  if (lower.startsWith('ax')) return 'ax';
  if (lower.startsWith('post')) return 'post';
  return 'lemma';
};

const ANCHOR = new RegExp(
  [
    // "Def. of the Emotions, xxx." and "the general Def. of the Emotions"
    String.raw`(?<emotions>(?<general>general\s+)?Def(?:inition)?s?\.?\s+of\s+(?:the\s+)?Emotions)`,
    // "note to Prop. x.", "Coroll. of the last Prop.", "Corollary and note to II. vii."
    String.raw`(?<prefixed>(?<prefixKind>Coroll(?:ary)?\.?|[Nn]otes?)(?:\s+and\s+[Nn]ote)?(?:\s+(?<prefixNumber>\d+|[ivxlc]+)\b)?\.?,?\s*(?:(?:to|of|after)\s+)?(?:the\s+)?(?=(?:Prop|${PART}\.\s*[ivxlc]|last\s+Prop|foregoing\s+Prop|preceding\s+Prop)))`,
    // "Part i., Prop. x.", "Pt. i., Deff. iii. and v.", "Part iv. from Prop. xviii."
    String.raw`(?<partFirst>\b(?:Pt\.?|Part)\s+(?<partFirstNumber>[ivxIVX]+)\b\.?,?\s*(?:from\s+)?(?<partFirstKind>${KIND})\.?\s+(?<partFirstValue>${NUM})\b)`,
    // "III. Def. iii.", "II., Def. i.", "I. Deff. iii. and v."
    String.raw`(?<qualified>\b(?<qualifiedPart>${PART})\.?,?\s+(?<qualifiedKind>${KIND})\.?\s+(?<qualifiedValue>${NUM})\b)`,
    // "III. xiii.", "I.v."
    String.raw`(?<compact>\b(?<compactPart>${PART})\.\s*(?<compactValue>[ivxlc]+)\b)`,
    // "(by i. 15)"
    String.raw`(?<lowerCompact>(?<=(?:by|in|cf\.|see|\()\s*)(?<lowerPart>${LOWER_PART})\.\s*(?<lowerValue>\d+|[ivxlc]+)\b)`,
    // "the last Prop.", "the foregoing proposition", "the first Prop. of this Part"
    String.raw`(?<relative>\b(?<relativeWord>last|foregoing|preceding|previous|first|second|third|fourth|fifth)\s+(?<relativeKind>Props?|[Pp]ropositions?|Lemmas?|Axioms?)\b\.?)`,
    // "Def. after Lemma iii."
    String.raw`(?<defAfterLemma>\bDef\.?\s+after\s+(?:the\s+Coroll\.?\s+of\s+)?Lemma\s+iii\b\.?)`,
    // "Prop. x.", "Deff. iii. and v.", "Ax. i.", "Lemmas v. and vii."
    String.raw`(?<local>\b(?<localKind>${KIND})\.?\s+(?<localValue>${NUM})\b)`
  ].join('|'),
  'g'
);

const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
const LIST_ITEM = new RegExp(String.raw`[.,]?\s*(?:,|and\b|&)?\s*(${NUM})\b(?=[\s.,;:)]|$)`, 'y');
const TAIL_SUFFIX = new RegExp(
  String.raw`[.,]?\s*(?:and\s+)?(?:the\s+)?(?<kind>Corolls?\.?|Corollary|Corollaries|[Nn]otes?|Explanation|explanation)\b\.?(?:\s*(?<number>${NUM})\b)?`,
  'y'
);
const TAIL_OF_THIS_PART = /[.,]*\s*of\s+this\s+(?:part|Part|book)\b\.?/y;
const TAIL_OF_PART = /[.,]*\s*(?:of\s+)?(?:Pt\.?|Part)\s+([ivxIVX]+)\b\.?/y;
const TAIL_EXTERNAL_WORK = /[.,]*\s*of\s+my\s+"/y;
const TAIL_AFTER_LEMMA =
  /[.,]*\s*\(?(?:which\s+see\s+)?(?:after|following)\s+(?:the\s+Coroll\.?\s+(?:of|to)\s+)?Lemma\s+iii\b\.?(?:\s+(?:after\s+II\.\s*xiii|Prop\.\s+xiii\.,\s+Part\s+II)\b\.?\)?)?/y;
const TAIL_AND_KIND = new RegExp(String.raw`[.,]*\s*and\s+(${KIND})\.?\s+(${NUM})\b`, 'y');

const suffixFromToken = token => {
  const lower = token.toLowerCase();

  if (lower.startsWith('coroll')) return 'corollary';
  if (lower.startsWith('note')) return 'note';
  return 'explanation';
};

const matchAt = (regex, text, index) => {
  regex.lastIndex = index;
  return regex.exec(text);
};

/**
 * The proposition or lemma a phrase like "the last Prop." counts back from. Inside a
 * proof that is the previous proposition. Inside a corollary or note, the proposition
 * it hangs from has already been stated, so "the last Prop." means that one.
 */
const readSourceContext = id => {
  const [partNumeral] = id.split('.');
  const match = id.match(/^[IVX]+\.(prop|lemma)\.(\d+)(.*)$/);
  const inOwnProof = match ? /^\.proof\d*$/.test(match[3]) : false;

  return {
    id,
    part: partNumeral,
    inEmotionDefinitions: /\.(?:affect|general_definition)\b/.test(id),
    relativeKind: match?.[1] ?? null,
    relativeNumber: match ? Number(match[2]) - (inOwnProof || match[3] === '' ? 1 : 0) : null
  };
};

const resolveRelative = (word, kindToken, source) => {
  const kind = kindFromToken(kindToken);

  if (ORDINALS[word]) {
    return { part: source.part, kind, number: ORDINALS[word] };
  }

  if (source.relativeNumber === null) {
    return null;
  }

  if (kind === 'prop' && source.relativeKind === 'lemma') {
    // The lemmas of Part II all sit after Prop. xiii.
    return { part: source.part, kind: 'prop', number: 13 };
  }

  if (kind !== source.relativeKind) {
    return null;
  }

  return { part: source.part, kind, number: source.relativeNumber };
};

/** Reads every reference in a passage, without checking that its target exists. */
export const parseReferences = (text, sourceId) => {
  const source = readSourceContext(sourceId);
  const references = [];

  const add = reference => {
    references.push(reference);
    return reference;
  };

  let groupCounter = 0;
  const startGroup = reference => add({ ...reference, group: (groupCounter += 1) });

  // Reads what may follow a reference: suffixes, list members and part qualifiers.
  const readTail = (start, first, { allowPartQualifier = false, partIsExplicit = true } = {}) => {
    let index = start;
    let current = first;

    for (;;) {
      if (matchAt(TAIL_EXTERNAL_WORK, text, index)) {
        references.splice(references.indexOf(current), 1);
        return index;
      }

      const suffix = current.kind === 'prop' || current.kind === 'lemma' || current.kind === 'affect' ? matchAt(TAIL_SUFFIX, text, index) : null;

      if (suffix) {
        const suffixKind = suffixFromToken(suffix.groups.kind);
        const suffixNumber = suffix.groups.number ? parseNumber(suffix.groups.number) : null;
        const applied = { ...current, suffix: suffixKind, suffixNumber };

        if (current.suffix) {
          add(applied);
        } else {
          references[references.indexOf(current)] = applied;
        }

        current = applied;
        index = suffix.index + suffix[0].length;
        continue;
      }

      // "I. xi. and Def. i.": the part carries over to a different kind of reference.
      const andKind = partIsExplicit ? matchAt(TAIL_AND_KIND, text, index) : null;
      const andKindNumber = andKind ? parseNumber(andKind[2]) : null;

      if (andKindNumber) {
        current = startGroup({ part: current.part, kind: kindFromToken(andKind[1]), number: andKindNumber });
        index = andKind.index + andKind[0].length;
        continue;
      }

      const ofThisPart = matchAt(TAIL_OF_THIS_PART, text, index);

      if (ofThisPart) {
        index = ofThisPart.index + ofThisPart[0].length;
        continue;
      }

      if (allowPartQualifier) {
        const ofPart = matchAt(TAIL_OF_PART, text, index);
        const partToken = ofPart?.[1].toUpperCase();

        if (ofPart && PART_NUMERALS.includes(partToken)) {
          // A trailing qualifier applies to the whole list before it.
          references.forEach((reference, position) => {
            if (reference.group === current.group) {
              references[position] = { ...reference, part: partToken };
            }
          });
          current = { ...current, part: partToken };
          index = ofPart.index + ofPart[0].length;
          continue;
        }
      }

      if (current.kind === 'ax' && matchAt(TAIL_AFTER_LEMMA, text, index)) {
        const after = matchAt(TAIL_AFTER_LEMMA, text, index);
        const position = references.indexOf(current);
        current = { ...current, part: 'II', kind: 'phys_ax2' };
        references[position] = current;
        index = after.index + after[0].length;
        continue;
      }

      const listed = matchAt(LIST_ITEM, text, index);
      const listedNumber = listed ? parseNumber(listed[1]) : null;

      if (listedNumber && !(listed[1] === 'i' && /^\s*\.\s*e\b/.test(text.slice(listed.index + listed[0].length)))) {
        current = add({ part: current.part, kind: current.kind, number: listedNumber, group: current.group });
        index = listed.index + listed[0].length;
        continue;
      }

      return index;
    }
  };

  ANCHOR.lastIndex = 0;

  for (let match = ANCHOR.exec(text); match; match = ANCHOR.exec(text)) {
    const groups = match.groups;
    const end = match.index + match[0].length;
    let resume = end;

    if (groups.emotions) {
      const list = matchAt(new RegExp(String.raw`[.,]?\s*,?\s*(${NUM})\b`, 'y'), text, end);

      if (list && !groups.general && parseNumber(list[1])) {
        const first = startGroup({ part: 'III', kind: 'affect', number: parseNumber(list[1]) });
        resume = readTail(list.index + list[0].length, first);
      } else {
        startGroup({ part: 'III', kind: 'general_definition', number: 0 });
      }
    } else if (groups.prefixed) {
      // The target follows the prefix; parse it, then apply the suffix.
      const suffix = suffixFromToken(groups.prefixKind);
      const suffixNumber = groups.prefixNumber ? parseNumber(groups.prefixNumber) : null;
      const alsoNote = /\band\s+[Nn]ote/.test(match[0]);
      const rest = text.slice(end);
      const target = readPrefixedTarget(rest, source);

      if (target) {
        const reference = startGroup({ ...target.reference, suffix, suffixNumber });

        if (alsoNote) {
          add({ ...target.reference, suffix: 'note', suffixNumber: null, group: reference.group });
        }

        resume = end + target.length;
      }
    } else if (groups.partFirst) {
      const part = groups.partFirstNumber.toUpperCase();
      const number = parseNumber(groups.partFirstValue);

      if (PART_NUMERALS.includes(part) && number) {
        const first = startGroup({ part, kind: kindFromToken(groups.partFirstKind), number });
        resume = readTail(end, first);
      }
    } else if (groups.qualified) {
      const number = parseNumber(groups.qualifiedValue);

      if (number) {
        const first = startGroup({ part: groups.qualifiedPart, kind: kindFromToken(groups.qualifiedKind), number });
        resume = readTail(end, first);
      }
    } else if (groups.compact) {
      const number = parseNumber(groups.compactValue);

      if (number) {
        const first = startGroup({ part: groups.compactPart, kind: 'prop', number });
        resume = readTail(end, first);
      }
    } else if (groups.lowerCompact) {
      const number = parseNumber(groups.lowerValue);

      if (number) {
        const first = startGroup({ part: groups.lowerPart.toUpperCase(), kind: 'prop', number });
        resume = readTail(end, first);
      }
    } else if (groups.relative) {
      const reference = resolveRelative(groups.relativeWord, groups.relativeKind, source);

      if (reference) {
        const first = startGroup(reference);
        resume = readTail(end, first);
      }
    } else if (groups.defAfterLemma) {
      startGroup({ part: 'II', kind: 'phys_def', number: 1 });
    } else if (groups.local) {
      const number = parseNumber(groups.localValue);

      if (number) {
        const kind = kindFromToken(groups.localKind);
        const first = startGroup({ part: source.part, kind: localKind(kind, source), number });
        resume = readTail(end, first, { allowPartQualifier: true, partIsExplicit: false });
      }
    }

    ANCHOR.lastIndex = Math.max(resume, match.index + 1);
  }

  return references;
};

const localKind = (kind, source) => (kind === 'def' && source.inEmotionDefinitions ? 'affect' : kind);

const readPrefixedTarget = (rest, source) => {
  const relative = rest.match(/^(last|foregoing|preceding)\s+Prop\.?/);

  if (relative) {
    const reference = resolveRelative(relative[1], 'Prop', source);

    if (!reference) {
      return null;
    }

    // A note counts its own proposition as "the last Prop.", but it cannot be pointing
    // at a corollary of that proposition this way; V.xxxiii. note means V.xxxii.'s.
    const fromNote = /\.note\d*$/.test(source.id);
    return { reference: fromNote ? { ...reference, number: reference.number - 1 } : reference, length: relative[0].length };
  }

  const compact = rest.match(new RegExp(String.raw`^(${PART})\.\s*([ivxlc]+)\b\.?`));

  if (compact && parseNumber(compact[2])) {
    return { reference: { part: compact[1], kind: 'prop', number: parseNumber(compact[2]) }, length: compact[0].length };
  }

  const local = rest.match(new RegExp(String.raw`^Prop\.?\s+(${NUM})\b\.?(?:,?\s*(?:of\s+)?(?:Pt\.?|Part)\s+([ivxIVX]+)\b\.?)?`));

  if (local && parseNumber(local[1])) {
    const part = local[2]?.toUpperCase();
    return {
      reference: { part: PART_NUMERALS.includes(part) ? part : source.part, kind: 'prop', number: parseNumber(local[1]) },
      length: local[0].length
    };
  }

  return null;
};

const baseId = ({ part, kind, number }) => {
  switch (kind) {
    // Only Part II has lemmas and post-lemma axioms, whichever part cites them.
    case 'lemma':
      return `II.lemma.${number}`;
    case 'phys_ax2':
      return `II.phys_ax2.${number}`;
    case 'phys_def':
      return 'II.phys_def.1';
    case 'general_definition':
      return 'III.general_definition.note';
    case 'affect':
      return `III.affect.${number}`;
    default:
      return `${part}.${kind}.${number}`;
  }
};

const suffixCandidates = (base, suffix, suffixNumber) => {
  if (!suffixNumber) {
    return [`${base}.${suffix}`, `${base}.${suffix}1`];
  }

  return suffixNumber === 1 ? [`${base}.${suffix}1`, `${base}.${suffix}`] : [`${base}.${suffix}${suffixNumber}`];
};

/**
 * Turns a reference into a passage id. A suffix with no matching passage falls back to
 * its proposition and is reported as "approximate"; a missing base is reported as
 * "unresolved" and yields no citation.
 */
export const resolveReference = (reference, validIds) => {
  const base = baseId(reference);

  if (!validIds.has(base)) {
    return { status: 'unresolved', target: null };
  }

  if (!reference.suffix) {
    return { status: 'exact', target: base };
  }

  const target = suffixCandidates(base, reference.suffix, reference.suffixNumber).find(id => validIds.has(id));
  return target ? { status: 'exact', target } : { status: 'approximate', target: base };
};

export const extractCitations = (text, sourceId, validIds) => {
  const citations = new Set();
  const problems = [];

  parseReferences(text, sourceId).forEach(reference => {
    const { status, target } = resolveReference(reference, validIds);

    if (status !== 'exact') {
      problems.push({ sourceId, status, reference: baseId(reference), suffix: reference.suffix ?? null, suffixNumber: reference.suffixNumber ?? null });
    }

    if (target && target !== sourceId) {
      citations.add(target);
    }
  });

  return { citations: [...citations], problems };
};
