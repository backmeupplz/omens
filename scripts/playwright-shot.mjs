import { chromium, firefox } from 'playwright-core'

const FALLBACK_EXECUTABLES = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/librewolf',
].filter(Boolean)

async function fileExists(path) {
  try {
    const fs = await import('node:fs/promises')
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

async function resolveExecutable() {
  for (const candidate of FALLBACK_EXECUTABLES) {
    if (await fileExists(candidate)) return candidate
  }
  throw new Error(
    'No browser executable found. Set PLAYWRIGHT_EXECUTABLE_PATH or install chromium/librewolf.',
  )
}

function resolveBrowserType(executablePath) {
  const lower = executablePath.toLowerCase()
  if (lower.includes('librewolf') || lower.includes('firefox')) return firefox
  return chromium
}

const url = process.argv[2]
if (!url) {
  console.error('Usage: pnpm playwright:shot <url> [output.png]')
  process.exit(1)
}

const outputPath = process.argv[3] || '/tmp/playwright-shot.png'
const executablePath = await resolveExecutable()
const browserType = resolveBrowserType(executablePath)

const browser = await browserType.launch({
  executablePath,
  headless: true,
})

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 2200 },
    deviceScaleFactor: 1,
  })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: outputPath, fullPage: true })
  console.log(outputPath)
} finally {
  await browser.close()
}
