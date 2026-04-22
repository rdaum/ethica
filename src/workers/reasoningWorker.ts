import { DataFactory, Store } from 'n3';
import { backfillStore, mergeStores, parseN3ToStore, stripRulesFromN3 } from '../lib/ethica';
import { buildInferredStore } from '../lib/inference';
import { buildSupplementalStore } from '../lib/readerGraph';
import { ReasoningAnalysis, ReasoningRelation, SpinozaElement, TransitiveChain, WeightAnalysis } from '../types';

const ctx = globalThis as typeof globalThis & {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};
const ETHICS = 'http://spinoza.org/ethics#';

type LoadPartMessage = {
  type: 'loadPart';
  requestId: number;
  elements: SpinozaElement[];
  n3Content: string;
  eyeContent: string;
};

type AnalyzeMessage = {
  type: 'analyze';
  requestId: number;
  elementId: string;
};

type WorkerRequest = LoadPartMessage | AnalyzeMessage;

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

let explicitStore = new Store();
let inferredStore = new Store();
let elements = new Map<string, SpinozaElement>();
let analysisCache = new Map<string, ReasoningAnalysis>();
let weightedOutboundAdjacency = new Map<string, string[]>();
let weightedInboundAdjacency = new Map<string, string[]>();

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  try {
    if (message.type === 'loadPart') {
      await loadPart(message);
      postMessage({
        type: 'partLoaded',
        requestId: message.requestId
      } satisfies WorkerResponse);
      return;
    }

    const result = analyzeElement(message.elementId);
    postMessage({
      type: 'analysis',
      requestId: message.requestId,
      elementId: message.elementId,
      result
    } satisfies WorkerResponse);
  } catch (error) {
    postMessage({
      type: 'error',
      requestId: message.requestId,
      stage: message.type,
      message: error instanceof Error ? error.message : 'Unknown worker error'
    } satisfies WorkerResponse);
  }
};

const loadPart = async (message: LoadPartMessage) => {
  elements = new Map(message.elements.map(element => [element.id, element]));
  analysisCache = new Map();

  const baseStore = await parseN3ToStore(message.n3Content);
  const eyeExplicitStore = await parseN3ToStore(stripRulesFromN3(message.eyeContent));
  const supplementalStore = buildSupplementalStore(elements);
  explicitStore = backfillStore(mergeStores(baseStore, eyeExplicitStore), supplementalStore);
  inferredStore = buildInferredStore(explicitStore);
  buildWeightedAdjacency();
};

const analyzeElement = (elementId: string): ReasoningAnalysis => {
  const cached = analysisCache.get(elementId);

  if (cached) {
    return cached;
  }

  const result = {
    reasoning: performReasoning(elementId),
    transitiveChains: findTransitiveChains(elementId),
    weightAnalysis: analyzeElementWeight(elementId)
  };

  analysisCache.set(elementId, result);
  return result;
};

