import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { demoReset, demoTakeSeats, getSeats, subscribe } from './api.mock'
import type { ConfirmResult } from './api.mock'
import type { Participant } from './types'
import { buildOrder } from './rules'
import ParticipantsStep from './components/ParticipantsStep'
import ReviewStep from './components/ReviewStep'
import ResultStep from './components/ResultStep'
import { secondaryButtonClass } from './components/ui'

const App = () => {
  const [step, setStep] = useState<'participants' | 'review' | 'result'>('participants')
  const [participants, setParticipants] = useState<Participant[]>([{ id: 1, name: '', age: '' }])
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<ConfirmResult | null>(null)
  const nextId = useRef(2)
  const stepContent = useRef<HTMLDivElement>(null)
  const previousStep = useRef(step)
  const seats = useSyncExternalStore(subscribe, getSeats)

  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    stepContent.current?.querySelector<HTMLElement>('[data-step-heading]')?.focus()
  }, [step])

  const addParticipant = () => {
    const participant = { id: nextId.current++, name: '', age: '' }
    setParticipants((previous) => [...previous, participant])
  }

  const updateParticipant = (participant: Participant) => {
    setParticipants((previous) => previous.map((item) => item.id === participant.id ? participant : item))
  }

  const removeParticipant = (id: number) => {
    setParticipants((previous) => previous.filter((participant) => participant.id !== id))
  }

  const reset = () => {
    setParticipants([{ id: nextId.current++, name: '', age: '' }])
    setEmail('')
    setResult(null)
    setStep('participants')
  }

  return (
    <main className="min-h-screen text-ink">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <header className="mb-8 border-b border-line pb-6">
          <p className="mb-2 text-sm font-medium text-violet-soft">Покупка билетов</p>
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="" width={32} height={32} className="shrink-0" />
            <h1 className="min-w-0 text-2xl sm:text-3xl">Фестиваль «Огни города»</h1>
          </div>
          <p className="mt-3 text-ink-muted">14 июня, 19:00</p>
        </header>
        <div ref={stepContent}>
          {step === 'participants' && (
            <ParticipantsStep
              participants={participants}
              seats={seats}
              onChange={updateParticipant}
              onAdd={addParticipant}
              onRemove={removeParticipant}
              onContinue={() => setStep('review')}
            />
          )}
          {step === 'review' && (
            <ReviewStep
              participants={participants}
              email={email}
              onEmailChange={setEmail}
              onBack={() => setStep('participants')}
              onResult={(confirmation) => {
                setResult(confirmation)
                setStep('result')
              }}
            />
          )}
          {step === 'result' && result && (
            <ResultStep
              result={result}
              order={buildOrder(participants, email)}
              onEdit={() => setStep('participants')}
              onReset={reset}
            />
          )}
        </div>
        <section
          aria-label="Демо"
          className="mt-6 rounded-3xl border border-dashed border-line-strong bg-bg-soft p-5"
        >
          <p className="text-sm text-ink-muted">Инструмент для демонстрации</p>
          <p className="mt-2 text-sm text-ink-muted">Мест сейчас: {seats}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => demoTakeSeats(0)} className={secondaryButtonClass}>
              Демо: кто-то купил билеты
            </button>
            <button type="button" onClick={() => demoTakeSeats(1)} className={secondaryButtonClass}>
              Демо: осталось 1 место
            </button>
            <button type="button" onClick={demoReset} className={secondaryButtonClass}>
              Сбросить демо
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
