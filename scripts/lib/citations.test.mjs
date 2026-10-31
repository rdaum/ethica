import { describe, expect, test } from 'vitest';
import { extractCitations, parseReferences } from './citations.mjs';

const targets = (text, sourceId, validIds) => extractCitations(text, sourceId, new Set(validIds)).citations;

const ids = (...parts) => parts;

describe('part qualifiers', () => {
  test.each([
    ['Part i., Ax. iv. is clear', 'II.prop.7.proof', ids('I.ax.4', 'II.ax.4'), ['I.ax.4']],
    ['(by Prop. xvi., Part i.)', 'II.prop.3.proof', ids('I.prop.16', 'II.prop.16'), ['I.prop.16']],
    ['(Prop. xxviii. of Part i.)', 'II.prop.9.proof', ids('I.prop.28', 'II.prop.28'), ['I.prop.28']],
    ['Pt. i., Deff. iii. and v.', 'II.prop.1.proof', ids('I.def.3', 'I.def.5', 'II.def.3', 'II.def.5'), ['I.def.3', 'I.def.5']],
    ['(I. Ax. vi.)', 'II.prop.44.proof', ids('I.ax.6', 'II.ax.6'), ['I.ax.6']],
    ['(II., Def. i.)', 'II.lemma.3.proof', ids('II.def.1'), ['II.def.1']],
    ['(III. xiii.)', 'IV.prop.5.proof', ids('III.prop.13', 'IV.prop.13'), ['III.prop.13']],
    ['(by i. 15)', 'II.prop.10.corollary', ids('I.prop.15'), ['I.prop.15']],
    ['Part iv. from Prop. xviii. to the end', 'III.prop.1.note', ids('IV.prop.18', 'III.prop.18'), ['IV.prop.18']],
    ['(I. xi. and Def. i.)', 'V.prop.35.proof', ids('I.prop.11', 'I.def.1'), ['I.prop.11', 'I.def.1']],
    ['from Postulate iv., Part II., that', 'IV.prop.18.note', ids('II.post.4'), ['II.post.4']]
  ])('%s', (text, source, valid, expected) => {
    expect(targets(text, source, valid)).toEqual(expected);
  });
});

describe('local references', () => {
  test.each([
    ['(by Def. iv. and Prop. x.)', 'I.prop.12.proof', ids('I.def.4', 'I.prop.10'), ['I.def.4', 'I.prop.10']],
    ['(Deff. iii. and vi.)', 'I.prop.5.proof', ids('I.def.3', 'I.def.6'), ['I.def.3', 'I.def.6']],
    ['Props. xxi., xxii., xxiii. that', 'I.appendix.introduction', ids('I.prop.21', 'I.prop.22', 'I.prop.23'), ['I.prop.21', 'I.prop.22', 'I.prop.23']],
    ['(by Prop. iii. of this Part)', 'II.prop.5.proof', ids('II.prop.3'), ['II.prop.3']],
    ['(by Lemma ii.)', 'III.prop.1.proof', ids('II.lemma.2'), ['II.lemma.2']],
    ['Lemmas v. and vii., which see', 'III.post.1.note', ids('II.lemma.5', 'II.lemma.7'), ['II.lemma.5', 'II.lemma.7']]
  ])('%s', (text, source, valid, expected) => {
    expect(targets(text, source, valid)).toEqual(expected);
  });

  test('ignores references to another book', () => {
    expect(targets('See Prop. xii. of my "Principles of Cartesian Philosophy."', 'I.prop.19.note', ['I.prop.12'])).toEqual([]);
  });

  test('never cites the passage itself', () => {
    expect(targets('(Prop. iii.)', 'I.prop.3', ['I.prop.3'])).toEqual([]);
  });

  test('does not read an ordinary word as a numeral', () => {
    expect(parseReferences('Prop. iii. and mix.', 'I.prop.5.proof')).toHaveLength(1);
  });
});

