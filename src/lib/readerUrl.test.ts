import { buildReaderHash, locateElement, parseReaderHash } from './readerUrl';

describe('parseReaderHash', () => {
  test.each([
    ['', { work: 'ethics', part: 1, elementId: null }],
    ['#III', { work: 'ethics', part: 3, elementId: null }],
    ['#III.prop.6', { work: 'ethics', part: 3, elementId: 'III.prop.6' }],
    ['#IV.prop.20.proof', { work: 'ethics', part: 4, elementId: 'IV.prop.20.proof' }],
    ['#TP', { work: 'political', part: 1, elementId: null }],
    ['#TP.VII', { work: 'political', part: 7, elementId: null }],
    ['#TP.VII.6', { work: 'political', part: 7, elementId: 'TP.VII.6' }],
    ['#TP.preface', { work: 'political', part: 1, elementId: 'TP.preface' }],
    ['#TP.XX.1', { work: 'ethics', part: 1, elementId: null }],
    ['#X.prop.1', { work: 'ethics', part: 1, elementId: null }],
    ['#garbage', { work: 'ethics', part: 1, elementId: null }],
    ['#%E0%A4%A', { work: 'ethics', part: 1, elementId: null }]
  ])('reads %s', (hash, expected) => {
    expect(parseReaderHash(hash)).toEqual(expected);
  });
});

describe('buildReaderHash', () => {
  test('keeps the start of Part I as a clean URL', () => {
    expect(buildReaderHash({ work: 'ethics', part: 1, elementId: null })).toBe('');
  });

  test('round-trips parts and passages in both works', () => {
    for (const location of [
      { work: 'ethics', part: 3, elementId: null },
      { work: 'ethics', part: 2, elementId: 'II.prop.7' },
      { work: 'political', part: 1, elementId: null },
      { work: 'political', part: 8, elementId: null },
      { work: 'political', part: 2, elementId: 'TP.II.5' },
      { work: 'political', part: 1, elementId: 'TP.preface' }
    ] as const) {
      expect(parseReaderHash(buildReaderHash(location))).toEqual(location);
    }
  });
});

describe('locateElement', () => {
  test('finds the work and part of any passage', () => {
    expect(locateElement('III.prop.29')).toEqual({ work: 'ethics', part: 3 });
    expect(locateElement('TP.VII.6')).toEqual({ work: 'political', part: 7 });
    expect(locateElement('nonsense')).toBeNull();
  });
});
