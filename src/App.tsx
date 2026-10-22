import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { demoReset, demoTakeSeats, getSeats, subscribe } from './api.mock'
import type { ConfirmResult } from './api.mock'
import type { Participant } from './types'
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
  const firstRender = useRef(true)
  const previousStep = useRef(step)
  const seats = useSyncExternalStore(subscribe, getSeats)
  const order = {
    participants: participants.map((participant) => ({ ...participant, name: participant.name.trim() })),
    email: email.trim(),
  }

  useEffect(() => {
    if (firstRender.current || previousStep.current === step) {
      firstRender.current = false
      return
    }
    previousStep.current = step
    stepContent.current?.querySelector('h2')?.focus()
  }, [step])

  const addParticipant = () => {
    const participant = { id: nextId.current++, name: '', age: '' }
    setParticipants((previous) => [...previous, participant])
  }

  const reset = () => {
    setParticipants([{ id: nextId.current++, name: '', age: '' }])
    setEmail('')
    setResult(null)
    setStep('participants')
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <header className="mb-8 border-b border-slate-200 pb-6">
          <p className="mb-2 text-sm font-medium text-indigo-600">Покупка билетов</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Фестиваль «Огни города»</h1>
          <p className="mt-3 text-slate-600">14 июня, 19:00</p>
        </header>
        <div ref={stepContent}>
          {step === 'participants' && (
            <ParticipantsStep participants={participants} seats={seats}
              onChange={(participant) => setParticipants((previous) => previous.map((item) => item.id === participant.id ? participant : item))}
              onAdd={addParticipant}
              onRemove={(id) => setParticipants((previous) => previous.filter((participant) => participant.id !== id))}
              onContinue={() => setStep('review')} />
          )}
          {step === 'review' && (
            <ReviewStep order={order} email={email} onEmailChange={setEmail}
              onBack={() => setStep('participants')}
              onResult={(confirmation) => {
                setResult(confirmation)
                setStep('result')
              }} />
          )}
          {step === 'result' && result && (
            <ResultStep result={result} order={order} onEdit={() => setStep('participants')} onReset={reset} />
          )}
        </div>
        <section aria-label="Демо" className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-100 p-5">
          <p className="text-sm text-slate-500">инструмент для демонстрации</p>
          <p className="mt-2 text-sm text-slate-600">Осталось мест: {seats}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => demoTakeSeats(0)} className={secondaryButtonClass}>Демо: кто-то купил билеты</button>
            <button type="button" onClick={() => demoTakeSeats(1)} className={secondaryButtonClass}>Демо: осталось 1 место</button>
            <button type="button" onClick={demoReset} className={secondaryButtonClass}>Сбросить демо</button>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
