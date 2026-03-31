#!/usr/bin/env bun
import { request } from './api'
import { loadConfig, saveConfig } from './config'

const args = process.argv.slice(2)
const command = args[0]

function flag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  if (idx === -1) return undefined
  return args[idx + 1]
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`)
}

function printHelp() {
  console.log(
    `
omens - Signal from Noise

Usage: omens <command> [options]

Commands:
  feed                    Show your tweet feed
  keys                    List API keys
  keys create <name>      Create a new API key
  keys rm <id>            Delete an API key
  config                  Show current CLI config
  config --api-url <url>  Set the API URL
  config --api-key <key>  Set the API key

Options:
  --help                  Show help
  --json                  Output as JSON
  --limit <n>             Number of items to show (default: 50)
`.trim(),
  )
}

async function feedCommand() {
  const limit = flag('limit') || '50'
  const json = hasFlag('json')

  const result = await request<any>(`/feed?limit=${limit}`)

  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (result.data.length === 0) {
    console.log('No tweets yet. Connect your Twitter account to get started.')
    return
  }

  for (const tweet of result.data) {
    console.log(`@${tweet.authorHandle} (${tweet.authorName})`)
    console.log(`  ${tweet.content.slice(0, 200)}`)
    console.log(`  ${tweet.url}`)
    console.log()
  }

  console.log(
    `Showing ${result.data.length} of ${result.pagination.total} tweets`,
  )
}

async function keysCommand() {
  const sub = args[1]

  if (sub === 'create') {
    const name = args[2] || flag('name')
    if (!name) {
      console.error('Usage: omens keys create <name>')
      process.exit(1)
    }
    const result = await request<any>('/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    console.log(`API key created: ${result.key}`)
    console.log('Save this key — it will not be shown again.')
    return
  }

  if (sub === 'rm') {
    const id = args[2]
    if (!id) {
      console.error('Usage: omens keys rm <id>')
      process.exit(1)
    }
    await request(`/api-keys/${id}`, { method: 'DELETE' })
    console.log('API key deleted.')
    return
  }

  const keys = await request<any[]>('/api-keys')
  if (hasFlag('json')) {
    console.log(JSON.stringify(keys, null, 2))
    return
  }

  if (keys.length === 0) {
    console.log('No API keys.')
    return
  }

  for (const k of keys) {
    const used = k.lastUsedAt
      ? `Last used: ${new Date(k.lastUsedAt).toLocaleDateString()}`
      : 'Never used'
    console.log(`${k.prefix}...  ${k.name.padEnd(20)} ${used}`)
  }
}

function configCommand() {
  const apiUrl = flag('api-url')
  const apiKey = flag('api-key')

  if (apiUrl || apiKey) {
    const updated = saveConfig({
      ...(apiUrl && { apiUrl }),
      ...(apiKey && { apiKey }),
    })
    console.log('Config saved:', JSON.stringify(updated, null, 2))
    return
  }

  const config = loadConfig()
  console.log(
    JSON.stringify(
      { ...config, apiKey: config.apiKey ? '***' : '(not set)' },
      null,
      2,
    ),
  )
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  switch (command) {
    case 'feed':
      return feedCommand()
    case 'keys':
      return keysCommand()
    case 'config':
      return configCommand()
    default:
      console.error(`Unknown command: ${command}`)
      printHelp()
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
