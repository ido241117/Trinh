import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { SERVICES_CONFIG } from '../config/services.js'
import type { HealthTarget } from './ops-catalog.js'

const execFileAsync = promisify(execFile)

export type ProbeResult = {
  label: string
  url: string
  online: boolean
  status: number | null
  latencyMs: number | null
  error?: string
}

async function probeProcess(target: HealthTarget): Promise<ProbeResult> {
  const started = Date.now()
  const name = target.processName || target.url.replace(/^process:\/\//i, '')
  const url = target.url || `process://${name}`
  if (!name) {
    return {
      label: target.label,
      url,
      online: false,
      status: null,
      latencyMs: null,
      error: 'missing processName',
    }
  }

  try {
    const { stdout } = await execFileAsync(
      'tasklist',
      ['/FI', `IMAGENAME eq ${name}`, '/NH'],
      { windowsHide: true, timeout: SERVICES_CONFIG.probeTimeoutMs },
    )
    const online = stdout.toLowerCase().includes(name.toLowerCase())
    return {
      label: target.label,
      url,
      online,
      status: online ? 200 : null,
      latencyMs: Date.now() - started,
      error: online ? undefined : `process not running: ${name}`,
    }
  } catch (err) {
    return {
      label: target.label,
      url,
      online: false,
      status: null,
      latencyMs: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function probeCommand(target: HealthTarget): Promise<ProbeResult> {
  const started = Date.now()
  const url = target.url || `command://${target.command || 'unknown'}`
  const bin = target.command?.trim()
  if (!bin) {
    return {
      label: target.label,
      url,
      online: false,
      status: null,
      latencyMs: null,
      error: 'missing command',
    }
  }

  try {
    const { stdout } = await execFileAsync(bin, target.commandArgs || [], {
      windowsHide: true,
      timeout: SERVICES_CONFIG.probeTimeoutMs,
    })
    const text = stdout.toString()
    let online = false
    let detail: string | undefined

    if (target.jsonField) {
      try {
        const data = JSON.parse(text) as Record<string, unknown>
        const value = data[target.jsonField]
        const actual = value == null ? '' : String(value)
        const expected = target.jsonEquals ?? 'Running'
        online = actual === expected
        detail = online ? undefined : `${target.jsonField}=${actual || '(empty)'}`
      } catch (err) {
        return {
          label: target.label,
          url,
          online: false,
          status: null,
          latencyMs: Date.now() - started,
          error: err instanceof Error ? err.message : 'invalid JSON from command',
        }
      }
    } else {
      const expect = target.expect
      online = !expect || text.toLowerCase().includes(expect.toLowerCase())
      detail = online ? undefined : expect ? `missing expect "${expect}"` : 'command empty'
    }

    return {
      label: target.label,
      url,
      online,
      status: online ? 200 : null,
      latencyMs: Date.now() - started,
      error: detail,
    }
  } catch (err) {
    return {
      label: target.label,
      url,
      online: false,
      status: null,
      latencyMs: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function probeUrl(target: HealthTarget): Promise<ProbeResult> {
  if (target.kind === 'process' || /^process:\/\//i.test(target.url)) {
    return probeProcess(target)
  }
  if (target.kind === 'command' || /^command:\/\//i.test(target.url)) {
    return probeCommand(target)
  }

  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SERVICES_CONFIG.probeTimeoutMs)

  try {
    const res = await fetch(target.url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: '*/*' },
    })
    const latencyMs = Date.now() - started
    let body = ''
    try {
      body = await res.text()
    } catch {
      body = ''
    }

    const statusOk = res.status >= 200 && res.status < 500
    const expectOk =
      !target.expect || body.toLowerCase().includes(target.expect.toLowerCase())
    const online = statusOk && expectOk

    return {
      label: target.label,
      url: target.url,
      online,
      status: res.status,
      latencyMs,
      error: online
        ? undefined
        : !statusOk
          ? `HTTP ${res.status}`
          : `missing expect "${target.expect}"`,
    }
  } catch (err) {
    return {
      label: target.label,
      url: target.url,
      online: false,
      status: null,
      latencyMs: null,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function probeAll(targets: HealthTarget[]): Promise<ProbeResult[]> {
  return Promise.all(targets.map(probeUrl))
}
