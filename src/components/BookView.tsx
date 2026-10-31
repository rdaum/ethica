import React from 'react';
import './BookView.css';
import {
  formatLocalizedLabel,
  getLocalizedSectionLabel,
  getPartText,
  getPassageText,
  LANGUAGE_CODES,
  LANGUAGE_NAMES
} from '../lib/ethica';
import { getStrings } from '../lib/strings';
import { Language, PartMetadata, ReadingLanguages, SpinozaElement } from '../types';

interface BookViewProps {
  elements: SpinozaElement[];
  query: string;
  visibleIds: Set<string>;
  onElementSelect: (elementId: string | null, viaKeyboard?: boolean) => void;
  selectedElement: string | null;
  part: PartMetadata;
  languages: ReadingLanguages;
}

const BookView: React.FC<BookViewProps> = ({
  elements,
  visibleIds,
  onElementSelect,
  selectedElement,
  part,
  languages
}) => {
  const { heading: partHeading, title: partTitle, description: partDescription } = getPartText(part, languages.primary);
  const t = getStrings(languages.primary);

  const childrenByParent = new Map<string, SpinozaElement[]>();

  elements.forEach(element => {
    if (!element.parentId || !visibleIds.has(element.id)) {
      return;
    }

    const children = childrenByParent.get(element.parentId) ?? [];
    children.push(element);
    childrenByParent.set(element.parentId, children);
  });

  const visibleElements = elements.filter(element => !element.parentId && visibleIds.has(element.id));

  const handleSelect = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();

    // Finishing a text selection is not a request to select the passage.
    if (window.getSelection()?.toString()) {
      return;
    }

    // A click with no pointer details came from the keyboard.
    onElementSelect(selectedElement === id ? null : id, event.detail === 0);
  };

  const selectButton = (element: SpinozaElement) => (
    <button type="button" className="entry-select" aria-pressed={selectedElement === element.id}>
      {formatLocalizedLabel(element, languages.primary)}
    </button>
  );

  const renderChildren = (parentId: string) => {
    const children = childrenByParent.get(parentId) ?? [];

    if (children.length === 0) {
      return null;
    }

    return (
      <div className="entry-children">
        {children.map(child => (
          <article
            key={child.id}
            className={`child-entry entry-${child.type} ${selectedElement === child.id ? 'selected' : ''}`}
            onClick={event => handleSelect(child.id, event)}
            data-element-id={child.id}
          >
            <header className="entry-header">
              <h4>{selectButton(child)}</h4>
              <span className="entry-id">{child.id}</span>
            </header>
            <div className="entry-body">{renderEntryBody(child, languages)}</div>
            {renderChildren(child.id)}
          </article>
        ))}
      </div>
    );
  };

  let previousSectionKind: string | null = null;

  return (
    <section className="book-view" lang={LANGUAGE_CODES[languages.primary]} aria-label={`${partHeading}: ${partTitle}`}>
      <div className="book-intro">
        <p className="book-kicker">{partHeading}</p>
        {/* The Latin of the treatise numbers its chapters without titling them. */}
        <h2 lang={part.work === 'political' && languages.primary === 'latin' ? 'en' : undefined}>{partTitle}</h2>
        {partDescription && (
          <p className="book-description" lang={languages.primary === 'latin' ? 'en' : undefined}>
            {t.summary} {partDescription}
          </p>
        )}
      </div>

      {visibleElements.length === 0 && (
        <div className="empty-state">
          <h3>{t.noMatchTitle}</h3>
          <p>{t.noMatchHelp}</p>
        </div>
      )}

      {visibleElements.map(element => {
        const showSectionHeading = previousSectionKind !== element.sectionKind;
        previousSectionKind = element.sectionKind;

        return (
          <div key={element.id} data-section-kind={element.sectionKind}>
            {showSectionHeading && (
              <header className="section-header">
                <p>{getLocalizedSectionLabel(element.sectionKind, languages.primary)}</p>
              </header>
            )}

            <article
              className={`reader-entry entry-${element.type} ${selectedElement === element.id ? 'selected' : ''}`}
              onClick={event => handleSelect(element.id, event)}
              data-element-id={element.id}
            >
              <header className="entry-header">
                <h3>{selectButton(element)}</h3>
                <span className="entry-id">{element.id}</span>
              </header>

              <div className="entry-body">{renderEntryBody(element, languages)}</div>

              {renderChildren(element.id)}
            </article>
          </div>
        );
      })}
    </section>
  );
};

const renderEntryBody = (element: SpinozaElement, { primary, parallel }: ReadingLanguages) =>
  parallel ? (
    <div className="parallel-text">
      {[primary, parallel].map(language => (
        <div key={language} className="parallel-column">
          <p className="parallel-label" lang={LANGUAGE_CODES[language]}>
            {LANGUAGE_NAMES[language]}
          </p>
          {renderLanguage(element, language, primary)}
        </div>
      ))}
    </div>
  ) : (
    renderLanguage(element, primary, primary)
  );

const renderLanguage = (element: SpinozaElement, language: Language, reader: Language) => {
  const { text, available, footnotes } = getPassageText(element, language, reader);
  const code = LANGUAGE_CODES[available ? language : reader === 'french' ? 'french' : 'english'];

  return (
    <>
      <div className={available ? undefined : 'entry-missing'}>{renderParagraphs(text, code)}</div>
      {footnotes && (
        <ol className="entry-footnotes" lang={code} aria-label={getStrings(reader).footnotes}>
          {footnotes.map(footnote => (
            <li key={footnote.number} value={Number(footnote.number)}>
              {footnote.text}
            </li>
          ))}
        </ol>
      )}
    </>
  );
};

const renderParagraphs = (text: string, code: string) =>
  text
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => (
      <p key={`${code}-${index}`} lang={code}>
        {renderFootnoteMarkers(paragraph)}
      </p>
    ));

const renderFootnoteMarkers = (paragraph: string) =>
  paragraph.split(/(\[\d+\])/).map((segment, index) => {
    const marker = segment.match(/^\[(\d+)\]$/);
    return marker ? (
      <sup key={index} className="footnote-marker">
        {marker[1]}
      </sup>
    ) : (
      segment
    );
  });

export default BookView;
