import { useState, useEffect } from 'react'
import { Modal, Form, Input, Select, Upload, message, Button, DatePicker } from 'antd'
import type { UploadFile } from 'antd/es/upload'
import { UploadOutlined } from '@ant-design/icons'
import type { AiQuotaServiceDTO, CycleRule } from '../../types'
import {
  cycleRulePresets,
  findPresetById,
} from './cycleRulePresets'
import dayjs from 'dayjs'

const { Option } = Select

interface AiQuotaFormModalProps {
  visible: boolean
  service: AiQuotaServiceDTO | null
  onCancel: () => void
  onSubmit: (data: { name: string; cycleRule: CycleRule; icon?: File }) => Promise<void>
}

export function AiQuotaFormModal({ visible, service, onCancel, onSubmit }: AiQuotaFormModalProps) {
  const [form] = Form.useForm()
  const [selectedPreset, setSelectedPreset] = useState<string>('duration-custom-days')
  const [presetParams, setPresetParams] = useState<Record<string, unknown>>({
    days: 7,
    anchorDate: new Date().toISOString().split('T')[0]
  })
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(service?.iconUrl || null)
  const [submitting, setSubmitting] = useState(false)

  const isEdit = Boolean(service)

  useEffect(() => {
    if (visible) {
      if (service) {
        form.setFieldsValue({ name: service.name })
        setPreviewUrl(service.iconUrl)

        if (service.cycleRule.type === 'monthly-day') {
          setSelectedPreset('monthly-day')
          setPresetParams({ dayOfMonth: service.cycleRule.dayOfMonth })
        } else if (service.cycleRule.type === 'weekly-day') {
          setSelectedPreset('weekly-day')
          setPresetParams({ dayOfWeek: service.cycleRule.dayOfWeek })
        } else if (service.cycleRule.type === 'date-range') {
          setSelectedPreset('date-range')
          setPresetParams({
            startDate: service.cycleRule.startDate,
            endDate: service.cycleRule.endDate,
          })
        } else {
          setSelectedPreset('duration-custom-days')
          setPresetParams({
            days: service.cycleRule.value,
            anchorDate: service.cycleRule.anchorDate || new Date().toISOString().split('T')[0],
          })
        }
      } else {
        form.resetFields()
        setSelectedPreset('duration-custom-days')
        setPresetParams({ days: 7, anchorDate: new Date().toISOString().split('T')[0] })
        setFileList([])
        setPreviewUrl(null)
      }
    }
  }, [visible, service, form])

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId)
    const preset = findPresetById(presetId)
    if (preset) {
      setPresetParams(preset.defaultParams)
    }
  }

  const handleParamChange = (paramName: string, value: unknown) => {
    setPresetParams(prev => ({ ...prev, [paramName]: value }))
  }

  const handleUploadChange = ({ fileList: newFileList }: { fileList: UploadFile[] }) => {
    setFileList(newFileList)
    if (newFileList.length > 0 && newFileList[0].originFileObj) {
      const file = newFileList[0].originFileObj as File
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    } else {
      setPreviewUrl(service?.iconUrl || null)
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const preset = findPresetById(selectedPreset)
      if (!preset) {
        message.error('Invalid preset selected')
        return
      }

      const cycleRule = preset.buildRule(presetParams)
      const iconFile = fileList[0]?.originFileObj as File | undefined

      await onSubmit({
        name: values.name,
        cycleRule,
        icon: iconFile,
      })

      form.resetFields()
      setFileList([])
      setSelectedPreset('duration-custom-days')
      setPresetParams({
        days: 7,
        anchorDate: new Date().toISOString().split('T')[0]
      })
    } catch (error) {
      console.error('Form validation failed:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    form.resetFields()
    setFileList([])
    setPreviewUrl(service?.iconUrl || null)
    setSelectedPreset('duration-custom-days')
    setPresetParams({
      days: 7,
      anchorDate: new Date().toISOString().split('T')[0]
    })
    onCancel()
  }

  const currentPreset = findPresetById(selectedPreset)

  return (
    <Modal
      title={isEdit ? 'Sửa dịch vụ AI' : 'Thêm dịch vụ AI mới'}
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={submitting}
      width={500}
      className="ai-quota-modal-no-scrollbar"
      styles={{
        body: {
          maxHeight: 'min(70vh, calc(100dvh - 200px))',
          overflowY: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        },
      }}
      style={{ top: 24, maxWidth: 'calc(100vw - 24px)' }}
      okText={isEdit ? 'Cập nhật' : 'Thêm'}
      cancelText="Hủy"
      centered
    >
      <Form form={form} layout="vertical" initialValues={service ? { name: service.name } : {}}>
        <Form.Item
          label="Tên dịch vụ"
          name="name"
          rules={[{ required: true, message: 'Vui lòng nhập tên dịch vụ' }]}
        >
          <Input placeholder="Ví dụ: ChatGPT, Claude, Midjourney" />
        </Form.Item>

        <Form.Item label="Icon (tùy chọn)">
          <div className="ai-quota-form-icon-row">
            {previewUrl && (
              <div className="ai-quota-form-icon-preview">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="ai-quota-form-icon-image"
                />
              </div>
            )}
            <Upload
              fileList={fileList}
              onChange={handleUploadChange}
              beforeUpload={() => false}
              accept="image/*"
              maxCount={1}
              showUploadList={false}
            >
              <Button icon={<UploadOutlined />}>Chọn ảnh</Button>
            </Upload>
          </div>
        </Form.Item>

        <Form.Item label="Chu kỳ reset">
          <Select
            value={selectedPreset}
            onChange={handlePresetChange}
            style={{ width: '100%' }}
          >
            {cycleRulePresets.map(preset => (
              <Option key={preset.id} value={preset.id}>
                {preset.label}
              </Option>
            ))}
          </Select>
        </Form.Item>

        {currentPreset?.paramFields.map(field => (
          <Form.Item
            key={field.name}
            label={field.label}
            rules={[
              {
                required: true,
                message: `Vui lòng nhập ${field.label.toLowerCase()}`,
              },
            ]}
          >
            {field.type === 'select' && field.options ? (
              <Select
                value={presetParams[field.name] as string | number}
                onChange={(value) => handleParamChange(field.name, value)}
              >
                {field.options.map(opt => (
                  <Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </Option>
                ))}
              </Select>
            ) : field.type === 'date' ? (
              <DatePicker
                value={presetParams[field.name] ? dayjs(presetParams[field.name] as string) : null}
                onChange={(date: any) => handleParamChange(field.name, date ? date.format('YYYY-MM-DD') : null)}
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
              />
            ) : (
              <Input
                type={field.type}
                value={presetParams[field.name] as string | number}
                onChange={(e) => handleParamChange(field.name, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                min={field.min}
                max={field.max}
              />
            )}
          </Form.Item>
        ))}
      </Form>
    </Modal>
  )
}
