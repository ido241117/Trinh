import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const softwareLanRoot = path.resolve(here, '../../..')
const defaultRoot = path.resolve(softwareLanRoot, '..')

/** PhanLeThien platform root — deploy scripts are relative to this. */
function resolvePlatformRoot(): string {
  const fromEnv = process.env.PLATFORM_ROOT?.trim() || process.env.ROOT?.trim()
  if (fromEnv) {
    const resolved = path.resolve(fromEnv)
    if (path.resolve(resolved) === path.resolve(softwareLanRoot)) {
      return defaultRoot
    }
    return resolved
  }
  return defaultRoot
}

export const SERVICES_CONFIG = {
  root: resolvePlatformRoot(),
  probeTimeoutMs: Number(process.env.PROBE_TIMEOUT_MS || 4000),
  lanHost: (process.env.LAN_HOST || '100.110.119.68').trim(),
}
