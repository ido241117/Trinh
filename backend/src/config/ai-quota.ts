function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const AI_QUOTA_CONFIG = {
  iconDir: requireEnv('AI_QUOTA_ICON_DIR'),
} as const
