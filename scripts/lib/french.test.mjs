import { describe, expect, it } from 'vitest';
import { applyCorrections, assignPassages, cleanInline, collectFootnotes, mergePassages, parseBlocks, renamePassages, splitPassages } from './french.mjs';

const label = text => `<div style="text-align:center;clear:both;font-size:smaller;">${text}</div>`;

const SAMPLE = [
  '<h2>PREMIÈRE PARTIE DE L’ÉTHIQUE</h2><h3><b>DE DIEU</b></h3>',
  '<h4>DÉFINITIONS</h4>',
  '<p><span id="1d1"></span>I. Première définition.</p>',
  label('EXPLICATION'),
  '<p>Explication.</p>',
  '<h4>AXIOMES</h4><p><span id="1a1"></span>I. Un axiome.</p>',
  '<span id="1p1"></span><h4>PROPOSITION I</h4><p><i>Énoncé.</i></p>',
  label('DÉMONSTRATION '),
  '<p>Preuve. <abbr title="x">C.&#160;Q.&#160;F.&#160;D.</abbr></p>',
  label('AUTRE DÉMONSTRATION'),
  '<p>Seconde preuve.</p>',
  label('COROLLAIRE I'),
  '<p>Un corollaire.</p>',
  label('DÉMONSTRATION'),
  '<p>Sa preuve.</p>',
  label('SCOLIE'),
  '<p>Un scolie.</p><p>Suite du scolie.</p>',
  label('SCOLIE II'),
  '<p>Second scolie.</p>',
  label('APPENDICE'),
  '<p>Annexe.</p>',
  label('FIN DE LA PREMIÈRE PARTIE')
].join('\n');

