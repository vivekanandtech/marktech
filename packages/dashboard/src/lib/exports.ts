import { transformInsightMetrics, deriveActionTag, ActionTag } from './meta-transform'

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function fileSafe(s: string) {
  return s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'export'
}

const today = () => new Date().toISOString().slice(0, 10)

type ActionBucket = ActionTag

const AD_COLUMNS: { header: string; key: string; width: number; numFmt?: string }[] = [
  { header: 'Campaign', key: 'campaign', width: 38 },
  { header: 'Ad Set', key: 'adset', width: 34 },
  { header: 'Ad', key: 'ad', width: 34 },
  { header: 'Amount Spent (₹)', key: 'spend', width: 16, numFmt: '#,##0' },
  { header: 'Results', key: 'results', width: 10, numFmt: '#,##0' },
  { header: 'Result Type', key: 'resultLabel', width: 16 },
  { header: 'Cost per Result (₹)', key: 'costPerResult', width: 17, numFmt: '#,##0' },
  { header: 'ROAS', key: 'roas', width: 8, numFmt: '0.00"x"' },
  { header: 'Purchase Value (₹)', key: 'purchaseValue', width: 17, numFmt: '#,##0' },
  { header: 'Purchases', key: 'purchases', width: 10, numFmt: '#,##0' },
  { header: 'Add to Carts', key: 'addToCart', width: 12, numFmt: '#,##0' },
  { header: 'Checkouts Initiated', key: 'initiateCheckout', width: 17, numFmt: '#,##0' },
  { header: 'Impressions', key: 'impressions', width: 13, numFmt: '#,##0' },
  { header: 'Reach', key: 'reach', width: 12, numFmt: '#,##0' },
  { header: 'Frequency', key: 'frequency', width: 10, numFmt: '0.00' },
  { header: 'Clicks', key: 'clicks', width: 10, numFmt: '#,##0' },
  { header: 'CTR (%)', key: 'ctr', width: 9, numFmt: '0.00' },
  { header: 'CPM (₹)', key: 'cpm', width: 10, numFmt: '#,##0' },
]

const TAB_STYLE: Record<ActionBucket, { title: string; argb: string; note: string }> = {
  scale:    { title: 'Scale',    argb: 'FF10B981', note: 'ROAS ≥ 4.5x — candidates for more budget' },
  optimise: { title: 'Optimise', argb: 'FF3B82F6', note: 'ROAS < 3x — fix creative/audience or cut spend' },
  watch:    { title: 'Watch',    argb: 'FFF59E0B', note: 'ROAS 3x–4.5x — hold and monitor' },
}