describe('corollaries and notes', () => {
  const valid = ids('I.prop.16', 'I.prop.16.corollary1', 'I.prop.16.corollary2', 'II.prop.7', 'II.prop.7.corollary', 'II.prop.7.note', 'III.prop.13', 'III.prop.13.note', 'IV.prop.37', 'IV.prop.37.note1', 'IV.prop.37.note2');

  test.each([
    ['(II. vii. Coroll.)', ['II.prop.7.corollary']],
    ['(I. xvi. Coroll. ii.)', ['I.prop.16.corollary2']],
    ['(III. xiii. note)', ['III.prop.13.note']],
    ['(IV. xxxvii. note. ii.)', ['IV.prop.37.note2']],
    ['(IV. xxxvii. note. i.)', ['IV.prop.37.note1']],
    ['(III. xiii. and note)', ['III.prop.13.note']],
    ['note to II. vii.', ['II.prop.7.note']],
    ['Corollary and note to II. vii.', ['II.prop.7.corollary', 'II.prop.7.note']],
    ['Coroll. after II. vii.', ['II.prop.7.corollary']]
  ])('%s', (text, expected) => {
    expect(targets(text, 'V.prop.1.proof', valid)).toEqual(expected);
  });

  test('a numbered reference finds an unnumbered single corollary', () => {
    expect(targets('(II. vii. Coroll. i.)', 'V.prop.1.proof', valid)).toEqual(['II.prop.7.corollary']);
  });

  test('an unnumbered reference finds the first of several', () => {
    expect(targets('(I. xvi. Coroll.)', 'V.prop.1.proof', valid)).toEqual(['I.prop.16.corollary1']);
  });

  test('a suffix with no passage falls back to the proposition and is reported', () => {
    const { citations, problems } = extractCitations('(III. xiii. Coroll.)', 'V.prop.1.proof', new Set(valid));
    expect(citations).toEqual(['III.prop.13']);
    expect(problems).toEqual([
      { sourceId: 'V.prop.1.proof', status: 'approximate', reference: 'III.prop.13', suffix: 'corollary', suffixNumber: null }
    ]);
  });

  test('a citation with no target is reported rather than dropped silently', () => {
    const { citations, problems } = extractCitations('(Prop. xcix.)', 'V.prop.1.proof', new Set());
    expect(citations).toEqual([]);
    expect(problems[0]).toMatchObject({ status: 'unresolved', reference: 'V.prop.99' });
  });
});

describe('definitions of the emotions', () => {
  const valid = ids('III.affect.18', 'III.affect.19', 'III.affect.20', 'III.general_definition.note', 'III.def.3');

  test.each([
    ['(Def. of the Emotions, xviii.)', 'IV.prop.50.proof', ['III.affect.18']],
    ['(Def. of Emotions, xix.)', 'IV.prop.51.proof', ['III.affect.19']],
    ['(Def. of the Emotions, xviii. and xix.)', 'IV.prop.50.proof', ['III.affect.18', 'III.affect.19']],
    ['(Def. of the Emotions, xviii. xix.)', 'IV.prop.50.proof', ['III.affect.18', 'III.affect.19']],
    ['(by the general Def. of the Emotions)', 'IV.prop.7.proof', ['III.general_definition.note']],
    ['Definitions of the Emotions', 'IV.prop.7.proof', ['III.general_definition.note']]
  ])('%s', (text, source, expected) => {
    expect(targets(text, source, valid)).toEqual(expected);
  });

  test('Def. inside the emotion definitions means another emotion definition', () => {
    expect(targets('(see Def. xviii.)', 'III.affect.20.explanation', valid)).toEqual(['III.affect.18']);
  });
});

describe('relative references', () => {
  const valid = ids('I.prop.1', 'I.prop.5', 'I.prop.6', 'I.prop.7', 'II.lemma.3', 'II.lemma.4', 'II.prop.13', 'I.prop.5.corollary');

  test.each([
    ['(by the last Prop.)', 'I.prop.6.proof', ['I.prop.5']],
    ['(by the foregoing Prop.)', 'I.prop.6.proof', ['I.prop.5']],
    ['the preceding proposition', 'I.prop.6.proof', ['I.prop.5']],
    ['(by the last Prop.)', 'I.prop.6.proof2', ['I.prop.5']],
    ['(by the first Prop. of this Part)', 'I.prop.6.proof', ['I.prop.1']],
    ['(by the last Prop.)', 'I.prop.6.corollary', ['I.prop.6']],
    ['(by the last Prop.)', 'I.prop.6.corollary.proof', ['I.prop.6']],
    ['(by the last Prop.)', 'I.prop.6.note', ['I.prop.6']],
    ['Coroll. of the last Prop.', 'I.prop.6.proof', ['I.prop.5.corollary']],
    ['Coroll. of the last Prop.', 'I.prop.6.note', ['I.prop.5.corollary']],
    ['(by the last Lemma)', 'II.lemma.4.proof', ['II.lemma.3']],
    ['(by the last Prop.)', 'II.lemma.4.proof', ['II.prop.13']]
  ])('%s from %s', (text, source, expected) => {
    expect(targets(text, source, valid)).toEqual(expected);
  });

  test('has nothing to count back from in a preface', () => {
    expect(targets('the last Prop.', 'III.preface', valid)).toEqual([]);
  });
});

describe('axioms and the definition after Lemma III', () => {
  const valid = ids('II.phys_ax2.1', 'II.phys_ax2.3', 'II.phys_def.1', 'II.post.3', 'II.prop.13', 'II.lemma.3');

  test.each([
    ['(Ax. i., after the Coroll. of Lemma iii.)', 'II.prop.14.proof', ['II.phys_ax2.1']],
    ['(by Ax. i. after Lemma iii. after II. xiii.)', 'III.prop.51.proof', ['II.phys_ax2.1']],
    ['Ax. i. (which see after Lemma iii. Prop. xiii., Part II.)', 'III.prop.57.proof', ['II.phys_ax2.1']],
    ['(Def. after Lemma iii.)', 'II.prop.24.proof', ['II.phys_def.1']]
  ])('%s', (text, source, expected) => {
    expect(targets(text, source, valid)).toEqual(expected);
  });
});
