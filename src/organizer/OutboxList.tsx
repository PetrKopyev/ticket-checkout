import { useEffect, useState } from 'react'
import { getOutbox } from './client'
import type { OutboxItem } from './client'
import { cardClass, secondaryButtonClass } from '../components/ui'

const OutboxList = ({ reloadKey }: { reloadKey: number }) => {
  const [items, setItems] = useState<OutboxItem[]>([])

  const load = () => {
    getOutbox().then(setItems)
  }

  useEffect(load, [reloadKey])

  return (
    <section aria-labelledby="outbox-heading" className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="outbox-heading" className="text-xl">Отправленные письма</h2>
        <button type="button" onClick={load} className={secondaryButtonClass}>Обновить</button>
      </div>
      <p className="mt-1 text-sm text-ink-muted">Демо-почтовый ящик: что ушло покупателям</p>
      {items.length === 0 && <p className="mt-4 text-ink-muted">Писем пока нет</p>}
      <ul className="mt-4 flex flex-col gap-3 text-sm">
        {items.map((item) => (
          <li key={item.id} className="border-t border-line pt-3">
            <p className="break-all font-medium">{item.email}</p>
            <p className="break-words text-ink-soft">{item.subject}</p>
            <p className="text-ink-muted">{new Date(item.sentAt).toLocaleTimeString('ru-RU')}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default OutboxList
