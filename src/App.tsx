import { useRef, useState, useSyncExternalStore } from 'react'
import { getSeats, subscribe } from './api.mock'
import type { ConfirmResult } from './api.mock'
import type { Participant } from './types'
import ParticipantsStep from './components/ParticipantsStep'
import ReviewStep from './components/ReviewStep'
import ResultStep from './components/ResultStep'

const App = () => {
  const [step, setStep] = useState<'participants' | 'review' | 'result'>('participants')
  const [participants, setParticipants] = useState<Participant[]>([{ id: 1, name: '', age: '' }])
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<ConfirmResult | null>(null)
  const nextId = useRef(2)
  const seats = useSyncExternalStore(subscribe, getSeats)

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
        {step === 'participants' && (
          <ParticipantsStep participants={participants} seats={seats}
            onChange={(participant) => setParticipants((previous) => previous.map((item) => item.id === participant.id ? participant : item))}
            onAdd={addParticipant}
            onRemove={(id) => setParticipants((previous) => previous.filter((participant) => participant.id !== id))}
            onContinue={() => setStep('review')} />
        )}
        {step === 'review' && (
          <ReviewStep order={{ participants, email }} seats={seats} onEmailChange={setEmail}
            onBack={() => setStep('participants')}
            onResult={(confirmation) => {
              setResult(confirmation)
              setStep('result')
            }} />
        )}
        {step === 'result' && result && (
          <ResultStep result={result} order={{ participants, email }} onEdit={() => setStep('participants')} onReset={reset} />
        )}
      </div>
    </main>
  )
}

export default App
