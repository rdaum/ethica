import React, { useEffect, useRef, useState } from 'react';
import './ReasoningPanel.css';
import { formatElementLabel, formatPassageReference } from '../lib/ethica';
import { PassageAnalysis, ReadingMode, SpinozaElement } from '../types';
import { MetadataChips, PassagePreview, ReadingModeToggle } from './PassageMeta';

const COLLAPSED_LIST_SIZE = 12;
const COLLAPSED_PATH_COUNT = 25;

interface ReasoningPanelProps {
  selectedElement: string | null;
  element?: SpinozaElement;
  analysis: PassageAnalysis | null;
  onNavigateToElement: (elementId: string) => void;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  previousElementId: string | null;
  nextElementId: string | null;
  readingMode: ReadingMode;
  onReadingModeChange: (mode: ReadingMode) => void;
  focusRequest: number;
}

const ReasoningPanel: React.FC<ReasoningPanelProps> = ({
  selectedElement,
  element,
  analysis,
  onNavigateToElement,
  onClose,
  loading,
  error,
  onRetry,
  previousElementId,
  nextElementId,
  readingMode,
  onReadingModeChange,
  focusRequest
}) => {
  const panelCardRef = useRef<HTMLDivElement | null>(null);
  const keyboardNavigation = useRef(false);

  useEffect(() => {
    panelCardRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedElement]);

  // A keyboard user's focus must follow them: a link they activated may no longer exist.
  useEffect(() => {
    if (element && keyboardNavigation.current) {
      keyboardNavigation.current = false;
      panelCardRef.current?.focus({ preventScroll: true });
    }
  }, [element]);

  useEffect(() => {
    if (focusRequest > 0) {
      panelCardRef.current?.focus({ preventScroll: true });
    }
  }, [focusRequest]);

  const navigate = (id: string, event: React.MouseEvent) => {
    // A click with no pointer details came from the keyboard.
    keyboardNavigation.current = event.detail === 0;
    onNavigateToElement(id);
  };

  if (!selectedElement || !element) {
    return (
      <aside className="reasoning-panel empty">
        <div className="panel-card">
          <p className="panel-kicker">Analysis</p>
          <h2>Choose a passage</h2>
          <p>Select a definition, axiom, proposition, proof, or note to see what it rests on and what rests on it.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="reasoning-panel">
      <div
        ref={panelCardRef}
        className="panel-card pinned"
        tabIndex={-1}
        aria-label={`Analysis of ${formatElementLabel(element)}`}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            onClose();
          }
        }}
      >
        <div className="reasoning-header">
          <div>
            <p className="panel-kicker">Analysis</p>
            <h2>{formatElementLabel(element)}</h2>
            <p className="panel-id">{element.id}</p>
            <MetadataChips element={element} />
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="nav-button"
              onClick={event => previousElementId && navigate(previousElementId, event)}
              disabled={!previousElementId}
            >
              Previous
            </button>
            <button
              type="button"
              className="nav-button"
              onClick={event => nextElementId && navigate(nextElementId, event)}
              disabled={!nextElementId}
            >
              Next
            </button>
            <button type="button" className="close-button" onClick={onClose}>
              Close
            </button>
            <div className="panel-reading-mode">
              <ReadingModeToggle value={readingMode} onChange={onReadingModeChange} compact />
            </div>
          </div>
        </div>

        <div className="selected-text">
          <PassagePreview element={element} readingMode={readingMode} length={300} />
        </div>

        {loading ? (
          <div className="analysis-loading">
            <p>Tracing relations and dependencies…</p>
          </div>
        ) : error ? (
          <div className="analysis-error" role="alert">
            <p>{error}</p>
            <button type="button" className="nav-button" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : (
          analysis && <AnalysisDetails key={selectedElement} analysis={analysis} navigate={navigate} />
        )}
      </div>
    </aside>
  );
};

type Navigate = (id: string, event: React.MouseEvent) => void;

