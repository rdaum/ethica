import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import BookView from './components/BookView';
import { LanguagePicker } from './components/PassageMeta';
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
  formatTranslationCredit,
  getPartText,
  LANGUAGE_CODES,
  getVisibleElementIds,
  mergeFrenchText,
  mergeLatinText,
  parseSpinozaXml,
  PARTS,
  summarizeSections
} from './lib/ethica';
import { getStrings } from './lib/strings';
import { Footnote, PassageAnalysis, ReaderSectionSummary, ReadingLanguages, SpinozaElement } from './types';

const EMPTY_ELEMENTS = new Map<string, SpinozaElement>();

const FOCUS_MODE_KEY = 'ethica.focusMode';

const readFocusMode = (): boolean => {
  try {
    return window.localStorage.getItem(FOCUS_MODE_KEY) === 'true';
  } catch {
    return false;
  }
};

const saveFocusMode = (enabled: boolean) => {
  try {
    window.localStorage.setItem(FOCUS_MODE_KEY, String(enabled));
  } catch {
    // Without storage, focus mode simply lasts until the next reload.
  }
};

const LANGUAGES_KEY = 'ethica.languages';
const DEFAULT_LANGUAGES: ReadingLanguages = { primary: 'english', parallel: null };
const VALID_LANGUAGES = ['english', 'french', 'latin'];

const readLanguages = (): ReadingLanguages => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(LANGUAGES_KEY) ?? 'null');
    const validParallel = stored?.parallel === null || (VALID_LANGUAGES.includes(stored?.parallel) && stored.parallel !== stored.primary);
    return VALID_LANGUAGES.includes(stored?.primary) && validParallel ? stored : DEFAULT_LANGUAGES;
  } catch {
    return DEFAULT_LANGUAGES;
  }
};

const saveLanguages = (languages: ReadingLanguages) => {
  try {
    window.localStorage.setItem(LANGUAGES_KEY, JSON.stringify(languages));
  } catch {
    // Without storage, the choice simply lasts until the next reload.
  }
};

const prefersReducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Animating across a long part is slow and disorienting, so a far jump goes straight there.
const scrollBehaviorFor = (node: HTMLElement): ScrollBehavior => {
  const distance = Math.abs(node.getBoundingClientRect().top);
  return prefersReducedMotion() || distance > window.innerHeight * 2 ? 'auto' : 'smooth';
};

const fetchOk = async (path: string): Promise<Response> => {
  const response = await fetch(publicPath(path));

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }

  return response;
};

const fetchPart = async (part: number): Promise<Map<string, SpinozaElement>> => {
  const xmlText = await (await fetchOk(`ethica_${part}.xml`)).text();
  // The English reader still works if a translation or the Latin fails to load.
  const optional = <T,>(path: string, empty: T): Promise<T> =>
    fetchOk(path)
      .then(response => response.json() as Promise<T>)
      .catch(optionalError => {
        console.error(`Failed to load ${path}:`, optionalError);
        return empty;
      });
  const [latin, french] = await Promise.all([
    optional<{ elements?: Record<string, string> }>(`ethica_la_${part}.json`, {}),
    optional<{ elements?: Record<string, string>; footnotes?: Record<string, Footnote[]> }>(`ethica_fr_${part}.json`, {})
  ]);
  const parsed = mergeLatinText(
    mergeFrenchText(parseSpinozaXml(xmlText), french.elements ?? {}, french.footnotes ?? {}),
    latin.elements ?? {}
  );

  if (parsed.size === 0) {
    throw new Error(`ethica_${part}.xml contained no passages`);
  }

  return parsed;
};

