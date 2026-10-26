import { useEffect, useState } from 'react'
import { getDemo, resetDemo, setMailerDown } from './client'
import { alertClass, secondaryButtonClass } from '../components/ui'

const DemoPanel = ({ onReset }: { onReset: () => void }) => {
  const [mailerDown, setDown] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getDemo().then((demo) => setDown(demo.mailerDown), (reason: Error) => setError(reason.message))
  }, [])

  const toggle = async (down: boolean) => {
    setError('')
    try {
      const demo = await setMailerDown(down)
      setDown(demo.mailerDown)
    } catch (reason) {
      setError(`Не удалось переключить службу: ${(reason as Error).message}`)
    }
  }

  const reset = async () => {
    setError('')
    try {
      await resetDemo()
      onReset()
    } catch (reason) {
      setError(`Не удалось сбросить данные: ${(reason as Error).message}`)
    }
  }

  return (
    <details className="group mt-6 rounded-3xl border border-dashed border-line-strong bg-bg-soft p-5 max-sm:px-3 max-sm:py-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-bright [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-semibold">Демо-настройки</span>
          <span className="block text-sm text-ink-muted">Только для демонстрации</span>
        </span>
        <span aria-hidden="true" className="text-ink-muted transition-transform group-open:rotate-90 motion-reduce:transition-none">
          ›
        </span>
      </summary>
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
      {error && <p role="alert" className={`${alertClass} mt-4`}>{error}</p>}
    </details>
  )
}

export default DemoPanel
