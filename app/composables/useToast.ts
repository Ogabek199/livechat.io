export type ToastKind = 'error' | 'success' | 'info'

export type ToastItem = {
  id: string
  message: string
  kind: ToastKind
}

export function useToast() {
  const toasts = useState<ToastItem[]>('toasts', () => [])

  function dismiss(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function push(message: string, kind: ToastKind = 'error', ms = 4200) {
    const clean = String(message || '').trim().slice(0, 240)
    if (!clean) return
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    toasts.value = [...toasts.value.slice(-4), { id, message: clean, kind }]
    if (import.meta.client) {
      window.setTimeout(() => dismiss(id), ms)
    }
  }

  function error(message: string) {
    push(message, 'error')
  }

  function success(message: string) {
    push(message, 'success', 3200)
  }

  function info(message: string) {
    push(message, 'info', 3200)
  }

  return { toasts, push, error, success, info, dismiss }
}
