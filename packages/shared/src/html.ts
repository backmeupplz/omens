const namedEntities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lsquo: '\u2018',
  rsquo: '\u2019',
  sbquo: '\u201A',
  ldquo: '\u201C',
  rdquo: '\u201D',
  bdquo: '\u201E',
  laquo: '\u00AB',
  raquo: '\u00BB',
  lsaquo: '\u2039',
  rsaquo: '\u203A',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  middot: '\u00B7',
  bull: '\u2022',
  copy: '\u00A9',
  reg: '\u00AE',
  trade: '\u2122',
  euro: '\u20AC',
  pound: '\u00A3',
  yen: '\u00A5',
  cent: '\u00A2',
}

export function decodeHtmlEntities(value: string | null | undefined): string {
  if (!value) return ''

  let current = value
    .replace(/\\u([0-9a-fA-F]{4})/g, (match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16)
      return codePointToString(codePoint) || match
    })
    .replace(/\\x([0-9a-fA-F]{2})/g, (match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16)
      return codePointToString(codePoint) || match
    })
    .replace(/\\\//g, '/')

  for (let i = 0; i < 3; i += 1) {
    const next = current.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
      if (entity[0] === '#') {
        const isHex = entity[1]?.toLowerCase() === 'x'
        const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10)
        return codePointToString(codePoint) || match
      }

      return namedEntities[entity] ?? match
    })

    if (next === current) break
    current = next
  }

  return current
}

function codePointToString(codePoint: number): string | null {
  if (!Number.isFinite(codePoint)) return null
  try {
    return String.fromCodePoint(codePoint)
  } catch {
    return null
  }
}
