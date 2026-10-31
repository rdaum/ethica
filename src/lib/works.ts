import { Language, PartMetadata, WorkId } from '../types';
import { PARTS } from './ethica';

const chapter = (number: number, numeral: string, title: string, description: string, frenchTitle: string, frenchDescription: string): PartMetadata => ({
  work: 'political',
  number,
  numeral,
  title,
  description,
  french: { title: frenchTitle, description: frenchDescription }
});

export const POLITICAL_CHAPTERS: Record<number, PartMetadata> = {
  1: chapter(1, 'I', 'Introduction', 'Politics must start from people as they are, subject to passions, and not as philosophers wish they were.', 'Introduction', 'La politique doit partir des hommes tels qu’ils sont, sujets aux passions, et non tels que les philosophes les voudraient.'),
  2: chapter(2, 'II', 'Of natural right', 'Right extends as far as power. From this follow the state of nature, the civil state, and what it means to do wrong.', 'Du droit naturel', 'Le droit s’étend aussi loin que la puissance. De là suivent l’état de nature, l’état civil et ce que signifie mal agir.'),
  3: chapter(3, 'III', 'Of the right of supreme authorities', 'The right of a commonwealth is the power of the multitude, guided as if by one mind, and it has limits.', 'Du droit des pouvoirs souverains', 'Le droit de l’État est la puissance de la multitude, conduite comme par une seule âme, et il a ses limites.'),
  4: chapter(4, 'IV', 'Of the functions of supreme authorities', 'What belongs to the supreme authority, and in what sense it can do wrong.', 'Des grandes affaires d’état', 'Ce qui appartient au pouvoir souverain, et en quel sens il peut mal agir.'),
  5: chapter(5, 'V', 'Of the best state of a dominion', 'The best dominion is the one where people live in harmony and its laws are kept unbroken.', 'De la meilleure condition possible pour un état', 'Le meilleur État est celui où les hommes vivent dans la concorde et où les lois restent inviolées.'),
  6: chapter(6, 'VI', 'Of monarchy', 'The foundations on which a monarchy must be built if it is to remain stable.', 'De la monarchie', 'Les fondements sur lesquels une monarchie doit être bâtie pour rester stable.'),
  7: chapter(7, 'VII', 'Of monarchy (continuation)', 'Why those foundations work, with historical examples of how monarchies stand and fall.', 'De la monarchie (suite)', 'Pourquoi ces fondements tiennent, avec des exemples historiques de monarchies qui durent ou qui tombent.'),
  8: chapter(8, 'VIII', 'Of aristocracy', 'An aristocracy needs many patricians. Its councils, its syndics, and why it comes closer to the absolute than monarchy does.', 'De l’aristocratie', 'Une aristocratie demande de nombreux patriciens. Ses conseils, ses syndics, et pourquoi elle approche de l’absolu plus que la monarchie.'),
  9: chapter(9, 'IX', 'Of aristocracy: continuation', 'An aristocracy shared among several cities, each independent as far as it can be.', 'De l’aristocratie (suite)', 'Une aristocratie partagée entre plusieurs villes, chacune aussi indépendante qu’elle peut l’être.'),
  10: chapter(10, 'X', 'Of aristocracy: conclusion', 'What destroys aristocracies, and how such a dominion might be made to last.', 'De l’aristocratie (fin)', 'Ce qui détruit les aristocraties, et comment un tel État pourrait durer.'),
  11: chapter(11, 'XI', 'Of democracy', 'The treatise breaks off here, at the beginning of its account of democracy.', 'De la démocratie', 'Le traité s’interrompt ici, au début de son exposé sur la démocratie.')
};

export interface WorkMetadata {
  id: WorkId;
  title: Record<'english' | 'french', string>;
  parts: Record<number, PartMetadata>;
}

export const WORKS: Record<WorkId, WorkMetadata> = {
  ethics: {
    id: 'ethics',
    title: { english: 'The Ethics', french: 'L’Éthique' },
    parts: PARTS
  },
  political: {
    id: 'political',
    title: { english: 'Political Treatise', french: 'Traité politique' },
    parts: POLITICAL_CHAPTERS
  }
};

export const getWorkTitle = (work: WorkId, language: Language): string => WORKS[work].title[language === 'french' ? 'french' : 'english'];
