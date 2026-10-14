const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const HTML_TAG = /<\/?[^>]+>/g
const DANGEROUS_PROTOCOLS = /(?:javascript|data|vbscript)\s*:/gi

/** XSS va injeksiyaga qarshi matn tozalash */
export function sanitizeText(input: unknown, maxLen = 500): string {
  if (typeof input !== 'string') return ''
  let text = input.normalize('NFKC')
  text = text.replace(CONTROL_CHARS, '')
  text = text.replace(HTML_TAG, '')
  text = text.replace(DANGEROUS_PROTOCOLS, '')
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  text = text.trim().slice(0, maxLen)
  return text
}

export function sanitizeDisplayName(input: unknown): string {
  const name = sanitizeText(input, 40)
  if (!name || name.length < 2) return 'Anonim'
  return name
}

export function isSafePath(path: string): boolean {
  if (!path.startsWith('/')) return false
  if (path.includes('\\') || path.includes('\0')) return false
  if (path.includes('..')) return false
  if (/%2e/i.test(path) || /%00/i.test(path) || /%5c/i.test(path)) return false
  if (path.length > 256) return false
  return true
}
