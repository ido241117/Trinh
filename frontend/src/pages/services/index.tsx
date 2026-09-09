import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Dropdown,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import type { CheckboxChangeEvent } from 'antd/es/checkbox'
import type { ColumnsType } from 'antd/es/table'
import {
  CloudUploadOutlined,
  DownOutlined,
  ExportOutlined,
  FilterOutlined,
  PlayCircleOutlined,
  PoweroffOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type { OpsProbeDTO, OpsServiceDTO } from '../../types'
import {
  checkOpsService,
  checkOpsServices,
  deployOpsService,
  fetchOpsServices,
  startOpsService,
  stopOpsService,
} from '../../api'
import './services.css'

const { Text, Title } = Typography

type RowAction = 'start' | 'stop' | 'deploy' | 'check'
type ServiceGroup = 'apps' | 'infra'

const INFRA_SERVICE_IDS = new Set(['docker-desktop', 'tunnel', 'tailscale'])
const ALL_GROUPS: ServiceGroup[] = ['apps', 'infra']

const GROUP_OPTIONS: {
  key: ServiceGroup
  label: string
  hint: string
}[] = [
  {
    key: 'apps',
    label: 'Apps',
    hint: 'Software Domain, LAN, Map, MOVE, Medic, Sneat, Forgejo…',
  },
  {
    key: 'infra',
    label: 'Infrastructure',
    hint: 'Docker Desktop, Cloudflare Tunnel, Tailscale',
  },
]

function serviceGroup(id: string): ServiceGroup {
  return INFRA_SERVICE_IDS.has(id) ? 'infra' : 'apps'
}

function statusTag(svc: OpsServiceDTO, checking: boolean) {
  if (checking) return <Tag color="processing">Checking…</Tag>
  if (!svc.health.probed) return <Tag>Chưa check</Tag>
  if (svc.health.allOnline) return <Tag color="success">Up</Tag>
  if (svc.health.online) return <Tag color="warning">Partial</Tag>
  return <Tag color="error">Down</Tag>
}

function ProbeBadge({ probe }: { probe: OpsProbeDTO }) {
  const tip = [
    probe.url,
    probe.online && probe.latencyMs != null ? `${probe.latencyMs} ms` : null,
    probe.error || null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Tooltip title={tip}>
      <Badge
        status={probe.online ? 'success' : 'error'}
        text={
          <span>
            {probe.label}
            {probe.online && probe.latencyMs != null ? (
              <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                {probe.latencyMs} ms
              </Text>
            ) : null}
          </span>
        }
      />
    </Tooltip>
  )
}

function measureTableBodyHeight(container: HTMLElement): number {
  const header = container.querySelector('.ant-table-thead')
  const pagination = container.querySelector('.ant-pagination')
  const headerHeight = header?.getBoundingClientRect().height ?? 0
  const paginationHeight = pagination
    ? pagination.getBoundingClientRect().height + 16
    : 0
  return Math.max(120, Math.floor(container.clientHeight - headerHeight - paginationHeight))
}

function sortServices(items: OpsServiceDTO[]): OpsServiceDTO[] {
  const rank = (svc: OpsServiceDTO) => {
    if (!svc.health.probed) return 3
    if (svc.health.allOnline) return 0
    if (svc.health.online) return 1
    return 2
  }
  return [...items].sort((a, b) => {
    const diff = rank(a) - rank(b)
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name, 'vi')
  })
}

