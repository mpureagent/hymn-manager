import type { HymnApi } from '../shared/ipc'

declare global {
  interface Window {
    hymn: HymnApi
  }
}

export {}