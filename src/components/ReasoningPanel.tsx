import React from 'react';
import { Store } from 'n3';
import './ReasoningPanel.css';

interface SpinozaElement {
  id: string;
  type: 'definition' | 'axiom' | 'proposition' | 'proof' | 'corollary' | 'note';
  number?: string;
  text: string;
  parentId?: string;
}

interface Reasoning {
  subject: string;
  predicate: string;
  object: string;
  inferred?: boolean;
}

interface ReasoningPanelProps {
  selectedElement: string | null;
  element?: SpinozaElement;
  reasoning: Reasoning[];
  transitiveChains: any[];
  weightAnalysis: any | null;
  n3Store: Store;
  onNavigateToElement: (elementId: string) => void;
  onClose: () => void;
}

const ReasoningPanel: React.FC<ReasoningPanelProps> = ({
  selectedElement,
  element,
  reasoning,
  transitiveChains,
  weightAnalysis,
  n3Store,
  onNavigateToElement,
  onClose
}) => {
  if (!selectedElement || !element) return null;

  const getTruncatedText = (text: string): string => {
    // Split into sentences (roughly)
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length <= 2) {
      return text;
    }
    
    // Take first two sentences and add ellipsis
    const firstTwoSentences = sentences.slice(0, 2).join('. ').trim();
    return `${firstTwoSentences}${firstTwoSentences.endsWith('.') ? '' : '.'} ...`;
  };

  const formatElementLabel = (elementId: string): string => {
    // Convert technical IDs like "I.prop.17.proof" to readable labels like "Proposition XVII" 
    const parts = elementId.split('.');
    
    if (parts.length < 2) return elementId;
    const type = parts[1]; // "def", "ax", "prop"
    const number = parts[2]; // "17"
    const subElement = parts[3]; // "proof", "corollary", "note"
    
    // Convert numbers to Roman numerals for formal presentation
    const toRoman = (num: number): string => {
      const values = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
      const symbols = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
      let result = '';
      
      for (let i = 0; i < values.length; i++) {
        while (num >= values[i]) {
          result += symbols[i];
          num -= values[i];
        }
      }
      return result;
    };
    
    let baseLabel = '';
    const romanNumber = number ? toRoman(parseInt(number)) : '';
    
    switch (type) {
      case 'def':
        baseLabel = `Definition ${romanNumber}`;
        break;
      case 'ax':
        baseLabel = `Axiom ${romanNumber}`;
        break;
      case 'prop':
        baseLabel = `Proposition ${romanNumber}`;
        break;
      default:
        baseLabel = `${type.charAt(0).toUpperCase() + type.slice(1)} ${romanNumber}`;
    }
    
    // Add sub-element if present
    if (subElement) {
      const subLabel = subElement === 'corollary' ? 'Corollary' :
                      subElement === 'note' ? 'Note' :
                      subElement === 'proof' ? 'Proof' :
                      subElement === 'explanation' ? 'Explanation' :
                      subElement.charAt(0).toUpperCase() + subElement.slice(1);
      
      return `${baseLabel} ${subLabel}`;
    }
    
    return baseLabel;
  };

  const groupReasoningByPredicate = (reasoning: Reasoning[]) => {
    const grouped: { [key: string]: Reasoning[] } = {};
    reasoning.forEach(r => {
      if (!grouped[r.predicate]) {
        grouped[r.predicate] = [];
      }
      grouped[r.predicate].push(r);
    });
    return grouped;
  };

  const formatPredicate = (predicate: string) => {
    switch (predicate) {
      case 'cites': return '📖 Citations (Outward)';
      case 'citedBy': return '📖 Citations (Inward)';
      case 'refersTo': return '📖 References';
      case 'mentions': return '📖 Mentions';
      
      case 'clearlyfollowsFrom': return '✨ Clearly Follows From';
      case 'evidentFrom': return '✨ Evident From';
      case 'necessarilyFollows': return '⚡ Logical Consequences';
      case 'necessarilyFollowedBy': return '⚡ Logical Prerequisites';
      
      case 'provedBy': return '📐 Proved By';
      case 'demonstratedBy': return '📐 Demonstrated By';
      case 'groundedIn': return '📐 Grounded In';
      
      case 'hasCorollary': return '🌟 Has Corollary';
      case 'impliesConsequence': return '🌟 Implies Consequence';
      case 'buildsUpon': return '🏗️ Builds Upon';
      case 'appliesResultFrom': return '🔄 Applies Result From';
      
      case 'refutedByAbsurdity': return '💥 Reductio Arguments';
      case 'refutes': return '💥 Refutes';
      case 'contradicts': return '⚠️ Contradicts';
      
      case 'partOf': return '🧩 Part Of';
      case 'contains': return '🧩 Contains';
      case 'containsSection': return '🧩 Contains Section';
      case 'containsElement': return '🧩 Contains Element';
      
      case 'type': return '🏷️ Type Classification';
      case 'inverse_type': return '🏷️ Instances';
      
      // Inverse relationships
      case 'referredToBy': return '📖 Referred To By';
      case 'mentionedBy': return '📖 Mentioned By';
      case 'clearlyLeadsTo': return '✨ Clearly Leads To';
      case 'makesEvident': return '✨ Makes Evident';
      case 'proves': return '📐 Proves';
      case 'demonstrates': return '📐 Demonstrates';
      case 'grounds': return '📐 Grounds';
      case 'isCorollaryOf': return '🌟 Is Corollary Of';
      case 'isConsequenceOf': return '🌟 Is Consequence Of';
      case 'isBuiltUponBy': return '🏗️ Is Built Upon By';
      case 'providesResultTo': return '🔄 Provides Result To';
      case 'contradictedBy': return '⚠️ Contradicted By';
      case 'isSectionOf': return '🧩 Is Section Of';
      case 'isElementOf': return '🧩 Is Element Of';
      
      default: return `🔗 ${predicate.replace(/([A-Z])/g, ' $1').toLowerCase()}`;
    }
  };

  const groupedReasoning = groupReasoningByPredicate(reasoning);

  return (
    <div className="reasoning-panel">
      <div className="reasoning-header">
        <h3>Logical Analysis</h3>
        <button className="close-button" onClick={onClose}>×</button>
      </div>
      
      <div className="selected-element">
        <div className="element-info">
          <span className={`element-type-badge ${element.type}`}>
            {element.type}
          </span>
          <span className="element-label">{formatElementLabel(element.id)}</span>
        </div>
        <div className="element-text">
          {getTruncatedText(element.text)}
        </div>
      </div>

      <div className="reasoning-results">
        {Object.keys(groupedReasoning).length === 0 ? (
          <div className="no-reasoning">
            <p>No logical relationships found through reasoning.</p>
            <p className="hint">
              This might mean this element is foundational or the reasoning rules need refinement.
            </p>
          </div>
        ) : (
          Object.entries(groupedReasoning).map(([predicate, relations]) => (
            <div key={predicate} className="reasoning-group">
              <h4 className="reasoning-group-title">
                {formatPredicate(predicate)} ({relations.length})
              </h4>
              <div className="reasoning-items">
                {relations.map((relation, index) => (
                  <div key={index} className={`reasoning-item ${relation.inferred ? 'inferred' : 'original'}`}>
                    <div className="reasoning-relationship">
                      {relation.subject === selectedElement ? (
                        <div className="relationship-flow">
                          <span className="current-element">{formatElementLabel(relation.subject)}</span>
                          <span className="arrow">→</span>
                          <span 
                            className="related-element clickable" 
                            onClick={() => onNavigateToElement(relation.object)}
                            title={`Navigate to ${formatElementLabel(relation.object)}`}
                          >
                            {formatElementLabel(relation.object)}
                          </span>
                        </div>
                      ) : (
                        <div className="relationship-flow">
                          <span 
                            className="related-element clickable" 
                            onClick={() => onNavigateToElement(relation.subject)}
                            title={`Navigate to ${formatElementLabel(relation.subject)}`}
                          >
                            {formatElementLabel(relation.subject)}
                          </span>
                          <span className="arrow">→</span>
                          <span className="current-element">{formatElementLabel(relation.object)}</span>
                        </div>
                      )}
                    </div>
                    <div className="relationship-type">
                      {relation.inferred && <span className="inferred-badge">🔍 Inferred</span>}
                      {relation.predicate}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {transitiveChains && transitiveChains.length > 0 && (
        <div className="transitive-chains">
          <h3 className="transitive-title">🔗 Transitive Logical Chains</h3>
          {transitiveChains.map((chain, index) => (
            <div key={index} className="chain-item">
              <div className="chain-header">
                <span className="chain-type">{chain.type.replace('_chain', '')} chain</span>
                <span className="chain-length">({chain.length} steps)</span>
              </div>
              <div className="chain-path">
                {chain.path.map((step: any, stepIndex: number) => (
                  <div key={stepIndex} className="chain-step">
                    <span 
                      className="step-element clickable" 
                      onClick={() => onNavigateToElement(step.from)}
                      title={`Navigate to ${formatElementLabel(step.from)}`}
                    >
                      {formatElementLabel(step.from)}
                    </span>
                    <span className="step-arrow">→</span>
                    <span className="step-relationship">{step.relationship}</span>
                    <span className="step-arrow">→</span>
                    {stepIndex === chain.path.length - 1 && (
                      <span 
                        className="step-element final clickable" 
                        onClick={() => onNavigateToElement(step.to)}
                        title={`Navigate to ${formatElementLabel(step.to)}`}
                      >
                        {formatElementLabel(step.to)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {weightAnalysis && (
        <div className="weight-analysis">
          <h3 className="weight-title">📊 Logical Weight Analysis</h3>
          <div className="weight-metrics">
            <div className="weight-metric">
              <span 
                className="metric-label" 
                title="How foundational this element is to the overall system. Higher scores indicate more fundamental elements that support many others. Based on element type, inbound dependencies, and dependency ratios."
              >
                🏛️ Foundational Score
              </span>
              <div className="metric-bar">
                <div 
                  className="metric-fill foundational" 
                  style={{ width: `${Math.min(100, (weightAnalysis.foundationalScore / 50) * 100)}%` }}
                ></div>
                <span className="metric-value">{Math.round(weightAnalysis.foundationalScore)}</span>
              </div>
            </div>
            
            <div className="weight-metric">
              <span 
                className="metric-label"
                title="How many other elements depend on this one through citations, proofs, logical consequences, etc. Higher values indicate this element supports more of the overall argument structure."
              >
                ⬅️ Inbound Dependencies
              </span>
              <div className="metric-bar">
                <div 
                  className="metric-fill inbound" 
                  style={{ width: `${Math.min(100, (weightAnalysis.inboundWeight / 20) * 100)}%` }}
                ></div>
                <span className="metric-value">{weightAnalysis.inboundWeight}</span>
              </div>
            </div>
            
            <div className="weight-metric">
              <span 
                className="metric-label"
                title="How many other elements this one depends on through citations, proofs, logical building, etc. Higher values indicate this element builds upon more prior work."
              >
                ➡️ Outbound Dependencies
              </span>
              <div className="metric-bar">
                <div 
                  className="metric-fill outbound" 
                  style={{ width: `${Math.min(100, (weightAnalysis.outboundWeight / 20) * 100)}%` }}
                ></div>
                <span className="metric-value">{weightAnalysis.outboundWeight}</span>
              </div>
            </div>
            
            <div className="weight-metric">
              <span 
                className="metric-label"
                title="The cascading influence this element has through the entire logical network. Calculated recursively through 4 levels of dependencies. Higher values mean changes here would affect many other elements."
              >
                🌊 Transitive Influence
              </span>
              <div className="metric-bar">
                <div 
                  className="metric-fill transitive" 
                  style={{ width: `${Math.min(100, (weightAnalysis.transitiveInfluence / 100) * 100)}%` }}
                ></div>
                <span className="metric-value">{Math.round(weightAnalysis.transitiveInfluence)}</span>
              </div>
            </div>
            
            <div className="weight-stats">
              <div className="stat-item">
                <span 
                  className="stat-label"
                  title="The maximum number of logical layers this element builds upon. Higher numbers indicate more complex, highly derived conclusions."
                >
                  🔗 Dependency Depth
                </span>
                <span className="stat-value">{weightAnalysis.dependencyDepth}</span>
              </div>
              <div className="stat-item">
                <span 
                  className="stat-label"
                  title="Approximate number of elements that would be transitively affected by changes to this one. A measure of downstream logical impact."
                >
                  📡 Influence Reach
                </span>
                <span className="stat-value">{weightAnalysis.influenceReach}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="reasoning-explanation">
        <h4>About This Analysis</h4>
        <p>
          This panel shows logical relationships discovered through automated reasoning 
          over Spinoza's Ethics using EYE-js. The reasoning engine applies inference rules 
          to uncover connections between definitions, axioms, propositions, and proofs.
        </p>
      </div>
    </div>
  );
};

export default ReasoningPanel;