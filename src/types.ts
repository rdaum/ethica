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

export type EditorialKind = 'english_only_addition' | 'synthetic_heading' | 'normalization';

export type SourceAuthority = 'latin_governed' | 'english_structural';

export interface Footnote {
  number: string;
  text: string;
}

export interface SpinozaElement {
  id: string;
  type: ElementType;
  text: string;
  latinText?: string;
  footnotes?: Footnote[];
  sortIndex: number;
  sectionKind: string;
  number?: string;
  parentId?: string;
  heading?: string;
  partNumber?: number;
  partNumeral?: string;
  canonicalLabel?: string;
  isEditorial?: boolean;
  editorialKind?: EditorialKind;
  sourceAuthority?: SourceAuthority;
  variantLabel?: string;
}

export type ReadingMode = 'english' | 'latin' | 'bilingual';

export interface PassageAnalysis {
  /** What a demonstration rests on directly, including through its own proofs. */
  dependsOn: string[];
  usedBy: string[];
  /** References from a note or preface, which are not steps in a demonstration. */
  cites: string[];
  citedBy: string[];
  structure: {
    parent: string | null;
    proofs: string[];
    corollaries: string[];
    notes: string[];
  };
  /** Shortest routes to passages that are only reached through others, nearest first. */
  dependencyPaths: string[][];
  dependentPaths: string[][];
  metrics: {
    cites: number;
    citedBy: number;
    totalDependencies: number;
    totalDependents: number;
    depth: number;
  };
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
