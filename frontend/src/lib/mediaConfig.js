import { BookOpen, Briefcase, Film, Sparkles } from 'lucide-react'

export const MEDIA_TYPES = ['book', 'movie', 'anime', 'job']

export const TYPE_ICONS = { book: BookOpen, movie: Film, anime: Sparkles, job: Briefcase }

export const MEDIA_CONFIG = {
  book: {
    label: 'Books',
    singular: 'Book',
    creatorLabel: 'Author',
    subInfoLabel: 'Pages',
    statuses: ['To Read', 'Reading', 'Finished'],
    defaultStatus: 'To Read',
  },
  movie: {
    label: 'Movies',
    singular: 'Movie',
    creatorLabel: 'Director',
    subInfoLabel: 'Year',
    statuses: ['To Watch', 'Watching', 'Finished'],
    defaultStatus: 'To Watch',
  },
  anime: {
    label: 'Anime',
    singular: 'Anime',
    creatorLabel: 'Studio',
    subInfoLabel: 'Episodes',
    statuses: ['To Watch', 'Watching', 'Finished'],
    defaultStatus: 'To Watch',
  },
  job: {
    label: 'Jobs',
    singular: 'Job',
    creatorLabel: 'Company',
    subInfoLabel: 'Salary/Location',
    statuses: ['Not Answered', 'Answered', 'Rejected', 'Got the Job'],
    defaultStatus: 'Not Answered',
  },
}

export function getStatusNav(type, currentStatus) {
  const flow = MEDIA_CONFIG[type]?.statuses || []
  const index = flow.indexOf(currentStatus)
  return {
    flow,
    currentIndex: index,
    prev: index > 0 ? flow[index - 1] : null,
    next: index >= 0 && index < flow.length - 1 ? flow[index + 1] : null,
  }
}