describe('French source parsing', () => {
  it('keeps non-breaking spaces and drops markup', () => {
    expect(cleanInline('un  <i>mot</i>&#160;; 1<sup style="x">o</sup> <abbr>C.</abbr>')).toBe('un mot ; 1° C.');
  });

  it('removes page markers without joining words', () => {
    const page = 'un&#32;<span><span class="pagenum ws-pagenum" id="39" title="Page"></span></span>être';
    expect(parseBlocks(`<p>${page}</p>`)[0].text).toBe('un être');
  });

  it('assigns every label to the ID the English text uses', () => {
    const { passages, unassigned, unknownLabels } = assignPassages(parseBlocks(SAMPLE), 'I');

    expect(unassigned).toEqual([]);
    expect(unknownLabels).toEqual([]);
    expect(passages).toEqual({
      'I.def.1': 'Première définition.',
      'I.def.1.explanation': 'Explication.',
      'I.ax.1': 'Un axiome.',
      'I.prop.1': 'Énoncé.',
      'I.prop.1.proof': 'Preuve. C. Q. F. D.',
      'I.prop.1.proof2': 'Seconde preuve.',
      'I.prop.1.corollary1': 'Un corollaire.',
      'I.prop.1.corollary1.proof': 'Sa preuve.',
      'I.prop.1.note': 'Un scolie.\n\nSuite du scolie.',
      'I.prop.1.note2': 'Second scolie.',
      'I.appendix.introduction': 'Annexe.'
    });
  });

  it('handles the lemmas and axioms on bodies after II.xiii', () => {
    const html = [
      '<h4>PROPOSITION XIII</h4><p>Énoncé.</p>',
      label('AXIOME I'), '<p>Premier.</p>',
      label('LEMME I'), '<p>Lemme.</p>',
      label('DÉMONSTRATION'), '<p>Preuve du lemme.</p>',
      label('COROLLAIRE'), '<p>Corollaire du lemme.</p>',
      label('AXIOME I'), '<p>Second groupe.</p>',
      label('DÉFINITION'), '<p>Individu.</p>',
      label('LEMME VII'), '<p>Dernier.</p>',
      label('SCOLIE'), '<p>Scolie du lemme.</p>',
      '<h4>POSTULATS</h4><p>I. Un postulat.</p>',
      '<h4>PROPOSITION XIV</h4><p>Suite.</p>'
    ].join('');

    expect(assignPassages(parseBlocks(html), 'II').passages).toEqual({
      'II.prop.13': 'Énoncé.',
      'II.phys_ax.1': 'Premier.',
      'II.lemma.1': 'Lemme.',
      'II.lemma.1.proof': 'Preuve du lemme.',
      'II.lemma.1.corollary': 'Corollaire du lemme.',
      'II.phys_ax2.1': 'Second groupe.',
      'II.phys_def.1': 'Individu.',
      'II.lemma.7': 'Dernier.',
      'II.lemma.7.note': 'Scolie du lemme.',
      'II.post.1': 'Un postulat.',
      'II.prop.14': 'Suite.'
    });
  });

  it('handles prefaces, emotions and the general definition', () => {
    const html = [
      '<h2>TROISIÈME PARTIE DE L’ÉTHIQUE</h2><h3>DES AFFECTIONS</h3>',
      '<p>Une préface sans titre.</p>',
      '<h4>DÉFINITIONS DES AFFECTIONS</h4>',
      label('I'), '<p>Le Désir.</p>',
      label('EXPLICATION'), '<p>Explication.</p>',
      label('DÉFINITION GÉNÉRALE DES AFFECTIONS'), '<p>Une Affection.</p>',
      label('EXPLICATION'), '<p>Je dis.</p>'
    ].join('');

    expect(assignPassages(parseBlocks(html), 'III').passages).toEqual({
      'III.preface': 'Une préface sans titre.',
      'III.affect.1': 'Le Désir.',
      'III.affect.1.explanation': 'Explication.',
      'III.general_definition.note': 'Une Affection.\n\nJe dis.'
    });
  });

  it('numbers a repeated corollary, an unnumbered axiom and appendix chapters', () => {
    const html = [
      '<h4>AXIOME</h4><p>Unique.</p>',
      '<h4>PROPOSITION LV</h4><p>Énoncé.</p>',
      label('COROLLAIRE'), '<p>Premier.</p>',
      label('COROLLAIRE'), '<p>Second.</p>',
      label('DÉMONSTRATION'), '<p>Sa preuve.</p>',
      label('APPENDICE'), '<p>Annexe.</p>',
      label('CHAPITRE II'), '<p>Chapitre.</p>'
    ].join('');

    expect(assignPassages(parseBlocks(html), 'IV').passages).toEqual({
      'IV.ax.1': 'Unique.',
      'IV.prop.55': 'Énoncé.',
      'IV.prop.55.corollary': 'Premier.',
      'IV.prop.55.corollary2': 'Second.',
      'IV.prop.55.corollary2.proof': 'Sa preuve.',
      'IV.appendix.introduction': 'Annexe.',
      'IV.appendix.chapter.2': 'Chapitre.'
    });
  });

  it('keeps footnotes with their passages and fails if one is orphaned', () => {
    const notes = '<ol class="references"><li id="n"><a href="#r">↑</a> N. B. Une note.</li></ol>';
    expect(collectFootnotes(notes, { a: 'Les hommes[1] voient.', b: 'Rien.' })).toEqual({
      a: [{ number: '1', text: 'N. B. Une note.' }]
    });
    expect(() => collectFootnotes(notes, { a: 'Rien.' })).toThrow(/1 notes but 0 markers/);
    expect(() => collectFootnotes('', { a: 'Texte[1].' })).toThrow(/no note/);
  });

  it('renders a footnote reference as a marker', () => {
    const reference = '<sup class="reference"><a href="#n"><span>&#91;</span>1<span>&#93;</span></a></sup>';
    expect(parseBlocks(`<p>Les hommes${reference} voient.</p>`)[0].text).toBe('Les hommes[1] voient.');
  });

  it('renames passages and splits one at a paragraph', () => {
    expect(renamePassages({ a: 'A' }, { a: 'b' })).toEqual({ b: 'A' });
    expect(splitPassages({ a: 'Un.\n\nDeux.' }, [{ from: 'a', to: 'b', marker: 'Deux' }])).toEqual({ a: 'Un.', b: 'Deux.' });
    expect(() => splitPassages({ a: 'Un.' }, [{ from: 'a', to: 'b', marker: 'Deux' }])).toThrow(/begins with/);
  });

  it('reports labels it does not recognise instead of dropping them', () => {
    const { unknownLabels } = assignPassages(parseBlocks(`<h4>DÉFINITIONS</h4>${label('TITRE INCONNU')}`), 'II');
    expect(unknownLabels).toEqual(['TITRE INCONNU']);
  });

  it('applies a correction and fails when it no longer matches', () => {
    const correction = { id: 'a', from: 'ici, Mais', to: 'ici. Mais' };
    expect(applyCorrections({ a: 'ici, Mais non' }, [correction])).toEqual({ a: 'ici. Mais non' });
    expect(() => applyCorrections({ a: 'autre' }, [correction])).toThrow(/matched 0 times/);
  });

  it('merges a passage into its target as a new paragraph', () => {
    expect(mergePassages({ a: 'A', b: 'B' }, { b: 'a' })).toEqual({ a: 'A\n\nB' });
  });
});
