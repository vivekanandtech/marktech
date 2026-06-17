import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { formatRoas } from '@/lib/formatters'
import { useThemeStore } from '@/store/themeStore'

interface RoasChartProps {
  data: Array<{ date: string; roas: number; blendedRoas?: number; attributedRoas?: number }>
  target?: number
}

function useChartColors() {
  const mode = useThemeStore((s) => s.mode)
  const isDark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return {
    grid:        isDark ? '#1e293b' : '#e2e8f0',
    axis:        isDark ? '#64748b' : '#94a3b8',
    tooltipBg:   isDark ? '#1e293b' : '#ffffff',
    tooltipBdr:  isDark ? '#334155' : '#e2e8f0',
    tooltipText: isDark ? '#f1f5f9' : '#0f172a',
    muted:       isDark ? '#94a3b8' : '#64748b',
  }
}

function CustomTooltip({ active, payload, label, colors }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBdr}` }} className="rounded-lg p-3 shadow-xl text-xs">
      <p style={{ color: colors.muted }} className="mb-2 font-medium">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-6">
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ color: colors.tooltipText }} className="font-bold">{formatRoas(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function RoasChart({ data, target = 4.5 }: RoasChartProps) {
  const c = useChartColors()
  // Normalise: accept either `roas` (live) or `blendedRoas` (mock-data compat)
  const normalised = data.map((d) => ({ ...d, roas: d.roas ?? d.blendedRoas ?? 0 }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={normalised} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
        <XAxis dataKey="date" tick={{ fill: c.axis, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: c.axis, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}x`} domain={['auto', 'auto']} />
        <Tooltip content={<CustomTooltip colors={c} />} />
        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} formatter={(v) => <span style={{ color: c.muted }}>{v}</span>} />
        <ReferenceLine y={target} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1} label={{ value: `Target ${target}x`, fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} />
        <Line name="Meta ROAS" type="monotone" dataKey="roas" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#6366f1' }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
