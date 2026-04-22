export const DEFAULT_POST_MAX_CHARS = 400

export function truncatePostText(
  text: string,
  options?: {
    maxChars?: number
    maxLines?: number
  },
) {
  const maxChars = options?.maxChars ?? DEFAULT_POST_MAX_CHARS
  const maxLines = options?.maxLines ?? 10
  const lines = text.split('\n')
  const tooManyLines = lines.length > maxLines
  const tooManyChars = text.length > maxChars
  const truncated = tooManyLines || tooManyChars

  if (!truncated) {
    return {
      text,
      truncated: false,
    }
  }

  let visible = text
  if (tooManyLines) visible = lines.slice(0, maxLines).join('\n')
  if (visible.length > maxChars) visible = visible.slice(0, maxChars)
  visible = `${visible.trimEnd()}...`

  return {
    text: visible,
    truncated: true,
  }
}

export function splitTextParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}
