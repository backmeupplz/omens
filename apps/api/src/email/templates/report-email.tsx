import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { DEFAULT_POST_MAX_CHARS, splitTextParagraphs, truncatePostText } from '@omens/shared'
import type { ReactNode } from 'react'
import type { TimelineItem } from '../../helpers/timeline'
import type { EmailReportBlock, ParsedEmailSection } from '../report-content'
import { parseEmailReportContent } from '../report-content'

interface ReportEmailTemplateProps {
  reportContent: string
  reportUrl: string
  unsubscribeUrl: string
  feedName: string
  createdAt: Date
  itemCount: number
  refItems: TimelineItem[]
}

type TweetMedia = {
  type: 'photo' | 'video' | 'gif'
  url: string
  thumbnail: string
}

type TelegramFile = {
  url: string
  fileName: string
  fileSizeLabel: string | null
}

type TelegramMediaPayload = {
  items?: TweetMedia[]
  files?: TelegramFile[]
}

type TweetCardData = {
  title: string
  description: string | null
  thumbnail: string | null
  domain: string
  url: string
}

type QuotedTweet = {
  authorName: string
  authorHandle: string
  authorAvatar: string | null
  content: string
  media: TweetMedia[] | null
  card: TweetCardData | null
  url: string
}

const colors = {
  bg: '#171310',
  paper: '#1b1714',
  article: '#1f1a16',
  card: '#221c17',
  cardSoft: '#251f19',
  text: '#f1e7d8',
  textSoft: '#b9aa95',
  textMuted: '#8c7d6a',
  rule: '#4a3d31',
  accent: '#c77458',
  accentSoft: '#30201a',
  chip: '#2b241d',
}

const typefaces = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: '"Avenir Next", "Helvetica Neue", "Segoe UI", Arial, sans-serif',
}

const cardRadius = '10px'

const cardMaxWidth = '580px'

const responsiveCss = `
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background-color: ${colors.bg} !important;
  }

  a, a:visited, a:hover, a:active {
    text-decoration: none !important;
  }

  @media only screen and (max-width: 720px) {
    .shell {
      padding: 0 !important;
    }

    .paper-pad,
    .article-pad,
    .rail-card-pad,
    .meta-pad {
      padding-left: 12px !important;
      padding-right: 12px !important;
    }

    .stack-column,
    .stack-column td,
    .stack-column div,
    .stack-column table {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
    }

    .stack-column {
      padding-left: 0 !important;
      padding-right: 0 !important;
    }

    .stack-column + .stack-column {
      padding-top: 14px !important;
    }

    .stack-gutter,
    .pair-gutter {
      display: none !important;
      width: 0 !important;
      max-width: 0 !important;
      overflow: hidden !important;
    }

    .mobile-full,
    .mobile-full a {
      display: block !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }

    .masthead-title {
      font-size: 42px !important;
    }

    .masthead-subtitle {
      font-size: 12px !important;
      letter-spacing: 0.1em !important;
    }

    .meta-line {
      text-align: center !important;
      font-size: 11px !important;
      line-height: 1.6 !important;
      white-space: normal !important;
    }

    .section-headline {
      font-size: 32px !important;
    }
  }
`

function safeJson<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function hostName(url: string | null | undefined) {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function isUnreliablePreviewHost(url: string | null | undefined) {
  const host = hostName(url)
  return host === 'preview.redd.it' || host === 'external-preview.redd.it'
}

function safeImageUrl(url: string | null | undefined) {
  if (!url) return null
  if (isUnreliablePreviewHost(url)) return null
  return url
}

function originFromReportUrl(reportUrl: string) {
  try {
    return new URL(reportUrl).origin
  } catch {
    return 'https://omens.online'
  }
}

function itemShareUrl(item: TimelineItem, reportUrl: string) {
  const origin = originFromReportUrl(reportUrl)
  return `${origin}/item/${item.id}`
}

function renderTextWithBreaks(text: string) {
  const lines = text.split('\n')
  const nodes: ReactNode[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0) nodes.push(<br key={`br-${index}`} />)
    if (lines[index]) nodes.push(lines[index])
  }
  return nodes.length > 0 ? nodes : text
}

function renderParagraphText(text: string, options?: { color?: string; fontSize?: string; marginTop?: string }) {
  return splitTextParagraphs(text).map((paragraph, index) => (
    <Text
      key={`paragraph-${index}`}
      style={{
        margin: index === 0 ? '10px 0 0' : options?.marginTop || '10px 0 0',
        color: options?.color || colors.textSoft,
        fontSize: options?.fontSize || '14px',
        lineHeight: '1.55',
        fontFamily: typefaces.sans,
      }}
    >
      {renderTextWithBreaks(paragraph)}
    </Text>
  ))
}

