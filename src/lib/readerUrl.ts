import { PARTS } from './ethica';

export interface ReaderLocation {
  part: number;
  elementId: string | null;
}

const DEFAULT_LOCATION: ReaderLocation = { part: 1, elementId: null };

export const getPartNumberFromElementId = (elementId: string): number | null => {
  const numeral = elementId.split('.')[0];
  return Object.values(PARTS).find(entry => entry.numeral === numeral)?.number ?? null;
};

/**
 * Reads `#III` (a part) or `#III.prop.6` (a passage). Anything else, including
 * malformed percent-encoding, falls back to the start of Part I.
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

  const part = getPartNumberFromElementId(decoded);

  if (!part) {
    return DEFAULT_LOCATION;
  }

  return { part, elementId: decoded.includes('.') ? decoded : null };
};

export const buildReaderHash = ({ part, elementId }: ReaderLocation): string => {
  if (elementId) {
    return `#${encodeURIComponent(elementId)}`;
  }

  return part === 1 ? '' : `#${PARTS[part].numeral}`;
};

export const buildReaderUrl = (location: ReaderLocation): string =>
  `${window.location.pathname}${window.location.search}${buildReaderHash(location)}`;

export const sameReaderLocation = (left: ReaderLocation, right: ReaderLocation): boolean =>
  left.part === right.part && left.elementId === right.elementId;
