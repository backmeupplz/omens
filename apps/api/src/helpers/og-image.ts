import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'

const FONT_DIR = [
  resolve(import.meta.dir, '../../assets/fonts'),
  resolve(import.meta.dir, 'assets/fonts'),
].find((d) => existsSync(resolve(d, 'Inter-Regular.ttf'))) || ''

const INTER_REGULAR_PATH = resolve(FONT_DIR, 'Inter-Regular.ttf')
const INTER_BOLD_PATH = resolve(FONT_DIR, 'Inter-Bold.ttf')
const SERIF_REGULAR_PATH = resolve(FONT_DIR, 'LiberationSerif-Regular.ttf')
const SERIF_BOLD_PATH = resolve(FONT_DIR, 'LiberationSerif-Bold.ttf')

const WIDTH = 1200
const HEIGHT = 630

const COLORS = {
  bg: '#141311',
  bgAlt: '#241f1a',
  paper: '#181613',
  text: '#e6e0d2',
  textSecondary: '#c5bcad',
  textMuted: '#857b6e',
  border: '#332f29',
  accent: '#c95a47',
}

const PAGE_PADDING = '24px 36px 40px'

const SATORI_FONTS = [
  {
    name: 'Inter',
    data: readFileSync(INTER_REGULAR_PATH),
    weight: 400 as const,
    style: 'normal' as const,
  },
  {
    name: 'Inter',
    data: readFileSync(INTER_BOLD_PATH),
    weight: 700 as const,
    style: 'normal' as const,
  },
  {
    name: 'Liberation Serif',
    data: readFileSync(SERIF_REGULAR_PATH),
    weight: 400 as const,
    style: 'normal' as const,
  },
  {
    name: 'Liberation Serif',
    data: readFileSync(SERIF_BOLD_PATH),
    weight: 700 as const,
    style: 'normal' as const,
  },
]

const pngCache = new Map<string, Uint8Array>()
const MAX_CACHE = 500

type SatoriNode = {
  type: string
  props: Record<string, unknown>
}

function cacheGet(key: string): Uint8Array | undefined {
  return pngCache.get(key)
}

function cacheSet(key: string, value: Uint8Array) {
  if (pngCache.size >= MAX_CACHE) {
    const first = pngCache.keys().next().value
    if (first) pngCache.delete(first)
  }
  pngCache.set(key, value)
}

function h(type: string, props: Record<string, unknown> = {}, ...children: unknown[]): SatoriNode {
  const flat = children.flat(Infinity).filter((child): child is Exclude<typeof child, null | undefined | false> => child !== null && child !== undefined && child !== false)
  return {
    type,
    props: {
      ...props,
      children: flat.length <= 1 ? flat[0] : flat,
    },
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}\u2026` : s
}

function stripEmoji(s: string): string {
  return s.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').replace(/\s{2,}/g, ' ').trim()
}

function unescapeText(s: string): string {
  return s.replace(/\\([\\$"'`*_{}\[\]()#+\-.!])/g, '$1')
}

