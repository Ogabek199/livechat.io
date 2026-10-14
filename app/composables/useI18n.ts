import uz from '~/locales/uz'
import ru from '~/locales/ru'
import en from '~/locales/en'

export type Locale = 'uz' | 'ru' | 'en'
type Dict = typeof uz
type Key = keyof Dict

const DICTS: Record<Locale, Dict> = { uz, ru, en }
const STORAGE = 'livechat_locale'

function detect(): Locale {
  if (!import.meta.client) return 'uz'
  const saved = localStorage.getItem(STORAGE) as Locale | null
  if (saved && DICTS[saved]) return saved
  const nav = (navigator.language || 'uz').toLowerCase()
  if (nav.startsWith('ru')) return 'ru'
  if (nav.startsWith('en')) return 'en'
  return 'uz'
}

export function useI18n() {
  const locale = useState<Locale>('locale', () => 'uz')

  if (import.meta.client && locale.value === 'uz' && !localStorage.getItem(STORAGE)) {
    locale.value = detect()
  }

  function setLocale(next: Locale) {
    locale.value = next
    if (import.meta.client) localStorage.setItem(STORAGE, next)
  }

  function t(key: Key, params?: Record<string, string | number>) {
    const dict = DICTS[locale.value] || uz
    let text: string = dict[key] || uz[key] || String(key)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return text
  }

  return { locale, setLocale, t, locales: ['uz', 'ru', 'en'] as Locale[] }
}
