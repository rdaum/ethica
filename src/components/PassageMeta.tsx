import React from 'react';
import { getPassageText, LANGUAGE_CODES, LANGUAGE_NAMES, stripFootnoteMarkers } from '../lib/ethica';
import { Language, ReadingLanguages, SpinozaElement } from '../types';

type MetadataChip = {
  label: string;
  tone: string;
  description: string;
};

const getMetadataChips = (element: SpinozaElement): MetadataChip[] => {
  const chips: MetadataChip[] = [];

  if (element.variantLabel) {
    chips.push({
      label: 'Alternate',
      tone: 'ink',
      description: 'Spinoza gives this as another proof of the same proposition.'
    });
  }

  if (element.isEditorial) {
    chips.push({
      label: 'Editorial',
      tone: 'rose',
      description: 'This passage was added or separated by the edition, rather than preserved as a standalone passage in the Latin source.'
    });
  } else if (element.editorialKind === 'synthetic_heading') {
    chips.push({
      label: 'Normalized Heading',
      tone: 'gold',
      description: 'This heading is a normalized reader aid created to label a section consistently.'
    });
  }

  if (element.sourceAuthority === 'latin_governed') {
    chips.push({
      label: 'Latin-Based',
      tone: 'green',
      description: 'The reader derives this passage structure and its analysis from the Latin source text.'
    });
  }

  if (element.sourceAuthority === 'english_structural') {
    chips.push({
      label: 'English-Based',
      tone: 'rose',
      description: 'The reader derives this passage structure or analysis from editorial decisions in the English edition.'
    });
  }

  return chips;
};

export const MetadataChips: React.FC<{ element: SpinozaElement }> = ({ element }) => {
  const chips = getMetadataChips(element);

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="metadata-chips" aria-label="Passage metadata">
      {chips.map(chip => (
        <span
          key={`${chip.tone}-${chip.label}`}
          className={`metadata-chip ${chip.tone}`}
          title={chip.description}
          aria-label={`${chip.label}: ${chip.description}`}
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
};

const truncate = (text: string, length: number): string => (text.length > length ? `${text.slice(0, length).trim()}…` : text);

const PreviewParagraph: React.FC<{ element: SpinozaElement; language: Language; length: number }> = ({ element, language, length }) => {
  const { text, available } = getPassageText(element, language);
  return <p lang={available ? LANGUAGE_CODES[language] : 'en'}>{truncate(stripFootnoteMarkers(text), length)}</p>;
};

/** A short excerpt of a passage that follows the reader's chosen languages. */
export const PassagePreview: React.FC<{ element: SpinozaElement; languages: ReadingLanguages; length?: number }> = ({
  element,
  languages: { primary, parallel },
  length = 280
}) =>
  parallel ? (
    <div className="selection-preview-grid">
      <PreviewParagraph element={element} language={primary} length={length / 2} />
      <PreviewParagraph element={element} language={parallel} length={length / 2} />
    </div>
  ) : (
    <PreviewParagraph element={element} language={primary} length={length} />
  );

const LANGUAGES: readonly Language[] = ['english', 'french', 'latin'];

export const LanguagePicker: React.FC<{
  value: ReadingLanguages;
  onChange: (languages: ReadingLanguages) => void;
}> = ({ value: { primary, parallel }, onChange }) => (
  <div className="language-picker">
    <div role="group" aria-label="Read in">
      <p className="sidebar-kicker">Read in</p>
      <div className="reading-mode-buttons">
        {LANGUAGES.map(language => (
          <button
            key={language}
            type="button"
            lang={LANGUAGE_CODES[language]}
            aria-pressed={primary === language}
            className={`reading-mode-button ${primary === language ? 'active' : ''}`}
            // Choosing the language shown alongside swaps the two.
            onClick={() => onChange({ primary: language, parallel: parallel === language ? primary : parallel })}
          >
            {LANGUAGE_NAMES[language]}
          </button>
        ))}
      </div>
    </div>
    <div role="group" aria-label="Compare with">
      <p className="sidebar-kicker">Compare with</p>
      <div className="reading-mode-buttons">
        <button
          type="button"
          aria-pressed={parallel === null}
          className={`reading-mode-button ${parallel === null ? 'active' : ''}`}
          onClick={() => onChange({ primary, parallel: null })}
        >
          None
        </button>
        {LANGUAGES.filter(language => language !== primary).map(language => (
          <button
            key={language}
            type="button"
            lang={LANGUAGE_CODES[language]}
            aria-pressed={parallel === language}
            className={`reading-mode-button ${parallel === language ? 'active' : ''}`}
            onClick={() => onChange({ primary, parallel: language })}
          >
            {LANGUAGE_NAMES[language]}
          </button>
        ))}
      </div>
    </div>
  </div>
);
