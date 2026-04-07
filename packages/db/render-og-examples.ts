import { mkdirSync, writeFileSync } from 'node:fs'

import postgres from 'postgres'

import { generateReportOgPng, generateTweetOgPng } from '../../apps/api/src/helpers/og-image.ts'

const OUTPUT_DIR = '/home/borodutch/code/omens/og-examples'

const EXAMPLES = [
  ['text-only-bryan.png', '2041624570747351157'],
  ['media-only-thegameverse.png', '2041576747024425054'],
  ['text-photo-ted.png', '2041623753063329821'],
  ['text-video-levelsio.png', '2041632868502532550'],
  ['text-multi-media-levelsio.png', '2041628070998667520'],
  ['x-article-only-gakonst.png', '2041582586578026830'],
  ['url-card-text-anthropic.png', '2041578392852517128'],
  ['url-card-many-urls-alexgroberman.png', '2039891439837167771'],
  ['url-card-only-opencode.png', '2039754504489341237'],
  ['linkedin-card-text-xwayfinder.png', '2041463414300553679'],
  ['spotify-card-text-evilsocket.png', '2041458633087586595'],
  ['omens-card-text-backmeupplz.png', '2040573866322616686'],
] as const

const sql = postgres({
  host: '/run/postgresql',
  database: 'omens',
  username: 'omens',
})

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const ids = EXAMPLES.map(([, id]) => id)
  const idList = ids.map((id) => `'${id}'`).join(', ')
  const rows = await sql.unsafe<{
    tweet_id: string
    author_name: string
    author_handle: string
    author_avatar: string | null
    content: string
    media_urls: string | null
    card: string | null
    published_at: string | null
  }[]>(`
    select
      tweet_id,
      author_name,
      author_handle,
      author_avatar,
      content,
      media_urls,
      card,
      published_at
    from tweets
    where tweet_id in (${idList})
  `)

  const byId = new Map(rows.map((row) => [String(row.tweet_id), row]))

  for (const [filename, id] of EXAMPLES) {
    const row = byId.get(id)
    if (!row) throw new Error(`Missing row ${id}`)

    const png = await generateTweetOgPng({
      tweetId: `${id}-${filename}`,
      authorName: row.author_name,
      authorHandle: row.author_handle,
      authorAvatar: row.author_avatar,
      content: row.content,
      mediaUrls: row.media_urls,
      card: row.card,
      publishedAt: row.published_at,
    })

    writeFileSync(`${OUTPUT_DIR}/${filename}`, Buffer.from(png))
    console.log(`${filename}\t${id}\t@${row.author_handle}`)
  }

  const [report] = await sql<{
    id: string
    content: string
    model: string
    tweet_count: number
    created_at: string
  }[]>`
    select
      id,
      content,
      model,
      tweet_count,
      created_at
    from ai_reports
    order by created_at desc nulls last
    limit 1
  `

  if (report) {
    const png = await generateReportOgPng({
      id: `${report.id}-latest-report`,
      content: report.content,
      model: report.model,
      tweetCount: report.tweet_count,
      createdAt: report.created_at,
    })

    writeFileSync(`${OUTPUT_DIR}/report-latest.png`, Buffer.from(png))
    console.log(`report-latest.png\t${report.id}\treport`)
  }
}

try {
  await main()
} finally {
  await sql.end({ timeout: 1 })
}
