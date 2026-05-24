import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatCurrency, formatRoas } from '@/lib/formatters'
import { useThemeStore } from '@/store/themeStore'

interface FormatBreakdownChartProps {
  data: Array<{ format: string; spend: number; roas: number; impressions: number }>
}

const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#64748b']

function useChartColors() {
  const mode = useThemeStore((s) => s.mode)
  const isDark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return {
    tooltipBg:   isDark ? '#1e293b' : '#ffffff',
    tooltipBdr:  isDark ? '#334155' : '#e2e8f0',
    tooltipText: isDark ? '#f1f5f9' : '#0f172a',
    muted:       isDark ? '#94a3b8' : '#64748b',
  }
}

function CustomTooltip({ active, payload, colors }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBdr}` }} className="rounded-lg p-3 shadow-xl text-xs">
      <p style={{ color: colors.tooltipText }} className="font-medium mb-2">{d.format}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4"><span style={{ color: colors.muted }}>Spend</span><span style={{ color: colors.tooltipText }} className="font-bold">{formatCurrency(d.spend)}</span></div>
        <div className="flex justify-between gap-4"><span style={{ color: colors.muted }}>ROAS</span><span className="font-bold text-indigo-400">{formatRoas(d.roas)}</span></div>
      </div>
    </div>
  )
}

export function FormatBreakdownChart({ data }: FormatBreakdownChartProps) {
  const c = useChartColors()
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="40%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          dataKey="spend"
          nameKey="format"
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip colors={c} />} />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          wrapperStyle={{ fontSize: '11px' }}
          formatter={(v, entry: any) => (
            <span style={{ color: c.muted }}>
              {v} <span style={{ color: COLORS[entry.payload?.cx ? 0 : 0] }}>{formatRoas(entry.payload.roas)}</span>
            </span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
