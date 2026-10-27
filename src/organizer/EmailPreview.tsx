import { plural } from '../format'

const EnvelopeIcon = () => (
  <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" className="shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m4 7 8 6 8-6" strokeLinecap="round" />
  </svg>
)

const EmailPreview = ({ heading, subject, body, recipientsCount }: {
  heading: string
  subject: string
  body: string
  recipientsCount: number
}) => (
  <section aria-label={heading} className="mt-4 min-w-0">
    <p className="flex items-center gap-2 text-sm font-medium text-ink-muted">
      <EnvelopeIcon />
      {heading}
    </p>
    <div className="mt-2 rounded-3xl border border-violet/60 bg-gradient-to-b from-[#241a45] to-paper p-5 text-paper-ink shadow-card max-sm:px-3 max-sm:py-4">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-paper-muted">От:</dt>
        <dd>Sqoch</dd>
        <dt className="text-paper-muted">Кому:</dt>
        <dd>{recipientsCount} {plural(recipientsCount, 'получатель', 'получателя', 'получателей')}</dd>
        <dt className="text-paper-muted">Тема:</dt>
        <dd className="break-words font-bold">
          {subject.trim() ? subject : <span className="font-normal text-paper-muted">Без темы</span>}
        </dd>
      </dl>
      <p className="mt-4 whitespace-pre-wrap break-words border-t border-paper-line pt-4 leading-relaxed">
        {body.trim() ? body : <span className="text-paper-muted">Текст письма пуст</span>}
      </p>
    </div>
  </section>
)

export default EmailPreview
