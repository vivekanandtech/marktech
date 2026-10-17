import { useState } from 'react'
import {
  TrendingUp, Wrench, ShieldAlert, Image, PieChart, MapPin, CheckCircle2, XCircle, RotateCcw,
  ChevronDown, Copy, Check, ExternalLink,
} from 'lucide-react'
import clsx from 'clsx'
import { accountManagerUrl, campaignManagerUrl, adsetManagerUrl, adManagerUrl } from '@/lib/meta-links'
import {
  Actionable, ActionableCategory, ActionableSeverity, actionableTitle, actionableCopyText, useActionablesStore,
} from '@/store/actionablesStore'

export const CATEGORY_CONFIG: Record<ActionableCategory, { icon: typeof TrendingUp; label: string; classes: string }> = {
  scale:     { icon: TrendingUp,  label: 'Scale',     classes: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  fix:       { icon: Wrench,      label: 'Fix',       classes: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30' },
  creative:  { icon: Image,       label: 'Creative',  classes: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30' },
  geography: { icon: MapPin,      label: 'Geography', classes: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/30' },
  tracking:  { icon: ShieldAlert, label: 'Tracking',  classes: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30' },
  budget:    { icon: PieChart,    label: 'Budget',    classes: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
}

const SEVERITY_CONFIG: Record<ActionableSeverity, { label: string; classes: string }> = {
  critical:    { label: 'Critical',    classes: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30' },
  warning:     { label: 'Warning',     classes: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30' },
  opportunity: { label: 'Opportunity', classes: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  info:        { label: 'Info',        classes: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
}

function sourceLink(a: Actionable, metaAdAccountId: string | null): { href: string; label: string; external: boolean } | null {
  if (a.platform === 'google') return { href: '/google', label: 'Open Google Ads', external: false }
  if (a.platform === 'shopify') return { href: '/shopify', label: 'Open Shopify analytics', external: false }
  if (!metaAdAccountId) return null
  const { level, id } = a.entity
  if (level === 'adset' && id) return { href: adsetManagerUrl(metaAdAccountId, id), label: 'Open ad set in Meta Ads Manager', external: true }
  if (level === 'ad' && id) return { href: adManagerUrl(metaAdAccountId, id), label: 'Open ad in Meta Ads Manager', external: true }
  if (level === 'campaign' && id) return { href: campaignManagerUrl(metaAdAccountId, id), label: 'Open campaign in Meta Ads Manager', external: true }
  if (a.platform === 'meta' || a.platform === 'cross') return { href: accountManagerUrl(metaAdAccountId), label: 'Open Meta Ads Manager', external: true }
  return null
}

function CopyIconButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
      }}
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-theme t3 hover:t1 hover:bg-surface-2 transition-colors"
      title={copied ? 'Copied' : 'Copy this action'}
      aria-label="Copy this action"
    >
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  )
}

function KVChips({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((m) => (
        <span key={m.label} className="inline-flex items-baseline gap-1.5 rounded-lg border border-theme bg-surface-2 px-2 py-1 text-[11px]">
          <span className="t3">{m.label}</span>
          <span className="font-semibold t1">{m.value}</span>
        </span>
      ))}
    </div>
  )
}

function Body({ a, clientId, metaAdAccountId }: { a: Actionable; clientId: string; metaAdAccountId: string | null }) {
  const updateStatus = useActionablesStore((s) => s.updateStatus)
  const link = sourceLink(a, metaAdAccountId)
  return (
    <div className="space-y-3">
      <p className="text-xs t2 leading-relaxed">{a.detail}</p>
      {a.metrics.length > 0 && <KVChips items={a.metrics} />}

      {a.plan && (
        <div className="rounded-lg border border-indigo-500/25 bg-indigo-500/5 p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 mb-1.5">Plan</p>
          <div className="grid gap-1 sm:grid-cols-3">
            {a.plan.map((p) => (
              <div key={p.label}>
                <p className="text-[10px] t3">{p.label}</p>
                <p className="text-xs font-semibold t1">{p.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(a.topCreatives || a.topProducts) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {a.topCreatives && (
            <div className="rounded-lg border border-theme p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider t3 mb-1.5">Creatives working in {a.entityName}</p>
              <ul className="space-y-1">
                {a.topCreatives.map((c) => (
                  <li key={c.id} className="text-[11px]">
                    {metaAdAccountId
                      ? <a href={adManagerUrl(metaAdAccountId, c.id)} target="_blank" rel="noopener noreferrer" className="font-medium t1 hover:text-indigo-500">{c.name}</a>
                      : <span className="font-medium t1">{c.name}</span>}
                    <span className="t3"> — {c.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.topProducts && (
            <div className="rounded-lg border border-theme p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider t3 mb-1.5">Best sellers in {a.entityName}</p>
              <ul className="space-y-1">
                {a.topProducts.map((p) => (
                  <li key={p.name} className="text-[11px]"><span className="font-medium t1">{p.name}</span><span className="t3"> — {p.detail}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {a.status === 'new' ? (
            <>
              <button
                onClick={() => updateStatus(clientId, a.id, 'done')}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                <CheckCircle2 size={11} /> Mark as done
              </button>
              <button
                onClick={() => updateStatus(clientId, a.id, 'dismissed')}
                className="flex items-center gap-1.5 text-[11px] font-semibold t3 hover:t1 transition-colors"
              >
                <XCircle size={11} /> Dismiss
              </button>
            </>
          ) : (
            <button
              onClick={() => updateStatus(clientId, a.id, 'new')}
              className="flex items-center gap-1.5 text-[11px] font-semibold t3 hover:t1 transition-colors"
            >
              <RotateCcw size={11} /> Reopen
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {link && (
            <a
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener noreferrer' : undefined}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white bg-[#1877F2] hover:bg-[#166fe5] rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <ExternalLink size={11} /> {link.label}
            </a>
          )}
          <CopyIconButton text={actionableCopyText(a)} />
        </div>
      </div>
    </div>
  )
}

export function ActionableCard({
  a, index, clientId, metaAdAccountId, defaultOpen = false,
}: { a: Actionable; index: number; clientId: string; metaAdAccountId: string | null; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const cfg = CATEGORY_CONFIG[a.category] ?? CATEGORY_CONFIG.fix
  const sev = SEVERITY_CONFIG[a.severity] ?? SEVERITY_CONFIG.info
  const Icon = cfg.icon

  return (
    <div className={clsx('card overflow-hidden', a.status === 'dismissed' && 'opacity-50', a.status === 'done' && 'opacity-75')}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-start gap-3 px-4 py-3 text-left">
        <span className="text-[11px] font-bold t3 w-5 shrink-0 mt-0.5">{index}</span>
        <Icon size={14} className={clsx('shrink-0 mt-0.5', cfg.classes.split(' ')[0])} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold t1 leading-snug">{actionableTitle(a)}</p>
          {a.context && <p className="text-[10px] t3 mt-0.5 truncate">{a.context}</p>}
        </div>
        <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0', sev.classes)}>{sev.label}</span>
        {a.status === 'done' && <span className="text-[10px] font-semibold text-emerald-500 shrink-0 mt-0.5">Done</span>}
        <ChevronDown size={14} className={clsx('t3 shrink-0 mt-0.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-4 pb-4 pl-12 -mt-1">
          <Body a={a} clientId={clientId} metaAdAccountId={metaAdAccountId} />
        </div>
      )}
    </div>
  )
}
