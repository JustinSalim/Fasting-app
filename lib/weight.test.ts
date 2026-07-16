import { describe, it, expect } from 'vitest'
import { getWeightDelta } from './weight'

describe('getWeightDelta', () => {
  it('returns null for the first entry (no previous)', () => {
    expect(getWeightDelta([{ value: 80 }, { value: 79 }], 0)).toBeNull()
  })

  it('returns the difference vs. the previous entry', () => {
    expect(getWeightDelta([{ value: 80 }, { value: 79.5 }], 1)).toBeCloseTo(-0.5, 5)
  })

  it('returns a positive delta on a gain', () => {
    expect(getWeightDelta([{ value: 80 }, { value: 81.2 }], 1)).toBeCloseTo(1.2, 5)
  })

  it('returns null for an out-of-range index', () => {
    expect(getWeightDelta([{ value: 80 }], 5)).toBeNull()
  })
})
