import { Router } from 'express'
import {
  SERVICES,
  getService,
  resolveOpenUrl,
  serviceCanDeploy,
  serviceCanStart,
  serviceCanStop,
} from '../services/ops-catalog.js'
import { probeAll } from '../services/ops-probe.js'
import { isBusy, runServiceAction, type ActionKind } from '../services/ops-lifecycle.js'

function summarize(
  svc: (typeof SERVICES)[number],
  probes: Awaited<ReturnType<typeof probeAll>> | null,
) {
  const probed = probes != null
  const onlineCount = probed ? probes.filter(p => p.online).length : 0
  return {
    id: svc.id,
    name: svc.name,
    description: svc.description,
    canStart: serviceCanStart(svc),
    canStop: serviceCanStop(svc),
    canDeploy: serviceCanDeploy(svc),
    busy: isBusy(svc.id) || null,
    open: resolveOpenUrl(svc.open),
    health: {
      probed,
      online: probed && onlineCount > 0,
      allOnline: probed && onlineCount === probes!.length && probes!.length > 0,
      probes: probes ?? [],
    },
  }
}

function actionStatus(result: Awaited<ReturnType<typeof runServiceAction>>) {
  if (result.ok) return 200
  if (result.error?.includes('Unknown')) return 404
  if (result.error?.includes('not allowed')) return 403
  return 409
}

export function createServicesRouter() {
  const router = Router()

  /** List catalog (no probe). Probe only when client asks via /:id or /check. */
  router.get('/', (_req, res) => {
    const items = SERVICES.map(svc => summarize(svc, null))
    res.json({ services: items })
  })

  /** Probe all local ports / CF process. */
  router.post('/check', async (_req, res) => {
    const items = await Promise.all(
      SERVICES.map(async svc => summarize(svc, await probeAll(svc.health))),
    )
    res.json({ services: items })
  })

  router.get('/:id', async (req, res) => {
    const svc = getService(req.params.id)
    if (!svc) {
      res.status(404).json({ error: 'Service not found' })
      return
    }
    const probes = await probeAll(svc.health)
    res.json({
      ...summarize(svc, probes),
      scripts: {
        start: svc.startScript || null,
        stop: svc.stopScript || null,
        deploy: svc.deployScript || null,
      },
    })
  })

  router.post('/:id/check', async (req, res) => {
    const svc = getService(req.params.id)
    if (!svc) {
      res.status(404).json({ error: 'Service not found' })
      return
    }
    const probes = await probeAll(svc.health)
    res.json(summarize(svc, probes))
  })

  async function handleAction(
    req: { params: { id: string } },
    res: { status: (code: number) => { json: (body: unknown) => void } },
    action: ActionKind,
  ) {
    const result = await runServiceAction(req.params.id, action)
    res.status(actionStatus(result)).json(result)
  }

  router.post('/:id/start', async (req, res) => {
    await handleAction(req, res, 'start')
  })

  router.post('/:id/stop', async (req, res) => {
    await handleAction(req, res, 'stop')
  })

  router.post('/:id/deploy', async (req, res) => {
    await handleAction(req, res, 'deploy')
  })

  return router
}
