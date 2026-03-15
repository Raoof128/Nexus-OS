export const MEDIA_TYPES = ['book', 'movie', 'anime']

export const MEDIA_CONFIG = {
  book: {
    label: 'Books',
    singular: 'Book',
    creatorLabel: 'Author',
    subInfoLabel: 'Pages',
    statuses: ['To Read', 'Reading', 'Finished'],
    defaultStatus: 'To Read',
    icon: 'BookOpen',
  },
  movie: {
    label: 'Movies',
    singular: 'Movie',
    creatorLabel: 'Director',
    subInfoLabel: 'Year',
    statuses: ['To Watch', 'Watching', 'Finished'],
    defaultStatus: 'To Watch',
    icon: 'Film',
  },
  anime: {
    label: 'Anime',
    singular: 'Anime',
    creatorLabel: 'Studio',
    subInfoLabel: 'Episodes',
    statuses: ['To Watch', 'Watching', 'Finished'],
    defaultStatus: 'To Watch',
    icon: 'Sparkles',
  },
}
