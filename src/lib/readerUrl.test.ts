import { buildReaderHash, parseReaderHash } from './readerUrl';

describe('parseReaderHash', () => {
  test.each([
    ['', { part: 1, elementId: null }],
    ['#III', { part: 3, elementId: null }],
    ['#III.prop.6', { part: 3, elementId: 'III.prop.6' }],
    ['#IV.prop.20.proof', { part: 4, elementId: 'IV.prop.20.proof' }],
    ['#X.prop.1', { part: 1, elementId: null }],
    ['#garbage', { part: 1, elementId: null }],
    ['#%E0%A4%A', { part: 1, elementId: null }]
  ])('reads %s', (hash, expected) => {
    expect(parseReaderHash(hash)).toEqual(expected);
  });
});

describe('buildReaderHash', () => {
  test('keeps the start of Part I as a clean URL', () => {
    expect(buildReaderHash({ part: 1, elementId: null })).toBe('');
  });

  test('round-trips parts and passages', () => {
    for (const location of [
      { part: 3, elementId: null },
      { part: 2, elementId: 'II.prop.7' }
    ]) {
      expect(parseReaderHash(buildReaderHash(location))).toEqual(location);
    }
  });
});
