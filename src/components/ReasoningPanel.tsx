import React, { useEffect, useRef, useState } from 'react';
import './ReasoningPanel.css';
import { formatLocalizedLabel, formatPassageReference } from '../lib/ethica';
import { PassageAnalysis, ReadingLanguages, SpinozaElement } from '../types';
import { getStrings, Strings } from '../lib/strings';
import { Language } from '../types';
import { MetadataChips, PassagePreview } from './PassageMeta';

const COLLAPSED_LIST_SIZE = 12;
const COLLAPSED_PATH_COUNT = 25;

interface ReasoningPanelProps {
  selectedElement: string | null;
  element?: SpinozaElement;
  analysis: PassageAnalysis | null;
  onNavigateToElement: (elementId: string) => void;
  onClose: () => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  previousElementId: string | null;
  nextElementId: string | null;
  languages: ReadingLanguages;
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
  languages,
  focusRequest
}) => {
  const t = getStrings(languages.primary);
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
          <p className="panel-kicker">{t.analysis}</p>
          <h2>{t.choosePassage}</h2>
          <p>{t.choosePassageHelp}</p>
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
        aria-label={t.analysisOf(formatLocalizedLabel(element, languages.primary))}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            onClose();
          }
        }}
      >
        <div className="reasoning-header">
          <div>
            <p className="panel-kicker">{t.analysis}</p>
            <h2>{formatLocalizedLabel(element, languages.primary)}</h2>
            <p className="panel-id">{element.id}</p>
            <MetadataChips element={element} t={t} />
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="nav-button"
              onClick={event => previousElementId && navigate(previousElementId, event)}
              disabled={!previousElementId}
            >
              {t.previous}
            </button>
            <button
              type="button"
              className="nav-button"
              onClick={event => nextElementId && navigate(nextElementId, event)}
              disabled={!nextElementId}
            >
              {t.next}
            </button>
            <button type="button" className="close-button" onClick={onClose}>
              {t.close}
            </button>
          </div>
        </div>

        <div className="selected-text">
          <PassagePreview element={element} languages={languages} length={300} />
        </div>

        {loading ? (
          <div className="analysis-loading">
            <p>{t.tracing}</p>
          </div>
        ) : error ? (
          <div className="analysis-error" role="alert">
            <p>{t.analysisError}</p>
            <button type="button" className="nav-button" onClick={onRetry}>
              {t.tryAgain}
            </button>
          </div>
        ) : (
          analysis && <AnalysisDetails key={selectedElement} analysis={analysis} navigate={navigate} t={t} language={languages.primary} />
        )}
      </div>
    </aside>
  );
};

type Navigate = (id: string, event: React.MouseEvent) => void;

type Localized = { t: Strings; language: Language };

const AnalysisDetails: React.FC<{ analysis: PassageAnalysis; navigate: Navigate } & Localized> = ({ analysis, navigate, t, language }) => {
  const { structure, metrics } = analysis;
  const structureGroups: Array<[string, string[]]> = [
    [t.partOf, structure.parent ? [structure.parent] : []],
    [t.proofs, structure.proofs],
    [t.corollaries, structure.corollaries],
    [t.notes, structure.notes]
  ];
  const hasRelations =
    analysis.dependsOn.length + analysis.usedBy.length + analysis.cites.length + analysis.citedBy.length > 0 ||
    structureGroups.some(([, ids]) => ids.length > 0);
  const localized = { navigate, t, language };

  return (
    <>
      <section className="panel-section">
        <div className="section-heading">
          <h3>{t.connections}</h3>
        </div>
        <dl className="connection-stats">
          <ConnectionStat label={t.cites} value={metrics.cites} description={t.citesHelp} />
          <ConnectionStat label={t.citedBy} value={metrics.citedBy} description={t.citedByHelp} />
          <ConnectionStat label={t.allDependencies} value={metrics.totalDependencies} description={t.allDependenciesHelp} />
          <ConnectionStat label={t.allDependents} value={metrics.totalDependents} description={t.allDependentsHelp} />
          <ConnectionStat label={t.depth} value={metrics.depth} description={t.depthHelp} />
        </dl>
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <h3>{t.relationships}</h3>
        </div>

        {!hasRelations && <p className="muted-copy">{t.noRelationships}</p>}

        <RelationshipGroup title={t.dependsOn} ids={analysis.dependsOn} {...localized} />
        <RelationshipGroup title={t.usedBy} ids={analysis.usedBy} {...localized} />
        <RelationshipGroup title={t.cites} ids={analysis.cites} {...localized} />
        <RelationshipGroup title={t.mentionedIn} ids={analysis.citedBy} {...localized} />
        {structureGroups.map(([title, ids]) => (
          <RelationshipGroup key={title} title={title} ids={ids} {...localized} />
        ))}
      </section>

      <PathSection title={t.dependenciesThrough} paths={analysis.dependencyPaths} {...localized} />
      <PathSection title={t.dependentsThrough} paths={analysis.dependentPaths} {...localized} />
    </>
  );
};

const ConnectionStat = ({ label, value, description }: { label: string; value: number; description: string }) => (
  <div className="connection-stat" title={description}>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
);

const RelationshipGroup: React.FC<{ title: string; ids: string[]; navigate: Navigate } & Localized> = ({ title, ids, navigate, t, language }) => {
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
            <span>{formatPassageReference(id, language)}</span>
          </button>
        ))}
      </div>
      {ids.length > COLLAPSED_LIST_SIZE && (
        <button type="button" className="show-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? t.showFewer : t.showAll(ids.length)}
        </button>
      )}
    </div>
  );
};

const PathSection: React.FC<{ title: string; paths: string[][]; navigate: Navigate } & Localized> = ({ title, paths, navigate, t, language }) => {
  const [expanded, setExpanded] = useState(false);

  if (paths.length === 0) {
    return null;
  }

  const visible = expanded ? paths : paths.slice(0, COLLAPSED_PATH_COUNT);

  return (
    <section className="panel-section">
      <details className="path-details">
        <summary>
          <span>{title}</span>
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
                    {formatPassageReference(step, language)}
                  </button>
                </React.Fragment>
              ))}
            </li>
          ))}
        </ol>
        {paths.length > COLLAPSED_PATH_COUNT && (
          <button type="button" className="show-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? t.showFewer : t.showAll(paths.length)}
          </button>
        )}
      </details>
    </section>
  );
};

export default ReasoningPanel;
