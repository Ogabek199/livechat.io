export default defineNuxtPlugin(() => {
  const { setLocale } = useI18n()
  const saved = localStorage.getItem('livechat_locale') as 'uz' | 'ru' | 'en' | null
  if (saved === 'uz' || saved === 'ru' || saved === 'en') {
    setLocale(saved)
    return
  }
  const nav = (navigator.language || 'uz').toLowerCase()
  if (nav.startsWith('ru')) setLocale('ru')
  else if (nav.startsWith('en')) setLocale('en')
  else setLocale('uz')
})
