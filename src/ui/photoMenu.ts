// Builds the right-click menu for a photo. Read at open time from the live store so
// rating/flag/collection checkmarks reflect current state. Used by the canvas and the
// filmstrip. "Export…" dispatches a window event the Editor listens for.

import { useEditor } from '../store/editor'
import type { MenuItem } from './ContextMenu'
import { buildLookUrl } from '../engine/look'

export const EXPORT_EVENT = 'halcyon:export'

export function buildPhotoMenu(photoId: string): MenuItem[] {
  const s = useEditor.getState()
  const isActive = s.activeId === photoId
  const rating = s.ratings[photoId] ?? 0
  const flag = s.flags[photoId]

  const ratingSub: MenuItem[] = [1, 2, 3, 4, 5].map((n) => ({
    label: '★'.repeat(n),
    shortcut: String(n),
    checked: rating === n,
    onClick: () => s.setRating(photoId, rating === n ? 0 : n),
  }))
  ratingSub.push(
    { separator: true },
    { label: 'No rating', checked: rating === 0, onClick: () => s.setRating(photoId, 0) },
  )

  const flagSub: MenuItem[] = [
    { label: 'Pick', shortcut: 'P', checked: flag === 'pick', onClick: () => s.setFlag(photoId, flag === 'pick' ? null : 'pick') },
    { label: 'Reject', shortcut: 'X', checked: flag === 'reject', onClick: () => s.setFlag(photoId, flag === 'reject' ? null : 'reject') },
    { label: 'Unflagged', shortcut: 'U', checked: !flag, onClick: () => s.setFlag(photoId, null) },
  ]

  const collSub: MenuItem[] = s.collections.map((c) => {
    const inIt = c.photoIds.includes(photoId)
    return {
      label: c.name,
      checked: inIt,
      onClick: () => (inIt ? s.removeFromCollection(c.id, photoId) : s.addToCollection(c.id, [photoId])),
    }
  })
  if (s.collections.length === 0) collSub.push({ label: 'No collections yet', disabled: true })

  const exportNow = () => {
    s.setActive(photoId)
    window.dispatchEvent(new Event(EXPORT_EVENT))
  }

  return [
    ...(isActive
      ? []
      : [{ label: 'Open in develop', onClick: () => s.setActive(photoId) } as MenuItem, { separator: true } as MenuItem]),
    { label: 'Copy settings', onClick: () => { s.setActive(photoId); s.copySettings() } },
    { label: 'Paste settings', disabled: !s.clipboard, onClick: () => { s.setActive(photoId); s.pasteSettings() } },
    { label: 'Reset all', onClick: () => { s.setActive(photoId); s.resetAllDevelop() } },
    { separator: true },
    {
      label: 'Apply reference match',
      disabled: !s.targetStats,
      onClick: () => { s.setActive(photoId); s.applyMatch() },
    },
    { label: 'Rating', submenu: ratingSub },
    { label: 'Flag', submenu: flagSub },
    { label: 'Add to collection', submenu: collSub },
    { separator: true },
    {
      label: 'Copy look link',
      onClick: () => {
        navigator.clipboard?.writeText(buildLookUrl(s.edits[photoId])).catch(() => {})
      },
    },
    { label: 'Export…', onClick: exportNow },
  ]
}