function renderStrongText(text: string) {
  const nodes: ReactNode[] = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    nodes.push(<strong key={`strong-${match.index}`}>{match[1]}</strong>)
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes.length > 0 ? nodes : text
}

function firstTweetMedia(value: string | null) {
  const media = safeJson<TweetMedia[]>(value)
  return media?.find((item) => item.type === 'photo') || media?.[0] || null
}

function sectionBlocks(section: ParsedEmailSection) {
  const textBlocks: Extract<EmailReportBlock, { type: 'paragraph' | 'list' }>[] = []
  const itemBlocks: Extract<EmailReportBlock, { type: 'item' }>[] = []

  for (const block of section.blocks) {
    if (block.type === 'item') itemBlocks.push(block)
    else textBlocks.push(block)
  }

  return { textBlocks, itemBlocks }
}

function AuthorRow(props: {
  href: string
  avatar: string | null
  name: string
  handle?: string | null
  kicker?: string | null
}) {
  const avatarSize = 28
  return (
    <Text style={{
      margin: '0 0 8px',
      fontFamily: typefaces.sans,
      fontSize: '14px',
      lineHeight: '1.35',
      color: colors.text,
    }}>
      <Link href={props.href} style={{ color: colors.text, textDecoration: 'none' }}>
        {props.avatar ? (
          <Img
            src={props.avatar}
            alt=""
            width={avatarSize}
            height={avatarSize}
            style={{
              display: 'inline-block',
              verticalAlign: 'middle',
              width: `${avatarSize}px`,
              height: `${avatarSize}px`,
              borderRadius: '999px',
              marginRight: '8px',
            }}
          />
        ) : (
          <span style={{
            display: 'inline-block',
            verticalAlign: 'middle',
            width: `${avatarSize}px`,
            height: `${avatarSize}px`,
            borderRadius: '999px',
            backgroundColor: colors.accentSoft,
            marginRight: '8px',
          }} />
        )}
        <span style={{ verticalAlign: 'middle', fontWeight: 700, color: colors.text }}>{props.name}</span>
        {props.handle ? (
          <span style={{ verticalAlign: 'middle', color: colors.textMuted, fontWeight: 400, marginLeft: '4px' }}>
            {props.handle}
          </span>
        ) : null}
        {props.kicker ? (
          <span style={{ verticalAlign: 'middle', color: colors.textMuted, fontWeight: 400, marginLeft: '6px', fontSize: '12px' }}>
            · {props.kicker}
          </span>
        ) : null}
      </Link>
    </Text>
  )
}

function postCardStyle() {
  return {
    width: '100%',
    maxWidth: cardMaxWidth,
    margin: '0 auto',
    backgroundColor: colors.card,
    border: `1px solid ${colors.rule}`,
    borderRadius: cardRadius,
    overflow: 'hidden' as const,
  }
}

function MediaPreview(props: { label?: string; href: string; imageUrl: string | null; altHeight?: string }) {
  if (props.imageUrl) {
    return (
      <Section style={{ marginTop: '10px' }}>
        <Link href={props.href} style={{ color: colors.textMuted, textDecoration: 'none' }}>
          <Section style={{ border: `1px solid ${colors.rule}`, borderRadius: '8px', overflow: 'hidden', backgroundColor: colors.cardSoft }}>
            {props.label ? (
              <Text style={{ margin: '0', padding: '8px 10px 0', color: colors.textMuted, fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: typefaces.sans }}>
                {props.label}
              </Text>
            ) : null}
            <Img
              src={props.imageUrl}
              alt=""
              style={{
                display: 'block',
                width: '100%',
                height: 'auto',
                maxHeight: props.altHeight || '320px',
                margin: props.label ? '8px 0 0' : '0',
                objectFit: 'cover',
              }}
            />
          </Section>
        </Link>
      </Section>
    )
  }

  return (
    <Link href={props.href} style={{ textDecoration: 'none' }}>
      <Section
        style={{
          marginTop: '10px',
          border: `1px solid ${colors.rule}`,
          borderRadius: '8px',
          backgroundColor: colors.cardSoft,
          padding: '24px 12px',
        }}
      >
        <Text style={{ margin: '0', color: colors.textMuted, fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'center', fontFamily: typefaces.sans }}>
          {props.label || 'Open in Omens'}
        </Text>
      </Section>
    </Link>
  )
}