const AnalysisDetails: React.FC<{ analysis: PassageAnalysis; navigate: Navigate }> = ({ analysis, navigate }) => {
  const { structure, metrics } = analysis;
  const structureGroups: Array<[string, string[]]> = [
    ['Part of', structure.parent ? [structure.parent] : []],
    ['Proofs', structure.proofs],
    ['Corollaries', structure.corollaries],
    ['Notes', structure.notes]
  ];
  const hasRelations =
    analysis.dependsOn.length + analysis.usedBy.length + analysis.cites.length + analysis.citedBy.length > 0 ||
    structureGroups.some(([, ids]) => ids.length > 0);

  return (
    <>
      <section className="panel-section">
        <div className="section-heading">
          <h3>Connections</h3>
        </div>
        <div className="metric-grid">
          <MetricCard label="Cites" value={metrics.cites} tone="ink" description="Passages this one directly relies on or refers to." />
          <MetricCard label="Cited by" value={metrics.citedBy} tone="green" description="Passages that directly rely on or refer to this one." />
          <MetricCard
            label="All dependencies"
            value={metrics.totalDependencies}
            tone="gold"
            description="Every passage this one rests on, following demonstrations back to their foundations."
          />
          <MetricCard
            label="All dependents"
            value={metrics.totalDependents}
            tone="rose"
            description="Every passage that rests on this one, directly or through other demonstrations."
          />
          <MetricCard label="Depth" value={metrics.depth} tone="ink" description="The longest chain of steps from this passage back to a foundation." />
        </div>
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <h3>Relationships</h3>
        </div>

        {!hasRelations && <p className="muted-copy">No relationships were found for this passage.</p>}

        <RelationshipGroup title="Depends on" ids={analysis.dependsOn} navigate={navigate} />
        <RelationshipGroup title="Used by" ids={analysis.usedBy} navigate={navigate} />
        <RelationshipGroup title="Cites" ids={analysis.cites} navigate={navigate} />
        <RelationshipGroup title="Mentioned in" ids={analysis.citedBy} navigate={navigate} />
        {structureGroups.map(([title, ids]) => (
          <RelationshipGroup key={title} title={title} ids={ids} navigate={navigate} />
        ))}
      </section>

      <PathSection title="All dependencies" paths={analysis.dependencyPaths} navigate={navigate} />
      <PathSection title="All dependents" paths={analysis.dependentPaths} navigate={navigate} />
    </>
  );
};

const MetricCard = ({ label, value, tone, description }: { label: string; value: number; tone: string; description: string }) => (
  <div className={`metric-card ${tone}`} title={description}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const RelationshipGroup: React.FC<{ title: string; ids: string[]; navigate: Navigate }> = ({ title, ids, navigate }) => {
  const [expanded, setExpanded] = useState(false);

  if (ids.length === 0) {
    return null;
  }

  const visible = expanded ? ids : ids.slice(0, COLLAPSED_LIST_SIZE);

  return (
    <div className="relationship-group">
      <h4>
        {title} <span className="relationship-count">{ids.length}</span>
      </h4>
      <div className="relationship-list">
        {visible.map(id => (
          <button key={id} type="button" className="relationship-chip" data-target-id={id} onClick={event => navigate(id, event)}>
            <span>{formatPassageReference(id)}</span>
          </button>
        ))}
      </div>
      {ids.length > COLLAPSED_LIST_SIZE && (
        <button type="button" className="show-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer' : `Show all ${ids.length}`}
        </button>
      )}
    </div>
  );
};

const PathSection: React.FC<{ title: string; paths: string[][]; navigate: Navigate }> = ({ title, paths, navigate }) => {
  const [expanded, setExpanded] = useState(false);

  if (paths.length === 0) {
    return null;
  }

  const visible = expanded ? paths : paths.slice(0, COLLAPSED_PATH_COUNT);

  return (
    <section className="panel-section">
      <details className="path-details">
        <summary>
          <span>{title} through other passages</span>
          <span className="relationship-count">{paths.length}</span>
        </summary>
        <ol className="path-list">
          {visible.map(path => (
            <li key={path[path.length - 1]} className="path-row">
              {path.slice(1).map((step, index) => (
                <React.Fragment key={step}>
                  {index > 0 && (
                    <span className="path-arrow" aria-hidden="true">
                      →
                    </span>
                  )}
                  <button type="button" className="path-step" data-target-id={step} onClick={event => navigate(step, event)}>
                    {formatPassageReference(step)}
                  </button>
                </React.Fragment>
              ))}
            </li>
          ))}
        </ol>
        {paths.length > COLLAPSED_PATH_COUNT && (
          <button type="button" className="show-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show fewer' : `Show all ${paths.length}`}
          </button>
        )}
      </details>
    </section>
  );
};

export default ReasoningPanel;
