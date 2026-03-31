import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface CLIConfig {
  apiUrl: string
  apiKey: string
}

const CONFIG_DIR = join(homedir(), '.config', 'omens')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export function loadConfig(): CLIConfig {
  const defaults: CLIConfig = {
    apiUrl: 'http://localhost:3000',
    apiKey: '',
  }

  if (!existsSync(CONFIG_FILE)) {
    return defaults
  }

  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8')
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

export function saveConfig(config: Partial<CLIConfig>) {
  const current = loadConfig()
  const merged = { ...current, ...config }

  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2) + '\n')
  return merged
}