function PostLinkCard(props: { data: TweetCardData; href: string; label?: string }) {
  return (
    <Link href={props.href} style={{ color: colors.text, textDecoration: 'none' }}>
      <Section style={{ marginTop: '10px', backgroundColor: colors.cardSoft, border: `1px solid ${colors.rule}`, borderRadius: '8px' }}>
        <Section className="rail-card-pad" style={{ padding: '10px 12px' }}>
          <Text style={{ margin: '0 0 4px', color: colors.accent, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: typefaces.sans }}>
            {props.label || props.data.domain}
          </Text>
          <Text style={{ margin: '0', color: colors.text, fontSize: '14px', lineHeight: '1.5', fontWeight: 700, fontFamily: typefaces.sans }}>
            {props.data.title}
          </Text>
          {props.data.description ? renderParagraphText(props.data.description) : null}
        </Section>
      </Section>
    </Link>
  )
}

function QuotedTweetCard(props: { quoted: QuotedTweet; href: string }) {
  return (
    <Section style={{ marginTop: '10px', backgroundColor: colors.cardSoft, border: `1px solid ${colors.rule}`, borderRadius: '8px' }}>
      <Section className="rail-card-pad" style={{ padding: '10px 12px' }}>
        <Text style={{ margin: '0 0 6px', color: colors.accent, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: typefaces.sans }}>
          Quoted Post
        </Text>
        <AuthorRow
          href={props.href}
          avatar={props.quoted.authorAvatar}
          name={props.quoted.authorName}
          handle={`@${props.quoted.authorHandle}`}
        />
        {renderParagraphText(props.quoted.content)}
      </Section>
    </Section>
  )
}

function ShowFullLink(props: { href: string; label: string }) {
  return (
    <Text style={{ margin: '8px 0 0', fontSize: '12px', lineHeight: '1.5', fontFamily: typefaces.sans }}>
      <Link href={props.href} style={{ color: colors.accent, textDecoration: 'none' }}>
        {props.label}
      </Link>
    </Text>
  )
}

function TweetPostCard(props: { item: Extract<TimelineItem, { provider: 'x' }>; reportUrl: string }) {
  const tweet = props.item.payload
  const media = firstTweetMedia(tweet.mediaUrls)
  const card = safeJson<TweetCardData>(tweet.card)
  const quoted = safeJson<QuotedTweet>(tweet.quotedTweet)
  const shareUrl = itemShareUrl(props.item, props.reportUrl)
  const cleaned = (card ? tweet.content.replace(/\s*https?:\/\/\S+/g, '').trim() : tweet.content).trim()
  const truncated = truncatePostText(cleaned, { maxChars: DEFAULT_POST_MAX_CHARS, maxLines: 10 })
  const visibleText = truncated.truncated ? truncated.text : cleaned
  const mediaThumb = media ? safeImageUrl(media.thumbnail) || safeImageUrl(media.url) : null

  return (
    <Section style={postCardStyle()}>
      <Section className="rail-card-pad" style={{ padding: '14px 16px' }}>
        <AuthorRow
          href={shareUrl}
          avatar={tweet.authorAvatar}
          name={tweet.authorName}
          handle={`@${tweet.authorHandle}`}
        />

        {renderParagraphText(visibleText, { color: colors.text, fontSize: '15px' })}

        {truncated.truncated ? <ShowFullLink href={shareUrl} label="Show full post" /> : null}

        {mediaThumb ? (
          <MediaPreview
            href={shareUrl}
            imageUrl={mediaThumb}
            label={media?.type === 'photo' ? undefined : media?.type === 'gif' ? 'GIF on X' : 'Video on X'}
          />
        ) : null}

        {quoted ? <QuotedTweetCard quoted={quoted} href={shareUrl} /> : null}
        {card?.title ? <PostLinkCard data={card} href={shareUrl} label={card.domain} /> : null}
      </Section>
    </Section>
  )
}

