import type { ProjectionApi } from '../shared/ipc'

declare global {
  interface Window {
    projection: ProjectionApi
  }
}

export {}