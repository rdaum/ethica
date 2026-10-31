import { describe, expect, it } from 'vitest';
import { normalizeCompounds } from './compounds.mjs';

describe('normalizeCompounds', () => {
  it.each([
    ['This is self—evident;', 'This is self-evident;'],
    ['Self—approval is', 'Self-approval is'],
    ['being and not—being;', 'being and not-being;'],
    ['the first—named object', 'the first-named object'],
    ['our fellow—men', 'our fellow-men']
  ])('hyphenates %s', (source, expected) => {
    expect(normalizeCompounds(source)).toBe(expected);
  });

  it.each([
    'clear and distinct—that is, a true—idea of a substance',
    'in nature—that is',
    'these questions—namely, if',
    'Proof.—The point of resemblance',
    'are finite—wanting in power',
    'herself—that'
  ])('keeps the true dash in %s', source => {
    expect(normalizeCompounds(source)).toBe(source);
  });
});
