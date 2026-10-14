import { getSessionFromEvent } from '../../utils/session'

export default defineEventHandler((event) => {
  const user = getSessionFromEvent(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return { user }
})
