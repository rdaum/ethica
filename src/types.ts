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
  | 'appendix'
  | 'section';

export type EditorialKind = 'english_only_addition' | 'synthetic_heading' | 'normalization';

export interface Footnote {
  number: string;
  text: string;
}

export interface SpinozaElement {
  id: string;
  type: ElementType;
  text: string;
  latinText?: string;
  frenchText?: string;
  footnotes?: Footnote[];
  frenchFootnotes?: Footnote[];
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
  variantLabel?: string;
}

export type Language = 'english' | 'french' | 'latin';

export type WorkId = 'ethics' | 'political';

/** The language to read in, and optionally a second one shown beside it. */
export interface ReadingLanguages {
  primary: Language;
  parallel: Language | null;
}

export interface PassageAnalysis {
  /** What a demonstration rests on directly, including through its own proofs. */
  dependsOn: string[];
  usedBy: string[];
  /** References from a note or preface, which are not steps in a demonstration. */
  cites: string[];
  citedBy: string[];
  /** References a later editor supplied, which are not the author's own. */
  editorCites: string[];
  editorCitedBy: string[];
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
  /** Unset for the Ethics. */
  work?: WorkId;
  number: number;
  numeral: string;
  title: string;
  description: string;
}

export interface ReaderSectionSummary {
  kind: string;
  label: string;
  count: number;
}
