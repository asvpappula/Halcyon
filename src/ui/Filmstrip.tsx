import { useMemo, useState } from 'react'
import { useEditor } from '../store/editor'
import { useToasts } from '../store/toast'
import type { Flag } from '../persist/library'

/** Clickable 1–5 star rating. Clicking the current rating clears it. */
function Stars({ id, rating }: { id: string; rating: number }) {
  const setRating = useEditor((s) => s.setRating)
  return (
    <div className="flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={(e) => {
            e.stopPropagation()
            setRating(id, rating === n ? 0 : n)
          }}
          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
          className={`px-px text-[10px] leading-none ${
            n <= rating ? 'text-accent' : 'text-fg-faint hover:text-fg-muted'
          }`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

/** Flag toggle: cycles none → pick → reject → none. */
function FlagButton({ id, flag }: { id: string; flag: Flag | undefined }) {
  const setFlag = useEditor((s) => s.setFlag)
  const next: Flag | null = flag === undefined ? 'pick' : flag === 'pick' ? 'reject' : null
  const glyph = flag === 'pick' ? 'P' : flag === 'reject' ? 'R' : '◦'
  const cls = flag === 'pick' ? 'text-accent' : flag === 'reject' ? 'text-fg-muted' : 'text-fg-faint'
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        setFlag(id, next)
      }}
      title={flag === 'pick' ? 'Pick (P)' : flag === 'reject' ? 'Reject (X)' : 'Unflagged'}
      aria-label="Toggle flag"
      className={`w-3 text-center text-[10px] font-medium leading-none ${cls}`}
    >
      {glyph}
    </button>
  )
}

const selCls =
  'rounded border border-hairline bg-base px-1.5 py-1 text-[11px] text-fg-dim outline-none focus:border-accent'

