/**
 * X login flow using curl-impersonate for TLS fingerprint impersonation.
 *
 * X/Cloudflare blocks non-browser TLS fingerprints. curl-impersonate is a
 * modified curl binary that mimics Chrome's TLS handshake. We shell out to it
 * for the login flow only — all subsequent API calls use regular fetch with
 * the session cookies.
 */

const LOGIN_BEARER =
  'AAAAAAAAAAAAAAAAAAAAAFQODgEAAAAAVHTp76lzh3rFzcHbmHVvQxYYpTw%3DckAlMINMjmCwxUcaXbAN4XqJVdgMJaHqNOFgPMK0zN1qLqLQCF'

const GUEST_ACTIVATE_URL = 'https://api.x.com/1.1/guest/activate.json'
const TASK_URL = 'https://api.x.com/1.1/onboarding/task.json'

const SUBTASK_VERSIONS: Record<string, number> = {
  action_list: 2,
  alert_dialog: 1,
  app_download_cta: 1,
  check_logged_in_account: 2,
  choice_selection: 3,
  contacts_live_sync_permission_prompt: 0,
  cta: 7,
  email_verification: 2,
  end_flow: 1,
  enter_date: 1,
  enter_email: 2,
  enter_password: 5,
  enter_phone: 2,
  enter_recaptcha: 1,
  enter_text: 5,
  generic_urt: 3,
  in_app_notification: 1,
  interest_picker: 3,
  js_instrumentation: 1,
  menu_dialog: 1,
  notifications_permission_prompt: 2,
  open_account: 2,
  open_home_timeline: 1,
  open_link: 1,
  phone_verification: 4,
  privacy_options: 1,
  security_key: 3,
  select_avatar: 4,
  select_banner: 2,
  settings_list: 7,
  show_code: 1,
  sign_up: 2,
  sign_up_review: 4,
  tweet_selection_urt: 1,
  update_users: 1,
  upload_media: 1,
  user_recommendations_list: 4,
  user_recommendations_urt: 1,
  wait_spinner: 3,
  web_modal: 1,
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Find the curl-impersonate binary */
async function findCurlImpersonate(): Promise<string> {
  // Try common binary names
  for (const name of [
    'curl_chrome131',
    'curl_chrome116',
    'curl_chrome110',
    'curl_chrome107',
    'curl_chrome104',
    'curl_chrome100',
    'curl_chrome99',
    'curl-impersonate-chrome',
    'curl-impersonate',
  ]) {
    try {
      const proc = Bun.spawn(['which', name], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      await proc.exited
      if (proc.exitCode === 0) {
        const path = (await new Response(proc.stdout).text()).trim()
        if (path) return path
      }
    } catch {
      continue
    }
  }
  throw new Error(
    'curl-impersonate not found. Install it: yay -S curl-impersonate-chrome-bin (Arch) or see https://github.com/lwthiker/curl-impersonate',
  )
}

/** Cookie jar for accumulating cookies across curl calls */
class CookieJar {
  private cookies: Record<string, string> = {}

  parseSetCookie(headers: string) {
    for (const line of headers.split('\n')) {
      const m = line.match(/^set-cookie:\s*([^=]+)=([^;]*)/i)
      if (m) this.cookies[m[1].trim()] = m[2].trim()
    }
  }

  get(name: string): string | undefined {
    return this.cookies[name]
  }

  getAll(): Record<string, string> {
    return { ...this.cookies }
  }

  toHeader(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  }
}

interface CurlResult {
  status: number
  headers: string
  body: string
}

/** Execute a curl-impersonate request */
async function curlRequest(
  curlBin: string,
  url: string,
  opts: {
    method?: string
    headers?: Record<string, string>
    body?: string
    jar: CookieJar
  },
): Promise<CurlResult> {
  const args = [
    '-s',
    '-i', // include headers in output (headers + blank line + body all in stdout)
    '-X', opts.method || 'POST',
  ]

  // Add headers
  const allHeaders: Record<string, string> = {
    'User-Agent': UA,
    ...opts.headers,
  }
  const cookieStr = opts.jar.toHeader()
  if (cookieStr) allHeaders.Cookie = cookieStr

  for (const [k, v] of Object.entries(allHeaders)) {
    args.push('-H', `${k}: ${v}`)
  }

  if (opts.body) {
    args.push('-d', opts.body)
  }

  args.push(url)

  const proc = Bun.spawn([curlBin, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const raw = await new Response(proc.stdout).text()
  await proc.exited

  // Split headers from body on the first double newline
  // HTTP responses separate headers from body with \r\n\r\n
  let headersText = ''
  let bodyText = ''
  const separator = raw.indexOf('\r\n\r\n')
  if (separator !== -1) {
    headersText = raw.slice(0, separator)
    bodyText = raw.slice(separator + 4)
  } else {
    // Fallback: try \n\n
    const sep2 = raw.indexOf('\n\n')
    if (sep2 !== -1) {
      headersText = raw.slice(0, sep2)
      bodyText = raw.slice(sep2 + 2)
    } else {
      bodyText = raw
    }
  }

  // Parse status code from first line
  const statusMatch = headersText.match(/HTTP\/[\d.]+ (\d+)/)
  const status = statusMatch ? Number.parseInt(statusMatch[1]) : 0

  opts.jar.parseSetCookie(headersText)

  return { status, headers: headersText, body: bodyText }
}

async function taskRequest(
  curlBin: string,
  flowToken: string,
  subtaskInputs: unknown[],
  guestToken: string,
  jar: CookieJar,
): Promise<{ flowToken: string; data: any }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${LOGIN_BEARER}`,
    'Content-Type': 'application/json',
    'X-Guest-Token': guestToken,
    'X-Twitter-Client-Language': 'en',
    'X-Twitter-Active-User': 'yes',
    Origin: 'https://x.com',
    Referer: 'https://x.com/',
  }

  const ct0 = jar.get('ct0')
  if (ct0) {
    headers['X-Csrf-Token'] = ct0
    headers['X-Twitter-Auth-Type'] = 'OAuth2Session'
  }

  const result = await curlRequest(curlBin, TASK_URL, {
    headers,
    body: JSON.stringify({
      flow_token: flowToken,
      subtask_inputs: subtaskInputs,
    }),
    jar,
  })

  if (result.status !== 200) {
    console.error(`[x] Task failed (${result.status}):`, result.body.slice(0, 500))
    // Try to extract the actual error message from X
    let detail = ''
    try {
      const parsed = JSON.parse(result.body)
      const msg = parsed?.errors?.[0]?.message
      if (msg) detail = msg.split(/\s[a-z];/)[0] // strip X tracking suffix
    } catch {}
    throw new Error(detail || `X login step failed (${result.status})`)
  }

  const data = JSON.parse(result.body)
  if (!data.flow_token) {
    throw new Error('No flow_token in response')
  }

  return { flowToken: data.flow_token, data }
}

export interface XSession {
  authToken: string
  ct0: string
  username: string
  xId: string
}

/** Get the list of subtask IDs from a response */
function getSubtaskIds(data: any): string[] {
  return (data.subtasks as any[] || []).map((s: any) => s.subtask_id)
}

export async function xLogin(
  username: string,
  password: string,
  handle?: string,
  totp?: string,
): Promise<XSession> {
  const curlBin = await findCurlImpersonate()
  const jar = new CookieJar()

  // 1. Get guest token
  const guestResult = await curlRequest(curlBin, GUEST_ACTIVATE_URL, {
    headers: {
      Authorization: `Bearer ${LOGIN_BEARER}`,
      'Content-Type': 'application/json',
    },
    jar,
  })

  if (guestResult.status !== 200) {
    throw new Error(`Failed to get guest token: ${guestResult.status}`)
  }

  const guestData = JSON.parse(guestResult.body)
  const guestToken = guestData.guest_token
  if (!guestToken) throw new Error('No guest_token in response')

  // 2. Init login flow
  const initResult = await curlRequest(
    curlBin,
    `${TASK_URL}?flow_name=login`,
    {
      headers: {
        Authorization: `Bearer ${LOGIN_BEARER}`,
        'Content-Type': 'application/json',
        'X-Guest-Token': guestToken,
        'X-Twitter-Client-Language': 'en',
        'X-Twitter-Active-User': 'yes',
        Origin: 'https://x.com',
        Referer: 'https://x.com/',
      },
      body: JSON.stringify({
        input_flow_data: {
          flow_context: {
            debug_overrides: {},
            start_location: { location: 'manual_link' },
          },
          subtask_versions: SUBTASK_VERSIONS,
        },
      }),
      jar,
    },
  )

  if (initResult.status !== 200) {
    console.error(`[x] Init failed (${initResult.status}):`, initResult.body.slice(0, 500))
    throw new Error(`Failed to init login flow: ${initResult.status}`)
  }

  const initData = JSON.parse(initResult.body)
  let flowToken = initData.flow_token as string
  if (!flowToken) throw new Error('No flow_token from init')

  // Drive the login flow adaptively based on what subtasks X returns
  let subtaskIds = getSubtaskIds(initData)
  const maxSteps = 15 // safety limit

  for (let step = 0; step < maxSteps; step++) {
    console.log(`[x] Step ${step}: subtasks = [${subtaskIds.join(', ')}]`)

    // Success — we're done
    if (subtaskIds.includes('DenyLoginSubtask')) {
      throw new Error('X denied the login')
    }

    if (subtaskIds.includes('LoginSuccessSubtask') || subtaskIds.includes('OpenHomeTimeline')) {
      break
    }

    let input: unknown[] | null = null

    if (subtaskIds.includes('LoginJsInstrumentationSubtask')) {
      input = [{
        subtask_id: 'LoginJsInstrumentationSubtask',
        js_instrumentation: {
          response: JSON.stringify({
            rf: {
              a4fc506d24bb4843c48a1966940c2796bf4fb7617a2d515ad3297b7df6b459b6: 121,
              bff66e16f1d7ea28c04653dc32479cf416a9c8b67c80cb8ad533b2a44fee82a3: -1,
              ac4008077a7e6ca03210159dbe2134dea72a616f03832178314bb9931645e4f7: -22,
              c3a8a81a9b2706c6fec42c771da65a9597c537b8e4d9b39e8e58de9fe31ff239: -12,
            },
            s: 'ZHYaDA9iXRxOl2J3AZ9cc23iJx-Fg5E82KIBA_fgeZFugZGYzRtf8Bl3EUeeYgsK30gLFD2jTQx9fAMsnYCw0j8ahEy4Pb5siM5zD6n7YgOeWmFFaXoTwaGY4H0o-jQnZi5yWZRAnFi4lVuCVouNz_xd2BO2sobCO7QuyOsOxQn2CWx7bjD8vPAzT5BS1mICqUWyjZDjLnRZJU6cSQG5YFIHEPBa8Kj-v1JFgkdAfAMIdVvP7C80HWoOqYivQR7IBuOAI4xCeLQEdxlGeT-JYStlP9dcU5St7jI6ExyMeQnRicOcxXLXsan8i5Joautk2M8dAJFByzBaG4wtrPhQ3QAAAZEi-_t7',
          }),
          link: 'next_link',
        },
      }]
    } else if (subtaskIds.includes('LoginEnterUserIdentifierSSO')) {
      input = [{
        subtask_id: 'LoginEnterUserIdentifierSSO',
        settings_list: {
          setting_responses: [{
            key: 'user_identifier',
            response_data: { text_data: { result: username } },
          }],
          link: 'next_link',
        },
      }]
    } else if (subtaskIds.includes('LoginEnterAlternateIdentifierSubtask')) {
      // X wants alternate identifier (handle/phone) — must differ from primary
      const altId = handle || username
      if (!handle) {
        console.warn('[x] No handle provided for alternate identifier, falling back to username')
      }
      input = [{
        subtask_id: 'LoginEnterAlternateIdentifierSubtask',
        enter_text: { text: altId, link: 'next_link' },
      }]
    } else if (subtaskIds.includes('LoginEnterPassword')) {
      input = [{
        subtask_id: 'LoginEnterPassword',
        enter_password: { password, link: 'next_link' },
      }]
    } else if (subtaskIds.includes('LoginTwoFactorAuthChallenge')) {
      if (!totp) throw new Error('2FA required but no TOTP code provided')
      input = [{
        subtask_id: 'LoginTwoFactorAuthChallenge',
        enter_text: { text: totp, link: 'next_link' },
      }]
    } else if (subtaskIds.includes('AccountDuplicationCheck')) {
      input = [{
        subtask_id: 'AccountDuplicationCheck',
        check_logged_in_account: { link: 'AccountDuplicationCheck_false' },
      }]
    } else if (subtaskIds.includes('LoginAcid')) {
      // Account verification challenge — send email/username
      input = [{
        subtask_id: 'LoginAcid',
        enter_text: { text: username, link: 'next_link' },
      }]
    } else {
      // Unknown subtask — check for error messages
      const cta = (initData.subtasks as any[])?.find((s: any) => s.cta)
      if (cta?.cta?.primary_text?.text) {
        throw new Error(`Login denied: ${cta.cta.primary_text.text}`)
      }
      throw new Error(`Unknown login subtask(s): ${subtaskIds.join(', ')}`)
    }

    const result = await taskRequest(curlBin, flowToken, input, guestToken, jar)
    flowToken = result.flowToken
    subtaskIds = getSubtaskIds(result.data)
  }

  // Extract session from cookies
  const allCookies = jar.getAll()
  const authToken = allCookies.auth_token
  const ct0 = allCookies.ct0
  if (!authToken || !ct0) {
    throw new Error('Failed to extract session cookies (auth_token or ct0 missing)')
  }

  let xId = ''
  const twid = allCookies.twid || ''
  const decoded = decodeURIComponent(twid).replace(/"/g, '')
  const uidMatch = decoded.match(/u=(\d+)/)
  if (uidMatch) xId = uidMatch[1]

  return { authToken, ct0, username, xId }
}
