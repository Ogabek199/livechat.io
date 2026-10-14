import { isSafePath } from '../utils/sanitize'

const ALLOWED_PREFIXES = [
  '/_nuxt',
  '/__nuxt',
  '/_ipx',
  '/api/',
  '/favicon',
  '/robots.txt',
]

const ALLOWED_EXACT = new Set([
  '/',
  '/login',
  '/terms',
  '/privacy',
  '/app',
])

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const path = url.pathname

  // Path traversal / oddiy URL manipulyatsiyasi
  if (!isSafePath(path)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  }

  const isAsset = ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(p))
  const isMeet = /^\/meet\/[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}\/?$/.test(path)
  const isPage = ALLOWED_EXACT.has(path) || isMeet

  // API va assetlardan tashqari noma'lum pathlar — 404
  if (!isAsset && !isPage && !path.startsWith('/api/')) {
    // Nuxt catch-all uchun faqat GET sahifalarini o'tkazamiz, lekin
    // shubhali kengaytmalarni bloklaymiz
    if (/\.(php|asp|aspx|env|git|sql|bak|swp)$/i.test(path)) {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
  }

  // Security headers
  setResponseHeaders(event, {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), interest-cohort=()',
    'X-XSS-Protection': '0',
    // same-origin Google popupni buzadi — allow-popups shart
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Cross-Origin-Resource-Policy': 'same-site',

    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://*.googleusercontent.com",
      "media-src 'self' blob:",
      "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://firebaseinstallations.googleapis.com https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app https://*.firebasestorage.app",
      "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com https://*.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com https://*.firebaseapp.com",
      "object-src 'none'",
    ].join('; '),
  })
})

