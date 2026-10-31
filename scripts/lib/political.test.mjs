import { describe, expect, test } from 'vitest';
import { extractEnglishReferences, extractLatinReferences, fromRoman, parseEnglish, parseLatin, sectionId } from './political.mjs';

describe('parseEnglish', () => {
  const source = [
    'TITLE',
    '',
    '------------------------',
    '',
    'The preface.',
    '',
    '------------------------',
    '',
    'CHAPTER I.',
    '',
    'INTRODUCTION.',
    '',
    'The first section, with a note. [1]',
    'It runs on.',
    '',
    '2. The second section.',
    '',
    'A second paragraph of it.',
    '',
    '------',
    '',
    '1. Ethics, iv. 4,',
    'Coroll.',
    '',
    '------------------------',
    '',
    'CHAPTER II.',
    '',
    'OF ARISTOCRACY. CONTINUATION.',
    '',
    'Only one.',
    ''
  ].join('\r\r\n');

  test('finds the preface, titles, and numbered sections, with an unnumbered first section', () => {
    const { preface, chapters } = parseEnglish(source);
    expect(preface).toBe('The preface.');
    expect(chapters.map(chapter => chapter.title)).toEqual(['Introduction', 'Of aristocracy: continuation']);
    expect(chapters[0].sections.map(section => section.number)).toEqual([1, 2]);
    expect(chapters[0].sections[0].text).toBe('The first section, with a note. [1] It runs on.');
    expect(chapters[0].sections[1].text).toBe('The second section.\n\nA second paragraph of it.');
  });

  test('takes the capitals off a chapter’s first word, but not off a heading', () => {
    const { preface, chapters } = parseEnglish(
      source.replace('The preface.', 'FROM THE EDITOR.\r\r\n\r\r\nOUR author.').replace('The first section', 'UNDER every section')
    );
    expect(preface).toBe('FROM THE EDITOR.\n\nOur author.');
    expect(chapters[0].sections[0].text).toContain('Under every section');
  });

  test('attaches notes to the section with the marker', () => {
    const { chapters } = parseEnglish(source);
    expect(chapters[0].sections[0].footnotes).toEqual([{ number: '1', text: 'Ethics, iv. 4, Coroll.' }]);
    expect(chapters[0].sections[1].footnotes).toBeUndefined();
  });

  test('fails on a marker with no note, and on a note with no marker', () => {
    expect(() => parseEnglish(source.replace('[1]', '[2]'))).toThrow(/no note/);
    expect(() => parseEnglish(source.replace(' [1]', ''))).toThrow(/1 notes but 0 markers/);
  });

  test('only takes a number as a new section when it comes next', () => {
    const { chapters } = parseEnglish(source.replace('2. The second', '5. The second'));
    expect(chapters[0].sections).toHaveLength(1);
  });
});

describe('parseLatin', () => {
  const html = [
    '<p>Title page</p><p>Auctoris epistola ad Amicum</p><p>Amice dilecte</p>',
    '<h2 id="CAPUT_I.">CAPUT I.</h2><dl><dt>I. Primus (1) articulus.</dt></dl><p>II. Secundus.</p>',
    '<h2 id="CAPUT_II.">CAPUT II.</h2><p>Synopsis.</p><p>I. Unus.</p><p>XLVlI. Misprinted.</p><p>Reliqua desiderantur.</p>'
  ].join('');

  test('finds the letter and sections, without the title page, note markers, or closing line', () => {
    const { preface, chapters } = parseLatin(html);
    expect(preface).toBe('Auctoris epistola ad Amicum\n\nAmice dilecte');
    expect(chapters[0].sections).toEqual([
      { number: 1, text: 'Primus articulus.' },
      { number: 2, text: 'Secundus.' }
    ]);
  });

  test('keeps a synopsis, and reads the misprinted numeral', () => {
    const { chapters } = parseLatin(html);
    expect(chapters[1].sections[0].text).toBe('Synopsis.\n\nUnus.');
    expect(chapters[1].sections[1].number).toBe(47);
  });
});

describe('extractEnglishReferences', () => {
  test.each([
    ['as shown (Sec. 7)', [[3, 7]]],
    ['(Chap. II. Sec. 17)', [[2, 17]]],
    ['(Chap. I, Sec. 5)', [[1, 5]]],
    ['see Chap. VI. Sects. 3, 5, 6.', [[6, 3], [6, 5], [6, 6]]],
    ['Secs. 5 and 6', [[3, 5], [3, 6]]],
    ['Chap. III. Secs. 3-5', [[3, 3], [3, 4], [3, 5]]],
    ['in Secs. 15-16 of the last chapter', [[2, 15], [2, 16]]],
    ['in the third section of the last chapter', [[2, 3]]],
    ['the thirty-fourth and thirty-fifth sections of the last chapter', [[2, 34], [2, 35]]],
    ['the twenty-ninth section of the sixth chapter', [[6, 29]]],
    ['in the ninth section of this chapter', [[3, 9]]],
    ['the fifteenth and following sections', [[3, 15]]],
    ['as we said in the last section', [[3, 9]]],
    ['the note [1] alone, and Chap. III.', []]
  ])('reads %s', (text, expected) => {
    expect(extractEnglishReferences(text, 3, 10)).toEqual(expected);
  });
});

describe('extractLatinReferences', () => {
  test.each([
    ['(per Art. 16.)', [[3, 16]]],
    ['(per Art. 16. hujus Cap.)', [[3, 16]]],
    ['(per Art. 4. Cap. 2.)', [[2, 4]]],
    ['(per Art. 5. Cap. I.)', [[1, 5]]],
    ['ut in Art. 5. praec. Cap. diximus', [[2, 5]]],
    ['in Art. 17. Cap. praeced. diximus', [[2, 17]]],
    ['Art. 3. 5. et 6. praec. Cap.', [[2, 3], [2, 5], [2, 6]]],
    ['Art. 3.4. et 5. huj. Cap.', [[3, 3], [3, 4], [3, 5]]],
    ['vide Cap. 4. Art. 4. et 5., ubi', [[4, 4], [4, 5]]],
    ['ex Art. 15. usque ad 17. in', [[3, 15], [3, 16], [3, 17]]],
    ['ut in praec. Art. diximus', [[3, 9]]],
    ['Art. 31. praeced. Cap. et Art. 10. ejusdem Cap.', [[2, 31], [2, 10]]],
    ['Vide Art. 7. et II. hujus Cap.', [[3, 7], [3, 11]]],
    ['nothing here', []]
  ])('reads %s', (text, expected) => {
    expect(extractLatinReferences(text, 3, 10)).toEqual(expected);
  });
});

test('names sections by chapter numeral', () => {
  expect(sectionId(7, 6)).toBe('TP.VII.6');
  expect(fromRoman('XLIX')).toBe(49);
});
