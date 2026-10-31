export interface CitationProblem {
  sourceId: string;
  status: 'approximate' | 'unresolved';
  reference: string;
  suffix: string | null;
  suffixNumber: number | null;
}

export function extractCitations(
  text: string,
  sourceId: string,
  validIds: Set<string>
): { citations: string[]; problems: CitationProblem[] };