function normalizeText(s: string): string {
  return unescapeText(stripEmoji(s)).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizePostText(s: string): string {
  return normalizeText(s).replace(/https?:\/\/t\.co\/\w+/g, '').replace(/\s{2,}/g, ' ').trim()
}

function truncateText(s: string, max: number): string {
  if (s.length <= max) return s
  const slice = s.slice(0, max - 1)
  const cut = slice.lastIndexOf(' ')
  return `${(cut > max * 0.6 ? slice.slice(0, cut) : slice).trimEnd()}\u2026`
}

function cleanDomain(domain?: string, url?: string): string {
  const value = (domain || url || '').trim()
  if (!value) return ''
  return value
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
}

async function fetchImageDataUri(url: string): Promise<string | null> {
  let fetchUrl = url
  if (url.includes('pbs.twimg.com') && url.includes('_normal.')) {
    fetchUrl = url.replace(/_normal\./, '_200x200.')
  }
  try {
    const res = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const ct = res.headers.get('content-type') || 'image/jpeg'
    return `data:${ct};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

function svgToPng(svg: string): Uint8Array {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
    font: {
      fontDirs: FONT_DIR ? [FONT_DIR] : [],
      loadSystemFonts: true,
      defaultFontFamily: 'Inter',
      sansSerifFamily: 'Inter',
      serifFamily: 'Liberation Serif',
    },
  }).render().asPng()
}

async function renderToPng(node: SatoriNode) {
  const svg = await satori(node, {
    width: WIDTH,
    height: HEIGHT,
    fonts: SATORI_FONTS,
  })
  return svgToPng(svg)
}

interface MediaItem {
  type: 'photo' | 'video' | 'gif'
  url: string
  thumbnail: string
}

interface CardItem {
  title?: string
  description?: string
  thumbnail?: string
  domain?: string
  url?: string
}

function parseMedia(mediaUrls: string | null): MediaItem[] {
  if (!mediaUrls) return []
  try { return JSON.parse(mediaUrls) } catch { return [] }
}

function parseCard(card: string | null): CardItem | null {
  if (!card) return null
  try { return JSON.parse(card) } catch { return null }
}

function buildBackground() {
  return h('div', {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      backgroundColor: COLORS.bg,
      backgroundImage: `radial-gradient(circle at center top, ${COLORS.bgAlt} 0%, ${COLORS.bg} 72%)`,
    },
  })
}

function buildMasthead() {
  return h('div', {
    style: {
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '12px',
    },
  },
    h('div', {
      style: {
        fontFamily: 'Liberation Serif',
        fontSize: 29,
        fontWeight: 700,
        color: COLORS.text,
        letterSpacing: '0.8px',
      },
    }, 'THE DAILY OMENS'),
    h('div', {
      style: {
        width: 1088,
        height: 1,
        backgroundColor: COLORS.border,
      },
    }),
  )
}

function buildAvatar(src: string | null, size: number) {
  if (src) {
    return h('img', {
      src,
      width: size,
      height: size,
      style: {
        width: size,
        height: size,
        borderRadius: 999,
        display: 'flex',
      },
    })
  }
  return h('div', {
    style: {
      width: size,
      height: size,
      borderRadius: 999,
      backgroundColor: COLORS.border,
      display: 'flex',
    },
  })
}

function buildPostFooter({
  authorAvatar,
  authorName,
  authorHandle,
  marginTop = 'auto',
}: {
  authorAvatar: string | null
  authorName: string
  authorHandle: string
  marginTop?: number | string
}) {
  return h('div', {
    style: {
      marginTop,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      width: '100%',
    },
  },
    h('div', {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        gap: '16px',
        maxWidth: 720,
      },
    },
      buildAvatar(authorAvatar, 52),
      h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          maxWidth: 640,
        },
      },
        h('div', {
          style: {
            fontFamily: 'Inter',
            fontSize: 22,
            fontWeight: 700,
            color: COLORS.text,
          },
        }, authorName),
        h('div', {
          style: {
            fontFamily: 'Inter',
            fontSize: 17,
            color: COLORS.textMuted,
          },
        }, `@${authorHandle}`),
      ),
    ),
    h('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        fontFamily: 'Liberation Serif',
        fontSize: 29,
        fontWeight: 700,
        color: COLORS.accent,
      },
    }, 'omens.online'),
  )
}

function buildMediaGrid(mediaDataUris: string[], width: number, height: number) {
  const items = mediaDataUris.slice(0, 4)
  if (items.length <= 1) {
    return h('img', {
      src: items[0],
      width,
      height,
      style: {
        width,
        height,
        objectFit: 'contain',
        display: 'flex',
        backgroundColor: '#0b0a08',
      },
    })
  }

  const cellWidth = items.length === 2 ? Math.floor((width - 6) / 2) : Math.floor((width - 6) / 2)
  const cellHeight = items.length === 2 ? height : Math.floor((height - 6) / 2)

  return h('div', {
    style: {
      width,
      height,
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      alignContent: 'flex-start',
      backgroundColor: '#0b0a08',
    },
  },
    items.map((src, index) => h('div', {
      style: {
        width: items.length === 3 && index === 0 ? width : cellWidth,
        height: items.length === 3 && index === 0 ? cellHeight : cellHeight,
        display: 'flex',
        position: 'relative',
        backgroundColor: '#0b0a08',
        overflow: 'hidden',
      },
    },
      h('img', {
        src,
        width: items.length === 3 && index === 0 ? width : cellWidth,
        height: items.length === 3 && index === 0 ? cellHeight : cellHeight,
        style: {
          width: items.length === 3 && index === 0 ? width : cellWidth,
          height: items.length === 3 && index === 0 ? cellHeight : cellHeight,
          objectFit: 'cover',
          display: 'flex',
          backgroundColor: '#0b0a08',
        },
      }),
      index === 3 && mediaDataUris.length > 4
        ? h('div', {
          style: {
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(9, 8, 6, 0.62)',
            fontFamily: 'Inter',
            fontSize: 40,
            fontWeight: 700,
            color: COLORS.text,
          },
        }, `+${mediaDataUris.length - 3}`)
        : null,
    )),
  )
}

function buildCardPanel({
  cardTitle,
  cardDescription,
  cardDomain,
  cardImageDataUri,
}: {
  cardTitle: string
  cardDescription: string
  cardDomain: string
  cardImageDataUri: string | null
}) {
  return h('div', {
    style: {
      display: 'flex',
      flex: 1,
      flexDirection: 'column',
      border: `1px solid ${COLORS.border}`,
      backgroundColor: '#0b0a08',
      overflow: 'hidden',
    },
  },
    h('div', {
      style: {
        height: 270,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0b0a08',
        borderBottom: `1px solid ${COLORS.border}`,
      },
    },
      cardImageDataUri
        ? h('img', {
          src: cardImageDataUri,
          width: 640,
          height: 270,
          style: {
            width: 640,
            height: 270,
            objectFit: 'contain',
            display: 'flex',
            backgroundColor: '#0b0a08',
          },
        })
        : h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            fontFamily: 'Liberation Serif',
            fontSize: 32,
            fontWeight: 700,
            color: COLORS.textMuted,
          },
        }, cardDomain || 'link'),
    ),
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 18px',
        gap: '8px',
      },
    },
      cardDomain
        ? h('div', {
          style: {
            display: 'flex',
            fontFamily: 'Inter',
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: COLORS.textMuted,
          },
        }, cardDomain)
        : null,
      h('div', {
        style: {
          display: 'flex',
          fontFamily: 'Liberation Serif',
          fontSize: 24,
          fontWeight: 700,
          lineHeight: 1.04,
          color: COLORS.text,
          overflow: 'hidden',
          lineClamp: 2,
        },
      }, cardTitle),
      cardDescription
        ? h('div', {
          style: {
            display: 'flex',
            fontFamily: 'Inter',
            fontSize: 15,
            lineHeight: 1.2,
            color: COLORS.textSecondary,
            overflow: 'hidden',
            lineClamp: 1,
          },
        }, cardDescription)
        : null,
    ),
  )
}

function buildTextOnlyPostOg({
  authorAvatar,
  authorName,
  authorHandle,
  content,
}: {
  authorAvatar: string | null
  authorName: string
  authorHandle: string
  content: string
}) {
  return h('div', {
    style: {
      width: WIDTH,
      height: HEIGHT,
      display: 'flex',
      position: 'relative',
      backgroundColor: COLORS.bg,
      color: COLORS.text,
      padding: PAGE_PADDING,
      flexDirection: 'column',
      overflow: 'hidden',
    },
  },
    buildBackground(),
    h('div', {
      style: {
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      },
    },
      buildMasthead(),
      h('div', {
        style: {
          marginTop: 34,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Liberation Serif',
          fontSize: 38,
          fontWeight: 700,
          lineHeight: 1.22,
          color: COLORS.text,
          letterSpacing: '-0.4px',
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
          lineClamp: 6,
        },
      }, content),
      buildPostFooter({
        authorAvatar,
        authorName,
        authorHandle,
        marginTop: 'auto',
      }),
    ),
  )
}

function buildSplitPostOg({
  authorAvatar,
  authorName,
  authorHandle,
  content,
  mediaDataUris,
}: {
  authorAvatar: string | null
  authorName: string
  authorHandle: string
  content: string
  mediaDataUris: string[]
}) {
  return h('div', {
    style: {
      width: WIDTH,
      height: HEIGHT,
      display: 'flex',
      position: 'relative',
      flexDirection: 'column',
      backgroundColor: COLORS.bg,
      color: COLORS.text,
      overflow: 'hidden',
    },
  },
    buildBackground(),
    h('div', {
      style: {
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: PAGE_PADDING,
      },
    },
      buildMasthead(),
      h('div', {
        style: {
          marginTop: 24,
          flex: 1,
          display: 'flex',
          gap: '22px',
          padding: '18px',
          border: `1px solid ${COLORS.border}`,
          backgroundColor: 'rgba(17, 15, 13, 0.52)',
        },
      },
        h('div', {
          style: {
            width: 454,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
          },
        },
          h('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'Liberation Serif',
              fontSize: 33,
              fontWeight: 700,
              lineHeight: 1.18,
              color: COLORS.text,
              letterSpacing: '-0.4px',
              whiteSpace: 'pre-wrap',
              overflow: 'hidden',
              lineClamp: 8,
            },
          }, content),
        ),
        h('div', {
          style: {
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 0 0 6px',
            backgroundColor: '#0b0a08',
          },
        },
          buildMediaGrid(mediaDataUris, 622, 410),
        ),
      ),
      buildPostFooter({
        authorAvatar,
        authorName,
        authorHandle,
        marginTop: 22,
      }),
    ),
  )
}

function buildMediaOnlyPostOg({
  authorAvatar,
  authorName,
  authorHandle,
  mediaDataUris,
}: {
  authorAvatar: string | null
  authorName: string
  authorHandle: string
  mediaDataUris: string[]
}) {
  return h('div', {
    style: {
      width: WIDTH,
      height: HEIGHT,
      display: 'flex',
      position: 'relative',
      backgroundColor: COLORS.bg,
      color: COLORS.text,
      overflow: 'hidden',
    },
  },
    buildBackground(),
    h('div', {
      style: {
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: PAGE_PADDING,
      },
    },
      buildMasthead(),
      h('div', {
        style: {
          marginTop: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
      },
        h('div', {
          style: {
            display: 'flex',
            padding: '16px',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${COLORS.border}`,
            backgroundColor: 'rgba(17, 15, 13, 0.6)',
          },
        },
          buildMediaGrid(mediaDataUris, 1090, 396),
        ),
      ),
      buildPostFooter({
        authorAvatar,
        authorName,
        authorHandle,
        marginTop: 32,
      }),
    ),
  )
}

