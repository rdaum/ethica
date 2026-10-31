import React from 'react';
import { missingLatinMessage, stripFootnoteMarkers } from '../lib/ethica';
import { ReadingMode, SpinozaElement } from '../types';

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

/** A short excerpt of a passage that follows the reader's chosen language. */
export const PassagePreview: React.FC<{ element: SpinozaElement; readingMode: ReadingMode; length?: number }> = ({
  element,
  readingMode,
  length = 280
}) => {
  const english = stripFootnoteMarkers(element.text);
  const latin = element.latinText || missingLatinMessage(element);

  if (readingMode === 'latin') {
    return <p lang={element.latinText ? 'la' : 'en'}>{truncate(latin, length)}</p>;
  }

  if (readingMode === 'bilingual') {
    return (
      <div className="selection-preview-grid">
        <p lang="en">{truncate(english, length / 2)}</p>
        <p lang={element.latinText ? 'la' : 'en'}>{truncate(latin, length / 2)}</p>
      </div>
    );
  }

  return <p lang="en">{truncate(english, length)}</p>;
};

const READING_MODES: ReadonlyArray<readonly [ReadingMode, string]> = [
  ['english', 'English'],
  ['latin', 'Latin'],
  ['bilingual', 'Bilingual']
];

export const ReadingModeToggle: React.FC<{
  value: ReadingMode;
  onChange: (mode: ReadingMode) => void;
}> = ({ value, onChange }) => (
  <div className="reading-mode-buttons" role="group" aria-label="Reading language">
    {READING_MODES.map(([mode, label]) => (
      <button
        key={mode}
        type="button"
        aria-pressed={value === mode}
        className={`reading-mode-button ${value === mode ? 'active' : ''}`}
        onClick={() => onChange(mode)}
      >
        {label}
      </button>
    ))}
  </div>
);