const App: React.FC = () => {
  const [initialLocation] = useState(() => parseReaderHash(window.location.hash));
  const [elements, setElements] = useState<Map<string, SpinozaElement>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentPart, setCurrentPart] = useState(initialLocation.part);
  const [loadedPart, setLoadedPart] = useState<number | null>(null);
  const [languages, setLanguages] = useState(readLanguages);
  const [selectedElement, setSelectedElement] = useState<string | null>(initialLocation.elementId);
  const [scrollTarget, setScrollTarget] = useState<string | null>(initialLocation.elementId);
  const [query, setQuery] = useState('');
  const [partAttempt, setPartAttempt] = useState(0);
  const [analysisAttempt, setAnalysisAttempt] = useState(0);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(false);
  const [analysis, setAnalysis] = useState<PassageAnalysis | null>(null);
  const [panelFocusRequest, setPanelFocusRequest] = useState(0);
  const [focusMode, setFocusMode] = useState(readFocusMode);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const contentsToggleRef = useRef<HTMLButtonElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const deferredQuery = useDeferredValue(query);
  const t = getStrings(languages.primary);
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
      setError(false);

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
        setError(true);
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
      behavior: scrollBehaviorFor(elementNode),
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
      setAnalysisError(false);

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
        setAnalysisError(true);
        setAnalysisLoading(false);
      }
    };

    analyzeSelectedElement();

    return () => {
      cancelled = true;
    };
  }, [selectedElement, elements, ready, analysisAttempt]);

  // Screen readers and browsers take the page's language from here.
  useEffect(() => {
    document.documentElement.lang = LANGUAGE_CODES[languages.primary === 'french' ? 'french' : 'english'];
  }, [languages.primary]);

  useEffect(() => {
    if (contentsOpen) {
      sidebarRef.current?.querySelector('button')?.focus();
    }
  }, [contentsOpen]);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

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
  const sectionSummaries: ReaderSectionSummary[] = summarizeSections(visibleTopLevelElements, languages.primary);
  const selectedEntry = selectedElement ? currentElements.get(selectedElement) : undefined;
  const currentPartMetadata = PARTS[currentPart];
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
    setQuery('');
    setAnalysis(null);
    setContentsOpen(false);
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

    setContentsOpen(false);
    sectionNode.scrollIntoView({
      behavior: scrollBehaviorFor(sectionNode),
      block: 'start'
    });
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth'
    });
  };

  const changeLanguages = (next: ReadingLanguages) => {
    setLanguages(next);
    saveLanguages(next);
  };

  const showsFrench = languages.primary === 'french' || languages.parallel === 'french';

  const toggleFocusMode = () => {
    const enabled = !focusMode;
    setFocusMode(enabled);
    saveFocusMode(enabled);
  };

  const closeContents = () => {
    setContentsOpen(false);
    contentsToggleRef.current?.focus();
  };

  if (loadedPart === null && !error) {
    return (
      <div className="app loading-shell">
        <div className="loading-card">
          <p className="eyebrow">Ethica</p>
          <h1>{t.loadingTitle}</h1>
          <p>{t.loadingBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${languages.parallel ? 'has-parallel' : ''} ${focusMode ? 'focus-mode' : ''} ${selectedEntry ? 'has-selection' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <button type="button" className="brand-mark" onClick={scrollToTop} aria-label={t.scrollToTop}>
            <img src={publicPath('spinoza-signet.png')} alt="" />
          </button>
          <div className="brand-text">
            <h1>The Ethics</h1>
            <p>{formatTranslationCredit(languages)}</p>
          </div>
        </div>

        <label className={`reader-search ${searchOpen ? 'open' : ''}`}>
          <span className="visually-hidden">{t.searchLabel}</span>
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t.searchPlaceholder(currentPartMetadata.numeral)}
          />
        </label>

        <div className="topbar-actions">
          <button
            type="button"
            className="topbar-button search-toggle"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(open => !open)}
          >
            {t.search}
          </button>
          <button
            ref={contentsToggleRef}
            type="button"
            className="topbar-button contents-toggle"
            aria-expanded={contentsOpen}
            aria-controls="reader-contents"
            onClick={() => setContentsOpen(open => !open)}
          >
            {t.contents}
          </button>
          <button type="button" className="topbar-button focus-toggle" aria-pressed={focusMode} onClick={toggleFocusMode}>
            {t.focus}
          </button>
        </div>
      </header>

      {contentsOpen && <button type="button" className="contents-scrim" aria-label={t.closeContents} onClick={closeContents} />}

      <main className="reader-layout">
        <aside
          ref={sidebarRef}
          id="reader-contents"
          className={`reader-sidebar ${contentsOpen ? 'open' : ''}`}
          onKeyDown={event => {
            if (event.key === 'Escape' && contentsOpen) {
              closeContents();
            }
          }}
        >
          <div className="sidebar-stack">
            <nav aria-label={t.contents}>
              <p className="sidebar-kicker">{t.contents}</p>
              <ol className="contents-list">
                {Object.values(PARTS).map(part => (
                  <li key={part.number}>
                    <button
                      type="button"
                      className={`part-button ${currentPart === part.number ? 'active' : ''}`}
                      aria-current={currentPart === part.number ? 'true' : undefined}
                      onClick={() => handlePartChange(part.number)}
                    >
                      <span>{getPartText(part, languages.primary).heading}</span>
                      <strong>{getPartText(part, languages.primary).title}</strong>
                    </button>
                    {currentPart === part.number && sectionSummaries.length > 0 && (
                      <ul className="section-links">
                        {sectionSummaries.map(section => (
                          <li key={section.kind}>
                            <button type="button" onClick={() => jumpToSection(section.kind)}>
                              <span>{section.label}</span>
                              <strong>{section.count}</strong>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </nav>

            <div className="sidebar-reading-mode">
              <LanguagePicker value={languages} onChange={changeLanguages} />
              {showsFrench && (
                <p className="translation-source">
                  {t.frenchSource}{' '}
                  <a href="https://fr.wikisource.org/wiki/%C3%89thique_(Appuhn,_1913)" target="_blank" rel="noreferrer">
                    {t.frenchSourceLink}
                  </a>
                  .
                </p>
              )}
            </div>
          </div>
        </aside>

        {!ready ? (
          <section className="book-view part-status" aria-live="polite">
            {error ? (
              <div className="empty-state" role="alert">
                <h3>{t.partLoadError}</h3>
                <p>{t.partLoadHelp}</p>
                <button type="button" className="part-retry" onClick={() => setPartAttempt(attempt => attempt + 1)}>
                  {t.tryAgain}
                </button>
              </div>
            ) : (
              <div className="empty-state">
                <h3>{t.loadingPart(currentPartMetadata.numeral)}</h3>
              </div>
            )}
          </section>
        ) : (
          <BookView
            elements={orderedElements}
            query={deferredQuery}
            visibleIds={visibleIds}
            selectedElement={selectedElement}
            onElementSelect={handleSelectElement}
            currentPart={currentPart}
            languages={languages}
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
          languages={languages}
        />
      </main>
    </div>
  );
};

export default App;
