const PUBLIC = new Set(['/login', '/terms', '/privacy'])
const ALLOWED = new Set(['/', '/login', '/terms', '/privacy', '/app'])

function isMeetPath(path: string) {
  return /^\/meet\/[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/.test(path)
}

function safeNext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (isMeetPath(raw)) return raw
  return null
}

export default defineNuxtRouteMiddleware(async (to) => {
  const path = to.path.replace(/\/+$/, '') || '/'
  const meet = isMeetPath(path)

  if (!ALLOWED.has(path) && !path.startsWith('/api') && !meet) {
    if (to.name !== 'slug') {
      return navigateTo('/', { replace: true })
    }
  }

  if (to.query.room || to.query.user || to.query.id || to.query.token) {
    const nextQ = safeNext(to.query.next)
    return navigateTo(
      { path: path === '/login' ? '/login' : path, query: nextQ ? { next: nextQ } : {} },
      { replace: true },
    )
  }

  const { user, ready, fetchMe } = useAuth()

  if (import.meta.client && !ready.value) {
    await fetchMe()
  }

  if (!import.meta.client) return

  const isPublic = PUBLIC.has(path)

  if (!user.value && (path === '/app' || meet)) {
    return navigateTo(
      { path: '/login', query: meet ? { next: path } : {} },
      { replace: true },
    )
  }

  if (!user.value && !isPublic && path !== '/') {
    return navigateTo('/login', { replace: true })
  }

  if (user.value && path === '/login') {
    const next = safeNext(to.query.next) || '/app'
    return navigateTo(next, { replace: true })
  }
})
