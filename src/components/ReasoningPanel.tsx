import React, { useEffect, useRef } from 'react';
import './ReasoningPanel.css';
import { formatElementLabel } from '../lib/ethica';
import {
  ReadingMode,
  ReasoningRelation,
  SpinozaElement,
  TransitiveChain,
  WeightAnalysis
} from '../types';

interface ReasoningPanelProps {
  selectedElement: string | null;
  element?: SpinozaElement;
  reasoning: ReasoningRelation[];
  transitiveChains: TransitiveChain[];
  weightAnalysis: WeightAnalysis | null;
  onNavigateToElement: (elementId: string) => void;
  onClose: () => void;
  currentPart: number;
  loading: boolean;
  previousElementId: string | null;
  nextElementId: string | null;
  readingMode: ReadingMode;
  onReadingModeChange: (mode: ReadingMode) => void;
}

const ReasoningPanel: React.FC<ReasoningPanelProps> = ({
  selectedElement,
  element,
  reasoning,
  transitiveChains,
  weightAnalysis,
  onNavigateToElement,
  onClose,
  currentPart,
  loading,
  previousElementId,
  nextElementId,
  readingMode,
  onReadingModeChange
}) => {
  const panelCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedElement) {
      return;
    }

    panelCardRef.current?.scrollTo({
      top: 0,
      behavior: 'auto'
    });
  }, [selectedElement]);

  if (!selectedElement || !element) {
    return (
      <aside className="reasoning-panel empty">
        <div className="panel-card">
          <p className="panel-kicker">Analysis</p>
          <h2>Choose a passage</h2>
          <p>
            Select a definition, axiom, proposition, proof, or note to inspect its logical
            relations and inferred dependencies.
          </p>
        </div>
      </aside>
    );
  }

  const groupedReasoning = reasoning.reduce<Record<string, ReasoningRelation[]>>((groups, relation) => {
    const key = relation.predicate;
    groups[key] = groups[key] ?? [];
    groups[key].push(relation);
    return groups;
  }, {});

  const orderedReasoningGroups = Object.entries(groupedReasoning).sort(([left], [right]) => {
    const leftRank = predicateRank(left);
    const rightRank = predicateRank(right);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return formatPredicate(left).localeCompare(formatPredicate(right));
  });

  return (
    <aside className="reasoning-panel">
      <div ref={panelCardRef} className="panel-card pinned">
        <div className="reasoning-header">
          <div>
            <p className="panel-kicker">Analysis</p>
            <h2>{formatElementLabel(element)}</h2>
            <p className="panel-id">{element.id}</p>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="nav-button"
              onClick={() => previousElementId && onNavigateToElement(previousElementId)}
              disabled={!previousElementId}
            >
              Previous
            </button>
            <button
              type="button"
              className="nav-button"
              onClick={() => nextElementId && onNavigateToElement(nextElementId)}
              disabled={!nextElementId}
            >
              Next
            </button>
            <button type="button" className="close-button" onClick={onClose}>
              Close
            </button>
            <div className="panel-reading-mode" aria-label="Reading language">
              <div className="reading-mode-buttons" role="tablist" aria-label="Reading language">
                {([
                  ['english', 'EN'],
                  ['latin', 'LA'],
                  ['bilingual', 'BI']
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={readingMode === mode}
                    className={`reading-mode-button ${readingMode === mode ? 'active' : ''}`}
                    onClick={() => onReadingModeChange(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="selected-text">{truncateText(element.text)}</p>

        {loading ? (
          <div className="analysis-loading">
            <p>Tracing relations and inferred dependencies…</p>
          </div>
        ) : (
          <>
            {weightAnalysis && (
              <section className="panel-section">
                <div className="section-heading">
                  <h3>Logical Weight</h3>
                </div>
                <div className="metric-grid">
                  <MetricCard label="Foundational" value={weightAnalysis.foundationalScore} tone="gold" />
                  <MetricCard label="Inbound" value={weightAnalysis.inboundWeight} tone="green" />
                  <MetricCard label="Outbound" value={weightAnalysis.outboundWeight} tone="ink" />
                  <MetricCard label="Reach" value={weightAnalysis.influenceReach} tone="rose" />
                </div>
              </section>
            )}

            <section className="panel-section">
              <div className="section-heading">
                <h3>Relationships</h3>
                <span>{reasoning.length}</span>
              </div>

              {Object.keys(groupedReasoning).length === 0 ? (
                <p className="muted-copy">No explicit or inferred relationships were found for this passage.</p>
              ) : (
                orderedReasoningGroups.map(([predicate, relations]) => (
                  <div key={predicate} className="relationship-group">
                    <h4>{formatPredicate(predicate)}</h4>
                    <div className="relationship-list">
                      {relations.map((relation, index) => {
                        const targetId =
                          relation.subject === selectedElement ? relation.object : relation.subject;
                        return (
                          <button
                            key={`${predicate}-${targetId}-${index}`}
                            type="button"
                            className={`relationship-chip ${relation.inferred ? 'inferred' : ''}`}
                            onClick={() => onNavigateToElement(targetId)}
                          >
                            <span>{formatElementReference(targetId, currentPart)}</span>
                            {relation.inferred && <em>Inferred</em>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </section>

            {transitiveChains.length > 0 && (
              <section className="panel-section">
                <div className="section-heading">
                  <h3>Dependency Paths</h3>
                  <span>{transitiveChains.length}</span>
                </div>
                <div className="chain-list">
                  {transitiveChains.slice(0, 12).map((chain, index) => (
                    <button
                      key={`${chain.start}-${chain.end}-${index}`}
                      type="button"
                      className="chain-item"
                      onClick={() => onNavigateToElement(chain.end)}
                    >
                      <strong>{formatElementReference(chain.start, currentPart)}</strong>
                      <span>{humanizeRelationship(chain.relationship)}</span>
                      <strong>{formatElementReference(chain.end, currentPart)}</strong>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
};

const MetricCard = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <div className={`metric-card ${tone}`}>
    <span>{label}</span>
    <strong>{value.toFixed(1)}</strong>
  </div>
);

const truncateText = (text: string): string => {
  if (text.length <= 300) {
    return text;
  }

  return `${text.slice(0, 300).trim()}…`;
};

const formatPredicate = (predicate: string): string => {
  const inverseLabels: Record<string, string> = {
    inverse_dependsUpon: 'Is Depended On By',
    inverse_transitivelyDependsOn: 'Is Transitively Depended On By',
    inverse_derivedFrom: 'Derives',
    inverse_explainsElement: 'Is Explained By',
    inverse_cites: 'Is Cited By',
    inverse_provedBy: 'Proves',
    inverse_hasCorollary: 'Is Corollary Of',
    inverse_partOf: 'Contains',
    inverse_type: 'Type Of'
  };

  if (inverseLabels[predicate]) {
    return inverseLabels[predicate];
  }

  return predicate
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, letter => letter.toUpperCase())
    .trim();
};

const humanizeRelationship = (relationship: string): string =>
  relationship.replace(/([A-Z])/g, ' $1').toLowerCase();

const formatElementReference = (elementId: string, currentPart: number): string => {
  const showPart = !elementId.startsWith(`${currentPart === 1 ? 'I' : 'II'}.`);
  const label = elementId.split('.').length > 1 ? elementId : elementId;
  return showPart ? label : label.replace(/^[IVX]+\./, '');
};

const predicateRank = (predicate: string): number => {
  const normalized = predicate.replace(/^inverse_/, '');

  if (normalized.includes('transitively')) {
    return 2;
  }

  return 1;
};

export default ReasoningPanel;
