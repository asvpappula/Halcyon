// Load a user file into an ImageBitmap + metadata. EXIF orientation is applied so
// portrait shots display upright. docs/UX-SPEC.md (import flow).

import type { PhotoMeta } from '../store/editor'

const SUPPORTED = ['image/jpeg', 'image/png', 'image/tiff', 'image/webp']

export interface LoadedImage {
  meta: PhotoMeta
  bitmap: ImageBitmap
  bytes: File
}

export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (file.type && !SUPPORTED.includes(file.type)) {
    throw new Error(`Unsupported file type "${file.type}". Use JPEG, PNG, TIFF, or WebP.`)
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(`Couldn't read "${file.name}". The file may be corrupt or unsupported.`)
  }
  const meta: PhotoMeta = {
    id: crypto.randomUUID(),
    name: file.name,
    width: bitmap.width,
    height: bitmap.height,
  }
  return { meta, bitmap, bytes: file }
}