function buildCardPostOg({
  authorAvatar,
  authorName,
  authorHandle,
  content,
  cardTitle,
  cardDescription,
  cardDomain,
  cardImageDataUri,
}: {
  authorAvatar: string | null
  authorName: string
  authorHandle: string
  content: string
  cardTitle: string
  cardDescription: string
  cardDomain: string
  cardImageDataUri: string | null
}) {
  return h('div', {
    style: {
      width: WIDTH,
      height: HEIGHT,
      display: 'flex',
      position: 'relative',
      flexDirection: 'column',
      backgroundColor: COLORS.bg,
      color: COLORS.text,
      overflow: 'hidden',
    },
  },
    buildBackground(),
    h('div', {
      style: {
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: PAGE_PADDING,
      },
    },
      buildMasthead(),
      h('div', {
        style: {
          marginTop: 24,
          flex: 1,
          display: 'flex',
          gap: '22px',
          padding: '18px',
          border: `1px solid ${COLORS.border}`,
          backgroundColor: 'rgba(17, 15, 13, 0.52)',
        },
      },
        h('div', {
          style: {
            width: 420,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
          },
        },
          h('div', {
            style: {
              display: 'flex',
              fontFamily: 'Liberation Serif',
              fontSize: 31,
              fontWeight: 700,
              lineHeight: 1.18,
              color: COLORS.text,
              whiteSpace: 'pre-wrap',
              overflow: 'hidden',
              lineClamp: 7,
            },
          }, content),
        ),
        buildCardPanel({
          cardTitle,
          cardDescription,
          cardDomain,
          cardImageDataUri,
        }),
      ),
      buildPostFooter({
        authorAvatar,
        authorName,
        authorHandle,
        marginTop: 22,
      }),
    ),
  )
}

