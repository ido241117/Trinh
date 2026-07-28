function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function requireEnvEither(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  throw new Error(`Missing required environment variable: ${names.join(' or ')}`)
}

export const MUSIC_CONFIG = {
  folder: requireEnv('MUSIC_FOLDER'),
  coverDir: requireEnvEither('IMG_FOLDER', 'IMG_DIR'),
} as const
