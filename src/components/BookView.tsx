import React from 'react';
import './BookView.css';
import { formatElementLabel, getSectionLabel, missingLatinMessage } from '../lib/ethica';
import { ReadingMode, SpinozaElement } from '../types';

interface BookViewProps {
  elements: SpinozaElement[];
  query: string;
  visibleIds: Set<string>;
  onElementHover: (elementId: string | null) => void;
  onElementSelect: (elementId: string | null) => void;
  selectedElement: string | null;
  hoveredElement: string | null;
  currentPart: number;
  partTitle: string;
  readingMode: ReadingMode;
}

const BookView: React.FC<BookViewProps> = ({
  elements,
  visibleIds,
  onElementHover,
  onElementSelect,
  selectedElement,
  hoveredElement,
  currentPart,
  partTitle,
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
            className={`child-entry entry-${child.type} ${selectedElement === child.id ? 'selected' : ''} ${hoveredElement === child.id ? 'hovered' : ''}`}
            onMouseEnter={() => onElementHover(child.id)}
            onMouseLeave={() => onElementHover(null)}
            onClick={event => {
              event.stopPropagation();
              onElementSelect(selectedElement === child.id ? null : child.id);
            }}
            data-element-id={child.id}
          >
            <header className="entry-header child-header">
              <div>
                <p className="entry-type">{child.type}</p>
                <h4>{formatElementLabel(child)}</h4>
              </div>
              <span className="entry-id">{child.id}</span>
            </header>
            <div className="entry-body compact">{renderEntryBody(child, readingMode)}</div>
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
        <p className="book-kicker">Part {currentPart}</p>
        <h2>{partTitle}</h2>
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
              className={`reader-entry entry-${element.type} ${selectedElement === element.id ? 'selected' : ''} ${hoveredElement === element.id ? 'hovered' : ''}`}
              onMouseEnter={() => onElementHover(element.id)}
              onMouseLeave={() => onElementHover(null)}
              onClick={() => onElementSelect(selectedElement === element.id ? null : element.id)}
              data-element-id={element.id}
            >
              <header className="entry-header">
                <div>
                  <p className="entry-type">{element.type}</p>
                  <h3>{formatElementLabel(element)}</h3>
                </div>
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
