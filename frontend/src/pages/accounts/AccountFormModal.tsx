import { useEffect, useState } from 'react'
import { Modal, Form, Input, Upload, Button } from 'antd'
import type { UploadFile } from 'antd/es/upload'
import { UploadOutlined } from '@ant-design/icons'
import type { AccountDTO } from '../../types'

export interface AccountFormValues {
  name: string
  account: string
  password: string
  logo?: File
}

interface Props {
  visible: boolean
  account: AccountDTO | null
  onCancel: () => void
  onSubmit: (data: AccountFormValues) => Promise<void>
}

export function AccountFormModal({ visible, account, onCancel, onSubmit }: Props) {
  const [form] = Form.useForm()
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const isEdit = Boolean(account)

  useEffect(() => {
    if (!visible) return
    if (account) {
      form.setFieldsValue({
        name: account.name,
        account: account.account,
        password: account.password,
      })
      setPreviewUrl(account.logoUrl)
      setFileList([])
    } else {
      form.resetFields()
      setPreviewUrl(null)
      setFileList([])
    }
  }, [visible, account, form])

  function handleUploadChange({ fileList: next }: { fileList: UploadFile[] }) {
    setFileList(next)
    if (next.length > 0 && next[0].originFileObj) {
      setPreviewUrl(URL.createObjectURL(next[0].originFileObj as File))
    } else {
      setPreviewUrl(account?.logoUrl ?? null)
    }
  }

  async function handleSubmit() {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      await onSubmit({
        name: values.name,
        account: values.account,
        password: values.password,
        logo: fileList[0]?.originFileObj as File | undefined,
      })
      form.resetFields()
      setFileList([])
    } catch {
      // validation / submit errors handled by caller or form
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancel() {
    form.resetFields()
    setFileList([])
    setPreviewUrl(account?.logoUrl ?? null)
    onCancel()
  }

  return (
    <Modal
      title={isEdit ? 'Sửa tài khoản' : 'Thêm tài khoản'}
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={submitting}
      okText={isEdit ? 'Cập nhật' : 'Thêm'}
      cancelText="Hủy"
      width={480}
      destroyOnHidden
      centered
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Logo (tùy chọn)">
          <div className="accounts-form-logo-row">
            {previewUrl ? (
              <img src={previewUrl} alt="Logo preview" className="accounts-form-logo-preview" />
            ) : (
              <div className="accounts-form-logo-placeholder">—</div>
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

        <Form.Item
          label="Tên gọi"
          name="name"
          rules={[{ required: true, message: 'Nhập tên gọi' }]}
        >
          <Input placeholder="Ví dụ: Gmail cá nhân" />
        </Form.Item>

        <Form.Item
          label="Tài khoản"
          name="account"
          rules={[{ required: true, message: 'Nhập tài khoản' }]}
        >
          <Input placeholder="email / username" />
        </Form.Item>

        <Form.Item
          label="Mật khẩu"
          name="password"
          rules={[{ required: true, message: 'Nhập mật khẩu' }]}
        >
          <Input.TextArea rows={2} placeholder="password" autoSize={{ minRows: 1, maxRows: 4 }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
