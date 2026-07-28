function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const JOURNAL_CONFIG = {
  attachmentDir: requireEnv('JOURNAL_ATTACHMENT_DIR'),
} as const
