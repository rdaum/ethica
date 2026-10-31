import { WorkId } from '../types';
import { PARTS } from './ethica';
import { POLITICAL_CHAPTERS } from './works';

export interface ReaderLocation {
  work: WorkId;
  part: number;
  elementId: string | null;
}

const DEFAULT_LOCATION: ReaderLocation = { work: 'ethics', part: 1, elementId: null };
const POLITICAL_PREFIX = 'TP';

const partNumbered = (parts: typeof PARTS, numeral: string | undefined): number | null =>
  Object.values(parts).find(entry => entry.numeral === numeral)?.number ?? null;

/** Which work and part an ID belongs to: `III.prop.6`, `TP.II.5`, or `TP.preface`. */
export const locateElement = (elementId: string): { work: WorkId; part: number } | null => {
  const [first, second] = elementId.split('.');

  if (first !== POLITICAL_PREFIX) {
    const part = partNumbered(PARTS, first);
    return part ? { work: 'ethics', part } : null;
  }

  const part = second === undefined || second === 'preface' ? 1 : partNumbered(POLITICAL_CHAPTERS, second);
  return part ? { work: 'political', part } : null;
};

/**
 * Reads `#III` (a part), `#III.prop.6` (a passage), `#TP.II` (a chapter), or `#TP.II.5` (a
 * section). Anything else, including malformed percent-encoding, falls back to Part I.
 */
export const parseReaderHash = (hash: string): ReaderLocation => {
  const raw = hash.replace(/^#/, '');

  if (!raw) {
    return DEFAULT_LOCATION;
  }

  let decoded: string;

  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return DEFAULT_LOCATION;
  }

  const located = locateElement(decoded);

  if (!located) {
    return DEFAULT_LOCATION;
  }

  const segments = decoded.split('.');
  const isPassage = located.work === 'political' ? segments.length > 2 || segments[1] === 'preface' : segments.length > 1;
  return { ...located, elementId: isPassage ? decoded : null };
};

export const buildReaderHash = ({ work, part, elementId }: ReaderLocation): string => {
  if (elementId) {
    return `#${encodeURIComponent(elementId)}`;
  }

  if (work === 'political') {
    return part === 1 ? `#${POLITICAL_PREFIX}` : `#${POLITICAL_PREFIX}.${POLITICAL_CHAPTERS[part].numeral}`;
  }

  return part === 1 ? '' : `#${PARTS[part].numeral}`;
};

export const buildReaderUrl = (location: ReaderLocation): string =>
  `${window.location.pathname}${window.location.search}${buildReaderHash(location)}`;

export const sameReaderLocation = (left: ReaderLocation, right: ReaderLocation): boolean =>
  left.work === right.work && left.part === right.part && left.elementId === right.elementId;
