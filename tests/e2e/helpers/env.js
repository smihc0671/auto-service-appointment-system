import fs from 'node:fs'
import path from 'node:path'

export function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const result = {}

  fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return

    const index = trimmed.indexOf('=')
    if (index <= 0) return

    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    result[key] = value
  })

  return result
}

const fileValues = parseEnvFile(path.resolve(process.cwd(), '.env.e2e.local'))

export function e2eEnv(name, fallback = '') {
  return process.env[name] ?? fileValues[name] ?? fallback
}
