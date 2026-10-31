import React from 'react';
import './BookView.css';
import { formatElementLabel, getSectionLabel, missingLatinMessage } from '../lib/ethica';
import { ReadingMode, SpinozaElement } from '../types';

interface BookViewProps {
  elements: SpinozaElement[];
  query: string;
  visibleIds: Set<string>;
  onElementSelect: (elementId: string | null, viaKeyboard?: boolean) => void;
  selectedElement: string | null;
  currentPart: number;
  partTitle: string;
  partNumeral: string;
  partDescription: string;
  readingMode: ReadingMode;
}

const BookView: React.FC<BookViewProps> = ({
  elements,
  visibleIds,
  onElementSelect,
  selectedElement,
  currentPart,
  partTitle,
  partNumeral,
  partDescription,
  readingMode
}) => {
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
      {formatElementLabel(element)}
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
            <div className="entry-body">{renderEntryBody(child, readingMode)}</div>
            {renderChildren(child.id)}
          </article>
        ))}
      </div>
    );
  };

  let previousSectionKind: string | null = null;

  return (
    <section className="book-view" aria-label={`Part ${currentPart}: ${partTitle}`}>
      <div className="book-intro">
        <p className="book-kicker">Part {partNumeral}</p>
        <h2>{partTitle}</h2>
        <p className="book-description">{partDescription}</p>
      </div>

      {visibleElements.length === 0 && (
        <div className="empty-state">
          <h3>No passages match that search.</h3>
          <p>Try a proposition number, a key term, or a cited concept.</p>
        </div>
      )}

      {visibleElements.map(element => {
        const showSectionHeading = previousSectionKind !== element.sectionKind;
        previousSectionKind = element.sectionKind;

        return (
          <div key={element.id} data-section-kind={element.sectionKind}>
            {showSectionHeading && (
              <header className="section-header">
                <p>{getSectionLabel(element.sectionKind)}</p>
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

              <div className="entry-body">{renderEntryBody(element, readingMode)}</div>

              {renderChildren(element.id)}
            </article>
          </div>
        );
      })}
    </section>
  );
};

const renderEntryBody = (element: SpinozaElement, readingMode: ReadingMode) => {
  if (readingMode === 'latin') {
    return renderParagraphs(element.latinText || missingLatinMessage(element), element.latinText ? 'latin' : 'english');
  }

  if (readingMode === 'bilingual') {
    return (
      <div className="parallel-text">
        <div className="parallel-column">
          <p className="parallel-label">English</p>
          {renderEnglish(element)}
        </div>
        <div className="parallel-column">
          <p className="parallel-label">Latin</p>
          {renderParagraphs(element.latinText || missingLatinMessage(element), element.latinText ? 'latin' : 'english')}
        </div>
      </div>
    );
  }

  return renderEnglish(element);
};

const renderEnglish = (element: SpinozaElement) => (
  <>
    {renderParagraphs(element.text, 'english')}
    {element.footnotes && (
      <ol className="entry-footnotes" aria-label="Footnotes">
        {element.footnotes.map(footnote => (
          <li key={footnote.number} value={Number(footnote.number)}>
            {footnote.text}
          </li>
        ))}
      </ol>
    )}
  </>
);

const renderParagraphs = (text: string, language: 'english' | 'latin') =>
  text
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => (
      <p key={`${language}-${index}`} lang={language === 'latin' ? 'la' : 'en'}>
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
