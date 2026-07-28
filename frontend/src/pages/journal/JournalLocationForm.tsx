import { useState } from 'react'
import { AimOutlined } from '@ant-design/icons'
import { Button, Input, message } from 'antd'
import { getBrowserJournalLocation } from './journalLocation'

interface JournalLocationFormProps {
  latInput: string
  longInput: string
  onLatInputChange: (value: string) => void
  onLongInputChange: (value: string) => void
}

export function JournalLocationForm({
  latInput,
  longInput,
  onLatInputChange,
  onLongInputChange,
}: JournalLocationFormProps) {
  const [locating, setLocating] = useState(false)

  async function useCurrentLocation() {
    if (locating) return

    setLocating(true)
    try {
      const location = await getBrowserJournalLocation()
      onLatInputChange(location.lat.toFixed(6))
      onLongInputChange(location.long.toFixed(6))
      message.success('Đã lấy vị trí hiện tại')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Không lấy được vị trí')
    } finally {
      setLocating(false)
    }
  }

  return (
    <div className="journal-location-form">
      <Button
        type="default"
        icon={<AimOutlined />}
        loading={locating}
        onClick={() => void useCurrentLocation()}
        block
      >
        Lấy vị trí hiện tại
      </Button>
      <label className="journal-location-field">
        <span>Longitude</span>
        <Input
          value={longInput}
          onChange={event => onLongInputChange(event.target.value)}
          placeholder="105.804817"
          inputMode="decimal"
        />
      </label>
      <label className="journal-location-field">
        <span>Latitude</span>
        <Input
          value={latInput}
          onChange={event => onLatInputChange(event.target.value)}
          placeholder="21.028511"
          inputMode="decimal"
        />
      </label>
    </div>
  )
}
