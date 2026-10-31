import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import BookView from './components/BookView';
import { MetadataChips, PassagePreview, ReadingModeToggle } from './components/PassageMeta';
import ReasoningPanel from './components/ReasoningPanel';
import './App.css';
import { AnalysisClient, createAnalysisClient } from './lib/analysisClient';
import createReasoningWorker from './lib/createReasoningWorker';
import { publicPath } from './lib/publicPath';
import {
  buildReaderUrl,
  getPartNumberFromElementId,
  parseReaderHash,
  sameReaderLocation
} from './lib/readerUrl';
import {
  formatElementLabel,
  getVisibleElementIds,
  mergeLatinText,
  parseSpinozaXml,
  PARTS,
  summarizeSections
} from './lib/ethica';
import { PassageAnalysis, ReaderSectionSummary, ReadingMode, SpinozaElement } from './types';

const EMPTY_ELEMENTS = new Map<string, SpinozaElement>();

const fetchOk = async (path: string): Promise<Response> => {
  const response = await fetch(publicPath(path));

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }

  return response;
};

const fetchPart = async (part: number): Promise<Map<string, SpinozaElement>> => {
  const xmlText = await (await fetchOk(`ethica_${part}.xml`)).text();
  // The English reader still works if only the parallel text fails to load.
  const latin = await fetchOk(`ethica_la_${part}.json`)
    .then(response => response.json() as Promise<{ elements?: Record<string, string> }>)
    .catch(latinError => {
      console.error('Failed to load Latin text:', latinError);
      return { elements: {} };
    });
  const parsed = mergeLatinText(parseSpinozaXml(xmlText), latin.elements ?? {});

  if (parsed.size === 0) {
    throw new Error(`ethica_${part}.xml contained no passages`);
  }

  return parsed;
};