export function Filmstrip() {
  const order = useEditor((s) => s.order)
  const photos = useEditor((s) => s.photos)
  const activeId = useEditor((s) => s.activeId)
  const selection = useEditor((s) => s.selection)
  const ratings = useEditor((s) => s.ratings)
  const flags = useEditor((s) => s.flags)
  const collections = useEditor((s) => s.collections)
  const activeCollection = useEditor((s) => s.activeCollection)
  const libFilter = useEditor((s) => s.libFilter)
  const libSort = useEditor((s) => s.libSort)
  const batchProgress = useEditor((s) => s.batchProgress)
  const targetStats = useEditor((s) => s.targetStats)
  const clipboard = useEditor((s) => s.clipboard)

  const setActive = useEditor((s) => s.setActive)
  const toggleSelect = useEditor((s) => s.toggleSelect)
  const clearSelect = useEditor((s) => s.clearSelect)
  const setSelection = useEditor((s) => s.setSelection)
  const applyMatchToSelection = useEditor((s) => s.applyMatchToSelection)
  const pasteToSelection = useEditor((s) => s.pasteToSelection)
  const createCollection = useEditor((s) => s.createCollection)
  const renameCollection = useEditor((s) => s.renameCollection)
  const deleteCollection = useEditor((s) => s.deleteCollection)
  const setActiveCollection = useEditor((s) => s.setActiveCollection)
  const addToCollection = useEditor((s) => s.addToCollection)
  const setLibFilter = useEditor((s) => s.setLibFilter)
  const setLibSort = useEditor((s) => s.setLibSort)
  const pushToast = useToasts((s) => s.push)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // The displayed set: collection → rating → flag filters, then sort.
  const visible = useMemo(() => {
    let ids = order
    if (activeCollection) {
      const col = collections.find((c) => c.id === activeCollection)
      ids = col ? order.filter((id) => col.photoIds.includes(id)) : order
    }
    ids = ids.filter((id) => (ratings[id] ?? 0) >= libFilter.minRating)
    if (libFilter.flag === 'pick') ids = ids.filter((id) => flags[id] === 'pick')
    else if (libFilter.flag === 'reject') ids = ids.filter((id) => flags[id] === 'reject')
    else if (libFilter.flag === 'unflagged') ids = ids.filter((id) => !flags[id])
    const arr = [...ids]
    if (libSort === 'name') arr.sort((a, b) => (photos[a]?.name ?? '').localeCompare(photos[b]?.name ?? ''))
    else if (libSort === 'rating') arr.sort((a, b) => (ratings[b] ?? 0) - (ratings[a] ?? 0))
    return arr
  }, [order, activeCollection, collections, ratings, flags, libFilter, libSort, photos])

  const allVisibleSelected = visible.length > 0 && visible.every((id) => selection.includes(id))

  return (
    <footer className="flex shrink-0 flex-col border-t border-hairline bg-panel">
      {/* library bar: collections + filter + sort */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-hairline-subtle px-3 py-1.5">
        <button
          onClick={() => setActiveCollection(null)}
          className={`shrink-0 rounded px-2 py-1 text-[11px] transition-colors ${
            !activeCollection ? 'bg-hover text-fg' : 'text-fg-muted hover:text-fg'
          }`}
        >
          All {order.length}
        </button>
        {collections.map((c) => (
          <div key={c.id} className="group flex shrink-0 items-center">
            {renamingId === c.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  renameCollection(c.id, renameValue)
                  setRenamingId(null)
                }}
              >
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={() => {
                    renameCollection(c.id, renameValue)
                    setRenamingId(null)
                  }}
                  className={selCls}
                />
              </form>
            ) : (
              <button
                onClick={() => setActiveCollection(c.id)}
                onDoubleClick={() => {
                  setRenamingId(c.id)
                  setRenameValue(c.name)
                }}
                title="Double-click to rename"
                className={`rounded px-2 py-1 text-[11px] transition-colors ${
                  activeCollection === c.id ? 'bg-hover text-fg' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {c.name} {c.photoIds.length}
              </button>
            )}
            <button
              onClick={() => deleteCollection(c.id)}
              aria-label={`Delete collection ${c.name}`}
              className="px-0.5 text-fg-faint opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
        {creating ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const n = newName.trim()
              if (n) setActiveCollection(createCollection(n))
              setCreating(false)
              setNewName('')
            }}
            className="shrink-0"
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setCreating(false)
                  setNewName('')
                }
              }}
              onBlur={() => {
                setCreating(false)
                setNewName('')
              }}
              placeholder="Collection name"
              className={selCls}
            />
          </form>
        ) : (
          <button
            onClick={() => {
              setNewName('')
              setCreating(true)
            }}
            className="shrink-0 rounded px-2 py-1 text-[11px] text-fg-muted transition-colors hover:text-fg"
          >
            + New
          </button>
        )}

        <div className="flex-1" />

        <select
          aria-label="Filter by rating"
          value={libFilter.minRating}
          onChange={(e) => setLibFilter({ minRating: Number(e.target.value) })}
          className={`${selCls} shrink-0`}
        >
          <option value={0}>★ Any</option>
          <option value={1}>★ 1+</option>
          <option value={2}>★ 2+</option>
          <option value={3}>★ 3+</option>
          <option value={4}>★ 4+</option>
          <option value={5}>★ 5</option>
        </select>
        <select
          aria-label="Filter by flag"
          value={libFilter.flag}
          onChange={(e) => setLibFilter({ flag: e.target.value as typeof libFilter.flag })}
          className={`${selCls} shrink-0`}
        >
          <option value="all">All flags</option>
          <option value="pick">Picks</option>
          <option value="reject">Rejects</option>
          <option value="unflagged">Unflagged</option>
        </select>
        <select
          aria-label="Sort by"
          value={libSort}
          onChange={(e) => setLibSort(e.target.value as typeof libSort)}
          className={`${selCls} shrink-0`}
        >
          <option value="added">Added</option>
          <option value="name">Name</option>
          <option value="rating">Rating</option>
        </select>
      </div>

      {/* batch actions + filmstrip */}
      <div className="flex h-16 items-center gap-3 px-3">
        <div className="flex shrink-0 flex-col gap-1">
          <button
            onClick={() => (allVisibleSelected ? clearSelect() : setSelection(visible))}
            className="rounded-md border border-hairline px-2 py-1 text-[11px] text-fg-dim transition-colors hover:bg-hover"
          >
            {allVisibleSelected ? 'Clear' : 'Select all'}
          </button>
          {selection.length > 0 &&
            (batchProgress ? (
              <span className="tnum text-[11px] text-fg-dim">
                Matching {batchProgress.done}/{batchProgress.total}…
              </span>
            ) : (
              <div className="flex gap-1">
                <button
                  onClick={applyMatchToSelection}
                  disabled={!targetStats}
                  className="rounded-md border border-accent px-2 py-1 text-[11px] text-accent transition-colors hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-40"
                  title={targetStats ? undefined : 'Add a reference look first'}
                >
                  Match {selection.length}
                </button>
                {clipboard && (
                  <button
                    onClick={() => {
                      pasteToSelection()
                      pushToast(`Pasted to ${selection.length} ${selection.length === 1 ? 'photo' : 'photos'}`)
                    }}
                    className="rounded-md border border-hairline px-2 py-1 text-[11px] text-fg-dim transition-colors hover:bg-hover"
                  >
                    Paste {selection.length}
                  </button>
                )}
                {activeCollection && (
                  <button
                    onClick={() => {
                      addToCollection(activeCollection, selection)
                      pushToast(`Added ${selection.length} to collection`)
                    }}
                    className="rounded-md border border-hairline px-2 py-1 text-[11px] text-fg-dim transition-colors hover:bg-hover"
                  >
                    + Collection
                  </button>
                )}
              </div>
            ))}
        </div>

        <div className="flex flex-1 items-center gap-2 overflow-x-auto">
          {visible.length === 0 && (
            <span className="text-[11px] text-fg-faint">No photos match this filter.</span>
          )}
          {visible.map((id) => {
            const sel = selection.includes(id)
            return (
              <div
                key={id}
                className={`flex shrink-0 flex-col gap-1 rounded-md border px-2.5 py-1.5 ${
                  id === activeId ? 'border-accent' : 'border-hairline'
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleSelect(id)}
                    aria-label={sel ? 'Deselect' : 'Select'}
                    aria-pressed={sel}
                    className={`grid h-4 w-4 place-items-center rounded border text-[10px] leading-none ${
                      sel ? 'border-accent bg-accent-subtle text-accent' : 'border-hairline-strong text-transparent'
                    }`}
                  >
                    x
                  </button>
                  <button
                    onClick={() => setActive(id)}
                    className={`text-xs ${id === activeId ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
                    title={photos[id]?.name}
                  >
                    {photos[id]?.name.slice(0, 16) ?? id.slice(0, 6)}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 pl-6">
                  <Stars id={id} rating={ratings[id] ?? 0} />
                  <FlagButton id={id} flag={flags[id]} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </footer>
  )
}
