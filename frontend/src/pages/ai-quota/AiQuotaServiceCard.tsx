import { Button, Popconfirm, Progress, Switch, Typography } from 'antd'
import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import type { AiQuotaServiceDTO } from '../../types'

interface Props {
  service: AiQuotaServiceDTO
  cycleRuleText: string
  progressColor: string
  onEdit: (service: AiQuotaServiceDTO) => void
  onDelete: (id: string) => void
  onToggleExhausted: (id: string, exhausted: boolean) => void
}

export function AiQuotaServiceCard({
  service,
  cycleRuleText,
  progressColor,
  onEdit,
  onDelete,
  onToggleExhausted,
}: Props) {
  const progressPercent = service.progressPercent ?? 0

  return (
    <article className={`ai-quota-card${service.exhausted ? ' is-exhausted' : ''}`}>
      <div className="ai-quota-card-top">
        <button
          type="button"
          className="ai-quota-icon-button"
          onClick={() => onEdit(service)}
          aria-label={`Edit ${service.name}`}
        >
          {service.iconUrl ? (
            <img
              src={service.iconUrl}
              alt={service.name}
              className="ai-quota-icon ai-quota-card-icon"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="ai-quota-icon-placeholder ai-quota-card-icon">🤖</div>
          )}
        </button>
        <div className="ai-quota-card-main">
          <button
            type="button"
            className="ai-quota-name"
            onClick={() => onEdit(service)}
          >
            {service.name}
          </button>
          <Typography.Text type="secondary" className="ai-quota-card-status">
            {service.statusText}
          </Typography.Text>
        </div>
      </div>

      <div className="ai-quota-card-progress">
        <div className="ai-quota-progress-row">
          <Typography.Text className="ai-quota-progress-text">
            {`${progressPercent.toFixed(2)}%`}
          </Typography.Text>
          <Progress
            percent={progressPercent}
            strokeColor={progressColor}
            size="small"
            showInfo={false}
            className="ai-quota-progress-bar"
          />
        </div>
        <Typography.Text type="secondary" className="ai-quota-card-cycle">
          {cycleRuleText}
        </Typography.Text>
      </div>

      <div className="ai-quota-card-actions">
        <Switch
          checked={service.exhausted ?? false}
          onChange={checked => onToggleExhausted(service.id, checked)}
          checkedChildren="Hết"
          unCheckedChildren="Còn"
          className="ai-quota-exhausted-switch"
        />
        <div className="ai-quota-card-action-buttons">
          <Button
            type="text"
            shape="circle"
            icon={<EditOutlined />}
            onClick={() => onEdit(service)}
            aria-label={`Edit ${service.name}`}
          />
          <Popconfirm
            title="Bạn chắc chắn muốn xóa dịch vụ này?"
            onConfirm={() => onDelete(service.id)}
            okText="Có"
            cancelText="Không"
          >
            <Button
              danger
              type="text"
              shape="circle"
              icon={<DeleteOutlined />}
              aria-label={`Delete ${service.name}`}
            />
          </Popconfirm>
        </div>
      </div>
    </article>
  )
}
