// Currency formatting (INR, with Indian numbering system)
export function formatCurrency(value: number, compact = true): string {
  if (!compact) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value)
  }

  if (value >= 10_000_000) {
    return `₹${(value / 10_000_000).toFixed(2)}Cr`
  }
  if (value >= 100_000) {
    return `₹${(value / 100_000).toFixed(2)}L`
  }
  if (value >= 1_000) {
    return `₹${(value / 1_000).toFixed(1)}K`
  }
  return `₹${value.toFixed(0)}`
}

export function formatNumber(value: number): string {
  if (value >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}Cr`
  if (value >= 100_000) return `${(value / 100_000).toFixed(1)}L`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString('en-IN')
}

export function formatRoas(value: number): string {
  return `${value.toFixed(2)}x`
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

export function formatChange(change: number): string {
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(1)}%`
}

export function formatCpc(value: number): string {
  return `₹${value.toFixed(0)}`
}

export function formatCpm(value: number): string {
  return `₹${value.toFixed(0)}`
}