export default function ServicesPage() {
  const panelRef = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<OpsServiceDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [checkingAll, setCheckingAll] = useState(false)
  const [rowAction, setRowAction] = useState<Record<string, RowAction>>({})
  const [scrollY, setScrollY] = useState(360)
  const [groups, setGroups] = useState<ServiceGroup[]>(ALL_GROUPS)

  const loadList = useCallback(async () => {
    try {
      setLoading(true)
      setItems(await fetchOpsServices())
    } catch (error) {
      message.error('Không tải được danh sách service')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [])

  const checkAll = useCallback(async () => {
    try {
      setCheckingAll(true)
      setItems(sortServices(await checkOpsServices()))
    } catch (error) {
      message.error('Không check được ports')
      console.error(error)
    } finally {
      setCheckingAll(false)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      await loadList()
      await checkAll()
    })()
  }, [loadList, checkAll])

  useEffect(() => {
    const element = panelRef.current
    if (!element) return

    const updateScrollY = () => {
      setScrollY(measureTableBodyHeight(element))
    }
    updateScrollY()
    const observer = new ResizeObserver(updateScrollY)
    observer.observe(element)
    return () => observer.disconnect()
  }, [items.length, loading, groups])

  const anyBusy = Object.keys(rowAction).length > 0 || checkingAll

  const toggleGroup = useCallback((key: ServiceGroup, checked: boolean) => {
    setGroups(prev => {
      if (checked) {
        return ALL_GROUPS.filter(g => prev.includes(g) || g === key)
      }
      // Keep at least one group so the table never goes blank by accident.
      if (prev.length <= 1 && prev.includes(key)) return prev
      return prev.filter(g => g !== key)
    })
  }, [])

  const patchService = useCallback((next: OpsServiceDTO) => {
    setItems(prev => sortServices(prev.map(s => (s.id === next.id ? next : s))))
  }, [])

  const runCheckOne = useCallback(async (id: string) => {
    setRowAction(prev => ({ ...prev, [id]: 'check' }))
    try {
      const next = await checkOpsService(id)
      patchService(next)
    } catch (error) {
      message.error(`Check ${id} thất bại`)
      console.error(error)
    } finally {
      setRowAction(prev => {
        const copy = { ...prev }
        delete copy[id]
        return copy
      })
    }
  }, [patchService])

  const waitUntilReady = useCallback(async (id: string, timeoutMs = 90_000) => {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      await new Promise(r => setTimeout(r, 2000))
      try {
        const next = await checkOpsService(id)
        patchService(next)
        if (next.health.allOnline) return true
      } catch {
        // keep polling
      }
    }
    return false
  }, [patchService])

  const runAction = useCallback(async (
    id: string,
    action: 'start' | 'stop' | 'deploy',
  ) => {
    setRowAction(prev => ({ ...prev, [id]: action }))
    try {
      if (action === 'start') {
        await startOpsService(id)
        message.info(`Đã Start ${id} — đang chờ port…`)
        const ok = await waitUntilReady(id)
        if (ok) message.success(`${id} đã Up`)
        else message.warning(`${id} chưa sẵn sàng sau Start`)
      } else if (action === 'stop') {
        await stopOpsService(id)
        message.success(`Đã Stop ${id}`)
        const next = await checkOpsService(id)
        patchService(next)
      } else {
        await deployOpsService(id)
        message.info(`Deploy ${id} xong — đang check…`)
        const ok = await waitUntilReady(id)
        if (ok) message.success(`${id} deploy OK`)
        else message.warning(`${id} deploy xong nhưng port chưa Up`)
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : `${action} thất bại`)
      console.error(error)
    } finally {
      setRowAction(prev => {
        const copy = { ...prev }
        delete copy[id]
        return copy
      })
    }
  }, [patchService, waitUntilReady])

  const sorted = useMemo(() => sortServices(items), [items])

  const filtered = useMemo(() => {
    const active = new Set(groups)
    return sorted.filter(svc => active.has(serviceGroup(svc.id)))
  }, [sorted, groups])

  const filterActive = groups.length < ALL_GROUPS.length

  const filterMenu = (
    <div className="ops-services-filter-panel" onClick={e => e.stopPropagation()}>
      <Text type="secondary" className="ops-services-filter-title">
        Hiện nhóm
      </Text>
      <div className="ops-services-filter-list">
        {GROUP_OPTIONS.map(opt => {
          const checked = groups.includes(opt.key)
          const locked = checked && groups.length === 1
          return (
            <label key={opt.key} className="ops-services-filter-item">
              <Checkbox
                checked={checked}
                disabled={locked}
                onChange={(e: CheckboxChangeEvent) => {
                  toggleGroup(opt.key, e.target.checked)
                }}
              />
              <span className="ops-services-filter-copy">
                <Text strong>{opt.label}</Text>
                <Text type="secondary">{opt.hint}</Text>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )

  const columns: ColumnsType<OpsServiceDTO> = useMemo(
    () => [
      {
        title: 'Service',
        key: 'service',
        width: 220,
        render: (_, svc) => (
          <div className="ops-service-cell">
            <Text strong>{svc.name}</Text>
            <Text type="secondary" className="ops-service-id">{svc.id}</Text>
          </div>
        ),
      },
      {
        title: 'Open',
        key: 'open',
        width: 100,
        render: (_, svc) => {
          if (!svc.open) return <Text type="secondary">—</Text>
          return (
            <Tooltip title={svc.open}>
              <Button
                size="small"
                icon={<ExportOutlined />}
                href={svc.open}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
              >
                Open
              </Button>
            </Tooltip>
          )
        },
      },
      {
        title: 'Trạng thái',
        key: 'status',
        width: 130,
        render: (_, svc) => statusTag(svc, rowAction[svc.id] === 'check'),
      },
      {
        title: 'Port / Process',
        key: 'health',
        render: (_, svc) => {
          if (!svc.health.probed) {
            return <Text type="secondary">Bấm dòng để check</Text>
          }
          if (svc.health.probes.length === 0) return <Text type="secondary">—</Text>
          return (
            <Space direction="vertical" size={2}>
              {svc.health.probes.map(p => (
                <ProbeBadge key={`${p.label}:${p.url}`} probe={p} />
              ))}
            </Space>
          )
        },
      },
      {
        title: 'Thao tác',
        key: 'actions',
        width: 260,
        render: (_, svc) => {
          const busy = anyBusy || !!svc.busy
          const action = rowAction[svc.id]
          return (
            <Space size={6} wrap onClick={e => e.stopPropagation()}>
              <Button
                type="primary"
                size="small"
                icon={<PlayCircleOutlined />}
                disabled={busy || !svc.canStart}
                loading={action === 'start'}
                onClick={() => void runAction(svc.id, 'start')}
              >
                Start
              </Button>
              <Button
                size="small"
                icon={<CloudUploadOutlined />}
                disabled={busy || !svc.canDeploy}
                loading={action === 'deploy'}
                onClick={() => void runAction(svc.id, 'deploy')}
              >
                Deploy
              </Button>
              <Button
                danger
                size="small"
                icon={<PoweroffOutlined />}
                disabled={busy || !svc.canStop}
                loading={action === 'stop'}
                onClick={() => void runAction(svc.id, 'stop')}
              >
                Stop
              </Button>
            </Space>
          )
        },
      },
    ],
    [anyBusy, rowAction, runAction],
  )

  return (
    <div className="ops-services-page">
      <div className="ops-services-toolbar">
        <div>
          <Title level={4} style={{ margin: 0 }}>Services</Title>
          <Text type="secondary">
            Ops LAN — check port local · Docker / Cloudflare on/off · Start / Deploy / Stop
          </Text>
        </div>
        <Space size={8} wrap className="ops-services-toolbar-actions">
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            popupRender={() => filterMenu}
          >
            <Button icon={<FilterOutlined />}>
              Filter
              {filterActive ? ` (${groups.length})` : ''}
              <DownOutlined style={{ fontSize: 10, marginLeft: 4 }} />
            </Button>
          </Dropdown>
          <Button
            icon={<ReloadOutlined />}
            loading={checkingAll}
            onClick={() => void checkAll()}
          >
            Check all
          </Button>
        </Space>
      </div>

      <div className="ops-services-panel" ref={panelRef}>
        {loading && items.length === 0 ? (
          <div className="ops-services-spin">
            <Spin tip="Đang tải…" />
          </div>
        ) : (
          <Table<OpsServiceDTO>
            rowKey="id"
            columns={columns}
            dataSource={filtered}
            pagination={false}
            size="middle"
            scroll={{ y: scrollY, x: 980 }}
            loading={checkingAll}
            onRow={svc => ({
              onClick: () => {
                if (anyBusy) return
                void runCheckOne(svc.id)
              },
              className: 'ops-services-row',
            })}
          />
        )}
      </div>
    </div>
  )
}
