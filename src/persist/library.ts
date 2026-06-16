// Library organization metadata (ratings, flags, collections), kept separate from
// develop edits — it's about managing a shoot, not pixels. Small + JSON-shaped, so
// localStorage is plenty (keyed by photo id; orphan ids are ignored at read time).

export type Flag = 'pick' | 'reject'

export interface Collection {
  id: string
  name: string
  photoIds: string[]
}

export interface LibraryData {
  ratings: Record<string, number> // photoId -> 1..5 (absent = unrated)
  flags: Record<string, Flag> // photoId -> pick/reject (absent = none)
  collections: Collection[]
}

const KEY = 'halcyon.library.v1'

export function loadLibrary(): LibraryData {
  try {
    const s = localStorage.getItem(KEY)
    if (!s) return { ratings: {}, flags: {}, collections: [] }
    const d = JSON.parse(s) as Partial<LibraryData>
    return {
      ratings: d.ratings ?? {},
      flags: d.flags ?? {},
      collections: Array.isArray(d.collections) ? d.collections : [],
    }
  } catch {
    return { ratings: {}, flags: {}, collections: [] }
  }
}

export function saveLibrary(d: LibraryData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    /* storage unavailable / quota — library just won't persist */
  }
}
