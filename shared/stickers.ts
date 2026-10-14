/** Server + client uchun umumiy sticker allowlist */
export const SYSTEM_STICKER_IDS = [
  'wave',
  'smile',
  'laugh',
  'heart',
  'fire',
  'thumbsup',
  'clap',
  'ok',
  'cool',
  'think',
  'cry',
  'party',
] as const

export type StickerId = (typeof SYSTEM_STICKER_IDS)[number]

const SET = new Set<string>(SYSTEM_STICKER_IDS)

export function isValidStickerId(id: unknown): id is StickerId {
  return typeof id === 'string' && SET.has(id)
}
