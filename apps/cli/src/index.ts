#!/usr/bin/env bun
import { loadConfig, saveConfig } from './config'
import { request } from './api'

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
  console.log(`
omens - Signal from Noise

Usage: omens <command> [options]

Commands:
  feed                    Show your signal feed
  sources                 List configured sources
  sources add             Add a new source
  sources rm <id>         Remove a source
  outputs                 List configured outputs
  llm                     Show LLM configuration
  llm set                 Update LLM configuration
  keys                    List API keys
  keys create <name>      Create a new API key
  keys rm <id>            Delete an API key
  config                  Show current CLI config
  config --api-url <url>  Set the API URL
  config --api-key <key>  Set the API key

Options:
  --help                  Show help
  --json                  Output as JSON
  --source <type>         Filter feed by source type
  --min-score <n>         Filter feed by minimum score
  --limit <n>             Number of items to show (default: 20)
`.trim())
}

async function feedCommand() {
  const source = flag('source') || ''
  const minScore = flag('min-score') || '0'
  const limit = flag('limit') || '20'
  const json = hasFlag('json')

  const params = new URLSearchParams({ limit })
  if (source) params.set('source', source)
  if (Number(minScore) > 0) params.set('minScore', minScore)

  const result = await request<any>(`/feed?${params}`)

  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (result.data.length === 0) {
    console.log('No signals yet. Add sources to get started.')
    return
  }

  for (const entry of result.data) {
    const score = String(entry.signal.score).padStart(3)
    const type = entry.source.type.padEnd(7)
    const title = entry.item.title.slice(0, 60)
    const tags = entry.signal.tags.join(', ')
    console.log(`[${score}] ${type} ${title}`)
    console.log(`       ${entry.signal.summary}`)
    if (tags) console.log(`       Tags: ${tags}`)
    console.log(`       ${entry.item.url}`)
    console.log()
  }

  console.log(
    `Showing ${result.data.length} of ${result.pagination.total} signals`,
  )
}

async function sourcesCommand() {
  const sub = args[1]

  if (sub === 'add') {
    const type = flag('type')
    const configStr = flag('config')
    const interval = flag('interval')

    if (!type || !configStr) {
      console.error(
        'Usage: omens sources add --type <reddit|twitter|rss> --config \'{"subreddits":["tech"]}\'',
      )
      process.exit(1)
    }

    const result = await request('/sources', {
      method: 'POST',
      body: JSON.stringify({
        type,
        config: JSON.parse(configStr),
        ...(interval && { pollIntervalMinutes: Number(interval) }),
      }),
    })
    console.log('Source created:', JSON.stringify(result, null, 2))
    return
  }

  if (sub === 'rm') {
    const id = args[2]
    if (!id) {
      console.error('Usage: omens sources rm <id>')
      process.exit(1)
    }
    await request(`/sources/${id}`, { method: 'DELETE' })
    console.log('Source deleted.')
    return
  }

  const sources = await request<any[]>('/sources')
  if (hasFlag('json')) {
    console.log(JSON.stringify(sources, null, 2))
    return
  }

  if (sources.length === 0) {
    console.log('No sources configured.')
    return
  }

  for (const s of sources) {
    const status = s.enabled ? 'ON ' : 'OFF'
    console.log(
      `[${status}] ${s.type.padEnd(7)} ${s.id}  ${JSON.stringify(s.config)}`,
    )
  }
}

async function outputsCommand() {
  const outputs = await request<any[]>('/outputs')
  if (hasFlag('json')) {
    console.log(JSON.stringify(outputs, null, 2))
    return
  }
  for (const o of outputs) {
    const status = o.enabled ? 'ON ' : 'OFF'
    console.log(`[${status}] ${o.type.padEnd(10)} ${o.id}`)
  }
}

async function llmCommand() {
  const sub = args[1]

  if (sub === 'set') {
    const body: Record<string, unknown> = {}
    const provider = flag('provider')
    const model = flag('model')
    const apiKey = flag('api-key')
    const baseUrl = flag('base-url')

    if (provider) body.provider = provider
    if (model) body.model = model
    if (apiKey) body.apiKey = apiKey
    if (baseUrl) body.baseUrl = baseUrl

    if (Object.keys(body).length === 0) {
      console.error(
        'Usage: omens llm set --provider fireworks --model accounts/fireworks/models/kimi-k2p5 --api-key <key>',
      )
      process.exit(1)
    }

    const result = await request('/llm/config', {
      method: 'PUT',
      body: JSON.stringify(body),
    })
    console.log('LLM config updated:', JSON.stringify(result, null, 2))
    return
  }

  if (sub === 'providers') {
    const providers = await request('/llm/providers')
    console.log(JSON.stringify(providers, null, 2))
    return
  }

  const config = await request('/llm/config')
  console.log(JSON.stringify(config, null, 2))
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
    case 'sources':
      return sourcesCommand()
    case 'outputs':
      return outputsCommand()
    case 'llm':
      return llmCommand()
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
