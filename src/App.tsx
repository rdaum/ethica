import React, { startTransition, useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import BookView from './components/BookView';
import ReasoningPanel from './components/ReasoningPanel';
import './App.css';
import createReasoningWorker from './lib/createReasoningWorker';
import { publicPath } from './lib/publicPath';
import {
  formatElementLabel,
  mergeLatinText,
  matchesQuery,
  parseSpinozaXml,
  PARTS,
  summarizeSections
} from './lib/ethica';
import {
  ReasoningAnalysis,
  ReaderSectionSummary,
  ReadingMode,
  ReasoningRelation,
  SpinozaElement,
  TransitiveChain,
  WeightAnalysis
} from './types';

type WorkerResponse =
  | {
      type: 'partLoaded';
      requestId: number;
    }
  | {
      type: 'analysis';
      requestId: number;
      elementId: string;
      result: ReasoningAnalysis;
    }
  | {
      type: 'error';
      requestId: number;
      stage: 'loadPart' | 'analyze';
      message: string;
    };

const App: React.FC = () => {
  const [elements, setElements] = useState<Map<string, SpinozaElement>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPart, setCurrentPart] = useState(1);
  const [readingMode, setReadingMode] = useState<ReadingMode>('english');
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [reasoning, setReasoning] = useState<ReasoningRelation[]>([]);
  const [transitiveChains, setTransitiveChains] = useState<TransitiveChain[]>([]);
  const [weightAnalysis, setWeightAnalysis] = useState<WeightAnalysis | null>(null);
  const pendingNavigationId = useRef<string | null>(null);
  const hashInitialized = useRef(false);
  const deferredQuery = useDeferredValue(query);
  const workerRef = useRef<Worker | null>(null);
  const requestCounter = useRef(0);
  const pendingLoadResolvers = useRef(new Map<number, { resolve: () => void; reject: (error: Error) => void }>());
  const pendingAnalysisResolvers = useRef(
    new Map<number, { resolve: (result: ReasoningAnalysis) => void; reject: (error: Error) => void }>()
  );

  useEffect(() => {
    if (typeof Worker === 'undefined') {
      return undefined;
    }

    const loadResolvers = pendingLoadResolvers.current;
    const analysisResolvers = pendingAnalysisResolvers.current;
    const worker = createReasoningWorker();
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;

      if (message.type === 'partLoaded') {
        pendingLoadResolvers.current.get(message.requestId)?.resolve();
        pendingLoadResolvers.current.delete(message.requestId);
        return;
      }

      if (message.type === 'analysis') {
        pendingAnalysisResolvers.current.get(message.requestId)?.resolve(message.result);
        pendingAnalysisResolvers.current.delete(message.requestId);
        return;
      }

      const error = new Error(message.message);

      if (message.stage === 'loadPart') {
        pendingLoadResolvers.current.get(message.requestId)?.reject(error);
        pendingLoadResolvers.current.delete(message.requestId);
        return;
      }

      pendingAnalysisResolvers.current.get(message.requestId)?.reject(error);
      pendingAnalysisResolvers.current.delete(message.requestId);
    };

    worker.onerror = event => {
      const error = new Error(event.message || 'Reasoning worker failed.');
      loadResolvers.forEach(({ reject }) => reject(error));
      analysisResolvers.forEach(({ reject }) => reject(error));
      loadResolvers.clear();
      analysisResolvers.clear();
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
      loadResolvers.clear();
      analysisResolvers.clear();
    };
  }, []);

  const nextRequestId = useCallback(() => {
    requestCounter.current += 1;
    return requestCounter.current;
  }, []);

  const loadPartIntoWorker = useCallback(
    (payload: { elements: SpinozaElement[]; n3Content: string; eyeContent: string }) => {
      if (!workerRef.current) {
        return Promise.reject(new Error('Background reasoning worker is unavailable.'));
      }

      const requestId = nextRequestId();

      return new Promise<void>((resolve, reject) => {
        pendingLoadResolvers.current.set(requestId, { resolve, reject });
        workerRef.current?.postMessage({
          type: 'loadPart',
          requestId,
          ...payload
        });
      });
    },
    [nextRequestId]
  );

  const analyzeElementInWorker = useCallback(
    (elementId: string) => {
      if (!workerRef.current) {
        return Promise.reject(new Error('Background reasoning worker is unavailable.'));
      }

      const requestId = nextRequestId();

      return new Promise<ReasoningAnalysis>((resolve, reject) => {
        pendingAnalysisResolvers.current.set(requestId, { resolve, reject });
        workerRef.current?.postMessage({
          type: 'analyze',
          requestId,
          elementId
        });
      });
    },
    [nextRequestId]
  );

  useEffect(() => {
    let cancelled = false;

    const loadPartData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [xmlResponse, latinResponse, n3Response, eyeResponse] = await Promise.all([
          fetch(publicPath(`ethica_${currentPart}.xml`)),
          fetch(publicPath(`ethica_la_${currentPart}.json`)),
          fetch(publicPath('ethica-logic.n3')),
          fetch(publicPath('ethica-logic-eye.n3'))
        ]);

        const [xmlText, latinPayload, n3Content, eyeContent] = await Promise.all([
          xmlResponse.text(),
          latinResponse.ok
            ? latinResponse.json()
            : Promise.resolve({ language: 'la', part: currentPart, elements: {} }),
          n3Response.text(),
          eyeResponse.text()
        ]);

        const parsedElements = mergeLatinText(
          parseSpinozaXml(xmlText),
          (latinPayload as { elements?: Record<string, string> }).elements ?? {}
        );
        await loadPartIntoWorker({
          elements: Array.from(parsedElements.values()),
          n3Content,
          eyeContent
        });

        if (cancelled) {
          return;
        }

        setElements(parsedElements);
        setLoading(false);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        console.error('Failed to load reader data:', loadError);
        setError('The reader could not load this part of the text.');
        setLoading(false);
      }
    };

    loadPartData();

    return () => {
      cancelled = true;
    };
  }, [currentPart, loadPartIntoWorker]);

  useEffect(() => {
    if (loading || !pendingNavigationId.current) {
      return;
    }

    const elementId = pendingNavigationId.current;
    pendingNavigationId.current = null;
    navigateToElement(elementId);
  // navigateToElement is a stable callback; this effect only needs to react when loading finishes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    if (loading || hashInitialized.current) {
      return;
    }

    const hash = window.location.hash.replace(/^#/, '');

    if (!hash) {
      hashInitialized.current = true;
      return;
    }

    hashInitialized.current = true;
    navigateToElement(decodeURIComponent(hash));
  // navigateToElement is a stable callback; this effect only needs to react once after initial load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    let cancelled = false;

    const analyzeSelectedElement = async () => {
      if (!selectedElement) {
        setReasoning([]);
        setTransitiveChains([]);
        setWeightAnalysis(null);
        setAnalysisLoading(false);
        return;
      }

      setAnalysisLoading(true);

      try {
        const result = await analyzeElementInWorker(selectedElement);

        if (cancelled) {
          return;
        }

        setReasoning(result.reasoning);
        setTransitiveChains(result.transitiveChains);
        setWeightAnalysis(result.weightAnalysis);
        setAnalysisLoading(false);
      } catch (analysisError) {
        if (cancelled) {
          return;
        }

        console.error('Worker analysis failed:', analysisError);
        setReasoning([]);
        setTransitiveChains([]);
        setWeightAnalysis(null);
        setAnalysisLoading(false);
      }
    };

    analyzeSelectedElement();

    return () => {
      cancelled = true;
    };
  // These analyzers are stable callbacks backed by the current stores and elements.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElement, elements]);

  useEffect(() => {
    if (!selectedElement) {
      if (window.location.hash) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      }
      return;
    }

    const encoded = `#${encodeURIComponent(selectedElement)}`;

    if (window.location.hash !== encoded) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${encoded}`);
    }
  }, [selectedElement]);

  const orderedElements = Array.from(elements.values()).sort((left, right) => left.sortIndex - right.sortIndex);
  const topLevelElements = orderedElements.filter(element => !element.parentId);
  const visibleTopLevelElements = topLevelElements.filter(topLevel => {
    if (!deferredQuery.trim()) {
      return true;
    }

    if (matchesQuery(topLevel, deferredQuery)) {
      return true;
    }

    return orderedElements.some(
      candidate => candidate.parentId === topLevel.id && matchesQuery(candidate, deferredQuery)
    );
  });
  const sectionSummaries: ReaderSectionSummary[] = summarizeSections(visibleTopLevelElements);
  const selectedEntry = selectedElement ? elements.get(selectedElement) : undefined;
  const currentPartMetadata = PARTS[currentPart];
  const selectableEntries = orderedElements.filter(element => {
    if (!deferredQuery.trim()) {
      return true;
    }

    if (matchesQuery(element, deferredQuery)) {
      return true;
    }

    const parent = element.parentId ? elements.get(element.parentId) : null;
    return parent ? matchesQuery(parent, deferredQuery) : false;
  });
  const selectedIndex = selectedElement ? selectableEntries.findIndex(element => element.id === selectedElement) : -1;
  const previousEntry = selectedIndex > 0 ? selectableEntries[selectedIndex - 1] : null;
  const nextEntry =
    selectedIndex >= 0 && selectedIndex < selectableEntries.length - 1
      ? selectableEntries[selectedIndex + 1]
      : null;

  const handleSelectElement = (elementId: string | null) => {
    setSelectedElement(elementId);
  };

  const handlePartChange = useCallback((partNumber: number) => {
    startTransition(() => {
      setCurrentPart(partNumber);
      setSelectedElement(null);
      setHoveredElement(null);
      setQuery('');
      setReasoning([]);
      setTransitiveChains([]);
      setWeightAnalysis(null);
    });
  }, []);

  const navigateToElement = useCallback((elementId: string) => {
    const targetPart = getPartNumberFromElementId(elementId) ?? currentPart;

    if (targetPart !== currentPart) {
      pendingNavigationId.current = elementId;
      handlePartChange(targetPart);
      return;
    }

    const elementNode = document.querySelector<HTMLElement>(`[data-element-id="${elementId}"]`);

    if (!elementNode) {
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

    setSelectedElement(elementId);
  }, [currentPart, handlePartChange]);

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

  if (loading) {
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
            <div className="sidebar-card">
              <img
                src={publicPath('spinoza-signet.png')}
                alt="Spinoza's signet ring"
                className="spinoza-signet"
              />
              <p className="sidebar-kicker">
                Part {currentPartMetadata.numeral}
              </p>
              <h2>{currentPartMetadata.title}</h2>
              <p>{currentPartMetadata.strapline}</p>
            </div>

            <div className="sidebar-card sidebar-reading-mode">
              <div className="reading-mode" aria-label="Reading language">
                <span>Text view</span>
                <div className="reading-mode-buttons" role="tablist" aria-label="Reading language">
                  {([
                    ['english', 'English'],
                    ['latin', 'Latin'],
                    ['bilingual', 'Bilingual']
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={readingMode === mode}
                      className={`reading-mode-button ${readingMode === mode ? 'active' : ''}`}
                      onClick={() => setReadingMode(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="sidebar-card">
              <div className="sidebar-heading">
                <h3>Sections</h3>
                <span>{visibleTopLevelElements.length} passages</span>
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
                <p className="sidebar-kicker">Selected</p>
                <h3>{formatElementLabel(selectedEntry)}</h3>
                {renderSelectionPreview(selectedEntry, readingMode)}
                <div className="selection-nav">
                  <button type="button" onClick={() => previousEntry && navigateToElement(previousEntry.id)} disabled={!previousEntry}>
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

        <BookView
          elements={orderedElements}
          query={deferredQuery}
          selectedElement={selectedElement}
          hoveredElement={hoveredElement}
          onElementHover={setHoveredElement}
          onElementSelect={handleSelectElement}
          currentPart={currentPart}
          partTitle={currentPartMetadata.title}
          readingMode={readingMode}
        />

        <ReasoningPanel
          selectedElement={selectedElement}
          element={selectedEntry}
          reasoning={reasoning}
          transitiveChains={transitiveChains}
          weightAnalysis={weightAnalysis}
          onNavigateToElement={navigateToElement}
          onClose={() => handleSelectElement(null)}
          currentPart={currentPart}
          loading={analysisLoading}
          previousElementId={previousEntry?.id ?? null}
          nextElementId={nextEntry?.id ?? null}
          readingMode={readingMode}
          onReadingModeChange={setReadingMode}
        />
      </main>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
    </div>
  );
};

const truncateText = (text: string, length = 220): string => (text.length > length ? `${text.slice(0, length)}…` : text);

const renderSelectionPreview = (element: SpinozaElement, readingMode: ReadingMode) => {
  if (readingMode === 'latin') {
    return <p>{truncateText(element.latinText || 'Latin text not yet available for this passage.')}</p>;
  }

  if (readingMode === 'bilingual') {
    return (
      <div className="selection-preview-grid">
        <p>{truncateText(element.text, 140)}</p>
        <p>{truncateText(element.latinText || 'Latin text not yet available.', 140)}</p>
      </div>
    );
  }

  return <p>{truncateText(element.text)}</p>;
};

const getPartNumberFromElementId = (elementId: string): number | null => {
  const numeral = elementId.split('.')[0];
  const part = Object.values(PARTS).find(entry => entry.numeral === numeral);
  return part?.number ?? null;
};

export default App;
