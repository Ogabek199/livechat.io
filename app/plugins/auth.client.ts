export default defineNuxtPlugin(async () => {
  const { fetchMe } = useAuth()
  await fetchMe()
})
