import { describe, it, expect } from 'vitest'
import { formatElapsed, getFastingStage, computeStopOutcome, getRemainingSeconds } from './fasting'

describe('formatElapsed', () => {
  it('formats seconds under an hour', () => {
    expect(formatElapsed(125)).toBe('00:02:05')
  })

  it('formats hours, minutes and seconds, zero-padded', () => {
    expect(formatElapsed(3 * 3600 + 5 * 60 + 40)).toBe('03:05:40')
  })

  it('does not wrap past 24 hours', () => {
    expect(formatElapsed(30 * 3600 + 15 * 60)).toBe('30:15:00')
  })

  // The clock ticks every second, so the rendered string must change every
  // second — otherwise a fresh fast reads 00:00 for a full minute and looks dead.
  it('changes on every elapsed second', () => {
    expect(formatElapsed(0)).not.toBe(formatElapsed(1))
  })
})

describe('getFastingStage', () => {
  it('is "fasting" before the 12-hour mark', () => {
    expect(getFastingStage(0)).toBe('fasting')
    expect(getFastingStage(11.9)).toBe('fasting')
  })

  it('is "fat_burning" at and after the 12-hour mark', () => {
    expect(getFastingStage(12)).toBe('fat_burning')
    expect(getFastingStage(20)).toBe('fat_burning')
  })
})

describe('computeStopOutcome', () => {
  const start = new Date('2026-07-15T08:00:00.000Z')

  it('discards fasts shorter than the threshold (default 5 minutes)', () => {
    const now = new Date('2026-07-15T08:04:59.000Z')
    expect(computeStopOutcome(start, 16, now)).toEqual({ action: 'discard' })
  })

  it('saves as "missed" when stopped before the target duration', () => {
    const now = new Date('2026-07-15T14:00:00.000Z') // 6h elapsed of a 16h target
    expect(computeStopOutcome(start, 16, now)).toEqual({ action: 'save', status: 'missed' })
  })

  it('saves as "completed" when stopped at or after the target duration', () => {
    const now = new Date('2026-07-16T00:00:00.000Z') // 16h elapsed of a 16h target
    expect(computeStopOutcome(start, 16, now)).toEqual({ action: 'save', status: 'completed' })
  })

  it('respects a custom threshold', () => {
    const now = new Date('2026-07-15T08:02:00.000Z') // 2 minutes elapsed
    expect(computeStopOutcome(start, 16, now, 1)).toEqual({ action: 'save', status: 'missed' })
  })
})

describe('getRemainingSeconds', () => {
  it('returns positive seconds remaining before the goal', () => {
    // 16h target, 2h elapsed -> 14h remaining
    expect(getRemainingSeconds(16, 2 * 3600)).toBe(14 * 3600)
  })

  it('returns exactly zero at the goal', () => {
    expect(getRemainingSeconds(1, 3600)).toBe(0)
  })

  it('returns negative seconds once past the goal (overtime)', () => {
    // 1h target, 1h01m elapsed -> 60s overtime
    expect(getRemainingSeconds(1, 3660)).toBe(-60)
  })
})
