const EmailPreview = ({ heading, subject, body }: { heading: string; subject: string; body: string }) => (
  <section aria-label={heading} className="mt-4 rounded-control border border-line bg-bg-soft p-4 max-sm:px-3">
    <p className="text-sm font-medium text-ink-muted">{heading}</p>
    <p className="mt-3 break-words font-bold">
      {subject.trim() ? subject : <span className="font-normal text-ink-muted">Без темы</span>}
    </p>
    <p className="mt-3 whitespace-pre-wrap break-words border-t border-line pt-3 text-ink-soft">
      {body.trim() ? body : <span className="text-ink-muted">Текст письма пуст</span>}
    </p>
  </section>
)

export default EmailPreview
