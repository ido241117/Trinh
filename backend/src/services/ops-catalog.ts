import path from 'node:path'
import { SERVICES_CONFIG } from '../config/services.js'

export type HealthTarget = {
  label: string
  url: string
  expect?: string
  kind?: 'http' | 'process'
  processName?: string
}

export type ServiceOpen = {
  lanPort?: number
  lanPath?: string
}

export type ServiceDef = {
  id: string
  name: string
  description: string
  startScript?: string
  stopScript?: string
  deployScript?: string
  startArgs?: string[]
  stopArgs?: string[]
  deployArgs?: string[]
  canStart?: boolean
  canStop?: boolean
  canDeploy?: boolean
  health: HealthTarget[]
  open?: ServiceOpen
}

function abs(rel: string): string {
  return path.join(SERVICES_CONFIG.root, rel)
}

export function resolveOpenUrl(open?: ServiceOpen): string | null {
  if (open?.lanPort == null) return null
  return `http://${SERVICES_CONFIG.lanHost}:${open.lanPort}${open.lanPath || '/'}`
}

/** LAN-only catalog (ops as-is). No domain HTTPS probes. Tunnel = process on/off. */
export const SERVICES: ServiceDef[] = [
  {
    id: 'tunnel',
    name: 'Cloudflare Tunnel',
    description: 'Shared cloudflared (banhang-api) — on/off theo process',
    startScript: 'tunnel\\deploy\\start.vbs',
    stopScript: 'tunnel\\deploy\\stop.bat',
    startArgs: ['/silent'],
    canDeploy: false,
    health: [
      {
        label: 'cloudflared',
        url: 'process://cloudflared.exe',
        kind: 'process',
        processName: 'cloudflared.exe',
      },
    ],
  },
  {
    id: 'software-domain',
    name: 'Software Domain',
    description: 'software_domain :2412 (ensure tunnel khi start; auth local)',
    startScript: 'software_domain\\deploy\\start.vbs',
    stopScript: 'software_domain\\deploy\\stop.bat',
    deployScript: 'software_domain\\deploy\\deploy.bat',
    startArgs: ['/silent'],
    deployArgs: ['nopause'],
    health: [
      { label: 'local', url: 'http://127.0.0.1:2412/health', expect: 'status' },
    ],
    open: { lanPort: 2412 },
  },
  {
    id: 'software-lan',
    name: 'Software LAN',
    description: 'MusicPlayer LAN :2411 — auto-start',
    startScript: 'Software_lan\\deploy\\start.vbs',
    stopScript: 'Software_lan\\deploy\\stop.bat',
    deployScript: 'Software_lan\\deploy\\deploy.bat',
    startArgs: ['/silent'],
    deployArgs: ['nopause'],
    health: [
      { label: 'local', url: 'http://127.0.0.1:2411/health', expect: 'status' },
    ],
    open: { lanPort: 2411 },
  },
  {
    id: 'map',
    name: 'Map',
    description: 'Nest :2510 + Docker PostGIS/ES',
    startScript: 'map\\deploy\\start.vbs',
    stopScript: 'map\\deploy\\stop.bat',
    deployScript: 'map\\deploy\\deploy.bat',
    startArgs: ['/silent'],
    stopArgs: ['docker'],
    deployArgs: ['nopause'],
    health: [
      { label: 'local', url: 'http://127.0.0.1:2510/api/health', expect: 'ok' },
    ],
    open: { lanPort: 2510 },
  },
  {
    id: 'move',
    name: 'MOVE',
    description: 'Nest :2610 + PostgreSQL local :5432',
    startScript: 'MOVE\\deploy\\start.vbs',
    stopScript: 'MOVE\\deploy\\stop.bat',
    deployScript: 'MOVE\\deploy\\deploy.bat',
    startArgs: ['/silent'],
    stopArgs: ['all'],
    deployArgs: ['nopause'],
    health: [
      { label: 'local', url: 'http://127.0.0.1:2610/api/health', expect: 'ok' },
    ],
    open: { lanPort: 2610 },
  },
  {
    id: 'medic',
    name: 'Medic (SMAR)',
    description: 'GraphQL :2711 + Next FE :2710',
    startScript: 'Medic\\deploy\\start.vbs',
    stopScript: 'Medic\\deploy\\stop.bat',
    deployScript: 'Medic\\deploy\\deploy.bat',
    startArgs: ['/silent'],
    stopArgs: ['docker'],
    deployArgs: ['nopause'],
    health: [
      { label: 'FE', url: 'http://127.0.0.1:2710' },
      { label: 'GraphQL', url: 'http://127.0.0.1:2711/graphql' },
    ],
    open: { lanPort: 2710 },
  },
  {
    id: 'sneat',
    name: 'Sneat',
    description: 'FE-SMAR/sample Next :2810',
    startScript: 'Medic\\FE-SMAR\\sample\\deploy\\start.vbs',
    stopScript: 'Medic\\FE-SMAR\\sample\\deploy\\stop.bat',
    deployScript: 'Medic\\FE-SMAR\\sample\\deploy\\deploy.bat',
    startArgs: ['/silent'],
    deployArgs: ['nopause'],
    health: [
      { label: 'local', url: 'http://127.0.0.1:2810' },
    ],
    open: { lanPort: 2810 },
  },
  {
    id: 'forgejo',
    name: 'Forgejo',
    description: 'Git forge Docker :3010',
    startScript: 'forgejo\\deploy\\start.vbs',
    stopScript: 'forgejo\\deploy\\stop.bat',
    startArgs: ['/silent'],
    canDeploy: false,
    health: [
      { label: 'local', url: 'http://127.0.0.1:3010/' },
    ],
    open: { lanPort: 3010 },
  },
]

export function getService(id: string): ServiceDef | undefined {
  return SERVICES.find(s => s.id === id)
}

export function serviceCanStart(svc: ServiceDef): boolean {
  if (svc.canStart === false) return false
  return Boolean(svc.startScript)
}

export function serviceCanStop(svc: ServiceDef): boolean {
  if (svc.canStop === false) return false
  return Boolean(svc.stopScript)
}

export function serviceCanDeploy(svc: ServiceDef): boolean {
  if (svc.canDeploy === false) return false
  return Boolean(svc.deployScript)
}

export function resolveScripts(svc: ServiceDef) {
  return {
    start: svc.startScript ? abs(svc.startScript) : null,
    stop: svc.stopScript ? abs(svc.stopScript) : null,
    deploy: svc.deployScript ? abs(svc.deployScript) : null,
  }
}
