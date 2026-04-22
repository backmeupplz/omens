export type RedditPostRecord = {
  redditPostId: string
  fullname: string
  subreddit: string
  authorName: string | null
  title: string
  body: string | null
  thumbnailUrl: string | null
  previewUrl: string | null
  media: string | null
  domain: string | null
  permalink: string
  url: string
  score: number
  commentCount: number
  over18: boolean
  spoiler: boolean
  isSelf: boolean
  linkFlairText: string | null
  postHint: string | null
  publishedAt: Date | null
}

function decodeHtmlEntities(value: string | null | undefined) {
  if (!value) return null
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, '\'')
}

function normalizeUrl(value: string | null | undefined) {
  const decoded = decodeHtmlEntities(value)
  if (!decoded) return null
  if (!/^https?:\/\//.test(decoded)) return null
  return decoded
}

const REDDIT_PUBLIC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

function extractChallengeSolution(html: string) {
  const seed = html.match(/await\(async e=>e\+e\)\("([0-9a-f]+)"\)/i)?.[1]
  const token = html.match(/name="token"\s+value="([^"]+)"/i)?.[1]
  if (!seed || !token) return null
  return {
    solution: seed + seed,
    token,
  }
}

async function fetchRedditPublicHtml(url: string) {
  const first = await fetch(url, {
    headers: REDDIT_PUBLIC_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  const firstHtml = await first.text()
  if (!/Please wait for verification/i.test(firstHtml)) return firstHtml

  const challenge = extractChallengeSolution(firstHtml)
  if (!challenge) return firstHtml

  const challengedUrl = new URL(url)
  challengedUrl.searchParams.set('solution', challenge.solution)
  challengedUrl.searchParams.set('js_challenge', '1')
  challengedUrl.searchParams.set('token', challenge.token)

  const second = await fetch(challengedUrl.toString(), {
    headers: REDDIT_PUBLIC_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  return second.text()
}

export async function fetchRedditPublicGalleryMedia(postUrl: string) {
  const decodedHtml = decodeHtmlEntities(await fetchRedditPublicHtml(postUrl)) || ''
  const galleryStart = decodedHtml.indexOf('"gallery":{"__typename":"PostGallery","items":[')
  if (galleryStart === -1) return []
  const galleryEnd = decodedHtml.indexOf(']},"media":null', galleryStart)
  const galleryBlock = galleryEnd === -1
    ? decodedHtml.slice(galleryStart)
    : decodedHtml.slice(galleryStart, galleryEnd)
  const items: Array<{ url: string; thumbnail: string }> = []
  const seen = new Set<string>()
  const mediaBlocks = galleryBlock.split('"media":{"status":"VALID","__typename":"ImageAsset"').slice(1)

  for (const block of mediaBlocks) {
    const itemBlock = block.split('},"subcaptionStrikethrough"', 1)[0] || block
    const url = normalizeUrl(itemBlock.match(/"url":"(https:\/\/i\.redd\.it\/[^"]+)"/i)?.[1])
    const thumbnail = normalizeUrl(
      itemBlock.match(/"mediumPreview":\{"url":"(https:\/\/preview\.redd\.it\/[^"]+)"/i)?.[1]
      || itemBlock.match(/"preview":\{"url":"(https:\/\/preview\.redd\.it\/[^"]+)"/i)?.[1]
      || itemBlock.match(/"thumbnailPreview":\{"url":"(https:\/\/preview\.redd\.it\/[^"]+)"/i)?.[1]
      || itemBlock.match(/"url":"(https:\/\/i\.redd\.it\/[^"]+)"/i)?.[1],
    )
    if (url && thumbnail && !seen.has(url)) {
      seen.add(url)
      items.push({ url, thumbnail })
    }
  }

  return items
}
