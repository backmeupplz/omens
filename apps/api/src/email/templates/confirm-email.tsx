import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface ConfirmEmailTemplateProps {
  confirmUrl: string
  unsubscribeUrl: string
  publicationName: string
  feedName: string
}

const colors = {
  bg: '#f5efe3',
  paper: '#fcf8f0',
  ink: '#1f1a16',
  muted: '#786a5b',
  rule: '#d8c8b2',
  accent: '#a6462f',
  accentSoft: '#efe3d3',
}

export function ConfirmEmailTemplate(props: ConfirmEmailTemplateProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your Omens report email subscription.</Preview>
      <Body style={{ margin: 0, backgroundColor: colors.bg, color: colors.ink, fontFamily: 'Georgia, Times New Roman, serif' }}>
        <Container style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 12px 40px' }}>
          <Section style={{ padding: '0 6px 14px' }}>
            <Text style={{ margin: '0', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.26em', fontSize: '10px', color: colors.accent }}>
              Subscription Desk
            </Text>
            <Heading style={{ margin: '10px 0 0', fontSize: '34px', lineHeight: '1', fontWeight: '700', textAlign: 'center', letterSpacing: '-0.03em' }}>
              The Daily Omens
            </Heading>
          </Section>

          <Section style={{ backgroundColor: colors.paper, border: `1px solid ${colors.rule}` }}>
            <Section style={{ padding: '14px 22px', borderBottom: `1px solid ${colors.rule}` }}>
              <Text style={{ margin: '0', textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: '10px', color: colors.accent }}>
                Confirmation Required
              </Text>
            </Section>

            <Section style={{ padding: '24px 24px 16px' }}>
              <Heading style={{ margin: '0 0 12px', fontSize: '30px', lineHeight: '1.1' }}>
                Confirm your subscription
              </Heading>
              <Text style={{ margin: '0 0 14px', fontSize: '16px', lineHeight: '1.75' }}>
                Confirm this address to receive new {props.publicationName} reports for {props.feedName}.
              </Text>
              <Text style={{ margin: '0', fontSize: '16px', lineHeight: '1.75', color: colors.muted }}>
                This step keeps unrelated addresses from being added without permission.
              </Text>
            </Section>

            <Section style={{ padding: '0 24px 24px' }}>
              <Section style={{ backgroundColor: colors.accentSoft, border: `1px solid ${colors.rule}`, padding: '18px 18px 16px' }}>
                <Text style={{ margin: '0 0 12px', fontSize: '15px', lineHeight: '1.65' }}>
                  One click is enough. After confirmation, new editions will start arriving automatically.
                </Text>
                <Button
                  href={props.confirmUrl}
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
                  Confirm subscription
                </Button>
              </Section>
            </Section>
          </Section>

          <Section style={{ padding: '16px 8px 0' }}>
            <Text style={{ margin: '0', color: colors.muted, fontSize: '12px', lineHeight: '1.65', textAlign: 'center' }}>
              Didn’t request this subscription?
            </Text>
            <Text style={{ margin: '6px 0 0', color: colors.muted, fontSize: '12px', lineHeight: '1.65', textAlign: 'center' }}>
              <Link href={props.unsubscribeUrl} style={{ color: colors.accent, textDecoration: 'underline' }}>
                Ignore this message or unsubscribe this address
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
