// Parses the Political Treatise. The English (Gosset, 1883), the Latin (Latin Wikisource) and the
// French (Saisset, 1861) number their sections alike, so an ID such as `TP.II.5` fits all three.

import { cleanInline } from './french.mjs';

const ROMAN = { I: 1, V: 5, X: 10, L: 50, C: 100 };

export const fromRoman = numeral => {
  let total = 0;
  [...numeral].forEach((letter, index) => {
    const value = ROMAN[letter];
    const next = ROMAN[numeral[index + 1]] ?? 0;
    total += value < next ? -value : value;
  });
  return total;
};

const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

export const sectionId = (chapter, section) => `TP.${NUMERALS[chapter]}.${section}`;

export const PREFACE_ID = 'TP.preface';

const expandList = list =>
  [...list.matchAll(/(\d+)(?:\s*-\s*(\d+))?/g)].flatMap(([, start, end]) => {
    const first = Number(start);
    const last = end ? Number(end) : first;
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  });

const unflow = text => text.replace(/\s+/g, ' ').trim();

/** Splits a chapter's text into its numbered sections. The first section carries no number. */
const splitSections = paragraphs => {
  const sections = [{ number: 1, paragraphs: [] }];

  paragraphs.forEach(paragraph => {
    const match = paragraph.match(/^(\d+)\.\s+(.*)$/s);
    const next = sections.length + 1;

    if (match && Number(match[1]) === next) {
      sections.push({ number: next, paragraphs: [match[2]] });
    } else {
      sections.at(-1).paragraphs.push(paragraph);
    }
  });

  return sections.map(({ number, paragraphs: body }) => ({ number, text: body.join('\n\n') }));
};

const splitNotes = paragraphs => {
  const notes = new Map();
  let current = null;

  paragraphs.forEach(paragraph => {
    const match = paragraph.match(/^(\d+)\.\s+(.*)$/s);

    if (match) {
      current = Number(match[1]);
      notes.set(current, match[2]);
    } else if (current) {
      notes.set(current, `${notes.get(current)} ${paragraph}`);
    }
  });

  return notes;
};

const toParagraphs = text => text.split(/\n[ \t]*\n/).map(unflow).filter(Boolean);

const toSentenceCase = title =>
  title
    .replace(/\.\s*$/, '')
    .toLowerCase()
    .replace(/\. (?=continuation|conclusion)/, ': ')
    .replace(/^./, letter => letter.toUpperCase());

// The 1883 edition sets the first word of a chapter or letter in capitals: "IN our Treatise".
const openInLowerCase = paragraph =>
  paragraph.replace(/^([A-Z])([A-Z]+)(?=[ ,])(?! [A-Z]{2})/, (_, first, rest) => `${first}${rest.toLowerCase()}`);

/** Returns the preface and chapters of the English text, attaching notes to their sections. */
export const parseEnglish = raw => {
  const text = raw.replace(/\r+\n?/g, '\n');
  const [front, ...chapterParts] = text.split(/^CHAPTER ([IVXL]+)\.[ \t]*$/m);
  const [, preface] = front.split(/^-{20,}[ \t]*$/m);
  const chapters = [];

  for (let index = 0; index < chapterParts.length; index += 2) {
    const number = fromRoman(chapterParts[index]);
    const [body, notesText = ''] = chapterParts[index + 1].split(/^-{20,}[ \t]*$/m)[0].split(/^-{6}[ \t]*$/m);
    const [title, ...paragraphs] = toParagraphs(body);
    const notes = splitNotes(toParagraphs(notesText));
    const used = new Set();

    const sections = splitSections(paragraphs.map(openInLowerCase)).map(section => {
      const footnotes = [...section.text.matchAll(/\[(\d+)\]/g)].map(([, marker]) => {
        const note = notes.get(Number(marker));

        if (note === undefined) {
          throw new Error(`Chapter ${number}, section ${section.number}: marker [${marker}] has no note`);
        }

        used.add(Number(marker));
        return { number: marker, text: note };
      });

      return { ...section, ...(footnotes.length ? { footnotes } : {}) };
    });

    if (used.size !== notes.size) {
      throw new Error(`Chapter ${number}: ${notes.size} notes but ${used.size} markers`);
    }

    chapters.push({ number, title: toSentenceCase(title), sections });
  }

  return { preface: toParagraphs(preface ?? '').map(openInLowerCase).join('\n\n'), chapters };
};