function buildReportOg({
  title,
  bullets,
  date,
  tweetCount,
  model,
}: {
  title: string
  bullets: string[]
  date: string
  tweetCount: number
  model: string
}) {
  return h('div', {
    style: {
      width: WIDTH,
      height: HEIGHT,
      display: 'flex',
      position: 'relative',
      flexDirection: 'column',
      padding: PAGE_PADDING,
      backgroundColor: COLORS.bg,
      color: COLORS.text,
      overflow: 'hidden',
    },
  },
    buildBackground(),
    h('div', {
      style: {
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      },
    },
      buildMasthead(),
      h('div', {
        style: {
          marginTop: 28,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Liberation Serif',
          fontSize: 52,
          fontWeight: 700,
          lineHeight: 1.08,
          color: COLORS.text,
          letterSpacing: '-0.7px',
          overflow: 'hidden',
          lineClamp: 3,
        },
      }, title),
      h('div', {
        style: {
          marginTop: 22,
          height: 1,
          width: '100%',
          backgroundColor: COLORS.border,
        },
      }),
      h('div', {
        style: {
          marginTop: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        },
      },
        bullets.slice(0, 3).map((bullet) => h('div', {
          style: {
            display: 'flex',
            width: '100%',
            fontFamily: 'Inter',
            fontSize: 28,
            lineHeight: 1.3,
            color: COLORS.textSecondary,
            overflow: 'hidden',
            lineClamp: 2,
          },
        }, bullet)),
      ),
      h('div', {
        style: {
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
      },
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'Liberation Serif',
            fontSize: 31,
            color: COLORS.text,
          },
        }, `${date} · ${tweetCount} posts`),
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'Liberation Serif',
            fontSize: 31,
            fontWeight: 700,
            color: COLORS.accent,
          },
        }, 'omens.online'),
      ),
    ),
  )
}

