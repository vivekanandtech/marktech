// Currency formatting (INR, with Indian numbering system)
export function formatCurrency(value: number | undefined | null, compact = true): string {
  const v = value ?? 0
  if (!compact) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(v)
  }
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(2)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(1)}K`
  return `₹${v.toFixed(0)}`
}

export function formatNumber(value: number | undefined | null): string {
  const v = value ?? 0
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `${(v / 1_000).toFixed(1)}K`
  return v.toLocaleString('en-IN')
}

export function formatRoas(value: number | undefined | null): string {
  const v = value ?? 0
  return v > 0 ? `${v.toFixed(2)}x` : '–'
}

export function formatPercent(value: number | undefined | null, decimals = 1): string {
  return `${(value ?? 0).toFixed(decimals)}%`
}

export function formatChange(change: number | undefined | null): string {
  const v = change ?? 0
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

export function formatCpc(value: number | undefined | null): string {
  return `₹${(value ?? 0).toFixed(0)}`
}

export function formatCpm(value: number | undefined | null): string {
  return `₹${(value ?? 0).toFixed(0)}`
}
