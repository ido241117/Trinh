import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  getService,
  resolveScripts,
  serviceCanDeploy,
  serviceCanStart,
  serviceCanStop,
  type ServiceDef,
} from './ops-catalog.js'

export type ActionKind = 'start' | 'stop' | 'deploy'

export type ActionResult = {
  ok: boolean
  id: string
  action: ActionKind
  command: string
  stdout: string
  stderr: string
  exitCode: number | null
  async?: boolean
  error?: string
}

const busy = new Map<string, ActionKind>()

export function isBusy(id: string): ActionKind | undefined {
  return busy.get(id)
}

function spawnEnv(): NodeJS.ProcessEnv {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const extras = [
    'C:\\Program Files\\nodejs',
    path.join(home, '.dotnet'),
    'C:\\Program Files\\Docker\\Docker\\resources\\bin',
    path.join(
      process.env.LOCALAPPDATA || '',
      'Programs\\DockerDesktop\\resources\\bin',
    ),
    'C:\\Program Files\\Git\\cmd',
    'C:\\Program Files\\Git\\bin',
  ].filter(p => p && existsSync(p))

  const pathKey = process.env.Path ? 'Path' : 'PATH'
  const current = process.env[pathKey] || process.env.PATH || ''
  const parts = current.split(';').filter(Boolean)
  for (const extra of extras.reverse()) {
    if (!parts.some(p => p.toLowerCase() === extra.toLowerCase())) {
      parts.unshift(extra)
    }
  }
  const merged = parts.join(';')
  return {
    ...process.env,
    [pathKey]: merged,
    PATH: merged,
    DOTNET_ROOT: process.env.DOTNET_ROOT || path.join(home, '.dotnet'),
  }
}

function runWait(command: string, args: string[], cwd: string): Promise<{
  stdout: string
  stderr: string
  exitCode: number | null
}> {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
      env: spawnEnv(),
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', err => {
      stderr += err.message
      resolve({ stdout, stderr, exitCode: 1 })
    })
    child.on('close', code => {
      resolve({ stdout, stderr, exitCode: code })
    })
  })
}

function runDetached(command: string, args: string[], cwd: string): { error?: string } {
  try {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
      env: spawnEnv(),
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

function buildCommand(
  scriptPath: string,
  extraArgs: string[],
): { command: string; args: string[]; display: string; cwd: string } | { error: string } {
  const ext = path.extname(scriptPath).toLowerCase()
  const cwd = path.dirname(scriptPath)

  if (ext === '.vbs') {
    const command = 'wscript.exe'
    const args = ['//B', scriptPath, ...extraArgs]
    return {
      command,
      args,
      cwd,
      display: `wscript //B "${scriptPath}" ${extraArgs.join(' ')}`.trim(),
    }
  }
  if (ext === '.bat' || ext === '.cmd') {
    const command = 'cmd.exe'
    const args = ['/d', '/c', scriptPath, ...extraArgs]
    return {
      command,
      args,
      cwd,
      display: `cmd /d /c "${scriptPath}" ${extraArgs.join(' ')}`.trim(),
    }
  }
  return { error: `Unsupported script type: ${ext}` }
}

function scriptForAction(svc: ServiceDef, action: ActionKind) {
  const scripts = resolveScripts(svc)
  if (action === 'start') {
    return { path: scripts.start, args: svc.startArgs || [] }
  }
  if (action === 'stop') {
    return { path: scripts.stop, args: svc.stopArgs || [] }
  }
  return { path: scripts.deploy, args: svc.deployArgs || [] }
}

async function runScript(svc: ServiceDef, action: ActionKind): Promise<ActionResult> {
  const { path: scriptPath, args: extraArgs } = scriptForAction(svc, action)

  if (!scriptPath) {
    return {
      ok: false,
      id: svc.id,
      action,
      command: '',
      stdout: '',
      stderr: '',
      exitCode: null,
      error: `No ${action} script for ${svc.id}`,
    }
  }

  if (!existsSync(scriptPath)) {
    return {
      ok: false,
      id: svc.id,
      action,
      command: scriptPath,
      stdout: '',
      stderr: '',
      exitCode: null,
      error: `Script not found: ${scriptPath}`,
    }
  }

  const built = buildCommand(scriptPath, extraArgs)
  if ('error' in built) {
    return {
      ok: false,
      id: svc.id,
      action,
      command: scriptPath,
      stdout: '',
      stderr: '',
      exitCode: null,
      error: built.error,
    }
  }

  // Start always detached. Host Manager self-deploy also detached so the bat
  // survives when stop.bat kills Node mid-restart.
  const detach =
    action === 'start' || (action === 'deploy' && svc.id === 'host-manager')

  if (detach) {
    const launched = runDetached(built.command, built.args, built.cwd)
    if (launched.error) {
      return {
        ok: false,
        id: svc.id,
        action,
        command: built.display,
        stdout: '',
        stderr: launched.error,
        exitCode: 1,
        error: launched.error,
      }
    }
    return {
      ok: true,
      id: svc.id,
      action,
      command: built.display,
      stdout:
        action === 'deploy'
          ? 'Host Manager deploy launched async — poll health after rebuild'
          : 'Launched async — poll health for status',
      stderr: '',
      exitCode: 0,
      async: true,
    }
  }

  const result = await runWait(built.command, built.args, built.cwd)
  return {
    ok: result.exitCode === 0,
    id: svc.id,
    action,
    command: built.display,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    exitCode: result.exitCode,
    error: result.exitCode === 0 ? undefined : `exit ${result.exitCode}`,
  }
}

export async function runServiceAction(
  id: string,
  action: ActionKind,
): Promise<ActionResult> {
  const svc = getService(id)
  if (!svc) {
    return {
      ok: false,
      id,
      action,
      command: '',
      stdout: '',
      stderr: '',
      exitCode: null,
      error: `Unknown service: ${id}`,
    }
  }

  if (action === 'start' && !serviceCanStart(svc)) {
    return {
      ok: false,
      id,
      action,
      command: '',
      stdout: '',
      stderr: '',
      exitCode: null,
      error: `Start not allowed for ${id} (pinned / always-on)`,
    }
  }
  if (action === 'stop' && !serviceCanStop(svc)) {
    return {
      ok: false,
      id,
      action,
      command: '',
      stdout: '',
      stderr: '',
      exitCode: null,
      error: `Stop not allowed for ${id} (pinned / always-on)`,
    }
  }
  if (action === 'deploy' && !serviceCanDeploy(svc)) {
    return {
      ok: false,
      id,
      action,
      command: '',
      stdout: '',
      stderr: '',
      exitCode: null,
      error: `Deploy not allowed for ${id}`,
    }
  }

  if (busy.has(id)) {
    return {
      ok: false,
      id,
      action,
      command: '',
      stdout: '',
      stderr: '',
      exitCode: null,
      error: `Service busy (${busy.get(id)})`,
    }
  }

  busy.set(id, action)
  try {
    return await runScript(svc, action)
  } finally {
    busy.delete(id)
  }
}
