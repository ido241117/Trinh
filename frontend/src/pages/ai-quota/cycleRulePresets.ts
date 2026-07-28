import type { CycleRule } from '../../types'

export interface CycleRulePreset {
  id: string
  label: string
  description: string
  type: 'duration' | 'monthly-day' | 'weekly-day' | 'date-range'
  buildRule: (params: Record<string, unknown>) => CycleRule
  defaultParams: Record<string, unknown>
  paramFields: ParamField[]
}

export interface ParamField {
  name: string
  label: string
  type: 'number' | 'select' | 'text' | 'date'
  options?: { value: string | number; label: string }[]
  min?: number
  max?: number
  defaultValue: unknown
}

export const cycleRulePresets: CycleRulePreset[] = [
  {
    id: 'duration-custom-days',
    label: 'Reset mỗi n ngày',
    description: '',
    type: 'duration',
    buildRule: (params) => ({
      type: 'duration',
      value: (params.days as number) || 7,
      anchorDate: (params.anchorDate as string) || new Date().toISOString().split('T')[0],
    }),
    defaultParams: { days: 7, anchorDate: new Date().toISOString().split('T')[0] },
    paramFields: [
      {
        name: 'days',
        label: 'Số ngày',
        type: 'number',
        min: 1,
        max: 365,
        defaultValue: 7,
      },
      {
        name: 'anchorDate',
        label: 'Ngày bắt đầu chu kỳ',
        type: 'date',
        defaultValue: new Date().toISOString().split('T')[0],
      },
    ],
  },
  {
    id: 'monthly-day',
    label: 'Ngày thứ n của tháng',
    description: '',
    type: 'monthly-day',
    buildRule: (params) => ({
      type: 'monthly-day',
      dayOfMonth: (params.dayOfMonth as number) || 1,
    }),
    defaultParams: { dayOfMonth: 1 },
    paramFields: [
      {
        name: 'dayOfMonth',
        label: 'Ngày trong tháng',
        type: 'number',
        min: 1,
        max: 31,
        defaultValue: 1,
      },
    ],
  },
  {
    id: 'weekly-day',
    label: 'Reset vào sáng thứ n hàng tuần',
    description: '',
    type: 'weekly-day',
    buildRule: (params) => ({
      type: 'weekly-day',
      dayOfWeek: (params.dayOfWeek as number) || 4,
    }),
    defaultParams: { dayOfWeek: 4 },
    paramFields: [
      {
        name: 'dayOfWeek',
        label: 'Thứ trong tuần',
        type: 'select',
        options: [
          { value: 0, label: 'Chủ Nhật' },
          { value: 1, label: 'Thứ Hai' },
          { value: 2, label: 'Thứ Ba' },
          { value: 3, label: 'Thứ Tư' },
          { value: 4, label: 'Thứ Năm' },
          { value: 5, label: 'Thứ Sáu' },
          { value: 6, label: 'Thứ Bảy' },
        ],
        defaultValue: 4,
      },
    ],
  },
  {
    id: 'date-range',
    label: 'Từ ngày A đến ngày B',
    description: '',
    type: 'date-range',
    buildRule: (params) => ({
      type: 'date-range',
      startDate: (params.startDate as string) || new Date().toISOString().split('T')[0],
      endDate: (params.endDate as string) || new Date().toISOString().split('T')[0],
    }),
    defaultParams: {
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    },
    paramFields: [
      {
        name: 'startDate',
        label: 'Ngày bắt đầu',
        type: 'date',
        defaultValue: new Date().toISOString().split('T')[0],
      },
      {
        name: 'endDate',
        label: 'Ngày kết thúc',
        type: 'date',
        defaultValue: new Date().toISOString().split('T')[0],
      },
    ],
  },
]

// Find preset by ID
export function findPresetById(id: string): CycleRulePreset | undefined {
  return cycleRulePresets.find(p => p.id === id)
}
