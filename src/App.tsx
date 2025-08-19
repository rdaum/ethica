import React, { useState, useEffect } from 'react';
import { XMLParser } from 'fast-xml-parser';
import { Store, Parser, DataFactory } from 'n3';
import { n3reasoner } from 'eyereasoner';
import BookView from './components/BookView';
import ReasoningPanel from './components/ReasoningPanel';
import './App.css';

interface SpinozaElement {
  id: string;
  type: 'definition' | 'axiom' | 'proposition' | 'proof' | 'corollary' | 'note' | 'lemma' | 'postulate' | 'explanation';
  number?: string;
  text: string;
  parentId?: string;
}

interface AppState {
  elements: Map<string, SpinozaElement>;
  n3Store: Store;
  eyeStore: Store; // Store with EYE-js inferred facts
  selectedElement: string | null;
  hoveredElement: string | null;
  reasoning: any[];
  transitiveChains: any[];
  weightAnalysis: any | null;
  loading: boolean;
  currentPart: number;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    elements: new Map(),
    n3Store: new Store(),
    eyeStore: new Store(),
    selectedElement: null,
    hoveredElement: null,
    reasoning: [],
    transitiveChains: [],
    weightAnalysis: null,
    loading: true,
    currentPart: 1
  });

  useEffect(() => {
    loadData();
  }, [state.currentPart]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      setState(prev => ({ ...prev, loading: true }));

      // Load and parse XML
      const basePath = process.env.PUBLIC_URL || '.';
      const xmlResponse = await fetch(`${basePath}/ethica_${state.currentPart}.xml`);
      const xmlText = await xmlResponse.text();
      const elements = parseXML(xmlText);

      // Load and parse N3 data (use original file since N3.js can't parse reasoning rules)
      console.log(`Loading N3 logic from: ${basePath}/ethica-logic.n3`);
      const n3Response = await fetch(`${basePath}/ethica-logic.n3`);
      console.log(`N3 logic response status: ${n3Response.status}`);
      const n3Content = await n3Response.text();
      console.log(`N3 logic content length: ${n3Content.length} characters`);
      const n3Store = await parseN3(n3Content);
      console.log(`N3 store created with ${n3Store.size} triples`);

      // Load the EYE-js rules file and perform reasoning
      let eyeStore = new Store();
      
      try {
        // Load the file with active reasoning rules for EYE-js
        console.log(`Loading EYE reasoning from: ${basePath}/ethica-logic-eye.n3`);
        const eyeResponse = await fetch(`${basePath}/ethica-logic-eye.n3`);
        console.log(`EYE response status: ${eyeResponse.status}`);
        const eyeContent = await eyeResponse.text();
        console.log(`EYE content length: ${eyeContent.length} characters`);
        
        const reasoningResults = await n3reasoner(eyeContent, undefined, {
          output: 'derivations',
          outputType: 'string'
        });
        
        console.log(`EYE reasoning results length: ${reasoningResults.length} characters`);
        if (reasoningResults.trim()) {
          eyeStore = await parseN3(reasoningResults);
          console.log(`EYE store created with ${eyeStore.size} triples`);
        } else {
          console.warn('EYE reasoning returned empty results');
        }
        
      } catch (error) {
        console.error('EYE-js reasoning failed, continuing without inference:', error);
        // Continue with empty eye store
      }

      setState(prev => ({
        ...prev,
        elements,
        n3Store,
        eyeStore,
        loading: false
      }));

    } catch (error) {
      console.error('Error loading data or performing reasoning:', error);
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  const parseXML = (xmlText: string): Map<string, SpinozaElement> => {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
    
    const xmlDoc = parser.parse(xmlText);
    console.log('Parsed XML structure:', xmlDoc);
    const elements = new Map<string, SpinozaElement>();

    // The XML structure is <part><section type="definitions"><def>...
    
    // Find all sections
    const sections = xmlDoc.part?.section || [];
    const sectionsArray = Array.isArray(sections) ? sections : [sections];
    
    sectionsArray.forEach((section: any) => {
      if (section['@_type'] === 'definitions' && section.def) {
        const definitions = Array.isArray(section.def) ? section.def : [section.def];
        definitions.forEach((def: any) => {
          if (def['@_id'] && def.text) {
            elements.set(def['@_id'], {
              id: def['@_id'],
              type: 'definition',
              number: def['@_number'],
              text: def.text
            });
          }
          
          // Handle explanations for definitions
          if (def.explanation) {
            const explanations = Array.isArray(def.explanation) ? def.explanation : [def.explanation];
            explanations.forEach((exp: any) => {
              if (exp['@_id'] && exp.text) {
                elements.set(exp['@_id'], {
                  id: exp['@_id'],
                  type: 'explanation',
                  text: exp.text,
                  parentId: def['@_id']
                });
              }
            });
          }
        });
      }
      
      if (section['@_type'] === 'axioms' && section.axiom) {
        const axioms = Array.isArray(section.axiom) ? section.axiom : [section.axiom];
        axioms.forEach((axiom: any) => {
          if (axiom['@_id'] && axiom.text) {
            elements.set(axiom['@_id'], {
              id: axiom['@_id'],
              type: 'axiom',
              number: axiom['@_number'],
              text: axiom.text
            });
          }
        });
      }
      
      if (section['@_type'] === 'lemmas' && section.lemma) {
        const lemmas = Array.isArray(section.lemma) ? section.lemma : [section.lemma];
        lemmas.forEach((lemma: any) => {
          if (lemma['@_id'] && lemma.text) {
            elements.set(lemma['@_id'], {
              id: lemma['@_id'],
              type: 'lemma',
              number: lemma['@_number'],
              text: lemma.text
            });

            // Parse proofs for lemmas
            if (lemma.proof) {
              const proofs = Array.isArray(lemma.proof) ? lemma.proof : [lemma.proof];
              proofs.forEach((proof: any) => {
                if (proof['@_id'] && proof.text) {
                  elements.set(proof['@_id'], {
                    id: proof['@_id'],
                    type: 'proof',
                    text: proof.text,
                    parentId: lemma['@_id']
                  });
                }
              });
            }

            // Parse corollaries for lemmas
            if (lemma.corollary) {
              const corollaries = Array.isArray(lemma.corollary) ? lemma.corollary : [lemma.corollary];
              corollaries.forEach((cor: any) => {
                if (cor['@_id'] && cor.text) {
                  elements.set(cor['@_id'], {
                    id: cor['@_id'],
                    type: 'corollary',
                    text: cor.text,
                    parentId: lemma['@_id']
                  });
                }
              });
            }
          }
        });
      }
      
      if (section['@_type'] === 'postulates' && section.postulate) {
        const postulates = Array.isArray(section.postulate) ? section.postulate : [section.postulate];
        postulates.forEach((postulate: any) => {
          if (postulate['@_id'] && postulate.text) {
            elements.set(postulate['@_id'], {
              id: postulate['@_id'],
              type: 'postulate',
              number: postulate['@_number'],
              text: postulate.text
            });
          }
        });
      }
      
      if (section['@_type'] === 'propositions' && section.prop) {
        const propositions = Array.isArray(section.prop) ? section.prop : [section.prop];
        propositions.forEach((prop: any) => {
          if (prop['@_id'] && prop.text) {
            elements.set(prop['@_id'], {
              id: prop['@_id'],
              type: 'proposition',
              number: prop['@_number'],
              text: prop.text
            });

            // Parse proofs
            if (prop.proof) {
              const proofs = Array.isArray(prop.proof) ? prop.proof : [prop.proof];
              proofs.forEach((proof: any) => {
                if (proof['@_id'] && proof.text) {
                  elements.set(proof['@_id'], {
                    id: proof['@_id'],
                    type: 'proof',
                    text: proof.text,
                    parentId: prop['@_id']
                  });
                }
              });
            }

            // Parse corollaries
            if (prop.corollary) {
              const corollaries = Array.isArray(prop.corollary) ? prop.corollary : [prop.corollary];
              corollaries.forEach((cor: any) => {
                if (cor['@_id'] && cor.text) {
                  elements.set(cor['@_id'], {
                    id: cor['@_id'],
                    type: 'corollary',
                    text: cor.text,
                    parentId: prop['@_id']
                  });
                }
              });
            }

            // Parse notes
            if (prop.note) {
              const notes = Array.isArray(prop.note) ? prop.note : [prop.note];
              notes.forEach((note: any) => {
                if (note['@_id'] && note.text) {
                  elements.set(note['@_id'], {
                    id: note['@_id'],
                    type: 'note',
                    text: note.text,
                    parentId: prop['@_id']
                  });
                }
              });
            }
          }
        });
      }
    });

    console.log(`Parsed ${elements.size} elements from XML`);
    console.log('Sample elements:', Array.from(elements.entries()).slice(0, 3));
    return elements;
  };

  const parseN3 = async (n3Content: string): Promise<Store> => {
    const store = new Store();
    const parser = new Parser();
    
    return new Promise((resolve, reject) => {
      parser.parse(n3Content, (error, quad, prefixes) => {
        if (error) {
          reject(error);
        } else if (quad) {
          store.addQuad(quad);
        } else {
          resolve(store);
        }
      });
    });
  };

  const handleElementHover = (elementId: string | null) => {
    setState(prev => ({ ...prev, hoveredElement: elementId }));
  };

  const handleElementSelect = async (elementId: string | null) => {
    setState(prev => ({ ...prev, selectedElement: elementId }));
    
    if (elementId) {
      // Perform reasoning about the selected element
      const reasoning = await performReasoning(elementId);
      const transitiveChains = await findTransitiveChains(elementId);
      const weightAnalysis = await analyzeElementWeight(elementId);
      setState(prev => ({ ...prev, reasoning, transitiveChains, weightAnalysis }));
    }
  };

  const handleNavigateToElement = (elementId: string) => {
    console.log(`Navigation requested for element: ${elementId}`);
    // Determine which part this element belongs to
    const elementPart = elementId.startsWith('I.') ? 1 : elementId.startsWith('II.') ? 2 : state.currentPart;
    console.log(`Element belongs to part ${elementPart}, currently viewing part ${state.currentPart}`);
    
    // If element is in a different part, switch to that part first
    if (elementPart !== state.currentPart) {
      console.log(`Switching from Part ${state.currentPart} to Part ${elementPart} to navigate to ${elementId}`);
      setState(prev => ({ 
        ...prev, 
        currentPart: elementPart,
        selectedElement: null,
        hoveredElement: null,
        reasoning: [],
        transitiveChains: [],
        weightAnalysis: null
      }));
      
      // Wait for the new part to load, then navigate
      const attemptNavigation = (attempts: number = 0) => {
        const element = document.querySelector(`[data-element-id="${elementId}"]`);
        if (element) {
          element.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
          });
          
          // Temporarily highlight the element
          element.classList.add('navigation-highlight');
          setTimeout(() => {
            element.classList.remove('navigation-highlight');
          }, 2000);
          
          // Also select it for the reasoning panel
          handleElementSelect(elementId);
        } else if (attempts < 10) {
          // Retry up to 10 times with increasing delays
          setTimeout(() => attemptNavigation(attempts + 1), 50 * (attempts + 1));
        } else {
          console.warn(`Element ${elementId} not found after part switch and ${attempts} attempts`);
        }
      };
      
      setTimeout(() => attemptNavigation(), 100);
    } else {
      // Element is in current part, navigate directly
      const element = document.querySelector(`[data-element-id="${elementId}"]`);
      if (element) {
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest'
        });
        
        // Temporarily highlight the element
        element.classList.add('navigation-highlight');
        setTimeout(() => {
          element.classList.remove('navigation-highlight');
        }, 2000);
        
        // Also select it for the reasoning panel
        handleElementSelect(elementId);
      } else {
        console.warn(`Element ${elementId} not found in current part ${state.currentPart}`);
      }
    }
  };

  const performReasoning = async (elementId: string): Promise<any[]> => {
    try {
      const results: any[] = [];
      const elementURI = DataFactory.namedNode(`http://spinoza.org/ethics#${elementId}`);
      
      // Original predicates from the knowledge graph
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
        'type'  // RDF type relationships
      ];

      // EYE-js inferred predicates
      const inferredPredicates = [
        'transitivelyDependsOn',
        'dependsUpon',
        'circularArgument',
        'derivedFrom',
        'explainsElement'
      ];

      const allPredicates = [...originalPredicates, ...inferredPredicates];
      
      // Find outward relationships (this element relates to others)
      allPredicates.forEach(predicate => {
        const predicateURI = predicate === 'type' 
          ? DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
          : DataFactory.namedNode(`http://spinoza.org/ethics#${predicate}`);
          
        // Check both original data and EYE-js inferred facts
        const storeToUse = inferredPredicates.includes(predicate) ? state.eyeStore : state.n3Store;
        const outward = storeToUse.getQuads(elementURI, predicateURI, null, null);
        
        outward.forEach(quad => {
          const objectValue = quad.object.value;
          const cleanObject = objectValue.includes('#') 
            ? objectValue.split('#')[1] 
            : objectValue;
            
          results.push({
            subject: elementId,
            predicate: predicate,
            object: cleanObject,
            inferred: inferredPredicates.includes(predicate)
          });
        });
      });
      
      // Find inward relationships (others relate to this element)  
      allPredicates.forEach(predicate => {
        const predicateURI = predicate === 'type' 
          ? DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
          : DataFactory.namedNode(`http://spinoza.org/ethics#${predicate}`);
          
        // Check both original data and EYE-js inferred facts
        const storeToUse = inferredPredicates.includes(predicate) ? state.eyeStore : state.n3Store;
        const inward = storeToUse.getQuads(null, predicateURI, elementURI, null);
        
        inward.forEach(quad => {
          const subjectValue = quad.subject.value;
          const cleanSubject = subjectValue.includes('#') 
            ? subjectValue.split('#')[1] 
            : subjectValue;
            
          // Create inverse relationship names for clarity
          const inversePredicate = 
            predicate === 'cites' ? 'citedBy' :
            predicate === 'refersTo' ? 'referredToBy' :
            predicate === 'mentions' ? 'mentionedBy' :
            predicate === 'clearlyfollowsFrom' ? 'clearlyLeadsTo' :
            predicate === 'evidentFrom' ? 'makesEvident' :
            predicate === 'necessarilyFollows' ? 'necessarilyFollowedBy' :
            predicate === 'provedBy' ? 'proves' :
            predicate === 'demonstratedBy' ? 'demonstrates' :
            predicate === 'groundedIn' ? 'grounds' :
            predicate === 'hasCorollary' ? 'isCorollaryOf' :
            predicate === 'impliesConsequence' ? 'isConsequenceOf' :
            predicate === 'buildsUpon' ? 'isBuiltUponBy' :
            predicate === 'appliesResultFrom' ? 'providesResultTo' :
            predicate === 'refutedByAbsurdity' ? 'refutes' :
            predicate === 'contradicts' ? 'contradictedBy' :
            predicate === 'partOf' ? 'contains' :
            predicate === 'containsSection' ? 'isSectionOf' :
            predicate === 'containsElement' ? 'isElementOf' :
            `inverse_${predicate}`;
                                  
          results.push({
            subject: cleanSubject,
            predicate: inversePredicate,
            object: elementId,
            inferred: inferredPredicates.includes(predicate)
          });
        });
      });

      console.log(`Found ${results.length} relationships for ${elementId}:`, results);
      return results;
    } catch (error) {
      console.error('Reasoning failed:', error);
      return [];
    }
  };

  const findTransitiveChains = async (startElementId: string, maxDepth: number = 4): Promise<any[]> => {
    // Use EYE-js inferred transitive relationships instead of manual traversal
    try {
      const chains: any[] = [];
      const elementURI = DataFactory.namedNode(`http://spinoza.org/ethics#${startElementId}`);
      
      // Find all transitive dependencies inferred by EYE-js
      const transitivelyDependsOnURI = DataFactory.namedNode('http://spinoza.org/ethics#transitivelyDependsOn');
      const dependsUponURI = DataFactory.namedNode('http://spinoza.org/ethics#dependsUpon');
      
      // Get outward transitive dependencies
      const outwardTransitive = state.eyeStore.getQuads(elementURI, transitivelyDependsOnURI, null, null);
      const outwardDependencies = state.eyeStore.getQuads(elementURI, dependsUponURI, null, null);
      
      outwardTransitive.forEach(quad => {
        const target = quad.object.value.split('#')[1];
        chains.push({
          type: 'transitive_dependency',
          start: startElementId,
          end: target,
          relationship: 'transitivelyDependsOn',
          inferred: true,
          path: [{ from: startElementId, to: target, relationship: 'transitivelyDependsOn' }]
        });
      });
      
      outwardDependencies.forEach(quad => {
        const target = quad.object.value.split('#')[1];
        chains.push({
          type: 'dependency',
          start: startElementId,
          end: target,
          relationship: 'dependsUpon',
          inferred: true,
          path: [{ from: startElementId, to: target, relationship: 'dependsUpon' }]
        });
      });
      
      // Get inward transitive dependencies (others depend on this element)
      const inwardTransitive = state.eyeStore.getQuads(null, transitivelyDependsOnURI, elementURI, null);
      const inwardDependencies = state.eyeStore.getQuads(null, dependsUponURI, elementURI, null);
      
      inwardTransitive.forEach(quad => {
        const source = quad.subject.value.split('#')[1];
        chains.push({
          type: 'inverse_transitive_dependency',
          start: source,
          end: startElementId,
          relationship: 'transitivelyDependsOn',
          inferred: true,
          path: [{ from: source, to: startElementId, relationship: 'transitivelyDependsOn' }]
        });
      });
      
      inwardDependencies.forEach(quad => {
        const source = quad.subject.value.split('#')[1];
        chains.push({
          type: 'inverse_dependency',
          start: source,
          end: startElementId,
          relationship: 'dependsUpon',
          inferred: true,
          path: [{ from: source, to: startElementId, relationship: 'dependsUpon' }]
        });
      });
      
      console.log(`Found ${chains.length} EYE-js inferred chains for ${startElementId}:`, chains);
      return chains;
      
    } catch (error) {
      console.error('EYE-js transitive reasoning failed:', error);
      return [];
    }
  };

  // Keep the old manual implementation as fallback
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const findTransitiveChainsManual = async (startElementId: string, maxDepth: number = 4): Promise<any[]> => {
    try {
      const chains: any[] = [];
      const visited = new Set<string>();
      
      // Find transitive chains through different relationship types
      const transitivePredicates = [
        'cites', 
        'necessarilyFollows', 
        'appliesResultFrom',
        'clearlyfollowsFrom',
        'provedBy',
        'refutedByAbsurdity',
        'partOf'
      ];
      
      const exploreChain = (currentElement: string, path: any[], depth: number, predicate: string) => {
        if (depth >= maxDepth || visited.has(`${currentElement}-${predicate}-${depth}`)) {
          return;
        }
        
        visited.add(`${currentElement}-${predicate}-${depth}`);
        
        const predicateURI = DataFactory.namedNode(`http://spinoza.org/ethics#${predicate}`);
        const elementURI = DataFactory.namedNode(`http://spinoza.org/ethics#${currentElement}`);
        
        // Find next elements in the chain
        const nextElements = state.n3Store.getQuads(elementURI, predicateURI, null, null);
        
        nextElements.forEach(quad => {
          const nextElement = quad.object.value.split('#')[1];
          const newPath = [...path, {
            from: currentElement,
            to: nextElement,
            relationship: predicate,
            depth: depth
          }];
          
          // If this creates a meaningful chain (length > 1), save it
          if (newPath.length > 1) {
            chains.push({
              type: `${predicate}_chain`,
              path: newPath,
              length: newPath.length,
              start: startElementId,
              end: nextElement
            });
          }
          
          // Continue exploring from this element
          exploreChain(nextElement, newPath, depth + 1, predicate);
        });
      };
      
      // Start exploration for each transitive predicate
      transitivePredicates.forEach(predicate => {
        exploreChain(startElementId, [], 0, predicate);
      });
      
      // Sort chains by length and remove duplicates
      const uniqueChains = chains
        .filter((chain, index, self) => 
          index === self.findIndex(c => 
            c.start === chain.start && 
            c.end === chain.end && 
            c.type === chain.type &&
            c.length === chain.length
          )
        )
        .sort((a, b) => b.length - a.length)
        .slice(0, 20); // Limit to top 20 chains
      
      console.log(`Found ${uniqueChains.length} transitive chains for ${startElementId}`);
      return uniqueChains;
    } catch (error) {
      console.error('Transitive reasoning failed:', error);
      return [];
    }
  };

  const analyzeElementWeight = async (elementId: string): Promise<any> => {
    try {
      const analysis = {
        elementId,
        inboundWeight: 0,
        outboundWeight: 0,
        transitiveInfluence: 0,
        foundationalScore: 0,
        relationshipBreakdown: {} as any,
        dependencyDepth: 0,
        influenceReach: 0
      };

      // All relationship types with different weights
      const relationshipWeights = {
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
      
      // Calculate inbound weight (how much depends on this element)
      Object.entries(relationshipWeights).forEach(([predicate, weight]) => {
        const predicateURI = DataFactory.namedNode(`http://spinoza.org/ethics#${predicate}`);
        const inboundTriples = state.n3Store.getQuads(null, predicateURI, elementURI, null);
        
        const count = inboundTriples.length;
        analysis.inboundWeight += count * weight;
        
        if (count > 0) {
          analysis.relationshipBreakdown[`${predicate}_inbound`] = {
            count,
            weight: count * weight,
            elements: inboundTriples.map(t => t.subject.value.split('#')[1])
          };
        }
      });

      // Calculate outbound weight (how much this element depends on others)
      Object.entries(relationshipWeights).forEach(([predicate, weight]) => {
        const predicateURI = DataFactory.namedNode(`http://spinoza.org/ethics#${predicate}`);
        const outboundTriples = state.n3Store.getQuads(elementURI, predicateURI, null, null);
        
        const count = outboundTriples.length;
        analysis.outboundWeight += count * weight;
        
        if (count > 0) {
          analysis.relationshipBreakdown[`${predicate}_outbound`] = {
            count,
            weight: count * weight,
            elements: outboundTriples.map(t => t.object.value.split('#')[1])
          };
        }
      });

      // Calculate transitive influence (recursive depth analysis)
      const calculateTransitiveInfluence = (currentElement: string, visited: Set<string>, depth: number): number => {
        if (depth > 4 || visited.has(currentElement)) return 0;
        visited.add(currentElement);
        
        let influence = 0;
        const currentURI = DataFactory.namedNode(`http://spinoza.org/ethics#${currentElement}`);
        
        // Check what depends on this element
        Object.entries(relationshipWeights).forEach(([predicate, weight]) => {
          const predicateURI = DataFactory.namedNode(`http://spinoza.org/ethics#${predicate}`);
          const dependents = state.n3Store.getQuads(null, predicateURI, currentURI, null);
          
          dependents.forEach(triple => {
            const dependent = triple.subject.value.split('#')[1];
            influence += weight * (5 - depth); // Diminishing returns with depth
            influence += calculateTransitiveInfluence(dependent, visited, depth + 1);
          });
        });
        
        return influence;
      };

      analysis.transitiveInfluence = calculateTransitiveInfluence(elementId, new Set(), 0);
      
      // Calculate foundational score (how fundamental this element is)
      // Definitions and axioms get base foundational score
      const elementType = state.elements.get(elementId)?.type;
      let foundationalBase = 0;
      
      switch (elementType) {
        case 'definition': foundationalBase = 10; break;
        case 'axiom': foundationalBase = 8; break;
        case 'proposition': foundationalBase = 3; break;
        case 'proof': foundationalBase = 1; break;
        case 'corollary': foundationalBase = 2; break;
        case 'note': foundationalBase = 0.5; break;
      }
      
      // Calculate foundational score: base + inbound influence + transitive influence
      // Don't subtract outbound weight directly - instead use it as a ratio modifier
      const dependencyRatio = analysis.outboundWeight === 0 ? 1 : 
                             Math.min(1, analysis.inboundWeight / analysis.outboundWeight);
      
      analysis.foundationalScore = Math.max(0, 
        foundationalBase + 
        (analysis.inboundWeight * 1.5) + 
        (analysis.transitiveInfluence * 0.2) +
        (dependencyRatio * 5) // Bonus for having more things depend on you than you depend on
      );

      // Calculate dependency depth (how many layers of dependencies)
      const calculateDepth = (currentElement: string, visited: Set<string>): number => {
        if (visited.has(currentElement)) return 0;
        visited.add(currentElement);
        
        const currentURI = DataFactory.namedNode(`http://spinoza.org/ethics#${currentElement}`);
        let maxDepth = 0;
        
        Object.keys(relationshipWeights).forEach(predicate => {
          const predicateURI = DataFactory.namedNode(`http://spinoza.org/ethics#${predicate}`);
          const dependencies = state.n3Store.getQuads(currentURI, predicateURI, null, null);
          
          dependencies.forEach(triple => {
            const dependency = triple.object.value.split('#')[1];
            const depth = 1 + calculateDepth(dependency, new Set(visited));
            maxDepth = Math.max(maxDepth, depth);
          });
        });
        
        return maxDepth;
      };
      
      analysis.dependencyDepth = calculateDepth(elementId, new Set());
      analysis.influenceReach = Math.round(analysis.transitiveInfluence / 10);

      console.log(`Weight analysis for ${elementId}:`, analysis);
      return analysis;
    } catch (error) {
      console.error('Weight analysis failed:', error);
      return null;
    }
  };

  const handlePartChange = (partNumber: number) => {
    setState(prev => ({ 
      ...prev, 
      currentPart: partNumber,
      selectedElement: null,
      hoveredElement: null,
      reasoning: [],
      transitiveChains: [],
      weightAnalysis: null
    }));
  };

  const getPartTitle = (partNumber: number): string => {
    switch (partNumber) {
      case 1: return "CONCERNING GOD";
      case 2: return "ON THE NATURE AND ORIGIN OF THE MIND";
      default: return `PART ${partNumber}`;
    }
  };

  if (state.loading) {
    return (
      <div className="app loading">
        <div className="loading-message">
          <h2>Loading Spinoza's Ethics...</h2>
          <p>Preparing the text and logical structure for exploration</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="signet-container">
            <img 
              src={`${process.env.PUBLIC_URL}/spinoza-signet.png`}
              alt="Spinoza's Signet Ring - Rose with 'Caute' motto"
              className="spinoza-signet"
            />
          </div>
          <div className="title-section">
            <h1>The Ethics</h1>
            <p className="subtitle">by Baruch Spinoza</p>
            <div className="part-selector">
              <h2>Part {state.currentPart}: {getPartTitle(state.currentPart)}</h2>
              <div className="part-buttons">
                <button 
                  className={`part-button ${state.currentPart === 1 ? 'active' : ''}`}
                  onClick={() => handlePartChange(1)}
                >
                  Part I
                </button>
                <button 
                  className={`part-button ${state.currentPart === 2 ? 'active' : ''}`}
                  onClick={() => handlePartChange(2)}
                >
                  Part II
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="translation-info">
          <p className="translation-credit">
            Translated by R.H.M. Elwes • Text from{' '}
            <a 
              href="https://www.gutenberg.org/files/3800/3800-h/3800-h.htm" 
              target="_blank" 
              rel="noopener noreferrer"
              className="gutenberg-link"
            >
              Project Gutenberg #3800
            </a>
          </p>
        </div>
      </header>

      <main className="app-main">
        <BookView
          elements={state.elements}
          onElementHover={handleElementHover}
          onElementSelect={handleElementSelect}
          selectedElement={state.selectedElement}
          hoveredElement={state.hoveredElement}
          currentPart={state.currentPart}
          partTitle={getPartTitle(state.currentPart)}
        />
        
        {(state.selectedElement || state.reasoning.length > 0) && (
          <ReasoningPanel
            selectedElement={state.selectedElement}
            element={state.selectedElement ? state.elements.get(state.selectedElement) : undefined}
            reasoning={state.reasoning}
            transitiveChains={state.transitiveChains}
            weightAnalysis={state.weightAnalysis}
            n3Store={state.n3Store}
            onNavigateToElement={handleNavigateToElement}
            onClose={() => handleElementSelect(null)}
            currentPart={state.currentPart}
          />
        )}
      </main>
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="license-info">
            <h4>Text Attribution</h4>
            <p>
              This work uses the English translation of Spinoza's <em>Ethics</em> by{' '}
              <strong>R.H.M. Elwes</strong> (1883), sourced from{' '}
              <a 
                href="https://www.gutenberg.org/files/3800/3800-h/3800-h.htm" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                Project Gutenberg #3800
              </a>.
            </p>
            <p>
              The original text is in the public domain. This interactive presentation 
              adds computational analysis and modern interface design to enhance scholarly 
              exploration of Spinoza's systematic philosophy.
            </p>
          </div>
          
          <div className="project-info">
            <h4>About This Project</h4>
            <p>
              An interactive digital humanities project that transforms Spinoza's systematic 
              philosophy into a computational exploration tool. Uses automated reasoning to 
              discover implicit logical relationships in the Ethics.
            </p>
            <p className="tech-stack">
              Built with React, N3.js for data querying, and EYE-js for automated logical reasoning.
            </p>
          </div>
        </div>
        
        <div className="footer-links">
          <a 
            href="https://www.gutenberg.org/policy/license.html" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            Project Gutenberg License
          </a>
          <span className="separator">•</span>
          <a 
            href="https://en.wikipedia.org/wiki/Baruch_Spinoza" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            About Spinoza
          </a>
          <span className="separator">•</span>
          <a 
            href="https://plato.stanford.edu/entries/spinoza/" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            Stanford Encyclopedia
          </a>
        </div>
      </footer>
    </div>
  );
};

export default App;