function RedditPostCard(props: { item: Extract<TimelineItem, { provider: 'reddit' }>; reportUrl: string }) {
  const post = props.item.payload
  const shareUrl = itemShareUrl(props.item, props.reportUrl)
  const image = post.postHint === 'image'
    ? safeImageUrl(post.previewUrl) || safeImageUrl(post.thumbnailUrl)
    : null
  const body = post.body || ''
  const truncated = truncatePostText(body, { maxChars: DEFAULT_POST_MAX_CHARS, maxLines: 10 })
  const visibleBody = truncated.truncated ? truncated.text : body

  return (
    <Section style={postCardStyle()}>
      <Section className="rail-card-pad" style={{ padding: '14px 16px' }}>
        <Text style={{ margin: '0 0 6px', color: colors.accent, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: typefaces.sans }}>
          <Link href={shareUrl} style={{ color: colors.accent, textDecoration: 'none' }}>
            r/{post.subreddit}
          </Link>
        </Text>
        <Text style={{ margin: '0', color: colors.text, fontSize: '17px', lineHeight: '1.4', fontWeight: 700, fontFamily: typefaces.sans }}>
          <Link href={shareUrl} style={{ color: colors.text, textDecoration: 'none' }}>
            {post.title}
          </Link>
        </Text>
        {visibleBody ? renderParagraphText(visibleBody, { fontSize: '14px', marginTop: '10px 0 0' }) : null}
        {truncated.truncated ? <ShowFullLink href={shareUrl} label="Show full post" /> : null}
        {image ? <MediaPreview href={shareUrl} imageUrl={image} /> : null}
      </Section>
    </Section>
  )
}

function RssPostCard(props: { item: Extract<TimelineItem, { provider: 'rss' }>; reportUrl: string }) {
  const post = props.item.payload
  const media = safeJson<{ items?: TweetMedia[] }>(post.media)
  const image = safeImageUrl(post.previewUrl) || safeImageUrl(post.thumbnailUrl) || safeImageUrl(media?.items?.[0]?.thumbnail) || null
  const body = post.body || ''
  const truncated = truncatePostText(body, { maxChars: DEFAULT_POST_MAX_CHARS, maxLines: 10 })
  const visibleBody = truncated.truncated ? truncated.text : body
  const shareUrl = itemShareUrl(props.item, props.reportUrl)

  return (
    <Section style={postCardStyle()}>
      <Section className="rail-card-pad" style={{ padding: '14px 16px' }}>
        <Text style={{ margin: '0 0 6px', color: colors.accent, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: typefaces.sans }}>
          <Link href={shareUrl} style={{ color: colors.accent, textDecoration: 'none' }}>
            {post.feedTitle || post.domain || 'RSS'}
          </Link>
        </Text>
        <Text style={{ margin: '0', color: colors.text, fontSize: '17px', lineHeight: '1.4', fontWeight: 700, fontFamily: typefaces.sans }}>
          <Link href={shareUrl} style={{ color: colors.text, textDecoration: 'none' }}>
            {post.title}
          </Link>
        </Text>
        {visibleBody ? renderParagraphText(visibleBody, { fontSize: '14px', marginTop: '10px 0 0' }) : null}
        {truncated.truncated ? <ShowFullLink href={shareUrl} label="Show full article" /> : null}
        {image ? <MediaPreview href={shareUrl} imageUrl={image} /> : null}
      </Section>
    </Section>
  )
}

function TelegramPostCard(props: { item: Extract<TimelineItem, { provider: 'telegram' }>; reportUrl: string }) {
  const post = props.item.payload
  const media = safeJson<TelegramMediaPayload>(post.media)
  const image = safeImageUrl(post.previewUrl) || safeImageUrl(post.thumbnailUrl) || safeImageUrl(media?.items?.find((item) => item.type === 'photo')?.thumbnail) || null
  const body = post.content || ''
  const truncated = truncatePostText(body, { maxChars: DEFAULT_POST_MAX_CHARS, maxLines: 12 })
  const visibleBody = truncated.truncated ? truncated.text : body
  const shareUrl = itemShareUrl(props.item, props.reportUrl)

  return (
    <Section style={postCardStyle()}>
      <Section className="rail-card-pad" style={{ padding: '14px 16px' }}>
        <Text style={{ margin: '0 0 6px', color: colors.accent, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: typefaces.sans }}>
          <Link href={shareUrl} style={{ color: colors.accent, textDecoration: 'none' }}>
            Telegram · @{post.channelUsername}
          </Link>
        </Text>
        {post.channelTitle ? (
          <Text style={{ margin: '0', color: colors.text, fontSize: '17px', lineHeight: '1.4', fontWeight: 700, fontFamily: typefaces.sans }}>
            <Link href={shareUrl} style={{ color: colors.text, textDecoration: 'none' }}>
              {post.channelTitle}
            </Link>
          </Text>
        ) : null}
        {visibleBody ? renderParagraphText(visibleBody, { fontSize: '14px', marginTop: post.channelTitle ? '10px 0 0' : '0' }) : null}
        {truncated.truncated ? <ShowFullLink href={shareUrl} label="Show full post" /> : null}
        {image || media?.items?.length ? (
          <MediaPreview
            href={shareUrl}
            imageUrl={image || safeImageUrl(media?.items?.[0]?.thumbnail) || safeImageUrl(media?.items?.[0]?.url) || null}
            label={media?.items?.[0]?.type === 'gif' ? 'GIF on Telegram' : media?.items?.[0]?.type === 'video' ? 'Video on Telegram' : undefined}
          />
        ) : null}
        {!post.content && post.linkUrl ? (
          <Text style={{ margin: '8px 0 0', color: colors.textSoft, fontSize: '13px', lineHeight: '1.65', fontFamily: typefaces.sans }}>
            {post.linkUrl}
          </Text>
        ) : null}
      </Section>
    </Section>
  )
}

