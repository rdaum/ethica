import React from 'react';
import { getPassageText, LANGUAGE_CODES, LANGUAGE_NAMES, stripFootnoteMarkers } from '../lib/ethica';
import { getStrings, Strings } from '../lib/strings';
import { Language, ReadingLanguages, SpinozaElement } from '../types';

type MetadataChip = {
  label: string;
  tone: string;
  description: string;
};

const getMetadataChips = (element: SpinozaElement, t: Strings): MetadataChip[] => {
  const chips: MetadataChip[] = [];

  if (element.variantLabel) {
    chips.push({ label: t.chipAlternate, tone: 'ink', description: t.chipAlternateHelp });
  }

  if (element.isEditorial) {
    chips.push({ label: t.chipEditorial, tone: 'rose', description: t.chipEditorialHelp });
  } else if (element.editorialKind === 'synthetic_heading') {
    chips.push({ label: t.chipHeading, tone: 'gold', description: t.chipHeadingHelp });
  }

  if (element.sourceAuthority === 'latin_governed') {
    chips.push({ label: t.chipLatin, tone: 'green', description: t.chipLatinHelp });
  }

  if (element.sourceAuthority === 'english_structural') {
    chips.push({ label: t.chipEnglish, tone: 'rose', description: t.chipEnglishHelp });
  }

  return chips;
};

export const MetadataChips: React.FC<{ element: SpinozaElement; t: Strings }> = ({ element, t }) => {
  const chips = getMetadataChips(element, t);

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="metadata-chips" aria-label={t.passageMetadata}>
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

const PreviewParagraph: React.FC<{ element: SpinozaElement; language: Language; reader: Language; length: number }> = ({
  element,
  language,
  reader,
  length
}) => {
  const { text, available } = getPassageText(element, language, reader);
  return <p lang={LANGUAGE_CODES[available ? language : reader === 'french' ? 'french' : 'english']}>{truncate(stripFootnoteMarkers(text), length)}</p>;
};

/** A short excerpt of a passage that follows the reader's chosen languages. */
export const PassagePreview: React.FC<{ element: SpinozaElement; languages: ReadingLanguages; length?: number }> = ({
  element,
  languages: { primary, parallel },
  length = 280
}) =>
  parallel ? (
    <div className="selection-preview-grid">
      <PreviewParagraph element={element} language={primary} reader={primary} length={length / 2} />
      <PreviewParagraph element={element} language={parallel} reader={primary} length={length / 2} />
    </div>
  ) : (
    <PreviewParagraph element={element} language={primary} reader={primary} length={length} />
  );

const LANGUAGES: readonly Language[] = ['english', 'french', 'latin'];

export const LanguagePicker: React.FC<{
  value: ReadingLanguages;
  onChange: (languages: ReadingLanguages) => void;
}> = ({ value: { primary, parallel }, onChange }) => {
  const t = getStrings(primary);

  return (
  <div className="language-picker">
    <div role="group" aria-label={t.readIn}>
      <p className="sidebar-kicker">{t.readIn}</p>
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
    <div role="group" aria-label={t.compareWith}>
      <p className="sidebar-kicker">{t.compareWith}</p>
      <div className="reading-mode-buttons">
        <button
          type="button"
          aria-pressed={parallel === null}
          className={`reading-mode-button ${parallel === null ? 'active' : ''}`}
          onClick={() => onChange({ primary, parallel: null })}
        >
          {t.none}
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
};
