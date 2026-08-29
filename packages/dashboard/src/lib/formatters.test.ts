import { describe, it, expect } from 'vitest'
import { formatCurrency, formatNumber, formatRoas, formatPercent, formatChange, formatCpc, formatCpm } from './formatters'

describe('formatCurrency', () => {
  it('uses Crore/Lakh/Thousand compact suffixes at the right thresholds', () => {
    expect(formatCurrency(120_000_000)).toBe('₹12.00Cr')
    expect(formatCurrency(3_683_485.32)).toBe('₹36.83L')   // real Shopify net revenue seen this session
    expect(formatCurrency(222_818.34)).toBe('₹2.23L')      // real Attributed CPR seen this session
    expect(formatCurrency(5_000)).toBe('₹5.0K')
    expect(formatCurrency(500)).toBe('₹500')
  })

  it('treats null/undefined as 0 rather than throwing or printing "NaN"', () => {
    expect(formatCurrency(null)).toBe('₹0')
    expect(formatCurrency(undefined)).toBe('₹0')
  })

  it('renders full Indian-locale currency when compact=false', () => {
    expect(formatCurrency(150000, false)).toBe('₹1,50,000')
  })

  it('is exact at the boundary between suffix tiers', () => {
    expect(formatCurrency(99_999)).toBe('₹100.0K')  // just under 1L, still K-formatted
    expect(formatCurrency(100_000)).toBe('₹1.00L')  // exactly 1L
    expect(formatCurrency(9_999_999)).toBe('₹100.00L')
    expect(formatCurrency(10_000_000)).toBe('₹1.00Cr')
  })
})

describe('formatNumber', () => {
  it('applies the same compact suffixes as formatCurrency, without the ₹', () => {
    expect(formatNumber(87_993)).toBe('88.0K') // real Meta-sessions figure seen this session
    expect(formatNumber(5_000)).toBe('5.0K')
  })

  it('uses locale grouping below 1,000', () => {
    expect(formatNumber(999)).toBe('999')
  })

  it('treats null/undefined as 0', () => {
    expect(formatNumber(null)).toBe('0')
    expect(formatNumber(undefined)).toBe('0')
  })
})

describe('formatRoas', () => {
  it('formats positive values as "N.NNx"', () => {
    expect(formatRoas(1.1808)).toBe('1.18x') // real MER figure seen this session
    expect(formatRoas(9.9247)).toBe('9.92x')
  })

  it('renders an em-dash for zero or negative — NOT "0.00x", which would misleadingly imply a measured zero', () => {
    expect(formatRoas(0)).toBe('–')
    expect(formatRoas(-1)).toBe('–')
  })

  it('treats null/undefined as the zero case (em-dash), not a crash', () => {
    expect(formatRoas(null)).toBe('–')
    expect(formatRoas(undefined)).toBe('–')
  })
})

describe('formatPercent', () => {
  it('appends % with the requested decimal precision (default 1)', () => {
    expect(formatPercent(2.14)).toBe('2.1%')
    expect(formatPercent(2.146, 2)).toBe('2.15%')
  })

  it('treats null/undefined as 0%', () => {
    expect(formatPercent(null)).toBe('0.0%')
  })
})

describe('formatChange', () => {
  it('prefixes positive changes with a "+" but not negative ones', () => {
    expect(formatChange(27.47)).toBe('+27.5%')
    expect(formatChange(-21.5)).toBe('-21.5%')
    expect(formatChange(0)).toBe('0.0%')
  })
})

describe('formatCpc / formatCpm', () => {
  it('round to whole rupees with no compact suffix', () => {
    expect(formatCpc(18.2)).toBe('₹18')
    expect(formatCpm(132.6)).toBe('₹133')
  })

  it('treat null/undefined as ₹0', () => {
    expect(formatCpc(null)).toBe('₹0')
    expect(formatCpm(undefined)).toBe('₹0')
  })
})
