import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
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
  expiresInHours: number
}

const colors = {
  bg: '#171310',
  paper: '#1b1714',
  article: '#1f1a16',
  text: '#f1e7d8',
  textSoft: '#b9aa95',
  textMuted: '#8c7d6a',
  rule: '#4a3d31',
  accent: '#c77458',
}

const typefaces = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: '"Avenir Next", "Helvetica Neue", "Segoe UI", Arial, sans-serif',
}

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
    .meta-pad {
      padding-left: 12px !important;
      padding-right: 12px !important;
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

    .mobile-button,
    .mobile-button a {
      display: block !important;
      width: 100% !important;
      box-sizing: border-box !important;
      text-align: center !important;
    }
  }
`

export function ConfirmEmailTemplate(props: ConfirmEmailTemplateProps) {
  return (
    <Html style={{ backgroundColor: colors.bg }}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{responsiveCss}</style>
      </Head>
      <Preview>Confirm your Omens report email subscription.</Preview>
      <Body
        style={{ margin: 0, padding: 0, backgroundColor: colors.bg, color: colors.text, fontFamily: typefaces.serif }}
        {...{ bgcolor: colors.bg }}
      >
        <Section style={{ width: '100%', backgroundColor: colors.bg, minHeight: '100vh' }}>
          <Container className="shell" style={{ width: '100%', maxWidth: '1160px', margin: '0 auto', padding: '0', backgroundColor: colors.bg }}>
            <Section className="meta-pad" style={{ padding: '16px 12px 10px', backgroundColor: colors.bg }}>
              <Heading className="masthead-title" style={{ margin: '0', textAlign: 'center', color: colors.text, fontSize: '60px', lineHeight: '0.98', letterSpacing: '-0.04em', fontWeight: 700, fontFamily: typefaces.serif }}>
                The Daily Omens
              </Heading>
              <Text className="masthead-subtitle" style={{ margin: '8px 0 0', textAlign: 'center', color: colors.textMuted, fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: typefaces.serif }}>
                Subscription Desk
              </Text>
            </Section>

            <Section style={{ backgroundColor: colors.paper, borderTop: `1px solid ${colors.rule}`, borderBottom: `1px solid ${colors.rule}` }}>
              <Section className="paper-pad" style={{ padding: '12px 14px', borderTop: `3px double ${colors.rule}`, borderBottom: `3px double ${colors.rule}` }}>
                <Text className="meta-line" style={{ margin: '0', color: colors.textMuted, fontSize: '12px', lineHeight: '1.4', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.12em', whiteSpace: 'nowrap', fontFamily: typefaces.serif }}>
                  Confirmation Required • {props.feedName} • Expires in {props.expiresInHours}h
                </Text>
              </Section>

              <Section style={{ backgroundColor: colors.article }}>
                <Section className="article-pad" style={{ padding: '14px 14px 12px' }}>
                  <Heading
                    className="section-headline"
                    style={{
                      margin: '0',
                      color: colors.text,
                      fontSize: '44px',
                      lineHeight: '1.02',
                      letterSpacing: '-0.04em',
                      fontWeight: 700,
                      fontFamily: typefaces.serif,
                    }}
                  >
                    Confirm your subscription
                  </Heading>

                  <Hr style={{ margin: '12px 0 0', borderColor: colors.rule }} />

                  <Section style={{ paddingTop: '14px' }}>
                    <Text style={{
                      margin: '0',
                      color: colors.text,
                      fontSize: '19px',
                      lineHeight: '1.7',
                      fontFamily: typefaces.sans,
                    }}>
                      Confirm this address to receive new {props.publicationName} editions for <strong>{props.feedName}</strong>.
                    </Text>

                    <Text style={{
                      margin: '12px 0 0',
                      color: colors.textSoft,
                      fontSize: '15px',
                      lineHeight: '1.7',
                      fontFamily: typefaces.sans,
                    }}>
                      One confirmation is enough — future editions will arrive automatically. This link expires in {props.expiresInHours} hours.
                    </Text>

                    <Section style={{ paddingTop: '20px' }}>
                      <Button
                        href={props.confirmUrl}
                        className="mobile-button"
                        style={{
                          backgroundColor: colors.accent,
                          color: '#ffffff',
                          textDecoration: 'none',
                          padding: '13px 22px',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: 700,
                          fontFamily: typefaces.sans,
                          letterSpacing: '0.04em',
                        }}
                      >
                        Confirm subscription
                      </Button>
                    </Section>

                    <Text style={{
                      margin: '18px 0 0',
                      color: colors.textMuted,
                      fontSize: '13px',
                      lineHeight: '1.65',
                      fontFamily: typefaces.sans,
                    }}>
                      If the button does not work in your client, open this link directly:
                    </Text>
                    <Text style={{
                      margin: '6px 0 0',
                      fontSize: '13px',
                      lineHeight: '1.55',
                      fontFamily: typefaces.sans,
                      wordBreak: 'break-all',
                    }}>
                      <Link href={props.confirmUrl} style={{ color: colors.accent, textDecoration: 'none' }}>
                        {props.confirmUrl}
                      </Link>
                    </Text>
                  </Section>
                </Section>
              </Section>

              <Section className="paper-pad" style={{ padding: '12px 14px 14px', borderTop: `3px double ${colors.rule}`, backgroundColor: colors.paper }}>
                <Text style={{ margin: '0', color: colors.textMuted, fontSize: '12px', lineHeight: '1.6', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: typefaces.serif }}>
                  Didn’t request this?{' '}
                  <Link href={props.unsubscribeUrl} style={{ color: colors.accent, textDecoration: 'none' }}>
                    Unsubscribe this address
                  </Link>
                </Text>
              </Section>
            </Section>

            <Section style={{ padding: '14px 12px 18px', backgroundColor: colors.bg }}>
              <Text style={{ margin: '0', color: colors.textMuted, fontSize: '12px', lineHeight: '1.68', textAlign: 'center', fontFamily: typefaces.serif }}>
                The Daily Omens · Subscription Desk
              </Text>
            </Section>
          </Container>
        </Section>
      </Body>
    </Html>
  )
}
