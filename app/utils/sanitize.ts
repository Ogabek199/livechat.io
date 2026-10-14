const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const TAGS = /<\/?[^>]+>/g

/** Client-side XSS himoya (server ham sanitize qiladi) */
export function sanitizeText(input: string, maxLen = 500): string {
  return input
    .normalize('NFKC')
    .replace(CONTROL, '')
    .replace(TAGS, '')
    .replace(/[<>"'`]/g, '')
    .trim()
    .slice(0, maxLen)
}

/** Ko'rsatish uchun — Vue {{ }} escape qiladi; qo'shimcha tozalash */
export function safeDisplay(input: string): string {
  return sanitizeText(input, 500)
}
