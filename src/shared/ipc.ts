import type { PackBook } from './types'

export const IPC = {
  bootstrap: 'app:bootstrap',
  recheck: 'app:recheck',
  setCurrentBook: 'app:set-current-book',
} as const

export interface PackViewOk {
  ok: true
  root: string
  books: PackBook[]
}

export interface PackViewError {
  ok: false
  reason: 'missing' | 'corrupt'
  searchedPaths: string[]
  error?: string
}

export type PackView = PackViewOk | PackViewError

export interface Bootstrap {
  pack: PackView
  currentBook: string | null
}

export interface HymnApi {
  bootstrap(): Promise<Bootstrap>
  recheck(): Promise<Bootstrap>
  setCurrentBook(id: string): Promise<{ currentBook: string | null }>
}