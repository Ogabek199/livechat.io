const PUBLIC = new Set(['/login', '/terms', '/privacy'])
const ALLOWED = new Set(['/', '/login', '/terms', '/privacy', '/app'])

export default defineNuxtRouteMiddleware(async (to) => {
  // URL path himoya: faqat ruxsat etilgan marshrutlar
  const path = to.path.replace(/\/+$/, '') || '/'
  if (!ALLOWED.has(path) && !path.startsWith('/api')) {
    // catch-all [...slug] ham kelishi mumkin — bosh sahifaga
    if (to.name !== 'slug') {
      return navigateTo('/', { replace: true })
    }
  }

  // Query orqali room/user id o'tkazishni e'tiborsiz qoldiramiz (URL da sessiya yo'q)
  if (to.query.room || to.query.user || to.query.id || to.query.token) {
    return navigateTo({ path: path === '/login' ? '/login' : path, query: {} }, { replace: true })
  }

  const { user, ready, fetchMe } = useAuth()

  if (import.meta.client && !ready.value) {
    await fetchMe()
  }

  if (!import.meta.client) return

  const isPublic = PUBLIC.has(path)

  if (!user.value && path === '/app') {
    return navigateTo('/login', { replace: true })
  }

  if (!user.value && !isPublic && path !== '/') {
    return navigateTo('/login', { replace: true })
  }

  if (user.value && path === '/login') {
    return navigateTo('/app', { replace: true })
  }
})
