import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { useThemeStore } from '@/store/themeStore'

interface SpendVsSalesChartProps {
  data: Array<{ date: string; adSpend: number; netSales: number; metaSpend: number; googleSpend: number }>
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
        <div key={p.dataKey} className="flex items-center justify-between gap-6 mb-0.5">
          <span style={{ color: p.color ?? p.fill }}>{p.name}</span>
          <span style={{ color: colors.tooltipText }} className="font-bold">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function SpendVsSalesChart({ data }: SpendVsSalesChartProps) {
  const c = useChartColors()
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
        <XAxis dataKey="date" tick={{ fill: c.axis, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis yAxisId="spend" tick={{ fill: c.axis, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCurrency(v)} />
        <YAxis yAxisId="sales" orientation="right" tick={{ fill: c.axis, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCurrency(v)} />
        <Tooltip content={<CustomTooltip colors={c} />} />
        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} formatter={(v) => <span style={{ color: c.muted }}>{v}</span>} />
        <Bar yAxisId="spend" dataKey="metaSpend" name="Meta Spend" stackId="spend" fill="#6366f1" fillOpacity={0.85} radius={[0, 0, 0, 0]} />
        <Bar yAxisId="spend" dataKey="googleSpend" name="Google Spend" stackId="spend" fill="#8b5cf6" fillOpacity={0.85} radius={[2, 2, 0, 0]} />
        <Line yAxisId="sales" name="Net Sales" type="monotone" dataKey="netSales" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
