import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { getHistory, sendMessage } from './client'
import type { ChatMessage } from './client'
import { alertClass, cardClass, inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui'

const EXAMPLE = 'Переносим мастер-класс "Керамика" на 20 ноября, 19:00. Подготовь уведомление покупателям'

const ChatPanel = ({ onCampaign }: { onCampaign: (id: number) => void }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [error, setError] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    getHistory().then(setMessages, (reason: Error) => setError(reason.message))
  }, [])

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [messages, isThinking])

  const send = async () => {
    const message = text.trim()
    if (!message || isThinking) return
    setMessages((previous) => [...previous, { role: 'user', content: message }])
    setText('')
    setError('')
    setIsThinking(true)
    try {
      const { reply, campaignId } = await sendMessage(message)
      setMessages((previous) => [...previous, { role: 'assistant', content: reply }])
      if (campaignId !== null) onCampaign(campaignId)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setIsThinking(false)
      input.current?.focus()
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    send()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    send()
  }

  return (
    <section aria-labelledby="chat-heading" className={`${cardClass} flex flex-col gap-4`}>
      <h2 id="chat-heading" className="text-xl">Помощник</h2>
      <div ref={list} className="flex max-h-[28rem] min-h-40 flex-col gap-3 overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-sm text-ink-muted">
            <p>Например: {EXAMPLE}</p>
            <button
              type="button"
              onClick={() => {
                setText(EXAMPLE)
                input.current?.focus()
              }}
              className={`${secondaryButtonClass} mt-3`}
            >
              Вставить пример
            </button>
          </div>
        )}
        {messages.map((message, index) => (
          <p
            key={index}
            className={[
              'max-w-[85%] whitespace-pre-wrap break-words rounded-control px-4 py-2.5',
              message.role === 'user' ? 'self-end bg-surface-muted' : 'self-start border border-line',
            ].join(' ')}
          >
            <span className="sr-only">{message.role === 'user' ? 'Вы: ' : 'Помощник: '}</span>
            {message.content}
          </p>
        ))}
      </div>
      <p role="status" className="min-h-5 text-sm text-violet-soft">{isThinking && 'Помощник думает…'}</p>
      {error && <p role="alert" className={alertClass}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <label htmlFor="chat-input" className="text-sm font-medium">Сообщение помощнику</label>
        <textarea
          id="chat-input"
          ref={input}
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          className={inputClass}
        />
        <button type="submit" disabled={isThinking || !text.trim()} className={`${primaryButtonClass} mt-3`}>
          Отправить
        </button>
      </form>
    </section>
  )
}

export default ChatPanel