const decodeEntities = text =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

const LATIN_BLOCK = /<(p|dt|dd)\b[^>]*>([\s\S]*?)<\/\1>/g;

// The page numbers its notes "(1)" to "(51)" but gives no notes.
const cleanLatin = html => unflow(decodeEntities(html.replace(/<[^>]+>/g, ''))).replace(/\s*\(\d+\)/g, '');

const blocksOf = html => [...html.matchAll(LATIN_BLOCK)].map(match => cleanLatin(match[2])).filter(Boolean);

/**
 * Returns the preface and chapters of the Latin. Text before a chapter's first numbered
 * section (only Chapter VIII's synopsis) is kept, opening that first section.
 */
export const parseLatin = html => {
  const source = html
    .replace(/<span class="mw-editsection">[\s\S]*?<\/span><\/span>/g, '')
    // A stray "`" runs IX.5 into the end of IX.4.
    .replace(/\s*`\s*(?=V\. Nempe)/, '</p><p>');
  const [front, ...chapterParts] = source.split(/<h2 id="CAPUT[^"]*">[\s\S]*?<\/h2>/);
  const chapters = chapterParts.map((part, index) => {
    const sections = [];
    let lead = [];

    blocksOf(part).forEach(block => {
      // The page misprints one numeral as "XLVlI".
      const match = block.match(/^([IVXLCl]+)\s*\.\s+(.*)$/s);

      if (block === 'Reliqua desiderantur.') {
        return;
      }

      if (match) {
        sections.push({ number: fromRoman(match[1].replace(/l/g, 'I')), paragraphs: [...lead, match[2]] });
        lead = [];
      } else if (sections.length) {
        sections.at(-1).paragraphs.push(block);
      } else {
        lead.push(block);
      }
    });

    return {
      number: index + 1,
      sections: sections.map(({ number, paragraphs }) => ({ number, text: paragraphs.join('\n\n') }))
    };
  });

  // What comes before the letter is the title page.
  const prefaceBlocks = blocksOf(front);
  const letter = prefaceBlocks.findIndex(block => block.startsWith('Auctoris epistola'));

  return { preface: prefaceBlocks.slice(letter).join('\n\n'), chapters };
};

const withoutPageMarkup = html =>
  html
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ol class="references">[\s\S]*?<\/ol>/g, '')
    .replace(/<br\s*\/?>/g, ' ');

const paragraphsOf = html => [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(match => cleanInline(match[1])).filter(Boolean);

/**
 * Returns one chapter's numbered sections from a French Wikisource page. Each numeral must
 * be the next one. A paragraph opening in lower case continues the last across a page break.
 */
export const parseFrenchChapter = html => {
  const sections = [];

  paragraphsOf(withoutPageMarkup(html)).forEach(paragraph => {
    const match = paragraph.match(/^(\d+)\.[\s\u00a0]+(.*)$/s);

    // The closing line, like the Latin's "Reliqua desiderantur".
    if (paragraph === 'Le reste manque.') {
      return;
    }

    if (match && Number(match[1]) === sections.length + 1) {
      sections.push({ number: sections.length + 1, text: match[2] });
    } else if (!sections.length) {
      throw new Error(`Text before the first section: ${paragraph.slice(0, 60)}`);
    } else {
      const last = sections.at(-1);
      last.text = `${last.text}${/^[a-zà-ÿ]/.test(paragraph) ? ' ' : '\n\n'}${paragraph}`;
    }
  });

  return sections;
};

/** Returns the letter that serves as the preface, with its heading as the first paragraph. */
export const parseFrenchPreface = html => {
  const source = withoutPageMarkup(html);
  const heading = cleanInline(source.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? '');
  return [heading, ...paragraphsOf(source)].filter(Boolean).join('\n\n');
};

/** Returns the notes a French Wikisource page lists, in order. */
export const parseFrenchNotes = html => {
  const list = html.match(/<ol class="references">([\s\S]*?)<\/ol>/)?.[1] ?? '';
  return [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(match => cleanInline(match[1]).replace(/^↑\s*/, ''));
};

/**
 * Pairs each "[n]" marker in a passage with note n. Fails if a marker has no note or a note
 * has no marker, so nothing is lost silently.
 */
export const attachNotes = (passages, notesByNumber) => {
  const used = new Set();

  const result = passages.map(passage => {
    const footnotes = [...passage.text.matchAll(/\[(\d+)\]/g)].map(([, number]) => {
      if (!notesByNumber.has(number)) {
        throw new Error(`${passage.id} has marker [${number}] with no note`);
      }

      used.add(number);
      return { number, text: notesByNumber.get(number) };
    });

    return { ...passage, ...(footnotes.length ? { footnotes } : {}) };
  });

  const unused = [...notesByNumber.keys()].filter(number => !used.has(number));

  if (unused.length) {
    throw new Error(`Notes with no marker: ${unused.join(', ')}`);
  }

  return result;
};

const ENGLISH_ORDINALS = Object.fromEntries(
  [
    'first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth',
    'seventeenth eighteenth nineteenth twentieth'
  ]
    .join(' ')
    .split(' ')
    .map((word, index) => [word, index + 1])
);

const TENS = { twenty: 20, thirty: 30, forty: 40 };

const ordinal = word => {
  const lower = word.toLowerCase();
  const [tens, unit] = lower.split('-');

  if (unit) {
    return (TENS[tens] ?? 0) + (ENGLISH_ORDINALS[unit] ?? Number.NaN);
  }

  return ENGLISH_ORDINALS[lower] ?? (lower === 'thirtieth' ? 30 : lower === 'fortieth' ? 40 : Number.NaN);
};

const ORDINAL_WORD = '[a-z]+(?:-[a-z]+)?';

/** Section references in the English of one section, as [chapter, section] pairs. */
export const extractEnglishReferences = (text, chapter, section) => {
  const found = [];
  const body = unflow(text.replace(/\[\d+\]/g, ''));
  const add = (targetChapter, numbers) => numbers.forEach(number => found.push([targetChapter, number]));
  const LIST = String.raw`\d+(?:\s*-\s*\d+)?(?:(?:,\s*(?:and\s+)?|\s+and\s+)\d+(?:\s*-\s*\d+)?)*`;
  const pattern = new RegExp(
    String.raw`(?:Chap\.\s*([IVXL]+)\.?,?\s*)?\b(?:Secs?|Sects?)\.\s*(${LIST})(\s+of the last chapter|\s+of this chapter)?` +
      String.raw`|\bSections?\s+(${LIST})` +
      String.raw`|\bthe\s+(${ORDINAL_WORD})(?:\s+and\s+(${ORDINAL_WORD}))?\s+sections?(?:\s+of\s+(?:the|this)\s+(${ORDINAL_WORD})\s*chapter|\s+of\s+this\s+chapter)?` +
      String.raw`|\bthe\s+(${ORDINAL_WORD})\s+and\s+following\s+sections` +
      String.raw`|\b(?:the|by\s+the)\s+last\s+section`,
    'g'
  );

  for (const match of body.matchAll(pattern)) {
    const [whole, chapterNumeral, list, scope, spelled, firstWord, secondWord, namedChapter, followingWord] = match;

    if (list) {
      add(chapterNumeral ? fromRoman(chapterNumeral) : /last/.test(scope ?? '') ? chapter - 1 : chapter, expandList(list));
    } else if (spelled) {
      add(chapter, expandList(spelled));
    } else if (firstWord && firstWord !== 'last') {
      const target = !namedChapter ? chapter : namedChapter === 'last' ? chapter - 1 : ordinal(namedChapter);
      add(target, [firstWord, secondWord].filter(Boolean).map(ordinal));
    } else if (followingWord) {
      add(chapter, [ordinal(followingWord)]);
    } else if (/last sections?/.test(whole)) {
      add(chapter, [section - 1]);
    }
  }

  return found.filter(([, number]) => Number.isFinite(number));
};

/** Section references in the Latin of one section, as [chapter, section] pairs. */
export const extractLatinReferences = (text, chapter, section) => {
  const found = [];
  const body = unflow(text);
  const ARTICLE = String.raw`\bArt(?:ic(?:ul[a-z]*)?)?\.?`;
  const NUMBER = String.raw`(?:\d+|[IVXL]+\b)`;
  // "3. 5. et 6.", "3.4. et 5.", "15. usque ad 27."; a number needs a separator, so "Art. 3. Cap." stops at 3.
  const LIST = String.raw`${NUMBER}(?:\.?\s*(?:,|et|usque\s+ad)?\s*${NUMBER}(?=\.|\s*(?:,|et\b|hujus|huj|ejusdem|praec|Cap|\)|$)))*\.?`;
  const value = token => (/^\d+$/.test(token) ? Number(token) : fromRoman(token.toUpperCase()));
  // The page misreads the numeral 11 as "II" in II.20; an Arabic list never holds a Roman numeral.
  const numbers = list => {
    const tokens = [...list.matchAll(new RegExp(NUMBER, 'g'))].map(([token]) => token);

    if (/usque\s+ad/.test(list)) {
      const [first, last] = tokens.map(value);
      return Array.from({ length: last - first + 1 }, (_, index) => first + index);
    }

    return tokens.map(token => (token === 'II' && tokens.some(other => /^\d+$/.test(other)) ? 11 : value(token)));
  };
  const pattern = new RegExp(
    // "Cap. 4. Art. 4. et 5."
    String.raw`\bCap(?:\.|itis)?\s*(${NUMBER})\.?,?\s*${ARTICLE}\s*(${LIST})` +
      // "Art. 5. praec. Cap.", "Art. 17. Cap. praeced.", "Art. 4. Cap. 2.", "Art. 2. hujus Cap.", "Art. 16."
      String.raw`|${ARTICLE}\s*(${LIST})\s*(?:(?:in\s+)?(praec\w*)\.?\s+Cap\S*|Cap\S*\s+(praec\w*)|(?:,\s*)?Cap(?:\.|itis)?\s*(${NUMBER})|(?:hujus|huj\.|ejusdem)\s+Cap\S*)?` +
      // "praec. Art.", "Art. praec."
      String.raw`|\bpraec\w*\.?\s+Art\S*|${ARTICLE}\s*praec\w*`,
    'g'
  );
  let lastTarget = chapter;

  for (const match of body.matchAll(pattern)) {
    const [whole, leadingChapter, leadingList, list, previousBefore, previousAfter, trailingChapter] = match;

    if (leadingList) {
      numbers(leadingList).forEach(number => found.push([value(leadingChapter), number]));
    } else if (list) {
      // "ejusdem Cap." repeats the chapter just named.
      const target = trailingChapter
        ? value(trailingChapter)
        : previousBefore || previousAfter
          ? chapter - 1
          : /ejusdem/.test(whole)
            ? lastTarget
            : chapter;
      lastTarget = target;
      numbers(list).forEach(number => found.push([target, number]));
    } else {
      found.push([chapter, section - 1]);
    }
  }

  return found;
};
