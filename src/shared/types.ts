export interface HymnVerse {
  label: string
  lines: string[]
}

export interface HymnItem {
  number: number
  title: string
  title_official?: string
  title_alt?: string
  verses?: HymnVerse[]
  source?: string
}

export interface BookMeta {
  id: string
  name: string
  alias: string
  count: number
}

export interface Manifest {
  version: number
  books: BookMeta[]
}

export interface BookFile {
  book: string
  name: string
  alias: string
  count: number
  items: HymnItem[]
  missing_lyrics?: number[]
}

export interface PackBook extends BookMeta {
  items: HymnItem[]
}