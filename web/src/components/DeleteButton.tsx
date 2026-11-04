import { useState } from 'react'
import { errorMessage } from '../lib/api'
import { ErrorBox } from './Status'

export function DeleteButton({
  label,
  confirmation,
  onDelete,
}: {
  label: string
  confirmation: string
  onDelete: () => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    if (pending || !window.confirm(confirmation)) return
    setPending(true)
    setError(null)
    try {
      await onDelete()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <span className="delete-action">
      <button type="button" className="danger-button" onClick={remove} disabled={pending}>
        {pending ? 'Deleting…' : label}
      </button>
      {error ? <ErrorBox message={error} /> : null}
    </span>
  )
}
