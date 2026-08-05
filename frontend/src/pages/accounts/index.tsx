import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Empty,
  Image,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Typography,
  message,
} from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { FilterValue, SorterResult } from 'antd/es/table/interface'
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import type { AccountDTO } from '../../types'
import { createAccount, deleteAccount, fetchAccounts, updateAccount } from '../../api'
import { AccountFormModal, type AccountFormValues } from './AccountFormModal'
import './accounts.css'

type LogoFilter = 'all' | 'with' | 'without'

function measureTableBodyHeight(container: HTMLElement): number {
  const header = container.querySelector('.ant-table-thead')
  const pagination = container.querySelector('.ant-pagination')
  const headerHeight = header?.getBoundingClientRect().height ?? 0
  const paginationHeight = pagination
    ? pagination.getBoundingClientRect().height + 16
    : 56
  return Math.max(120, Math.floor(container.clientHeight - headerHeight - paginationHeight))
}

export default function AccountsPage() {
  const panelRef = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<AccountDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [logoFilter, setLogoFilter] = useState<LogoFilter>('all')
  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState<AccountDTO | null>(null)
  const [scrollY, setScrollY] = useState(360)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setItems(await fetchAccounts())
    } catch (error) {
      message.error('Không tải được danh sách tài khoản')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(item => {
      if (logoFilter === 'with' && !item.logoUrl) return false
      if (logoFilter === 'without' && item.logoUrl) return false
      if (!q) return true
      return (
        item.name.toLowerCase().includes(q) ||
        item.account.toLowerCase().includes(q) ||
        item.password.toLowerCase().includes(q)
      )
    })
  }, [items, search, logoFilter])

  useEffect(() => {
    const element = panelRef.current
    if (!element) return

    const updateScrollY = () => {
      setScrollY(measureTableBodyHeight(element))
    }

    const observer = new ResizeObserver(updateScrollY)
    observer.observe(element)

    const header = element.querySelector('.ant-table-thead')
    if (header) observer.observe(header)
    const pagination = element.querySelector('.ant-pagination')
    if (pagination) observer.observe(pagination)

    updateScrollY()
    window.addEventListener('resize', updateScrollY)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScrollY)
    }
  }, [loading, filtered.length])

  function handleAdd() {
    setEditing(null)
    setModalVisible(true)
  }

  function handleEdit(row: AccountDTO) {
    setEditing(row)
    setModalVisible(true)
  }

  async function handleDelete(id: string) {
    try {
      await deleteAccount(id)
      message.success('Đã xóa')
      load()
    } catch (error) {
      message.error('Xóa thất bại')
      console.error(error)
    }
  }

  async function handleSubmit(data: AccountFormValues) {
    try {
      if (editing) {
        await updateAccount(editing.id, data)
        message.success('Đã cập nhật')
      } else {
        await createAccount(data)
        message.success('Đã thêm')
      }
      setModalVisible(false)
      load()
    } catch (error) {
      message.error(editing ? 'Cập nhật thất bại' : 'Thêm thất bại')
      console.error(error)
      throw error
    }
  }

  const columns: ColumnsType<AccountDTO> = [
    {
      title: 'Logo',
      dataIndex: 'logoUrl',
      key: 'logo',
      width: 88,
      filters: [
        { text: 'Có logo', value: 'with' },
        { text: 'Không logo', value: 'without' },
      ],
      filteredValue: logoFilter === 'all' ? null : [logoFilter],
      filterMultiple: false,
      render: (url: string | null, row) =>
        url ? (
          <Image
            src={url}
            alt={row.name}
            width={48}
            height={48}
            className="accounts-logo"
            preview={{ src: url }}
          />
        ) : (
          <div className="accounts-logo-placeholder">—</div>
        ),
    },
    {
      title: 'Tên gọi',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name, 'vi'),
      defaultSortOrder: 'ascend',
      ellipsis: true,
    },
    {
      title: 'Tài khoản',
      dataIndex: 'account',
      key: 'account',
      sorter: (a, b) => a.account.localeCompare(b.account, 'vi'),
      ellipsis: true,
    },
    {
      title: 'Mật khẩu',
      dataIndex: 'password',
      key: 'password',
      sorter: (a, b) => a.password.localeCompare(b.password, 'vi'),
      ellipsis: true,
      render: (text: string) => (
        <Typography.Text copyable className="accounts-password">
          {text}
        </Typography.Text>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 96,
      fixed: 'right',
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button
            type="text"
            shape="circle"
            icon={<EditOutlined />}
            onClick={() => handleEdit(row)}
            aria-label={`Sửa ${row.name}`}
          />
          <Popconfirm
            title="Xóa tài khoản này?"
            onConfirm={() => handleDelete(row.id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Button danger type="text" shape="circle" icon={<DeleteOutlined />} aria-label={`Xóa ${row.name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  function handleTableChange(
    _pagination: TablePaginationConfig,
    filters: Record<string, FilterValue | null>,
    _sorter: SorterResult<AccountDTO> | SorterResult<AccountDTO>[],
  ) {
    const logoValues = filters.logo
    if (!logoValues || logoValues.length === 0) {
      setLogoFilter('all')
      return
    }
    const value = String(logoValues[0])
    setLogoFilter(value === 'with' || value === 'without' ? value : 'all')
  }

  return (
    <section className="accounts-page" role="main">
      <div className="accounts-toolbar">
        <div className="accounts-toolbar-left">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm tên, tài khoản, mật khẩu…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="accounts-search"
          />
          <Select
            value={logoFilter}
            onChange={setLogoFilter}
            className="accounts-filter"
            options={[
              { value: 'all', label: 'Tất cả logo' },
              { value: 'with', label: 'Có logo' },
              { value: 'without', label: 'Không logo' },
            ]}
          />
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          Thêm
        </Button>
      </div>

      <div className="accounts-panel" ref={panelRef}>
        {loading && items.length === 0 ? (
          <div className="accounts-loading">
            <Spin size="large" />
          </div>
        ) : (
          <Table<AccountDTO>
            rowKey="id"
            columns={columns}
            dataSource={filtered}
            loading={loading}
            size="middle"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: total => `${total} dòng`,
            }}
            onChange={handleTableChange}
            locale={{
              emptyText: (
                <Empty description={search || logoFilter !== 'all' ? 'Không có kết quả' : 'Chưa có tài khoản'}>
                  {!search && logoFilter === 'all' && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                      Thêm tài khoản đầu tiên
                    </Button>
                  )}
                </Empty>
              ),
            }}
            scroll={{ x: 720, y: scrollY }}
          />
        )}
      </div>

      <AccountFormModal
        visible={modalVisible}
        account={editing}
        onCancel={() => setModalVisible(false)}
        onSubmit={handleSubmit}
      />
    </section>
  )
}