const performReasoning = (elementId: string): ReasoningRelation[] => {
  const results: ReasoningRelation[] = [];
  const elementURI = DataFactory.namedNode(`${ETHICS}${elementId}`);
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
  const inferredPredicates = ['transitivelyDependsOn', 'dependsUpon', 'circularArgument', 'derivedFrom', 'explainsElement'];

  [...originalPredicates, ...inferredPredicates].forEach(predicate => {
    const predicateURI =
      predicate === 'type'
        ? DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
        : DataFactory.namedNode(`${ETHICS}${predicate}`);
    const store = inferredPredicates.includes(predicate) ? inferredStore : explicitStore;

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
};

const findTransitiveChains = (elementId: string): TransitiveChain[] => {
  const elementURI = DataFactory.namedNode(`${ETHICS}${elementId}`);
  const transitiveURI = DataFactory.namedNode(`${ETHICS}transitivelyDependsOn`);
  const dependencyURI = DataFactory.namedNode(`${ETHICS}dependsUpon`);
  const chains: TransitiveChain[] = [];

  inferredStore.getQuads(elementURI, transitiveURI, null, null).forEach(quad => {
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

  inferredStore.getQuads(elementURI, dependencyURI, null, null).forEach(quad => {
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

  inferredStore.getQuads(null, transitiveURI, elementURI, null).forEach(quad => {
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

  inferredStore.getQuads(null, dependencyURI, elementURI, null).forEach(quad => {
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
};

const analyzeElementWeight = (elementId: string): WeightAnalysis | null => {
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
    const elementURI = DataFactory.namedNode(`${ETHICS}${elementId}`);

    Object.entries(weights).forEach(([predicate, weight]) => {
      const predicateURI = DataFactory.namedNode(`${ETHICS}${predicate}`);
      const inbound = explicitStore.getQuads(null, predicateURI, elementURI, null);
      const outbound = explicitStore.getQuads(elementURI, predicateURI, null, null);

      analysis.inboundWeight += inbound.length * weight;
      analysis.outboundWeight += outbound.length * weight;
    });

    analysis.transitiveInfluence = calculateTransitiveInfluence(elementId);
    analysis.dependencyDepth = calculateDependencyDepth(elementId);
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
    const dependencyRatio = analysis.outboundWeight === 0 ? 1 : Math.min(1, analysis.inboundWeight / analysis.outboundWeight);

    analysis.foundationalScore = Math.max(
      0,
      baseScore + analysis.inboundWeight * 1.5 + analysis.transitiveInfluence * 0.2 + dependencyRatio * 5
    );

    return analysis;
  } catch (error) {
    console.error('Weight analysis failed in worker:', error);
    return null;
  }
};

const buildWeightedAdjacency = () => {
  weightedOutboundAdjacency = new Map();
  weightedInboundAdjacency = new Map();
  const weightedPredicates = [
    'cites',
    'necessarilyFollows',
    'clearlyfollowsFrom',
    'provedBy',
    'appliesResultFrom',
    'refutedByAbsurdity',
    'buildsUpon',
    'groundedIn',
    'demonstratedBy'
  ];

  weightedPredicates.forEach(predicate => {
    const predicateURI = DataFactory.namedNode(`${ETHICS}${predicate}`);
    explicitStore.getQuads(null, predicateURI, null, null).forEach(quad => {
      const from = cleanResourceValue(quad.subject.value);
      const to = cleanResourceValue(quad.object.value);

      if (!weightedOutboundAdjacency.has(from)) {
        weightedOutboundAdjacency.set(from, []);
      }

      if (!weightedInboundAdjacency.has(to)) {
        weightedInboundAdjacency.set(to, []);
      }

      weightedOutboundAdjacency.get(from)?.push(to);
      weightedInboundAdjacency.get(to)?.push(from);
    });
  });
};

const calculateTransitiveInfluence = (elementId: string): number => {
  const maxDepth = 4;
  const seenDepth = new Map<string, number>([[elementId, 0]]);
  const queue: Array<{ id: string; depth: number }> = [{ id: elementId, depth: 0 }];
  let influence = 0;

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    if (current.depth >= maxDepth) {
      continue;
    }

    const inboundNeighbors = weightedInboundAdjacency.get(current.id) ?? [];

    for (const neighbor of inboundNeighbors) {
      const nextDepth = current.depth + 1;
      const bestDepth = seenDepth.get(neighbor);

      if (bestDepth !== undefined && bestDepth <= nextDepth) {
        continue;
      }

      seenDepth.set(neighbor, nextDepth);
      influence += 5 - current.depth;
      queue.push({ id: neighbor, depth: nextDepth });
    }
  }

  return influence;
};

const calculateDependencyDepth = (elementId: string): number => {
  const maxDepth = 12;
  const seenDepth = new Map<string, number>([[elementId, 0]]);
  const queue: Array<{ id: string; depth: number }> = [{ id: elementId, depth: 0 }];
  let deepest = 0;

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    deepest = Math.max(deepest, current.depth);

    if (current.depth >= maxDepth) {
      continue;
    }

    const outboundNeighbors = weightedOutboundAdjacency.get(current.id) ?? [];

    for (const neighbor of outboundNeighbors) {
      const nextDepth = current.depth + 1;
      const bestDepth = seenDepth.get(neighbor);

      if (bestDepth !== undefined && bestDepth <= nextDepth) {
        continue;
      }

      seenDepth.set(neighbor, nextDepth);
      queue.push({ id: neighbor, depth: nextDepth });
    }
  }

  return deepest;
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

export {};
