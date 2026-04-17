export type ElementType =
  | 'preface'
  | 'definition'
  | 'axiom'
  | 'proposition'
  | 'proof'
  | 'corollary'
  | 'note'
  | 'lemma'
  | 'postulate'
  | 'explanation'
  | 'appendix';

export interface SpinozaElement {
  id: string;
  type: ElementType;
  text: string;
  latinText?: string;
  sortIndex: number;
  sectionKind: string;
  number?: string;
  parentId?: string;
  heading?: string;
}

export type ReadingMode = 'english' | 'latin' | 'bilingual';

export interface ReasoningRelation {
  subject: string;
  predicate: string;
  object: string;
  inferred?: boolean;
}

export interface TransitiveChain {
  type: string;
  start: string;
  end: string;
  relationship: string;
  inferred: boolean;
  path: Array<{
    from: string;
    to: string;
    relationship: string;
    depth?: number;
  }>;
  length?: number;
}

export interface WeightAnalysis {
  elementId: string;
  inboundWeight: number;
  outboundWeight: number;
  transitiveInfluence: number;
  foundationalScore: number;
  relationshipBreakdown: Record<string, unknown>;
  dependencyDepth: number;
  influenceReach: number;
}

export interface ReasoningAnalysis {
  reasoning: ReasoningRelation[];
  transitiveChains: TransitiveChain[];
  weightAnalysis: WeightAnalysis | null;
}

export interface PartMetadata {
  number: number;
  numeral: string;
  title: string;
  strapline: string;
  description: string;
}

export interface ReaderSectionSummary {
  kind: string;
  label: string;
  count: number;
}
