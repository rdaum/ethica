import React, { startTransition, useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { DataFactory, Store } from 'n3';
import BookView from './components/BookView';
import ReasoningPanel from './components/ReasoningPanel';
import './App.css';
import {
  backfillStore,
  formatElementLabel,
  mergeLatinText,
  matchesQuery,
  mergeStores,
  parseN3ToStore,
  parseSpinozaXml,
  PARTS,
  stripRulesFromN3,
  summarizeSections
} from './lib/ethica';
import { buildSupplementalStore } from './lib/readerGraph';
import {
  ReaderSectionSummary,
  ReadingMode,
  ReasoningRelation,
  SpinozaElement,
  TransitiveChain,
  WeightAnalysis
} from './types';

const App: React.FC = () => {
  const [elements, setElements] = useState<Map<string, SpinozaElement>>(new Map());
  const [n3Store, setN3Store] = useState(new Store());
  const [eyeStore, setEyeStore] = useState(new Store());
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

  // navigateToElement is a stable callback; this effect only needs to react when loading finishes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;

    const loadPartData = async () => {
      setLoading(true);
      setError(null);

      try {
        const basePath = process.env.PUBLIC_URL || '.';
        const [xmlResponse, latinResponse, n3Response, eyeResponse] = await Promise.all([
          fetch(`${basePath}/ethica_${currentPart}.xml`),
          fetch(`${basePath}/ethica_la_${currentPart}.json`),
          fetch(`${basePath}/ethica-logic.n3`),
          fetch(`${basePath}/ethica-logic-eye.n3`)
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
        const baseStore = await parseN3ToStore(n3Content);
        const eyeExplicitStore = await parseN3ToStore(stripRulesFromN3(eyeContent));
        const supplementalStore = buildSupplementalStore(parsedElements);
        const explicitStore = mergeStores(baseStore, eyeExplicitStore);
        const mergedStore = backfillStore(explicitStore, supplementalStore);

        let inferredStore = new Store();

        try {
          const { n3reasoner } = await import('eyereasoner');
          const derivations = await n3reasoner(eyeContent, undefined, {
            output: 'derivations',
            outputType: 'string'
          });

          if (derivations.trim()) {
            inferredStore = await parseN3ToStore(derivations);
          }
        } catch (reasoningError) {
          console.error('EYE-js reasoning failed, continuing with explicit graph only:', reasoningError);
        }

        if (cancelled) {
          return;
        }

        setElements(parsedElements);
        setN3Store(mergedStore);
        setEyeStore(inferredStore);
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
  }, [currentPart]);

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

      const [relations, chains, weight] = await Promise.all([
        performReasoning(selectedElement),
        findTransitiveChains(selectedElement),
        analyzeElementWeight(selectedElement)
      ]);

      if (cancelled) {
        return;
      }

      setReasoning(relations);
      setTransitiveChains(chains);
      setWeightAnalysis(weight);
      setAnalysisLoading(false);
    };

    analyzeSelectedElement();

    return () => {
      cancelled = true;
    };
  // These analyzers are stable callbacks backed by the current stores and elements.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElement, n3Store, eyeStore, elements]);

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

  const performReasoning = useCallback(async (elementId: string): Promise<ReasoningRelation[]> => {
    const results: ReasoningRelation[] = [];
    const elementURI = DataFactory.namedNode(`http://spinoza.org/ethics#${elementId}`);
    const originalPredicates = [
      'cites',
      'refersTo',
      'mentions',
      'clearlyfollowsFrom',
      'evidentFrom',
      'necessarilyFollows',
      'provedBy',
      'demonstratedBy',
      'groundedIn',
      'hasCorollary',
      'impliesConsequence',
      'buildsUpon',
      'appliesResultFrom',
      'refutedByAbsurdity',
      'contradicts',
      'partOf',
      'containsSection',
      'containsElement',
      'type'
    ];
    const inferredPredicates = [
      'transitivelyDependsOn',
      'dependsUpon',
      'circularArgument',
      'derivedFrom',
      'explainsElement'
    ];

    [...originalPredicates, ...inferredPredicates].forEach(predicate => {
      const predicateURI =
        predicate === 'type'
          ? DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
          : DataFactory.namedNode(`http://spinoza.org/ethics#${predicate}`);
      const store = inferredPredicates.includes(predicate) ? eyeStore : n3Store;

      store.getQuads(elementURI, predicateURI, null, null).forEach(quad => {
        results.push({
          subject: elementId,
          predicate,
          object: cleanResourceValue(quad.object.value),
          inferred: inferredPredicates.includes(predicate)
        });
      });

      store.getQuads(null, predicateURI, elementURI, null).forEach(quad => {
        results.push({
          subject: cleanResourceValue(quad.subject.value),
          predicate: inversePredicateFor(predicate),
          object: elementId,
          inferred: inferredPredicates.includes(predicate)
        });
      });
    });

    return dedupeRelations(results);
  }, [eyeStore, n3Store]);

  const findTransitiveChains = useCallback(async (elementId: string): Promise<TransitiveChain[]> => {
    const elementURI = DataFactory.namedNode(`http://spinoza.org/ethics#${elementId}`);
    const transitiveURI = DataFactory.namedNode('http://spinoza.org/ethics#transitivelyDependsOn');
    const dependencyURI = DataFactory.namedNode('http://spinoza.org/ethics#dependsUpon');
    const chains: TransitiveChain[] = [];

    eyeStore.getQuads(elementURI, transitiveURI, null, null).forEach(quad => {
      chains.push({
        type: 'transitive_dependency',
        start: elementId,
        end: cleanResourceValue(quad.object.value),
        relationship: 'transitivelyDependsOn',
        inferred: true,
        path: [{ from: elementId, to: cleanResourceValue(quad.object.value), relationship: 'transitivelyDependsOn' }],
        length: 1
      });
    });

    eyeStore.getQuads(elementURI, dependencyURI, null, null).forEach(quad => {
      chains.push({
        type: 'dependency',
        start: elementId,
        end: cleanResourceValue(quad.object.value),
        relationship: 'dependsUpon',
        inferred: true,
        path: [{ from: elementId, to: cleanResourceValue(quad.object.value), relationship: 'dependsUpon' }],
        length: 1
      });
    });

    eyeStore.getQuads(null, transitiveURI, elementURI, null).forEach(quad => {
      chains.push({
        type: 'inverse_transitive_dependency',
        start: cleanResourceValue(quad.subject.value),
        end: elementId,
        relationship: 'transitivelyDependsOn',
        inferred: true,
        path: [{ from: cleanResourceValue(quad.subject.value), to: elementId, relationship: 'transitivelyDependsOn' }],
        length: 1
      });
    });

    eyeStore.getQuads(null, dependencyURI, elementURI, null).forEach(quad => {
      chains.push({
        type: 'inverse_dependency',
        start: cleanResourceValue(quad.subject.value),
        end: elementId,
        relationship: 'dependsUpon',
        inferred: true,
        path: [{ from: cleanResourceValue(quad.subject.value), to: elementId, relationship: 'dependsUpon' }],
        length: 1
      });
    });

    return dedupeChains(chains);
  }, [eyeStore]);

  const analyzeElementWeight = useCallback(async (elementId: string): Promise<WeightAnalysis | null> => {
    try {
      const analysis: WeightAnalysis = {
        elementId,
        inboundWeight: 0,
        outboundWeight: 0,
        transitiveInfluence: 0,
        foundationalScore: 0,
        relationshipBreakdown: {},
        dependencyDepth: 0,
        influenceReach: 0
      };
      const weights: Record<string, number> = {
        cites: 1,
        necessarilyFollows: 3,
        clearlyfollowsFrom: 2,
        provedBy: 2,
        appliesResultFrom: 2,
        refutedByAbsurdity: 1.5,
        buildsUpon: 1.5,
        groundedIn: 2,
        demonstratedBy: 2
      };
      const elementURI = DataFactory.namedNode(`http://spinoza.org/ethics#${elementId}`);

      Object.entries(weights).forEach(([predicate, weight]) => {
        const predicateURI = DataFactory.namedNode(`http://spinoza.org/ethics#${predicate}`);
        const inbound = n3Store.getQuads(null, predicateURI, elementURI, null);
        const outbound = n3Store.getQuads(elementURI, predicateURI, null, null);

        analysis.inboundWeight += inbound.length * weight;
        analysis.outboundWeight += outbound.length * weight;
      });

      const calculateTransitiveInfluence = (currentId: string, visited: Set<string>, depth: number): number => {
        if (depth > 4 || visited.has(currentId)) {
          return 0;
        }

        visited.add(currentId);
        let influence = 0;
        const currentURI = DataFactory.namedNode(`http://spinoza.org/ethics#${currentId}`);

        Object.entries(weights).forEach(([predicate, weight]) => {
          const predicateURI = DataFactory.namedNode(`http://spinoza.org/ethics#${predicate}`);
          n3Store.getQuads(null, predicateURI, currentURI, null).forEach(quad => {
            influence += weight * (5 - depth);
            influence += calculateTransitiveInfluence(cleanResourceValue(quad.subject.value), new Set(visited), depth + 1);
          });
        });

        return influence;
      };

      const calculateDepth = (currentId: string, visited: Set<string>): number => {
        if (visited.has(currentId)) {
          return 0;
        }

        visited.add(currentId);
        const currentURI = DataFactory.namedNode(`http://spinoza.org/ethics#${currentId}`);
        let maxDepth = 0;

        Object.keys(weights).forEach(predicate => {
          const predicateURI = DataFactory.namedNode(`http://spinoza.org/ethics#${predicate}`);
          n3Store.getQuads(currentURI, predicateURI, null, null).forEach(quad => {
            maxDepth = Math.max(
              maxDepth,
              1 + calculateDepth(cleanResourceValue(quad.object.value), new Set(visited))
            );
          });
        });

        return maxDepth;
      };

      analysis.transitiveInfluence = calculateTransitiveInfluence(elementId, new Set(), 0);
      analysis.dependencyDepth = calculateDepth(elementId, new Set());
      analysis.influenceReach = Math.round(analysis.transitiveInfluence / 10);

      const selectedType = elements.get(elementId)?.type;
      const baseScore =
        selectedType === 'definition'
          ? 10
          : selectedType === 'axiom'
            ? 8
            : selectedType === 'proposition'
              ? 3
              : selectedType === 'appendix'
                ? 2
                : 1;
      const dependencyRatio =
        analysis.outboundWeight === 0 ? 1 : Math.min(1, analysis.inboundWeight / analysis.outboundWeight);

      analysis.foundationalScore = Math.max(
        0,
        baseScore +
          analysis.inboundWeight * 1.5 +
          analysis.transitiveInfluence * 0.2 +
          dependencyRatio * 5
      );

      return analysis;
    } catch (analysisError) {
      console.error('Weight analysis failed:', analysisError);
      return null;
    }
  }, [elements, n3Store]);

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
        </div>
      </header>

      <main className="reader-layout">
        <aside className="reader-sidebar">
          <div className="sidebar-card">
            <img
              src={`${process.env.PUBLIC_URL}/spinoza-signet.png`}
              alt="Spinoza's signet ring"
              className="spinoza-signet"
            />
            <p className="sidebar-kicker">
              Part {currentPartMetadata.numeral}
            </p>
            <h2>{currentPartMetadata.title}</h2>
            <p>{currentPartMetadata.strapline}</p>
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

const cleanResourceValue = (value: string): string => (value.includes('#') ? value.split('#')[1] : value);

const inversePredicateFor = (predicate: string): string =>
  predicate === 'cites'
    ? 'citedBy'
    : predicate === 'refersTo'
      ? 'referredToBy'
      : predicate === 'mentions'
        ? 'mentionedBy'
        : predicate === 'clearlyfollowsFrom'
          ? 'clearlyLeadsTo'
          : predicate === 'evidentFrom'
            ? 'makesEvident'
            : predicate === 'necessarilyFollows'
              ? 'necessarilyFollowedBy'
              : predicate === 'provedBy'
                ? 'proves'
                : predicate === 'demonstratedBy'
                  ? 'demonstrates'
                  : predicate === 'groundedIn'
                    ? 'grounds'
                    : predicate === 'hasCorollary'
                      ? 'isCorollaryOf'
                      : predicate === 'impliesConsequence'
                        ? 'isConsequenceOf'
                        : predicate === 'buildsUpon'
                          ? 'isBuiltUponBy'
                          : predicate === 'appliesResultFrom'
                            ? 'providesResultTo'
                            : predicate === 'refutedByAbsurdity'
                              ? 'refutes'
                              : predicate === 'contradicts'
                                ? 'contradictedBy'
                                : predicate === 'partOf'
                                  ? 'contains'
                                  : predicate === 'containsSection'
                                    ? 'isSectionOf'
                                    : predicate === 'containsElement'
                                      ? 'isElementOf'
                                      : `inverse_${predicate}`;

const dedupeRelations = (relations: ReasoningRelation[]): ReasoningRelation[] => {
  const seen = new Set<string>();

  return relations.filter(relation => {
    const key = `${relation.subject}|${relation.predicate}|${relation.object}|${relation.inferred ? '1' : '0'}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const dedupeChains = (chains: TransitiveChain[]): TransitiveChain[] => {
  const seen = new Set<string>();

  return chains.filter(chain => {
    const key = `${chain.start}|${chain.relationship}|${chain.end}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
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
