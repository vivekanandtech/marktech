export const DATE_RANGES = ['1D', '3D', '7D', '14D', '30D', '3M', '6M', '1Y'] as const

export const DATE_RANGE_DAYS: Record<string, number> = {
  '1D': 1,
  '3D': 3,
  '7D': 7,
  '14D': 14,
  '30D': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
}

export const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  advantage_plus: 'Advantage+',
  lookalike: 'Lookalike',
  retargeting: 'Retargeting',
  prospecting: 'Prospecting',
  brand_awareness: 'Brand',
}

export const ACTION_TAG_LABELS: Record<string, string> = {
  scale: 'Scale',
  watch: 'Watch',
  pause: 'Pause',
  optimise: 'Optimise',
}

export const CREATIVE_FORMAT_LABELS: Record<string, string> = {
  video: 'Video',
  image: 'Image',
  carousel: 'Carousel',
  reel: 'Reel',
  collection: 'Collection',
}

export const API_BASE_URL = import.meta?.env?.VITE_API_BASE_URL ?? 'http://localhost:3001'