function TextBlocks(props: { blocks: Extract<EmailReportBlock, { type: 'paragraph' | 'list' }>[]; lead?: boolean }) {
  let leadParagraphUsed = !props.lead

  return (
    <>
      {props.blocks.map((block, index) => {
        if (block.type === 'list') {
          return (
            <Section key={`list-${index}`} style={{ marginTop: index === 0 ? '0' : '10px' }}>
              {block.entries.map((entry, entryIndex) => (
                <Text key={`entry-${entryIndex}`} style={{ margin: entryIndex === block.entries.length - 1 ? '0' : '0 0 6px', color: colors.textSoft, fontSize: '15px', lineHeight: '1.7', fontFamily: typefaces.serif }}>
                  {block.ordered ? `${entryIndex + 1}. ` : '• '}
                  {renderStrongText(entry)}
                </Text>
              ))}
            </Section>
          )
        }

        const isLeadParagraph = !leadParagraphUsed
        leadParagraphUsed = true

        return (
          <Text
            key={`paragraph-${index}`}
            style={{
              margin: index === 0 ? '0' : '0 0 0',
              paddingTop: index === 0 ? '0' : '12px',
              color: isLeadParagraph ? colors.text : colors.textSoft,
              fontSize: isLeadParagraph ? '19px' : '16px',
              lineHeight: isLeadParagraph ? '1.7' : '1.8',
              fontWeight: isLeadParagraph ? '400' : '400',
              fontFamily: typefaces.serif,
            }}
          >
            {renderStrongText(block.text)}
          </Text>
        )
      })}
    </>
  )
}

function SectionPostCard(props: { block: Extract<EmailReportBlock, { type: 'item' }>; index: number; reportUrl: string }) {
  if (!props.block.item) {
    return (
      <Section key={`missing-${props.index}`} style={postCardStyle()}>
        <Section className="rail-card-pad" style={{ padding: '14px 16px' }}>
          <Text style={{ margin: '0', color: colors.textSoft, fontSize: '14px', lineHeight: '1.6', fontFamily: typefaces.sans }}>
            Referenced post is no longer available.
          </Text>
        </Section>
      </Section>
    )
  }

  if (props.block.item.provider === 'x') {
    return <TweetPostCard item={props.block.item} reportUrl={props.reportUrl} />
  }
  if (props.block.item.provider === 'reddit') {
    return <RedditPostCard item={props.block.item} reportUrl={props.reportUrl} />
  }
  if (props.block.item.provider === 'rss') {
    return <RssPostCard item={props.block.item} reportUrl={props.reportUrl} />
  }
  return <TelegramPostCard item={props.block.item} reportUrl={props.reportUrl} />
}

function PostStack(props: { blocks: Extract<EmailReportBlock, { type: 'item' }>[]; reportUrl: string }) {
  return (
    <>
      {props.blocks.map((block, index) => (
        <Section
          key={`item-${index}`}
          style={{ marginTop: index === 0 ? '0' : '14px' }}
        >
          <SectionPostCard block={block} index={index} reportUrl={props.reportUrl} />
        </Section>
      ))}
    </>
  )
}

