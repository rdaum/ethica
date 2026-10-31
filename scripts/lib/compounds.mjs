// The source sets hyphenated compounds with a long dash ("self—evident"). A true dash
// looks the same ("in nature—that is"), so only compounds reviewed by hand are changed.
const COMPOUND_PREFIXES = ['self', 'non', 'fellow'];

const COMPOUND_WORDS = [
  ['above', 'named'],
  ['co', 'exist'],
  ['fault', 'finding'],
  ['first', 'named'],
  ['full', 'flavored'],
  ['full', 'grown'],
  ['grown', 'up'],
  ['high', 'minded'],
  ['high', 'mindedness'],
  ['house', 'dog'],
  ['hunting', 'dog'],
  ['ill', 'founded'],
  ['ill', 'ordered'],
  ['ill', 'used'],
  ['last', 'named'],
  ['not', 'being'],
  ['over', 'esteem'],
  ['piece', 'meal'],
  ['two', 'footed'],
  ['weak', 'minded'],
  ['well', 'being'],
  ['well', 'doing'],
  ['well', 'ordered']
];

const alternatives = [
  `(?:${COMPOUND_PREFIXES.join('|')})—[a-z]+`,
  ...COMPOUND_WORDS.map(([first, second]) => `${first}—${second}`)
].join('|');

const COMPOUND = new RegExp(`\\b(?:${alternatives})\\b`, 'gi');

export const normalizeCompounds = text => text.replace(COMPOUND, match => match.replace('—', '-'));
