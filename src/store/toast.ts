// Ephemeral toast notifications (no persistence). Replaces blocking alert()/prompt()
// for non-fatal errors and confirmations. Gold accent = "needs attention" (DESIGN-SYSTEM).

import { create } from 'zustand'

export type ToastKind = 'error' | 'info'
export interface Toast {
  id: string
  message: string
  kind: ToastKind
}

interface ToastState {
  toasts: Toast[]
  push: (message: string, kind?: ToastKind) => void
  dismiss: (id: string) => void
}

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }))
    setTimeout(() => get().dismiss(id), 5000)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
