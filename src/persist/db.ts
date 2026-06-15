// Local-first persistence (IndexedDB via Dexie). UUID keys map 1:1 to a future
// Supabase row, so sync needs no remap. docs/ARCHITECTURE.md §5, docs/DATA-MODEL.md.

import Dexie, { type Table } from 'dexie'
import type { ControlParams } from '../engine/types'

export const SCHEMA_VERSION = 1

export interface PhotoRow {
  id: string
  name: string
  width: number
  height: number
  createdAt: number
}
export interface BlobRow {
  id: string
  bytes: Blob
}
export interface EditRow {
  photoId: string
  params: ControlParams
  schemaVersion: number
  updatedAt: number
}

class HalcyonDB extends Dexie {
  photos!: Table<PhotoRow, string>
  blobs!: Table<BlobRow, string>
  edits!: Table<EditRow, string>
  constructor() {
    super('halcyon')
    this.version(1).stores({ photos: 'id', blobs: 'id', edits: 'photoId' })
  }
}

export const db = new HalcyonDB()

export async function persistPhoto(row: PhotoRow, bytes: Blob): Promise<void> {
  await db.transaction('rw', db.photos, db.blobs, async () => {
    await db.photos.put(row)
    await db.blobs.put({ id: row.id, bytes })
  })
}

export async function persistEdit(photoId: string, params: ControlParams): Promise<void> {
  await db.edits.put({ photoId, params, schemaVersion: SCHEMA_VERSION, updatedAt: Date.now() })
}

export async function deletePhoto(id: string): Promise<void> {
  await db.transaction('rw', db.photos, db.blobs, db.edits, async () => {
    await db.photos.delete(id)
    await db.blobs.delete(id)
    await db.edits.delete(id)
  })
}

export interface LoadedData {
  photos: PhotoRow[]
  edits: EditRow[]
  blobs: BlobRow[]
}

export async function loadAll(): Promise<LoadedData> {
  // Only the primary key is indexed, so sort by createdAt in JS rather than orderBy().
  const [photos, edits, blobs] = await Promise.all([
    db.photos.toArray(),
    db.edits.toArray(),
    db.blobs.toArray(),
  ])
  photos.sort((a, b) => a.createdAt - b.createdAt)
  return { photos, edits, blobs }
}

/** True if IndexedDB is usable (private mode / disabled storage returns false). */
export async function storageAvailable(): Promise<boolean> {
  try {
    await db.open()
    return true
  } catch {
    return false
  }
}
