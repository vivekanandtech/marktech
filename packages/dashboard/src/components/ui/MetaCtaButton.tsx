import { ExternalLink } from 'lucide-react'
import clsx from 'clsx'

// Small "open in Meta Ads Manager" icon button reused on campaign/ad set/ad
// rows and creative cards. stopPropagation keeps it from triggering the row's
// own expand-on-click handler.
export function MetaCtaButton({ href, label, size = 'sm' }: { href: string; label?: string; size?: 'xs' | 'sm' }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open in Meta Ads Manager"
      className={clsx(
        'inline-flex items-center gap-1 shrink-0 rounded-md font-medium transition-colors',
        'bg-[#1877F2]/10 text-[#1877F2] hover:bg-[#1877F2]/20',
        size === 'xs' ? 'p-1' : 'px-1.5 py-1 text-[10px]'
      )}
    >
      <ExternalLink size={size === 'xs' ? 10 : 11} />
      {label}
    </a>
  )
}
