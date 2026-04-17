import React from 'react';
import './BookView.css';
import { formatElementLabel, getSectionLabel, matchesQuery } from '../lib/ethica';
import { ReadingMode, SpinozaElement } from '../types';

interface BookViewProps {
  elements: SpinozaElement[];
  query: string;
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
  query,
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
    if (!element.parentId) {
      return;
    }

    const children = childrenByParent.get(element.parentId) ?? [];
    children.push(element);
    childrenByParent.set(element.parentId, children);
  });

  const topLevelElements = elements.filter(element => !element.parentId);
  const visibleElements = topLevelElements.filter(topLevel => {
    if (!query.trim()) {
      return true;
    }

    if (matchesQuery(topLevel, query)) {
      return true;
    }

    return (childrenByParent.get(topLevel.id) ?? []).some(child => matchesQuery(child, query));
  });

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
        const parentMatches = matchesQuery(element, query);

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

              <div className="entry-body">
                {renderEntryBody(element, readingMode)}
              </div>

              {renderChildren(
                element.id,
                childrenByParent,
                query,
                parentMatches,
                selectedElement,
                hoveredElement,
                onElementHover,
                onElementSelect,
                readingMode
              )}
            </article>
          </div>
        );
      })}
    </section>
  );
};

const renderChildren = (
  parentId: string,
  childrenByParent: Map<string, SpinozaElement[]>,
  query: string,
  parentMatches: boolean,
  selectedElement: string | null,
  hoveredElement: string | null,
  onElementHover: (elementId: string | null) => void,
  onElementSelect: (elementId: string | null) => void,
  readingMode: ReadingMode
) => {
  const children = (childrenByParent.get(parentId) ?? []).filter(child => {
    if (!query.trim()) {
      return true;
    }

    return parentMatches || matchesQuery(child, query);
  });

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
          <div className="entry-body compact">
            {renderEntryBody(child, readingMode)}
          </div>
        </article>
      ))}
    </div>
  );
};

const renderEntryBody = (element: SpinozaElement, readingMode: ReadingMode) => {
  if (readingMode === 'latin') {
    const text = element.latinText || 'Latin text not yet available for this passage.';
    return renderParagraphs(text, element.latinText ? 'latin' : 'english');
  }

  if (readingMode === 'bilingual') {
    return (
      <div className="parallel-text">
        <div className="parallel-column">
          <p className="parallel-label">English</p>
          {renderParagraphs(element.text, 'english')}
        </div>
        <div className="parallel-column">
          <p className="parallel-label">Latin</p>
          {renderParagraphs(
            element.latinText || 'Latin text not yet available for this passage.',
            element.latinText ? 'latin' : 'english'
          )}
        </div>
      </div>
    );
  }

  return renderParagraphs(element.text, 'english');
};

const renderParagraphs = (text: string, language: 'english' | 'latin') =>
  text
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => (
      <p key={`${language}-${index}`} lang={language === 'latin' ? 'la' : 'en'}>
        {paragraph}
      </p>
    ));

export default BookView;
