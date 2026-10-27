import type { ReactNode } from 'react'

const navLinkClass = 'rounded-control flex min-h-11 min-w-0 items-center px-3 py-2 text-center font-semibold text-ink-muted hover:text-ink aria-[current=page]:bg-surface-muted aria-[current=page]:text-ink'

// Одна обёртка на обе страницы: вкладки и контент стоят на одном месте.
const PageLayout = ({ isOrganizer, children }: { isOrganizer: boolean; children: ReactNode }) => (
  <main className="min-h-screen text-ink print:min-h-0">
    <div className="mx-auto min-w-0 max-w-5xl px-2 pt-6 pb-6 sm:px-4">
      <nav aria-label="Разделы" className="mb-4 flex flex-wrap gap-2 print:hidden">
        <a href="#/" aria-current={isOrganizer ? undefined : 'page'} className={navLinkClass}>Билеты</a>
        <a href="#/organizer" aria-current={isOrganizer ? 'page' : undefined} className={navLinkClass}>
          Организатор
        </a>
      </nav>
      {children}
    </div>
  </main>
)

export default PageLayout
