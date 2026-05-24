import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useThemeStore } from '@/store/themeStore'

interface ConversionRateChartProps {
  data: Array<{ date: string; conversionRate: number }>
}

function useChartColors() {
  const mode = useThemeStore((s) => s.mode)
  const isDark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return {
    grid:        isDark ? '#1e293b' : '#e2e8f0',
    axis:        isDark ? '#64748b' : '#94a3b8',
    tooltipBg:   isDark ? '#1e293b' : '#ffffff',
    tooltipBdr:  isDark ? '#334155' : '#e2e8f0',
    muted:       isDark ? '#94a3b8' : '#64748b',
  }
}

function CustomTooltip({ active, payload, label, colors }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBdr}` }} className="rounded-lg p-3 shadow-xl text-xs">
      <p style={{ color: colors.muted }} className="mb-1 font-medium">{label}</p>
      <p className="font-bold text-emerald-500">{payload[0]?.value?.toFixed(2)}%</p>
    </div>
  )
}

export function ConversionRateChart({ data }: ConversionRateChartProps) {
  const c = useChartColors()
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="cvr-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
        <XAxis dataKey="date" tick={{ fill: c.axis, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: c.axis, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} domain={['auto', 'auto']} />
        <Tooltip content={<CustomTooltip colors={c} />} />
        <Area
          type="monotone"
          dataKey="conversionRate"
          name="Conversion Rate"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#cvr-grad)"
          dot={false}
          activeDot={{ r: 4, fill: '#10b981' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
