import { useEffect, useState } from 'react'
import { Button, DatePicker, Form, Input, InputNumber, Modal, Space, Typography, Upload, message } from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import type { TrackDTO } from '../../types'
import { renameTrack, trimTrack, updateArtist, updateCover, updateDateModified } from '../../api'
import { clampDuration, formatDuration, joinDuration, splitDuration } from '../../utils'

interface Props {
  track: TrackDTO | null
  open: boolean
  onClose: () => void
  onTrackUpdated: (track: TrackDTO) => void
}

interface FormValues {
  filename: string
  artist: string
  dateModified: Dayjs
}

interface DurationFieldsProps {
  label: string
  totalSeconds: number
  maxSeconds?: number
  onChange: (seconds: number) => void
}

function DurationFields({ label, totalSeconds, maxSeconds, onChange }: DurationFieldsProps) {
  const { minutes, seconds } = splitDuration(totalSeconds)
  const maxMinutes = maxSeconds !== undefined ? Math.floor(maxSeconds / 60) : undefined

  function updateMinutes(nextMinutes: number) {
    onChange(clampDuration(joinDuration(nextMinutes, seconds), maxSeconds))
  }

  function updateSeconds(nextSeconds: number) {
    onChange(clampDuration(joinDuration(minutes, nextSeconds), maxSeconds))
  }

  return (
    <Space direction="vertical" size={4}>
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Space size={4} align="center">
        <InputNumber
          min={0}
          max={maxMinutes}
          value={minutes}
          onChange={value => updateMinutes(value ?? 0)}
          style={{ width: 72 }}
        />
        <Typography.Text className="music-tabular">:</Typography.Text>
        <InputNumber
          min={0}
          max={59}
          value={seconds}
          onChange={value => updateSeconds(value ?? 0)}
          style={{ width: 72 }}
        />
      </Space>
    </Space>
  )
}

export default function EditTrackModal({ track, open, onClose, onTrackUpdated }: Props) {
  const [form] = Form.useForm<FormValues>()
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [trimStartSec, setTrimStartSec] = useState(0)
  const [trimEndSec, setTrimEndSec] = useState(0)
  const [trimming, setTrimming] = useState(false)

  useEffect(() => {
    if (!track) return
    form.setFieldsValue({
      filename: track.filename,
      artist: track.artist ?? '',
      dateModified: dayjs(track.dateModified),
    })
    setTrimStartSec(0)
    setTrimEndSec(track.duration)
    setImageFile(null)
    setPreviewUrl(track.hasCover ? `/api/cover/${track.id}` : null)
  }, [form, track])

  useEffect(() => {
    if (!imageFile) return

    const objectUrl = URL.createObjectURL(imageFile)
    setPreviewUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [imageFile])

  async function handleTrim() {
    if (!track) return

    if (trimEndSec <= trimStartSec) {
      message.error('End time must be greater than start time')
      return
    }
    if (track.duration > 0 && trimEndSec > track.duration) {
      message.error(`End time must not exceed track duration (${formatDuration(track.duration)})`)
      return
    }

    setTrimming(true)
    try {
      const res = await trimTrack(track.id, trimStartSec, trimEndSec)
      if (!res.ok) throw new Error((await res.json()).error || 'Trim failed')
      const updated = (await res.json()) as TrackDTO

      message.success('Track trimmed')
      onTrackUpdated(updated)
      onClose()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Trim failed')
    } finally {
      setTrimming(false)
    }
  }

  async function handleSave() {
    if (!track) return

    const values = await form.validateFields()
    const nextFilename = values.filename.trim()
    const nextArtist = values.artist.trim()
    const nextDateModified = values.dateModified.toDate().toISOString()

    const filenameChanged = nextFilename !== track.filename
    const artistChanged = nextArtist !== (track.artist ?? '')
    const dateChanged = nextDateModified !== new Date(track.dateModified).toISOString()

    if (!filenameChanged && !artistChanged && !dateChanged && !imageFile) {
      onClose()
      return
    }

    setSaving(true)
    try {
      let updated: TrackDTO = { ...track }

      if (filenameChanged) {
        const res = await renameTrack(track.id, nextFilename)
        if (!res.ok) throw new Error((await res.json()).error || 'Rename failed')
        updated = { ...updated, ...(await res.json() as TrackDTO) }
      }

      if (artistChanged) {
        const res = await updateArtist(track.id, nextArtist)
        if (!res.ok) throw new Error((await res.json()).error || 'Artist update failed')
        updated = { ...updated, ...(await res.json() as TrackDTO) }
      }

      if (dateChanged) {
        const res = await updateDateModified(track.id, nextDateModified)
        if (!res.ok) throw new Error((await res.json()).error || 'Date update failed')
        updated = { ...updated, ...(await res.json() as TrackDTO) }
      }

      if (imageFile) {
        const res = await updateCover(track.id, imageFile)
        if (!res.ok) throw new Error((await res.json()).error || 'Cover update failed')
        updated = { ...updated, ...(await res.json() as TrackDTO) }
      }

      message.success('Track updated')
      onTrackUpdated(updated)
      onClose()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Edit track"
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      destroyOnHidden
      width="min(600px, calc(100vw - 24px))"
      styles={{
        body: {
          maxHeight: 'min(60vh, calc(100dvh - 160px))',
          overflowY: 'auto',
        },
      }}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="filename"
          label="Filename"
          rules={[{ required: true, message: 'Filename is required' }]}
        >
          <Input />
        </Form.Item>

        <Form.Item name="artist" label="Artist">
          <Input />
        </Form.Item>

        <Form.Item
          name="dateModified"
          label="Date modified"
          rules={[{ required: true, message: 'Date is required' }]}
        >
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item label="Cover art">
          <Space direction="vertical" size={12}>
            {previewUrl && (
              <img className="music-cover-preview" src={previewUrl} alt="Cover preview" />
            )}
            <Upload
              accept="image/jpeg,image/png"
              maxCount={1}
              showUploadList={false}
              beforeUpload={file => {
                setImageFile(file)
                return false
              }}
            >
              <Button>Select image</Button>
            </Upload>
          </Space>
        </Form.Item>

        <Form.Item
          label="Trim"
          extra={
            track
              ? `Current duration: ${formatDuration(track.duration)} — keep from start to end, drop intro/outro outside this range`
              : undefined
          }
        >
          <Space align="start" wrap>
            <DurationFields
              label="From"
              totalSeconds={trimStartSec}
              maxSeconds={track?.duration ?? undefined}
              onChange={setTrimStartSec}
            />
            <DurationFields
              label="To"
              totalSeconds={trimEndSec}
              maxSeconds={track?.duration ?? undefined}
              onChange={setTrimEndSec}
            />
            <Space direction="vertical" size={4}>
              <Typography.Text type="secondary">&nbsp;</Typography.Text>
              <Button loading={trimming} onClick={handleTrim}>
                Trim
              </Button>
            </Space>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  )
}
