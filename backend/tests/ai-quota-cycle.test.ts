import { describe, expect, it } from 'vitest'
import { computeCycleState } from '../src/services/ai-quota-cycle.js'
import type { CycleRule } from '../src/types.js'

describe('computeCycleState', () => {
  it('correctly calculates nextResetAt and prevResetAt for duration rule without anchorDate', () => {
    const rule: CycleRule = {
      type: 'duration',
      value: 7, // 7 days
    }
    // June 1st, 2026, 08:00 UTC
    const lastResetAt = '2026-06-01T08:00:00.000Z'
    // June 10th, 2026, 08:00 UTC
    const now = new Date('2026-06-10T08:00:00.000Z')

    const state = computeCycleState(rule, lastResetAt, now)

    // Interval is 7 days.
    // Reset day starts at 6:00 AM HCM on June 1st.
    // 6:00 AM HCM in UTC is 23:00 UTC of previous day (May 31st)
    // May 31st 23:00 UTC + 7 days = June 7th 23:00 UTC (June 8th 6:00 AM HCM) -> this is first nextReset <= now?
    // Wait, since June 7th 23:00 UTC is <= now (June 10th 8:00 UTC),
    // nextReset advances to June 14th 23:00 UTC.
    expect(state.nextResetAt).toBe(new Date('2026-06-14T23:00:00.000Z').toISOString())
    expect(state.prevResetAt).toBe(new Date('2026-06-07T23:00:00.000Z').toISOString())

    // Since lastResetAt (June 1st) < prevResetAt (June 7th), it needs reset!
    const lastResetTime = new Date(lastResetAt).getTime()
    const prevResetTime = new Date(state.prevResetAt).getTime()
    expect(lastResetTime < prevResetTime).toBe(true)
  })

  it('correctly calculates nextResetAt and prevResetAt for monthly-day rule', () => {
    const rule: CycleRule = {
      type: 'monthly-day',
      dayOfMonth: 5,
    }
    // May 10th, 2026
    const lastResetAt = '2026-05-10T08:00:00.000Z'
    // June 6th, 2026
    const now = new Date('2026-06-06T08:00:00.000Z')

    const state = computeCycleState(rule, lastResetAt, now)

    // For monthly-day 5th of month.
    // nextResetAt should be July 5th (at 6:00 AM HCM, i.e., 23:00 UTC of July 4th)
    // prevResetAt should be June 5th (at 6:00 AM HCM, i.e., 23:00 UTC of June 4th)
    expect(state.nextResetAt).toBe(new Date('2026-07-04T23:00:00.000Z').toISOString())
    expect(state.prevResetAt).toBe(new Date('2026-06-04T23:00:00.000Z').toISOString())

    // Since lastResetAt (May 10th) < prevResetAt (June 5th), it needs reset!
    const lastResetTime = new Date(lastResetAt).getTime()
    const prevResetTime = new Date(state.prevResetAt).getTime()
    expect(lastResetTime < prevResetTime).toBe(true)
  })

  it('does not reset if we are still within the same cycle', () => {
    const rule: CycleRule = {
      type: 'monthly-day',
      dayOfMonth: 5,
    }
    // June 5th, 2026, 07:00:00 UTC (which is 14:00 HCM, after 6:00 AM HCM boundary)
    const lastResetAt = '2026-06-05T07:00:00.000Z'
    // June 6th, 2026
    const now = new Date('2026-06-06T08:00:00.000Z')

    const state = computeCycleState(rule, lastResetAt, now)

    expect(state.nextResetAt).toBe(new Date('2026-07-04T23:00:00.000Z').toISOString())
    expect(state.prevResetAt).toBe(new Date('2026-06-04T23:00:00.000Z').toISOString())

    // Since lastResetAt (June 5th) >= prevResetAt (June 5th at 6:00 AM HCM, which is June 4th 23:00 UTC), it should NOT reset.
    const lastResetTime = new Date(lastResetAt).getTime()
    const prevResetTime = new Date(state.prevResetAt).getTime()
    expect(lastResetTime < prevResetTime).toBe(false)
  })
})