const App: React.FC = () => {
  const [initialLocation] = useState(() => parseReaderHash(window.location.hash));
  const [elements, setElements] = useState<Map<string, SpinozaElement>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPart, setCurrentPart] = useState(initialLocation.part);
  const [loadedPart, setLoadedPart] = useState<number | null>(null);
  const [readingMode, setReadingMode] = useState<ReadingMode>('english');
  const [selectedElement, setSelectedElement] = useState<string | null>(initialLocation.elementId);
  const [scrollTarget, setScrollTarget] = useState<string | null>(initialLocation.elementId);
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [partAttempt, setPartAttempt] = useState(0);
  const [analysisAttempt, setAnalysisAttempt] = useState(0);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PassageAnalysis | null>(null);
  const [panelFocusRequest, setPanelFocusRequest] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const deferredQuery = useDeferredValue(query);
  const analysisClient = useRef<AnalysisClient | null>(null);
  const partCache = useRef(new Map<number, Map<string, SpinozaElement>>());
  const previousPart = useRef(initialLocation.part);

  useEffect(() => {
    const client = createAnalysisClient(createReasoningWorker, async () =>
      (await fetchOk('ethica-logic.n3')).text()
    );

    analysisClient.current = client;
    client.preload();

    return () => {
      client.dispose();
      analysisClient.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPartData = async () => {
      setLoading(true);
      setError(null);

      try {
        const parsedElements = partCache.current.get(currentPart) ?? (await fetchPart(currentPart));
        partCache.current.set(currentPart, parsedElements);

        if (cancelled) {
          return;
        }

        setElements(parsedElements);
        setLoadedPart(currentPart);
        setLoading(false);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        console.error('Failed to load reader data:', loadError);
        setError('This part of the text could not be loaded.');
        setLoading(false);
      }
    };

    loadPartData();

    return () => {
      cancelled = true;
    };
  }, [currentPart, partAttempt]);

  // A part change commits before the load effect marks it as loading, so readiness
  // also requires that the elements in state belong to the current part.
  const ready = !loading && loadedPart === currentPart;

  useEffect(() => {
    if (!ready || !scrollTarget) {
      return;
    }

    if (!elements.has(scrollTarget)) {
      // The hash named a passage that does not exist in this part.
      window.history.replaceState(null, '', buildReaderUrl({ part: currentPart, elementId: null }));
      setSelectedElement(null);
      setScrollTarget(null);
      return;
    }

    const elementNode = document.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(scrollTarget)}"]`);

    if (!elementNode) {
      if (deferredQuery.trim()) {
        // The active search is hiding the target; clear it and try again on the next render.
        setQuery('');
      } else {
        setScrollTarget(null);
      }
      return;
    }

    elementNode.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest'
    });
    elementNode.classList.add('navigation-highlight');

    window.setTimeout(() => {
      elementNode.classList.remove('navigation-highlight');
    }, 1800);

    setScrollTarget(null);
  }, [ready, scrollTarget, elements, currentPart, deferredQuery]);

  useEffect(() => {
    if (!ready || previousPart.current === currentPart) {
      return;
    }

    previousPart.current = currentPart;

    if (!scrollTarget) {
      window.scrollTo({ top: 0 });
    }
  }, [ready, currentPart, scrollTarget]);

  useEffect(() => {
    let cancelled = false;

    const analyzeSelectedElement = async () => {
      setAnalysisError(null);

      if (!selectedElement || !ready || !elements.has(selectedElement)) {
        setAnalysis(null);
        setAnalysisLoading(false);
        return;
      }

      setAnalysisLoading(true);

      try {
        if (!analysisClient.current) {
          throw new Error('The analysis client is not running.');
        }

        const result = await analysisClient.current.analyze(selectedElement);

        if (cancelled) {
          return;
        }

        setAnalysis(result);
        setAnalysisLoading(false);
      } catch (analysisFailure) {
        if (cancelled) {
          return;
        }

        console.error('Analysis failed:', analysisFailure);
        setAnalysis(null);
        setAnalysisError('The relationships for this passage could not be loaded.');
        setAnalysisLoading(false);
      }
    };

    analyzeSelectedElement();

    return () => {
      cancelled = true;
    };
  }, [selectedElement, elements, ready, analysisAttempt]);

  // State to URL: comparing parsed locations means a state change that came from the
  // URL itself (initial load, back, forward, a hash edit) never adds a history entry.
  useEffect(() => {
    const location = { part: currentPart, elementId: selectedElement };

    if (!sameReaderLocation(parseReaderHash(window.location.hash), location)) {
      window.history.pushState(null, '', buildReaderUrl(location));
    }
  }, [currentPart, selectedElement]);

  // URL to state: browser history and hand-edited hashes.
  useEffect(() => {
    const handleLocationChange = () => {
      const location = parseReaderHash(window.location.hash);
      setCurrentPart(location.part);
      setSelectedElement(location.elementId);
      setScrollTarget(location.elementId);
      setQuery('');
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const currentElements = ready ? elements : EMPTY_ELEMENTS;
  const orderedElements = Array.from(currentElements.values()).sort((left, right) => left.sortIndex - right.sortIndex);
  const topLevelElements = orderedElements.filter(element => !element.parentId);
  const visibleIds = getVisibleElementIds(orderedElements, deferredQuery);
  const visibleTopLevelElements = topLevelElements.filter(element => visibleIds.has(element.id));
  const sectionSummaries: ReaderSectionSummary[] = summarizeSections(visibleTopLevelElements);
  const selectedEntry = selectedElement ? currentElements.get(selectedElement) : undefined;
  const currentPartMetadata = PARTS[currentPart];
  const totalPassageCount = topLevelElements.length;
  const selectableEntries = orderedElements.filter(element => visibleIds.has(element.id));
  const selectedIndex = selectedElement ? selectableEntries.findIndex(element => element.id === selectedElement) : -1;
  const previousEntry = selectedIndex > 0 ? selectableEntries[selectedIndex - 1] : null;
  const nextEntry =
    selectedIndex >= 0 && selectedIndex < selectableEntries.length - 1
      ? selectableEntries[selectedIndex + 1]
      : null;

  const handleSelectElement = (elementId: string | null, viaKeyboard = false) => {
    setSelectedElement(elementId);

    if (elementId && viaKeyboard) {
      setPanelFocusRequest(request => request + 1);
    }
  };

  const closePanel = () => {
    const closing = selectedElement;
    setSelectedElement(null);

    // Return keyboard users to the passage they came from.
    if (closing) {
      document.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(closing)}"] .entry-select`)?.focus({ preventScroll: true });
    }
  };

  const handlePartChange = useCallback((partNumber: number) => {
    setCurrentPart(partNumber);
    setSelectedElement(null);
    setScrollTarget(null);
    setHoveredElement(null);
    setQuery('');
    setAnalysis(null);
  }, []);

  const navigateToElement = useCallback((elementId: string) => {
    const targetPart = getPartNumberFromElementId(elementId);

    if (targetPart) {
      setCurrentPart(targetPart);
    }

    setSelectedElement(elementId);
    setScrollTarget(elementId);
  }, []);

  const jumpToSection = (sectionKind: string) => {
    const sectionNode = document.querySelector<HTMLElement>(`[data-section-kind="${sectionKind}"]`);

    if (!sectionNode) {
      return;
    }

    sectionNode.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  };

  const focusSearch = () => {
    searchInputRef.current?.focus();
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  if (loadedPart === null && !error) {
    return (
      <div className="app loading-shell">
        <div className="loading-card">
          <p className="eyebrow">Ethica</p>
          <h1>Loading Spinoza&apos;s Ethics</h1>
          <p>Preparing the text, structure, and inference graph for reading.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-shell">
        <aside className="app-rail" aria-label="Reader tools">
          <button type="button" className="rail-logo" onClick={scrollToTop} aria-label="Scroll to top">
            <img src={publicPath('spinoza-signet.png')} alt="" />
          </button>
          <div className="rail-actions">
            <button type="button" className="rail-button active" onClick={scrollToTop} aria-label="Overview">
              <span>Home</span>
            </button>
            <button type="button" className="rail-button" onClick={focusSearch} aria-label="Search this part">
              <span>Search</span>
            </button>
            <button
              type="button"
              className="rail-button"
              onClick={() => selectedEntry && navigateToElement(selectedEntry.id)}
              aria-label="Jump to selected passage"
              disabled={!selectedEntry}
            >
              <span>Focus</span>
            </button>
            <button
              type="button"
              className="rail-button"
              onClick={closePanel}
              aria-label="Clear selection"
              disabled={!selectedEntry}
            >
              <span>Clear</span>
            </button>
          </div>
        </aside>

        <div className="app-stage">
          <header className="app-header">
            <div className="header-grid">
              <div className="title-block">
                <p className="eyebrow">Interactive Reader</p>
                <h1>The Ethics</h1>
                <p className="subtitle">Baruch Spinoza, translated by R.H.M. Elwes</p>
                <p className="part-description">{currentPartMetadata.description}</p>
              </div>

              <div className="header-actions">
                <div className="part-switcher" aria-label="Select part">
                  {Object.values(PARTS).map(part => (
                    <button
                      key={part.number}
                      type="button"
                      className={`part-button ${currentPart === part.number ? 'active' : ''}`}
                      onClick={() => handlePartChange(part.number)}
                    >
                      <span>Part {part.numeral}</span>
                      <strong>{part.title}</strong>
                    </button>
                  ))}
                </div>

                <label className="reader-search">
                  <span>Search within this part</span>
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Search terms, ideas, references"
                  />
                </label>
              </div>
            </div>
          </header>

          <main className="reader-layout">
            <aside className="reader-sidebar">
              <div className="sidebar-stack">
                <div className="sidebar-card part-overview-card">
                  <div className="part-overview-header">
                    <div>
                      <p className="sidebar-kicker">Current Part</p>
                      <h2>{currentPartMetadata.title}</h2>
                    </div>
                    <img
                      src={publicPath('spinoza-signet.png')}
                      alt="Spinoza's signet ring"
                      className="spinoza-signet"
                    />
                  </div>
                  <p>{currentPartMetadata.strapline}</p>
                </div>

                <div className="sidebar-card sidebar-reading-mode">
                  <div className="reading-mode">
                    <span>View In</span>
                    <ReadingModeToggle value={readingMode} onChange={setReadingMode} />
                  </div>
                </div>

                <div className="sidebar-card">
                  <div className="sidebar-heading">
                    <h3>Sections</h3>
                    <span>{totalPassageCount} passages</span>
                  </div>
                  <div className="section-links">
                    {sectionSummaries.map(section => (
                      <button key={section.kind} type="button" onClick={() => jumpToSection(section.kind)}>
                        <span>{section.label}</span>
                        <strong>{section.count}</strong>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedEntry && (
                  <div className="sidebar-card selection-card">
                    <p className="sidebar-kicker">Selected passage</p>
                    <h3>{formatElementLabel(selectedEntry)}</h3>
                    <MetadataChips element={selectedEntry} />
                    <PassagePreview element={selectedEntry} readingMode={readingMode} length={220} />
                    <div className="selection-nav">
                      <button
                        type="button"
                        onClick={() => previousEntry && navigateToElement(previousEntry.id)}
                        disabled={!previousEntry}
                      >
                        Previous
                      </button>
                      <button type="button" onClick={() => nextEntry && navigateToElement(nextEntry.id)} disabled={!nextEntry}>
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </aside>

            {!ready ? (
              <section className="book-view part-status" aria-live="polite">
                {error ? (
                  <div className="empty-state" role="alert">
                    <h3>{error}</h3>
                    <p>Check your connection and try again.</p>
                    <button type="button" className="part-retry" onClick={() => setPartAttempt(attempt => attempt + 1)}>
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className="empty-state">
                    <h3>Loading Part {currentPartMetadata.numeral}…</h3>
                  </div>
                )}
              </section>
            ) : (
              <BookView
                elements={orderedElements}
                query={deferredQuery}
                visibleIds={visibleIds}
                selectedElement={selectedElement}
                hoveredElement={hoveredElement}
                onElementHover={setHoveredElement}
                onElementSelect={handleSelectElement}
                currentPart={currentPart}
                partTitle={currentPartMetadata.title}
                readingMode={readingMode}
              />
            )}

            <ReasoningPanel
              selectedElement={selectedElement}
              element={selectedEntry}
              analysis={analysis}
              focusRequest={panelFocusRequest}
              onNavigateToElement={navigateToElement}
              onClose={closePanel}
              loading={analysisLoading}
              error={analysisError}
              onRetry={() => setAnalysisAttempt(attempt => attempt + 1)}
              previousElementId={previousEntry?.id ?? null}
              nextElementId={nextEntry?.id ?? null}
              readingMode={readingMode}
              onReadingModeChange={setReadingMode}
            />
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;
