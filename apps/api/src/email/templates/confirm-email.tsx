import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Row,
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
  bg: '#ebe2d3',
  paper: '#f8f2e8',
  panel: '#f2e8d8',
  ink: '#17120d',
  muted: '#6f6254',
  rule: '#cdb89a',
  accent: '#8f3f2c',
  accentSoft: '#f3ddd0',
}

const responsiveCss = `
  @media only screen and (max-width: 640px) {
    .shell {
      padding: 18px 10px 28px !important;
    }

    .stack-column,
    .stack-column td {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
    }

    .stack-column table,
    .stack-column div {
      width: 100% !important;
      max-width: 100% !important;
    }

    .stack-gutter {
      display: none !important;
      width: 0 !important;
      max-width: 0 !important;
      overflow: hidden !important;
    }

    .paper-padding,
    .card-padding {
      padding-left: 18px !important;
      padding-right: 18px !important;
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
    <Html>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{responsiveCss}</style>
      </Head>
      <Preview>Confirm your Omens report email subscription.</Preview>
      <Body
        style={{
          margin: 0,
          backgroundColor: colors.bg,
          color: colors.ink,
          fontFamily: 'Georgia, Times New Roman, serif',
        }}
      >
        <Container className="shell" style={{ maxWidth: '680px', margin: '0 auto', padding: '28px 12px 40px' }}>
          <Section style={{ padding: '0 8px 14px' }}>
            <Text
              style={{
                margin: '0',
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '0.28em',
                fontSize: '10px',
                color: colors.accent,
              }}
            >
              Subscription Desk
            </Text>
            <Heading
              style={{
                margin: '10px 0 0',
                fontSize: '38px',
                lineHeight: '1',
                fontWeight: '700',
                textAlign: 'center',
                letterSpacing: '-0.04em',
              }}
            >
              The Daily Omens
            </Heading>
          </Section>

          <Section style={{ backgroundColor: colors.paper, border: `1px solid ${colors.rule}` }}>
            <Section className="paper-padding" style={{ padding: '12px 22px', borderBottom: `1px solid ${colors.rule}` }}>
              <Row>
                <Column className="stack-column" style={{ width: '58%' }}>
                  <Text
                    style={{
                      margin: '0',
                      textTransform: 'uppercase',
                      letterSpacing: '0.16em',
                      fontSize: '10px',
                      color: colors.accent,
                    }}
                  >
                    Confirmation Required
                  </Text>
                </Column>
                <Column className="stack-column" style={{ width: '42%' }}>
                  <Text style={{ margin: '0', fontSize: '11px', color: colors.muted, textAlign: 'right' }}>
                    {props.feedName}
                  </Text>
                </Column>
              </Row>
            </Section>

            <Section className="paper-padding" style={{ padding: '24px 24px 20px' }}>
              <Row>
                <Column className="stack-column" style={{ width: '58%', verticalAlign: 'top', paddingRight: '14px' }}>
                  <Heading
                    style={{
                      margin: '0',
                      fontSize: '34px',
                      lineHeight: '1.08',
                      fontWeight: '700',
                      letterSpacing: '-0.04em',
                    }}
                  >
                    Confirm your subscription
                  </Heading>
                  <Text style={{ margin: '14px 0 0', fontSize: '17px', lineHeight: '1.75', color: colors.ink }}>
                    Confirm this address to receive new {props.publicationName} editions for {props.feedName}.
                  </Text>
                  <Text style={{ margin: '14px 0 0', fontSize: '15px', lineHeight: '1.72', color: colors.muted }}>
                    This protects the list from unwanted signups and keeps delivery tied to an address that actually asked for it.
                  </Text>
                  <Section style={{ padding: '18px 0 0' }}>
                    <Button
                      href={props.confirmUrl}
                      className="mobile-button"
                      style={{
                        backgroundColor: colors.ink,
                        color: '#ffffff',
                        textDecoration: 'none',
                        padding: '13px 18px',
                        borderRadius: '0',
                        fontSize: '14px',
                        fontWeight: '700',
                      }}
                    >
                      Confirm subscription
                    </Button>
                  </Section>
                </Column>

                <Column className="stack-gutter" style={{ width: '20px' }}>
                  <Text style={{ margin: '0' }}>&nbsp;</Text>
                </Column>

                <Column className="stack-column" style={{ width: '42%', verticalAlign: 'top', paddingLeft: '14px' }}>
                  <Section style={{ backgroundColor: colors.panel, border: `1px solid ${colors.rule}` }}>
                    <Section className="card-padding" style={{ padding: '16px 16px 14px' }}>
                      <Text
                        style={{
                          margin: '0 0 8px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.16em',
                          fontSize: '10px',
                          color: colors.accent,
                        }}
                      >
                        Before You Click
                      </Text>
                      <Text style={{ margin: '0 0 10px', fontSize: '15px', lineHeight: '1.68', color: colors.ink }}>
                        One confirmation is enough. Future reports will arrive automatically after this step.
                      </Text>
                      <Text style={{ margin: '0', fontSize: '14px', lineHeight: '1.68', color: colors.muted }}>
                        This link expires in {props.expiresInHours} hours.
                      </Text>
                    </Section>
                  </Section>

                  <Section style={{ paddingTop: '14px' }}>
                    <Section style={{ backgroundColor: colors.accentSoft, border: `1px solid ${colors.rule}` }}>
                      <Section className="card-padding" style={{ padding: '16px 16px 14px' }}>
                        <Text
                          style={{
                            margin: '0 0 8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.16em',
                            fontSize: '10px',
                            color: colors.accent,
                          }}
                        >
                          Manual Link
                        </Text>
                        <Text style={{ margin: '0', fontSize: '14px', lineHeight: '1.68', color: colors.muted }}>
                          If the button does not work in your client, open this confirmation link directly:
                        </Text>
                        <Text style={{ margin: '10px 0 0', fontSize: '13px', lineHeight: '1.68', color: colors.accent }}>
                          <Link href={props.confirmUrl} style={{ color: colors.accent, textDecoration: 'underline' }}>
                            {props.confirmUrl}
                          </Link>
                        </Text>
                      </Section>
                    </Section>
                  </Section>
                </Column>
              </Row>
            </Section>
          </Section>

          <Section style={{ padding: '16px 10px 0' }}>
            <Text style={{ margin: '0', color: colors.muted, fontSize: '12px', lineHeight: '1.68', textAlign: 'center' }}>
              Didn’t request this subscription?
            </Text>
            <Text style={{ margin: '6px 0 0', color: colors.muted, fontSize: '12px', lineHeight: '1.68', textAlign: 'center' }}>
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