export function ReportEmailTemplate(props: ReportEmailTemplateProps) {
  const parsed = parseEmailReportContent(props.reportContent, props.refItems)
  const issueDate = props.createdAt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const issueTime = props.createdAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  const metaLine = `${issueDate} • ${props.feedName} • ${props.itemCount} sources • ${issueTime}`

  return (
    <Html style={{ backgroundColor: colors.bg }}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{responsiveCss}</style>
      </Head>
      <Preview>{parsed.preview}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: colors.bg, color: colors.text, fontFamily: typefaces.serif }} {...{ bgcolor: colors.bg }}>
        <Section style={{ width: '100%', backgroundColor: colors.bg, minHeight: '100vh' }}>
        <Container className="shell" style={{ width: '100%', maxWidth: '1160px', margin: '0 auto', padding: '0', backgroundColor: colors.bg }}>
          <Section className="meta-pad" style={{ padding: '16px 12px 10px', backgroundColor: colors.bg }}>
            <Heading className="masthead-title" style={{ margin: '0', textAlign: 'center', color: colors.text, fontSize: '60px', lineHeight: '0.98', letterSpacing: '-0.04em', fontWeight: '700', fontFamily: typefaces.serif }}>
              The Daily Omens
            </Heading>
            <Text className="masthead-subtitle" style={{ margin: '8px 0 0', textAlign: 'center', color: colors.textMuted, fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: typefaces.serif }}>
              Your AI-Curated Morning Briefing
            </Text>
          </Section>

          <Section style={{ backgroundColor: colors.paper, borderTop: `1px solid ${colors.rule}`, borderBottom: `1px solid ${colors.rule}` }}>
            <Section className="paper-pad" style={{ padding: '12px 14px', borderTop: `3px double ${colors.rule}`, borderBottom: `3px double ${colors.rule}` }}>
              <Text className="meta-line" style={{ margin: '0', color: colors.textMuted, fontSize: '12px', lineHeight: '1.4', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.12em', whiteSpace: 'nowrap', fontFamily: typefaces.serif }}>
                {metaLine}
              </Text>
            </Section>

            {parsed.sections.map((section, index) => {
              const { textBlocks, itemBlocks } = sectionBlocks(section)
              const hasRail = itemBlocks.length > 0
              const isLead = index === 0

              return (
                <Section
                  key={`${section.heading || 'section'}-${index}`}
                  style={{
                    borderTop: index === 0 ? 'none' : `1px solid ${colors.rule}`,
                    backgroundColor: colors.article,
                  }}
                >
                  <Section className="article-pad" style={{ padding: isLead ? '14px 14px 12px' : '12px 14px 12px' }}>
                    {section.heading ? (
                      <Heading
                        className="section-headline"
                        style={{
                          margin: '0',
                          color: colors.text,
                          fontSize: isLead ? '44px' : section.headerLevel === 1 ? '34px' : '28px',
                          lineHeight: isLead ? '1.02' : '1.12',
                          letterSpacing: '-0.04em',
                          fontWeight: '700',
                          fontFamily: typefaces.serif,
                        }}
                      >
                        {section.heading}
                      </Heading>
                    ) : null}

                    {section.heading ? (
                      <Hr style={{ margin: '12px 0 0', borderColor: colors.rule }} />
                    ) : null}

                    <Section style={{ paddingTop: section.heading ? '14px' : '0' }}>
                      {textBlocks.length > 0 ? <TextBlocks blocks={textBlocks} lead={isLead} /> : null}
                      {hasRail ? (
                        <Section style={{ paddingTop: textBlocks.length > 0 ? '16px' : '0' }}>
                          <PostStack blocks={itemBlocks} reportUrl={props.reportUrl} />
                        </Section>
                      ) : null}
                    </Section>
                  </Section>
                </Section>
              )
            })}

            <Section className="paper-pad" style={{ padding: '12px 14px 14px', borderTop: `3px double ${colors.rule}`, backgroundColor: colors.paper }}>
              <Text style={{ margin: '0', color: colors.textMuted, fontSize: '12px', lineHeight: '1.6', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: typefaces.serif }}>
                <Link href={props.reportUrl} style={{ color: colors.accent, textDecoration: 'none' }}>
                  Read On The Web
                </Link>
              </Text>
            </Section>
          </Section>

          <Section style={{ padding: '14px 12px 18px', backgroundColor: colors.bg }}>
            <Text style={{ margin: '0', color: colors.textMuted, fontSize: '12px', lineHeight: '1.68', textAlign: 'center', fontFamily: typefaces.serif }}>
              <Link href={props.unsubscribeUrl} style={{ color: colors.accent, textDecoration: 'none' }}>
                Unsubscribe
              </Link>
            </Text>
          </Section>
        </Container>
        </Section>
      </Body>
    </Html>
  )
}
