/** Faqat shu ro'yxatdagi system stickerlar yuboriladi (XSS xavfsiz) */
export const SYSTEM_STICKERS = [
  { id: 'wave', emoji: '👋', label: 'Wave' },
  { id: 'smile', emoji: '😊', label: 'Smile' },
  { id: 'laugh', emoji: '😂', label: 'Laugh' },
  { id: 'heart', emoji: '❤️', label: 'Heart' },
  { id: 'fire', emoji: '🔥', label: 'Fire' },
  { id: 'thumbsup', emoji: '👍', label: 'Like' },
  { id: 'clap', emoji: '👏', label: 'Clap' },
  { id: 'ok', emoji: '👌', label: 'OK' },
  { id: 'cool', emoji: '😎', label: 'Cool' },
  { id: 'think', emoji: '🤔', label: 'Think' },
  { id: 'cry', emoji: '😢', label: 'Sad' },
  { id: 'party', emoji: '🎉', label: 'Party' },
] as const

export type StickerId = (typeof SYSTEM_STICKERS)[number]['id']

const IDS = new Set<string>(SYSTEM_STICKERS.map((s) => s.id))

export function isValidStickerId(id: unknown): id is StickerId {
  return typeof id === 'string' && IDS.has(id)
}

export function stickerEmoji(id: string): string | null {
  return SYSTEM_STICKERS.find((s) => s.id === id)?.emoji ?? null
}
