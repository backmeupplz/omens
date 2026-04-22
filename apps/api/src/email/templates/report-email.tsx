import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import { parseEmailReportContent } from '../report-content'

interface ReportEmailTemplateProps {
  reportContent: string
  reportUrl: string
  unsubscribeUrl: string
  feedName: string
  createdAt: Date
  itemCount: number
}

const colors = {
  bg: '#f5efe3',
  paper: '#fcf8f0',
  ink: '#1f1a16',
  muted: '#786a5b',
  rule: '#d8c8b2',
  softRule: '#eadfce',
  accent: '#a6462f',
  accentSoft: '#efe3d3',
}

export function ReportEmailTemplate(props: ReportEmailTemplateProps) {
  const parsed = parseEmailReportContent(props.reportContent)
  const issueDate = props.createdAt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const normalizedTitle = parsed.title.trim().toLowerCase()
  const normalizedLead = parsed.lead.trim().toLowerCase()
  const sections = parsed.sections.map((section, index) => ({
    ...section,
    heading: index === 0 && section.heading?.trim().toLowerCase() === normalizedTitle
      ? null
      : section.heading,
    paragraphs: index === 0
      ? section.paragraphs.filter((paragraph, paragraphIndex) => (
        paragraphIndex !== 0 || paragraph.trim().toLowerCase() !== normalizedLead
      ))
      : section.paragraphs,
  })).filter((section) => section.heading || section.paragraphs.length > 0)

  return (
    <Html>
      <Head />
      <Preview>{parsed.preview}</Preview>
      <Body style={{ margin: 0, backgroundColor: colors.bg, color: colors.ink, fontFamily: 'Georgia, Times New Roman, serif' }}>
        <Container style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 12px 40px' }}>
          <Section style={{ padding: '0 6px 14px' }}>
            <Text style={{ margin: '0', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.26em', fontSize: '10px', color: colors.accent }}>
              Morning Edition
            </Text>
            <Heading style={{ margin: '10px 0 0', fontSize: '36px', lineHeight: '1', fontWeight: '700', textAlign: 'center', letterSpacing: '-0.03em' }}>
              The Daily Omens
            </Heading>
            <Text style={{ margin: '8px 0 0', textAlign: 'center', color: colors.muted, fontSize: '12px', lineHeight: '1.5' }}>
              Signal from the timeline, set in one readable edition.
            </Text>
          </Section>

          <Section style={{ backgroundColor: colors.paper, border: `1px solid ${colors.rule}` }}>
            <Section style={{ borderBottom: `1px solid ${colors.rule}`, padding: '12px 20px' }}>
              <Row>
                <Column>
                  <Text style={{ margin: '0', textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: '10px', color: colors.accent }}>
                    {props.feedName}
                  </Text>
                </Column>
                <Column align="right">
                  <Text style={{ margin: '0', fontSize: '12px', color: colors.muted }}>
                    {issueDate}
                  </Text>
                </Column>
              </Row>
            </Section>

            <Section style={{ padding: '22px 24px 16px' }}>
              <Heading style={{ margin: '0', fontSize: '34px', lineHeight: '1.05', fontWeight: '700' }}>
                {parsed.title}
              </Heading>
              <Text style={{ margin: '14px 0 0', fontSize: '18px', lineHeight: '1.75', color: colors.ink }}>
                {parsed.lead}
              </Text>
            </Section>

            <Section style={{ padding: '0 24px 20px' }}>
              <Row>
                <Column style={{ width: '62%' }}>
                  <Text style={{ margin: '0', fontSize: '12px', color: colors.muted }}>
                    {props.itemCount} sources reviewed
                  </Text>
                </Column>
                <Column align="right" style={{ width: '38%' }}>
                  <Text style={{ margin: '0', fontSize: '12px', color: colors.muted }}>
                    <Link href={props.reportUrl} style={{ color: colors.accent, textDecoration: 'underline' }}>
                      Open hosted edition
                    </Link>
                  </Text>
                </Column>
              </Row>
            </Section>

            <Hr style={{ borderColor: colors.rule, margin: '0' }} />

            <Section style={{ padding: '22px 24px 8px' }}>
              {sections.map((section, index) => (
                <Section
                  key={section.heading || index}
                  style={{
                    marginBottom: index === sections.length - 1 ? '0' : '18px',
                    paddingTop: index === 0 ? '0' : '18px',
                    borderTop: index === 0 ? 'none' : `1px solid ${colors.softRule}`,
                  }}
                >
                  {section.heading ? (
                    <Text style={{ margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: '11px', color: colors.accent }}>
                      {section.heading}
                    </Text>
                  ) : null}
                  {section.paragraphs.map((paragraph, paragraphIndex) => (
                    <Text
                      key={paragraphIndex}
                      style={{
                        margin: '0 0 12px',
                        fontSize: paragraph.startsWith('• ') ? '15px' : '16px',
                        lineHeight: paragraph.startsWith('• ') ? '1.6' : '1.75',
                        color: paragraph.startsWith('• ') ? colors.muted : colors.ink,
                      }}
                    >
                      {paragraph}
                    </Text>
                  ))}
                </Section>
              ))}
            </Section>

            <Section style={{ padding: '10px 24px 24px' }}>
              <Section style={{ backgroundColor: colors.accentSoft, border: `1px solid ${colors.rule}`, padding: '18px 18px 16px' }}>
                <Text style={{ margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: '10px', color: colors.accent }}>
                  Continue Reading
                </Text>
                <Text style={{ margin: '0 0 14px', fontSize: '15px', lineHeight: '1.65', color: colors.ink }}>
                  Open the hosted report for the full edition and original linked context.
                </Text>
                <Button
                  href={props.reportUrl}
                  style={{
                    backgroundColor: colors.ink,
                    color: '#ffffff',
                    textDecoration: 'none',
                    padding: '12px 18px',
                    borderRadius: '0',
                    fontSize: '14px',
                    fontWeight: '700',
                  }}
                >
                  Read the full edition
                </Button>
              </Section>
            </Section>
          </Section>

          <Section style={{ padding: '16px 8px 0' }}>
            <Text style={{ margin: '0', color: colors.muted, fontSize: '12px', lineHeight: '1.65', textAlign: 'center' }}>
              You’re receiving this because you subscribed to Omens report emails for {props.feedName}.
            </Text>
            <Text style={{ margin: '6px 0 0', color: colors.muted, fontSize: '12px', lineHeight: '1.65', textAlign: 'center' }}>
              <Link href={props.unsubscribeUrl} style={{ color: colors.accent, textDecoration: 'underline' }}>
                Unsubscribe from this edition
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
