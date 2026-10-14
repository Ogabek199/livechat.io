/** Firebase Google Auth — /api/auth/session ishlating */
export default defineEventHandler(() => {
  throw createError({
    statusCode: 410,
    statusMessage: 'Use Firebase Auth via /api/auth/session',
  })
})
