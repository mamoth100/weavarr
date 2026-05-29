import type { Subgenre, SortOption } from '@/types';

// All keyword IDs verified against TMDb API
export const SUBGENRES: Subgenre[] = [
  {
    id: 'true-crime',
    label: 'True Crime',
    emoji: '🔍',
    keywordIds: [
      33722, // true crime
      10714, // serial killer
      9826,  // murder
      5340,  // investigation
      323114,// crime
      4373,  // fraud
      11454, // scam
      378,   // prison
      15108, // justice
      6158,  // cult
      162766,// religious cult
    ],
  },
  {
    id: 'nature',
    label: 'Nature & Wildlife',
    emoji: '🌿',
    keywordIds: [
      18330, // nature
      9902,  // wildlife
      221355,// nature documentary
      15174, // ecology
      270,   // ocean
      33577, // environment
      2210,  // climate change
      18165, // animals
      361118,// animal
    ],
  },
  {
    id: 'history',
    label: 'History',
    emoji: '📜',
    keywordIds: [
      282633,// history
      15126, // historical
      5565,  // biography
      258077,// world war
      2504,  // world war i
      1739,  // holocaust
      14900, // genocide
      4098,  // civil rights
      163118,// social justice
    ],
  },
  {
    id: 'science',
    label: 'Science & Tech',
    emoji: '🔬',
    keywordIds: [
      287067,// science
      1576,  // technology
      191132,// space exploration
      160330,// astronomy
      371846,// artificial intelligence
      34152, // evolution
      188973,// pandemic
      2210,  // climate change
      15174, // ecology
      310,   // artificial intelligence (a.i.)
    ],
  },
  {
    id: 'political',
    label: 'Political',
    emoji: '🏛️',
    keywordIds: [
      6078,  // politics
      264792,// political
      15134, // election
      6086,  // government
      417,   // corruption
      4098,  // civil rights
      163118,// social justice
      13015, // terrorism
      325483,// extremism
      154954,// social injustice
    ],
  },
  {
    id: 'sports',
    label: 'Sports',
    emoji: '⚽',
    keywordIds: [
      6075,  // sports
      333328,// sport
      274126,// athlete
      208820,// olympic athlete
      6496,  // basketball
      13042, // football (soccer)
      352822,// football
      9882,  // (old — keep as fallback)
    ],
  },
  {
    id: 'music',
    label: 'Music',
    emoji: '🎵',
    keywordIds: [
      283297,// music
      4048,  // musician
      6029,  // concert
      156205,// concert film
      246377,// music documentary
      3526,  // (old)
      1870,  // (old)
    ],
  },
  {
    id: 'war',
    label: 'War',
    emoji: '⚔️',
    keywordIds: [
      273967,// war
      14643, // battle
      18543, // combat
      258077,// world war
      2504,  // world war i
      13065, // soldier
      1739,  // holocaust
      14900, // genocide
    ],
  },
  {
    id: 'food',
    label: 'Food & Culture',
    emoji: '🍽️',
    keywordIds: [
      10637, // food
      1918,  // cooking
      18293, // chef
      1946,  // restaurant
    ],
  },
  {
    id: 'conspiracy',
    label: 'Conspiracy',
    emoji: '👁️',
    keywordIds: [
      10410, // conspiracy
      6158,  // cult
      162766,// religious cult
      325483,// extremism
      11454, // scam
      13015, // terrorism
    ],
  },
];

export const STREAMING_PROVIDERS: { id: number; name: string; emoji: string }[] = [
  { id: 8,    name: 'Netflix',    emoji: '🔴' },
  { id: 9,    name: 'Prime',      emoji: '🔵' },
  { id: 15,   name: 'Hulu',       emoji: '🟢' },
  { id: 1899, name: 'Max',        emoji: '🟣' },
  { id: 337,  name: 'Disney+',    emoji: '✨' },
  { id: 350,  name: 'Apple TV+',  emoji: '🍎' },
  { id: 386,  name: 'Peacock',    emoji: '🦚' },
  { id: 531,  name: 'Paramount+', emoji: '⛰️' },
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
