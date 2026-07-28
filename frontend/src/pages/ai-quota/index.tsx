import { useState, useEffect, useCallback } from 'react'
import { Button, List, Popconfirm, message, Empty, Spin, Progress, Typography, Space, Switch } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { AiQuotaServiceDTO, CycleRule } from '../../types'
import {
  fetchAiQuotaServices,
  createAiQuotaService,
  updateAiQuotaService,
  deleteAiQuotaService,
  toggleAiQuotaServiceExhausted,
} from '../../api'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { AiQuotaFormModal } from './AiQuotaFormModal'
import { AiQuotaServiceCard } from './AiQuotaServiceCard'
import './ai-quota.css'

function formatCycleRuleText(rule: CycleRule): string {
  if (rule.type === 'duration') {
    return `Reset mỗi ${rule.value} ngày`
  }
  if (rule.type === 'monthly-day') {
    return `Reset vào ngày ${rule.dayOfMonth} hàng tháng`
  }
  if (rule.type === 'weekly-day') {
    const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
    return `Reset vào sáng ${dayNames[rule.dayOfWeek]} hàng tuần`
  }
  if (rule.type === 'date-range') {
    const formatDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split('-')
      return `${day}/${month}/${year}`
    }
    return `Từ ${formatDate(rule.startDate)} đến ${formatDate(rule.endDate)}`
  }
  return ''
}

function getProgressColor(percent: number): string {
  if (percent < 20) return '#52c41a'
  if (percent < 50) return '#1890ff'
  if (percent < 80) return '#faad14'
  return '#ff4d4f'
}

export function AiQuotaPage() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [services, setServices] = useState<AiQuotaServiceDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingService, setEditingService] = useState<AiQuotaServiceDTO | null>(null)

  const loadServices = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchAiQuotaServices()
      const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name))
      setServices(sorted)
    } catch (error) {
      message.error('Failed to load AI quota services')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadServices()
  }, [loadServices])

  const handleAdd = () => {
    setEditingService(null)
    setModalVisible(true)
  }

  const handleEdit = (service: AiQuotaServiceDTO) => {
    setEditingService(service)
    setModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteAiQuotaService(id)
      message.success('Xóa dịch vụ thành công')
      loadServices()
    } catch (error) {
      message.error('Failed to delete service')
      console.error(error)
    }
  }

  const handleToggleServiceExhausted = async (id: string, exhausted: boolean) => {
    try {
      const updated = await toggleAiQuotaServiceExhausted(id, exhausted)
      setServices(prev => prev.map(s => s.id === id ? updated : s))
      message.success(exhausted ? 'Đánh dấu quota đã hết' : 'Đánh dấu quota còn lại')
    } catch (error) {
      message.error('Failed to update exhausted status')
      console.error(error)
    }
  }

  const handleSubmit = async (data: { name: string; cycleRule: CycleRule; icon?: File }) => {
    try {
      if (editingService) {
        await updateAiQuotaService(editingService.id, data)
        message.success('Cập nhật dịch vụ thành công')
      } else {
        await createAiQuotaService(data)
        message.success('Thêm dịch vụ thành công')
      }
      setModalVisible(false)
      loadServices()
    } catch (error) {
      message.error(editingService ? 'Failed to update service' : 'Failed to create service')
      console.error(error)
      throw error
    }
  }

  if (loading && services.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <section className="ai-quota-page" role="main">
      <header className="ai-quota-header">
        <div>
          <Typography.Title level={3} className="ai-quota-title">
            AI QUOTA TRACKER
          </Typography.Title>
          <Typography.Text type="secondary">{services.length} dịch vụ</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          Thêm dịch vụ
        </Button>
      </header>

      <div className="ai-quota-panel">
        {loading ? (
          <div className="ai-quota-loading">
            <Spin />
          </div>
        ) : services.length === 0 ? (
          <Empty
            description="Chưa có dịch vụ nào"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              Thêm dịch vụ đầu tiên
            </Button>
          </Empty>
        ) : isMobile ? (
          <div className="ai-quota-card-list">
            {services.map(service => (
              <AiQuotaServiceCard
                key={service.id}
                service={service}
                cycleRuleText={formatCycleRuleText(service.cycleRule)}
                progressColor={getProgressColor(service.progressPercent ?? 0)}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggleExhausted={handleToggleServiceExhausted}
              />
            ))}
          </div>
        ) : (
          <List
            dataSource={services}
            itemLayout="horizontal"
            renderItem={service => (
              <List.Item
                className="ai-quota-row"
                actions={[
                  <Switch
                    key="exhausted"
                    checked={service.exhausted ?? false}
                    onChange={checked => handleToggleServiceExhausted(service.id, checked)}
                    checkedChildren="Hết"
                    unCheckedChildren="Còn"
                    className="ai-quota-exhausted-switch"
                  />,
                  <Button
                    key="edit"
                    type="text"
                    shape="circle"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(service)}
                  />,
                  <Popconfirm
                    key="delete"
                    title="Bạn chắc chắn muốn xóa dịch vụ này?"
                    onConfirm={() => handleDelete(service.id)}
                    okText="Có"
                    cancelText="Không"
                  >
                    <Button danger type="text" shape="circle" icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    service.iconUrl ? (
                      <button
                        type="button"
                        className="ai-quota-icon-button"
                        onClick={() => handleEdit(service)}
                        aria-label={`Edit ${service.name}`}
                      >
                        <img
                          src={service.iconUrl}
                          alt={service.name}
                          className="ai-quota-icon"
                        />
                      </button>
                    ) : (
                      <div className="ai-quota-icon-placeholder">🤖</div>
                    )
                  }
                  title={
                    <button
                      type="button"
                      className="ai-quota-name"
                      onClick={() => handleEdit(service)}
                    >
                      {service.name}
                    </button>
                  }
                  description={
                    <Space direction="vertical" size={2} className="ai-quota-meta">
                      <Typography.Text type="secondary">
                        {service.statusText}
                      </Typography.Text>
                      <div className="ai-quota-progress-row">
                        <Typography.Text className="ai-quota-progress-text">
                          {service.progressPercent !== undefined ? `${service.progressPercent.toFixed(2)}%` : '0%'}
                        </Typography.Text>
                        <Progress
                          percent={service.progressPercent}
                          strokeColor={getProgressColor(service.progressPercent ?? 0)}
                          size="small"
                          showInfo={false}
                          className="ai-quota-progress-bar"
                        />
                      </div>
                      <Typography.Text type="secondary">
                        {formatCycleRuleText(service.cycleRule)}
                      </Typography.Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>

      <AiQuotaFormModal
        visible={modalVisible}
        service={editingService}
        onCancel={() => setModalVisible(false)}
        onSubmit={handleSubmit}
      />
    </section>
  )
}
