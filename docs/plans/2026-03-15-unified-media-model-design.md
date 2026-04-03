# Unified Media Model Design

## Overview

Expand Nexus Archive from books-only to a unified media engine supporting books, movies, anime, and job applications. Single `media` table with Postgres ENUM discriminator, Pydantic discriminated unions, and tabbed Kanban UI.

## Database Migration

1. Create `media_type` ENUM (`book`, `movie`, `anime`, `job`)
2. Rename `books` → `media`
3. Add `type media_type NOT NULL DEFAULT 'book'`
4. Add `creator TEXT` (author/director/studio) and `sub_info TEXT` (pages/year/episodes)
5. Migrate `author` → `creator`, drop `author` column
6. Drop and recreate RLS policy as "Users can manage their own media"
7. Add composite index `(user_id, type)`
8. Wrap in a single transaction

## Backend

- Rename `BookController` → `MediaController` at `/media`
- GET `/media` supports `?type=book` query filter
- Pydantic discriminated union for create: `BookCreate`, `MovieCreate`, `AnimeCreate`
- `MediaUpdate` with optional `type` field
- All security (rate limiting, encryption, audit logging) carries over
- Suggestion endpoint stays at `/media/suggest`, scoped to current type context

## Frontend

- Media-type tabs (Books | Movies | Anime | Jobs) above the Kanban
- Status columns change per type (To Read/Reading/Finished vs To Watch/Watching/Finished vs Applied/Answered/Rejected/Got the Job)
- CyberCard swaps icon per type (BookOpen, Film, Sparkles, Briefcase)
- AddMediaDialog with type selector adjusting field labels
- useMedia hook with type-filtered queries

## Schema Reference

| Feature | Book | Movie | Anime | Job |
|---|---|---|---|---|
| Creator Label | Author | Director | Studio | Company |
| Sub-Info Label | Pages | Year | Episodes | Salary/Location |
| Status 1 | To Read | To Watch | To Watch | Applied |
| Status 2 | Reading | Watching | Watching | Answered |
| Status 3 | Finished | Finished | Finished | Rejected |
| Status 4 | — | — | — | Got the Job |
| Icon | BookOpen | Film | Sparkles | Briefcase |
