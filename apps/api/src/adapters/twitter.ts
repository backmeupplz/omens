import type { RawItem } from '@omens/shared'
import type { SourceAdapter } from './types'

interface RSSItem {
  title: string
  link: string
  description: string
  pubDate: string
  creator: string
  guid: string
}

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const get = (tag: string) => {
      const m = block.match(
        new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, 's'),
      )
      return m?.[1]?.trim() || ''
    }

    items.push({
      title: get('title'),
      link: get('link'),
      description: get('description'),
      pubDate: get('pubDate'),
      creator: get('dc:creator') || get('creator'),
      guid: get('guid') || get('link'),
    })
  }

  return items
}

export const twitterAdapter: SourceAdapter = {
  type: 'twitter',

  async fetch(config, since) {
    const accounts = config.accounts as string[]
    const nitterInstance =
      (config.nitterInstance as string) || 'https://nitter.net'

    const items: RawItem[] = []

    for (const account of accounts) {
      const handle = account.replace('@', '')
      const url = `${nitterInstance}/${handle}/rss`

      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Omens/1.0',
          },
        })

        if (!res.ok) {
          console.error(
            `[twitter] Failed to fetch @${handle} from ${nitterInstance}: ${res.status}`,
          )
          continue
        }

        const xml = await res.text()
        const rssItems = parseRSS(xml)

        for (const rssItem of rssItems) {
          const publishedAt = rssItem.pubDate
            ? new Date(rssItem.pubDate)
            : new Date()

          if (since && publishedAt <= since) continue

          items.push({
            externalId: rssItem.guid || rssItem.link,
            title: rssItem.title || `@${handle}`,
            content:
              rssItem.description?.replace(/<[^>]*>/g, '') ||
              rssItem.title,
            url: rssItem.link,
            author: `@${handle}`,
            publishedAt,
            sourceType: 'twitter',
            metadata: { account: handle },
          })
        }
      } catch (err) {
        console.error(
          `[twitter] Error fetching @${handle}:`,
          err,
        )
      }

      if (accounts.length > 1) {
        await new Promise((r) => setTimeout(r, 1000))
      }
    }

    return items
  },
}
