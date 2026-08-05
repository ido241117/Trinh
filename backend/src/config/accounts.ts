function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const ACCOUNTS_CONFIG = {
  logoDir: requireEnv('ACCOUNTS_LOGO_DIR'),
} as const