export interface TweetOgInput {
  tweetId: string
  authorName: string
  authorHandle: string
  authorAvatar: string | null
  content: string
  mediaUrls: string | null
  card: string | null
  publishedAt: Date | string | null
}

export async function generateTweetOgPng(t: TweetOgInput): Promise<Uint8Array> {
  const key = `tweet:${t.tweetId}`
  const cached = cacheGet(key)
  if (cached) return cached

  const card = parseCard(t.card)
  const media = parseMedia(t.mediaUrls)
  const mediaDataUris = (await Promise.all(
    media
      .slice(0, 4)
      .map((item) => item.type === 'photo' ? item.url : item.thumbnail)
      .filter(Boolean)
      .map((url) => fetchImageDataUri(url)),
  )).filter((value): value is string => !!value)

  const cardImageDataUri = card?.thumbnail
    ? await fetchImageDataUri(card.thumbnail)
    : null

  const avatarDataUri = t.authorAvatar ? await fetchImageDataUri(t.authorAvatar) : null

  const originalText = normalizePostText(t.content)
  const cardTitle = truncateText(normalizePostText(card?.title || ''), 120)
  const cardDescription = truncateText(normalizePostText(card?.description || ''), 100)
  const cardDomain = cleanDomain(card?.domain, card?.url)
  const authorName = stripEmoji(t.authorName)
  let content = originalText
  if (!content && card) {
    content = cardTitle || cardDescription
  }
  if (!content) content = `Shared post from @${t.authorHandle}`

  const node = card
    ? buildCardPostOg({
      authorAvatar: avatarDataUri,
      authorName,
      authorHandle: t.authorHandle,
      content: truncateText(content || cardTitle || `Shared post from @${t.authorHandle}`, originalText ? 260 : 220),
      cardTitle: cardTitle || truncateText(content, 100),
      cardDescription,
      cardDomain,
      cardImageDataUri,
    })
    : mediaDataUris.length === 0
    ? buildTextOnlyPostOg({
      authorAvatar: avatarDataUri,
      authorName,
      authorHandle: t.authorHandle,
      content: truncateText(content, 320),
    })
    : !originalText
      ? buildMediaOnlyPostOg({
        authorAvatar: avatarDataUri,
        authorName,
        authorHandle: t.authorHandle,
        mediaDataUris,
      })
      : buildSplitPostOg({
        authorAvatar: avatarDataUri,
        authorName,
        authorHandle: t.authorHandle,
        content: truncateText(content, mediaDataUris.length > 1 ? 230 : 260),
        mediaDataUris,
      })

  const png = await renderToPng(node)
  cacheSet(key, png)
  return png
}

export interface ReportOgInput {
  id: string
  content: string
  model: string
  tweetCount: number
  createdAt: Date | string
}

function stripTweetRefs(s: string): string {
  return unescapeText(s.replace(/\[\[tweet:[^\]]+\]\]/g, '')).replace(/\s{2,}/g, ' ').trim()
}

function extractReportSummary(content: string) {
  const lines = content.split('\n').filter((l) => l.trim())
  const title = lines.find((l) => l.match(/^#+\s/))?.replace(/^#+\s*/, '') || 'AI Report'
  const bullets: string[] = []

  for (const line of lines) {
    if (bullets.length >= 9) break
    if (line.match(/^[-*]\s/) || line.match(/^\d+\.\s/)) {
      const clean = stripTweetRefs(line.replace(/^[-*\d.]+\s*/, '').replace(/\*\*/g, ''))
      if (clean.length > 5) bullets.push(truncate(clean, 120))
    }
  }

  if (bullets.length === 0) {
    for (const line of lines) {
      if (bullets.length >= 9) break
      if (!line.startsWith('#') && line.trim().length > 20) {
        const clean = stripTweetRefs(line.replace(/\*\*/g, ''))
        if (clean.length > 5) bullets.push(truncate(clean, 120))
      }
    }
  }

  return {
    title: stripEmoji(title),
    bullets: bullets.map((bullet) => stripEmoji(bullet)),
  }
}

export { extractReportSummary }

export async function generateReportOgPng(r: ReportOgInput): Promise<Uint8Array> {
  const key = `report:${r.id}`
  const cached = cacheGet(key)
  if (cached) return cached

  const { title, bullets } = extractReportSummary(r.content)
  const date = new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const png = await renderToPng(buildReportOg({
    title,
    bullets,
    date,
    tweetCount: r.tweetCount,
    model: r.model,
  }))

  cacheSet(key, png)
  return png
}
