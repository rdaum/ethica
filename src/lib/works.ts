import { Language, PartMetadata, WorkId } from '../types';
import { PARTS } from './ethica';

const chapter = (number: number, numeral: string, title: string, description: string): PartMetadata => ({
  work: 'political',
  number,
  numeral,
  title,
  description
});

export const POLITICAL_CHAPTERS: Record<number, PartMetadata> = {
  1: chapter(1, 'I', 'Introduction', 'Politics must start from people as they are, subject to passions, and not as philosophers wish they were.'),
  2: chapter(2, 'II', 'Of natural right', 'Right extends as far as power. From this follow the state of nature, the civil state, and what it means to do wrong.'),
  3: chapter(3, 'III', 'Of the right of supreme authorities', 'The right of a commonwealth is the power of the multitude, guided as if by one mind, and it has limits.'),
  4: chapter(4, 'IV', 'Of the functions of supreme authorities', 'What belongs to the supreme authority, and in what sense it can do wrong.'),
  5: chapter(5, 'V', 'Of the best state of a dominion', 'The best dominion is the one where people live in harmony and its laws are kept unbroken.'),
  6: chapter(6, 'VI', 'Of monarchy', 'The foundations on which a monarchy must be built if it is to remain stable.'),
  7: chapter(7, 'VII', 'Of monarchy (continuation)', 'Why those foundations work, with historical examples of how monarchies stand and fall.'),
  8: chapter(8, 'VIII', 'Of aristocracy', 'An aristocracy needs many patricians. Its councils, its syndics, and why it comes closer to the absolute than monarchy does.'),
  9: chapter(9, 'IX', 'Of aristocracy: continuation', 'An aristocracy shared among several cities, each independent as far as it can be.'),
  10: chapter(10, 'X', 'Of aristocracy: conclusion', 'What destroys aristocracies, and how such a dominion might be made to last.'),
  11: chapter(11, 'XI', 'Of democracy', 'The treatise breaks off here, at the beginning of its account of democracy.')
};

export interface WorkMetadata {
  id: WorkId;
  title: Record<'english' | 'french', string>;
  parts: Record<number, PartMetadata>;
  languages: readonly Language[];
}

export const WORKS: Record<WorkId, WorkMetadata> = {
  ethics: {
    id: 'ethics',
    title: { english: 'The Ethics', french: 'L’Éthique' },
    parts: PARTS,
    languages: ['english', 'french', 'latin']
  },
  political: {
    id: 'political',
    title: { english: 'Political Treatise', french: 'Traité politique' },
    parts: POLITICAL_CHAPTERS,
    languages: ['english', 'latin']
  }
};

export const getWorkTitle = (work: WorkId, language: Language): string => WORKS[work].title[language === 'french' ? 'french' : 'english'];
