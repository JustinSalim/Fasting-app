import { describe, it, expect } from 'vitest'
import { kgToLb, lbToKg } from './units'

describe('kgToLb', () => {
  it('converts a known reference value', () => {
    expect(kgToLb(100)).toBeCloseTo(220.46, 1)
  })

  it('converts zero', () => {
    expect(kgToLb(0)).toBe(0)
  })
})

describe('lbToKg', () => {
  it('converts a known reference value', () => {
    expect(lbToKg(220.462)).toBeCloseTo(100, 1)
  })
})

describe('round-trip', () => {
  it('kg -> lb -> kg returns the original value', () => {
    expect(lbToKg(kgToLb(72.5))).toBeCloseTo(72.5, 6)
  })
})
