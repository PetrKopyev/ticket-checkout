import type { ReactNode } from 'react'
import { formatPrice } from './ui'

const SubmitBar = ({ total, children }: { total: number; children: ReactNode }) => (
  <div className={[
    'fixed inset-x-0 bottom-0 z-10 flex min-w-0 flex-wrap items-center justify-between gap-3',
    'border-t border-line bg-card/90 px-4 pt-3 backdrop-blur',
    'pb-[max(0.75rem,env(safe-area-inset-bottom))] md:contents',
  ].join(' ')}>
    <div className="min-w-0 md:hidden">
      <p className="text-sm text-ink-muted">Итого</p>
      <p className="text-2xl font-extrabold tabular-nums text-violet-soft">{formatPrice(total)}</p>
    </div>
    {children}
  </div>
)

export default SubmitBar
