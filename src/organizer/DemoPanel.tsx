import { useEffect, useState } from 'react'
import { getDemo, resetDemo, setMailerDown } from './client'
import { secondaryButtonClass } from '../components/ui'

const DemoPanel = ({ onReset }: { onReset: () => void }) => {
  const [mailerDown, setDown] = useState(false)

  useEffect(() => {
    getDemo().then((demo) => setDown(demo.mailerDown))
  }, [])

  const toggle = async (down: boolean) => {
    const demo = await setMailerDown(down)
    setDown(demo.mailerDown)
  }

  const reset = async () => {
    await resetDemo()
    onReset()
  }

  return (
    <section
      aria-label="Демо"
      className="mt-6 rounded-3xl border border-dashed border-line-strong bg-bg-soft p-5"
    >
      <p className="text-sm text-ink-muted">Инструмент для демонстрации</p>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Служба отправки</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="mailer"
              checked={!mailerDown}
              onChange={() => toggle(false)}
              className="size-5 accent-violet"
            />
            Работает
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="mailer"
              checked={mailerDown}
              onChange={() => toggle(true)}
              className="size-5 accent-violet"
            />
            Недоступна
          </label>
        </div>
      </fieldset>
      <button type="button" onClick={reset} className={`${secondaryButtonClass} mt-4`}>
        Сбросить данные
      </button>
    </section>
  )
}

export default DemoPanel
