import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList,
  ResponsiveContainer,
} from 'recharts'
import { useThemeStore } from '@/store/themeStore'
import { formatNumber } from '@/lib/formatters'

export interface ProductFunnelStage {
  stage: string
  value: number
}

interface ProductFunnelChartProps {
  data: ProductFunnelStage[]
  mode: 'count' | 'percent'
}

const STAGE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981']

function useChartColors() {
  const themeMode = useThemeStore((s) => s.mode)
  const isDark = themeMode === 'dark' || (themeMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return {
    grid:        isDark ? '#1e293b' : '#e2e8f0',
    axis:        isDark ? '#64748b' : '#94a3b8',
    tooltipBg:   isDark ? '#1e293b' : '#ffffff',
    tooltipBdr:  isDark ? '#334155' : '#e2e8f0',
    tooltipText: isDark ? '#f1f5f9' : '#0f172a',
    muted:       isDark ? '#94a3b8' : '#64748b',
    label:       isDark ? '#e2e8f0' : '#1e293b',
  }
}

function CustomTooltip({ active, payload, colors, mode }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div style={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBdr}` }} className="rounded-lg p-3 shadow-xl text-xs">
      <p style={{ color: colors.muted }} className="mb-1 font-medium">{p.payload.stage}</p>
      <p style={{ color: colors.tooltipText }} className="font-bold">
        {mode === 'percent' ? `${p.value.toFixed(1)}%` : formatNumber(p.value)}
      </p>
    </div>
  )
}

export function ProductFunnelChart({ data, mode }: ProductFunnelChartProps) {
  const c = useChartColors()
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="stage"
          tick={{ fill: c.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={90}
        />
        <Tooltip content={<CustomTooltip colors={c} mode={mode} />} cursor={{ fill: c.grid, opacity: 0.3 }} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
          {data.map((_, i) => <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />)}
          <LabelList
            dataKey="value"
            position="right"
            fill={c.label}
            fontSize={11}
            fontWeight={600}
            formatter={(v: number) => (mode === 'percent' ? `${v.toFixed(1)}%` : formatNumber(v))}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
