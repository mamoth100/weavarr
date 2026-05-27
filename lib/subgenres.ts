import type { Subgenre, SortOption } from '@/types';

// TMDb keyword IDs — to verify/update, search at:
// https://api.themoviedb.org/3/search/keyword?query=<name>&api_key=YOUR_KEY
export const SUBGENRES: Subgenre[] = [
  {
    id: 'true-crime',
    label: 'True Crime',
    emoji: '🔍',
    keywordIds: [156395, 4379, 5616, 210024],
  },
  {
    id: 'nature',
    label: 'Nature & Wildlife',
    emoji: '🌿',
    keywordIds: [14627, 14821, 3539, 11152],
  },
  {
    id: 'history',
    label: 'History',
    emoji: '📜',
    keywordIds: [9672, 258, 9793, 3411],
  },
  {
    id: 'science',
    label: 'Science & Tech',
    emoji: '🔬',
    keywordIds: [10172, 9706, 4161, 11330],
  },
  {
    id: 'political',
    label: 'Political',
    emoji: '🏛️',
    keywordIds: [1752, 6075, 11130, 414],
  },
  {
    id: 'sports',
    label: 'Sports',
    emoji: '⚽',
    keywordIds: [2298, 3179, 9882, 11083],
  },
  {
    id: 'music',
    label: 'Music',
    emoji: '🎵',
    keywordIds: [3526, 5714, 1870, 9951],
  },
  {
    id: 'war',
    label: 'War',
    emoji: '⚔️',
    keywordIds: [616, 1956, 3252, 10084],
  },
  {
    id: 'food',
    label: 'Food & Culture',
    emoji: '🍽️',
    keywordIds: [3230, 10964, 12565, 3205],
  },
  {
    id: 'conspiracy',
    label: 'Conspiracy',
    emoji: '👁️',
    keywordIds: [10349, 1562, 11743, 14669],
  },
];

export const SORT_OPTIONS: { value: SortOption; label: string; emoji: string }[] = [
  { value: 'vote_average.desc', label: 'Top Rated', emoji: '⭐' },
  { value: 'popularity.desc', label: 'Popular', emoji: '🔥' },
  { value: 'release_date.desc', label: 'Newest', emoji: '🆕' },
  { value: 'release_date.asc', label: 'Oldest', emoji: '📅' },
  { value: 'vote_count.desc', label: 'Most Reviewed', emoji: '💬' },
];

export const DECADES: { label: string; value: string; gte?: string; lte?: string }[] = [
  { label: 'All Time', value: '' },
  { label: '2020s', value: '2020s', gte: '2020-01-01', lte: '2029-12-31' },
  { label: '2010s', value: '2010s', gte: '2010-01-01', lte: '2019-12-31' },
  { label: '2000s', value: '2000s', gte: '2000-01-01', lte: '2009-12-31' },
  { label: '1990s', value: '1990s', gte: '1990-01-01', lte: '1999-12-31' },
  { label: 'Classic', value: 'classic', gte: '1900-01-01', lte: '1989-12-31' },
];
