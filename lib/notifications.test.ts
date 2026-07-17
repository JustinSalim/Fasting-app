import { describe, it, expect } from 'vitest'
import {
  shouldSendGoalReached,
  shouldSendPreGoalReminder,
  isSameLocalDate,
  isWithinReminderWindow,
  getOverdueOngoingLogs,
  type FastProgress,
  type OngoingLog,
} from './notifications'

function fast(overrides: Partial<FastProgress> = {}): FastProgress {
  return {
    elapsedMinutes: 0,
    targetDurationHours: 16,
    targetNotifiedAt: null,
    reminderNotifiedAt: null,
    ...overrides,
  }
}

describe('shouldSendGoalReached', () => {
  it('is false before the target', () => {
    expect(shouldSendGoalReached(fast({ elapsedMinutes: 900 }))).toBe(false)
  })

  it('is true once elapsed reaches the target', () => {
    expect(shouldSendGoalReached(fast({ elapsedMinutes: 960 }))).toBe(true)
  })

  it('is false if already notified', () => {
    expect(shouldSendGoalReached(fast({ elapsedMinutes: 1000, targetNotifiedAt: '2026-07-16T00:00:00Z' }))).toBe(false)
  })
})

describe('shouldSendPreGoalReminder', () => {
  it('is false well before the reminder window', () => {
    expect(shouldSendPreGoalReminder(fast({ elapsedMinutes: 900 }), 15)).toBe(false)
  })

  it('is true inside the reminder window before the target', () => {
    expect(shouldSendPreGoalReminder(fast({ elapsedMinutes: 950 }), 15)).toBe(true)
  })

  it('is false once the target itself is reached (goal-reached takes over)', () => {
    expect(shouldSendPreGoalReminder(fast({ elapsedMinutes: 960 }), 15)).toBe(false)
  })

  it('is false if the reminder was already sent', () => {
    expect(
      shouldSendPreGoalReminder(fast({ elapsedMinutes: 950, reminderNotifiedAt: '2026-07-16T00:00:00Z' }), 15)
    ).toBe(false)
  })

  it('is false if the goal was already notified', () => {
    expect(
      shouldSendPreGoalReminder(fast({ elapsedMinutes: 950, targetNotifiedAt: '2026-07-16T00:00:00Z' }), 15)
    ).toBe(false)
  })
})

describe('isSameLocalDate', () => {
  it('is true for two timestamps on the same local calendar day', () => {
    expect(isSameLocalDate('2026-07-16T23:30:00Z', 'America/New_York', new Date('2026-07-17T02:00:00Z'))).toBe(true)
  })

  it('is false across a local calendar day boundary', () => {
    expect(isSameLocalDate('2026-07-15T23:30:00Z', 'America/New_York', new Date('2026-07-17T02:00:00Z'))).toBe(false)
  })
})

describe('isWithinReminderWindow', () => {
  it('is true right at the reminder time', () => {
    expect(isWithinReminderWindow('20:00', '20:00', 15)).toBe(true)
  })

  it('is true a few minutes after the reminder time', () => {
    expect(isWithinReminderWindow('20:10', '20:00', 15)).toBe(true)
  })

  it('is false once the window has passed', () => {
    expect(isWithinReminderWindow('20:20', '20:00', 15)).toBe(false)
  })

  it('is false before the reminder time', () => {
    expect(isWithinReminderWindow('19:50', '20:00', 15)).toBe(false)
  })

  it('handles the midnight wraparound', () => {
    expect(isWithinReminderWindow('00:05', '23:55', 15)).toBe(true)
  })
})

describe('getOverdueOngoingLogs', () => {
  it('excludes a log that has not yet reached its target', () => {
    const now = new Date('2026-07-15T14:00:00.000Z') // 6h into an 8h target
    const logs = [{ id: '1', startTime: '2026-07-15T08:00:00.000Z', targetDurationHours: 8 }]
    expect(getOverdueOngoingLogs(logs, now)).toEqual([])
  })

  it('includes a log exactly at its target', () => {
    const now = new Date('2026-07-15T16:00:00.000Z') // exactly 8h
    const logs = [{ id: '1', startTime: '2026-07-15T08:00:00.000Z', targetDurationHours: 8 }]
    expect(getOverdueOngoingLogs(logs, now)).toEqual(logs)
  })

  it('includes a log past its target', () => {
    const now = new Date('2026-07-15T20:00:00.000Z') // 12h into an 8h target
    const logs = [{ id: '1', startTime: '2026-07-15T08:00:00.000Z', targetDurationHours: 8 }]
    expect(getOverdueOngoingLogs(logs, now)).toEqual(logs)
  })

  it('filters a mixed list to only the overdue ones', () => {
    const now = new Date('2026-07-15T16:00:00.000Z')
    const logs = [
      { id: 'overdue', startTime: '2026-07-15T08:00:00.000Z', targetDurationHours: 8 },
      { id: 'not-yet', startTime: '2026-07-15T12:00:00.000Z', targetDurationHours: 8 },
    ]
    expect(getOverdueOngoingLogs(logs, now)).toEqual([logs[0]])
  })
})
