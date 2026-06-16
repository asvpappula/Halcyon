import { useToasts } from '../store/toast'

/** Fixed bottom-right toast stack. Error toasts carry a gold attention bar; info
 *  toasts are plain neutral. Auto-dismiss after 5s or click ×. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)

  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-[20rem] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-lg border border-hairline-strong bg-raised px-3 py-2 text-xs text-fg shadow-lg"
          style={t.kind === 'error' ? { borderLeftColor: 'var(--accent)', borderLeftWidth: '3px' } : undefined}
        >
          <span className="flex-1 leading-relaxed text-fg-dim">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="-mr-1 shrink-0 text-fg-faint transition-colors hover:text-fg"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