export async function exportMetaAdsExcel(rawRows: any[], opts: { accountName: string; dateRange: string }) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Marktech'
  wb.created = new Date()

  const rows = rawRows.map((r) => {
    const m = transformInsightMetrics(r)
    return {
      campaign: r.campaign_name ?? '', adset: r.adset_name ?? '', ad: r.ad_name ?? '',
      spend: m.spend, results: m.results, resultLabel: m.results > 0 ? m.resultLabel : '',
      costPerResult: m.costPerResult, roas: m.roas, purchaseValue: m.roas * m.spend,
      purchases: m.conversions, addToCart: m.funnel.addToCart, initiateCheckout: m.funnel.initiateCheckout,
      impressions: m.impressions, reach: m.reach, frequency: m.frequency, clicks: m.clicks, ctr: m.ctr, cpm: m.cpm,
      // Same rule as the table's Scale/Watch/Optimise badges, so the export
      // never disagrees with what the user just saw on screen.
      bucket: deriveActionTag(m.roas),
    }
  })

  for (const bucket of ['scale', 'optimise', 'watch'] as ActionBucket[]) {
    const style = TAB_STYLE[bucket]
    const ws = wb.addWorksheet(style.title, { properties: { tabColor: { argb: style.argb } }, views: [{ state: 'frozen', ySplit: 3 }] })
    const tabRows = rows.filter((r) => r.bucket === bucket).sort((a, b) => b.spend - a.spend)
    const spend = tabRows.reduce((s, r) => s + r.spend, 0)
    const value = tabRows.reduce((s, r) => s + r.purchaseValue, 0)

    ws.getCell('A1').value = `${style.title} — ${tabRows.length} ads · ${opts.accountName} · ${opts.dateRange} window`
    ws.getCell('A1').font = { bold: true, size: 13 }
    ws.getCell('A2').value = `${style.note}.  Spend ₹${Math.round(spend).toLocaleString('en-IN')} · ROAS ${spend > 0 ? (value / spend).toFixed(2) : '0.00'}x`
    ws.getCell('A2').font = { italic: true, color: { argb: 'FF64748B' } }

    ws.columns = AD_COLUMNS.map((c) => ({ key: c.key, width: c.width }))
    const header = ws.getRow(3)
    AD_COLUMNS.forEach((c, i) => {
      const cell = header.getCell(i + 1)
      cell.value = c.header
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.argb } }
      cell.alignment = { vertical: 'middle', wrapText: true }
    })
    header.height = 30

    for (const r of tabRows) {
      const row = ws.addRow(r)
      AD_COLUMNS.forEach((c, i) => { if (c.numFmt) row.getCell(i + 1).numFmt = c.numFmt })
    }
    if (tabRows.length > 0) ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + tabRows.length, column: AD_COLUMNS.length } }
  }

  const buf = await wb.xlsx.writeBuffer()
  downloadBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Marktech_Meta_Ads_${fileSafe(opts.accountName)}_${opts.dateRange}_${today()}.xlsx`,
  )
}

export async function exportActionablesDocx(
  payload: { items: any[]; dateRange: string; window: { since: string; until: string }; clientName: string | null; metaAccountName: string | null; generatedAt: string },
) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
  const items = payload.items.filter((i) => i.status !== 'dismissed')
  const generated = new Date(payload.generatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  const bullet = (text: string) => new Paragraph({ text, bullet: { level: 0 } })
  const label = (text: string) => new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text, bold: true })] })

  const children: any[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, text: `Actionables — ${payload.clientName ?? 'Client'}` }),
    new Paragraph({
      children: [new TextRun({
        text: `${payload.window.since} to ${payload.window.until} (${payload.dateRange})${payload.metaAccountName ? ` · Meta account: ${payload.metaAccountName}` : ''} · Generated ${generated} · ${items.length} actions`,
        italics: true, color: '64748B',
      })],
    }),
  ]

  items.forEach((a, idx) => {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320 },
      children: [new TextRun({ text: `${idx + 1}. ${a.action} - ${a.entityName}` }), ...(a.status === 'done' ? [new TextRun({ text: '  (Done)', color: '10B981' })] : [])],
    }))
    if (a.context) children.push(new Paragraph({ children: [new TextRun({ text: a.context, italics: true, color: '64748B', size: 18 })] }))
    children.push(new Paragraph({ spacing: { before: 80 }, text: a.detail }))
    if (a.metrics?.length) a.metrics.forEach((m: any) => children.push(bullet(`${m.label}: ${m.value}`)))
    if (a.plan?.length) { children.push(label('Plan')); a.plan.forEach((p: any) => children.push(bullet(`${p.label}: ${p.value}`))) }
    if (a.topCreatives?.length) { children.push(label('Creatives working in this market')); a.topCreatives.forEach((c: any) => children.push(bullet(`${c.name} — ${c.detail}`))) }
    if (a.topProducts?.length) { children.push(label('Best-selling products in this market')); a.topProducts.forEach((p: any) => children.push(bullet(`${p.name} — ${p.detail}`))) }
  })

  const doc = new Document({ creator: 'Marktech', title: 'Actionables', sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `Marktech_Actionables_${fileSafe(payload.clientName ?? 'client')}_${payload.dateRange}_${today()}.docx`)
}
