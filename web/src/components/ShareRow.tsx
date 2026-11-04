import { useRef, useState } from 'react'
import { api, errorMessage, type Share } from '../lib/api'
import { type CurrencyCode, formatCents } from '../lib/money'

/**
 * One share with its Pay button.
 *
 * The Idempotency-Key is created once per share and reused for every retry of a payment
 * that failed. If the first request actually reached the server but the answer got lost,
 * the retry is recognised and not charged twice. The key is dropped after a success.
 * The share only becomes "paid" on screen when the server confirms (the parent reloads).
 */
export function ShareRow({
  billId,
  share,
  memberName,
  currency,
  onPaid,
}: {
  billId: string
  share: Share
  memberName: string
  currency: CurrencyCode
  onPaid: () => void
}) {
  const keyRef = useRef<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pay() {
    if (pending) return
    keyRef.current ??= crypto.randomUUID()
    setPending(true)
    setError(null)
    try {
      await api.payShare(billId, share.id, keyRef.current)
      keyRef.current = null
      onPaid()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <li className="share">
      <div className="share-main">
        <span>{memberName}</span>
        <span className="amount">{formatCents(share.amountCents, currency)}</span>
        {share.paidAt ? (
          <span className="badge paid">Paid {new Date(share.paidAt).toLocaleDateString()}</span>
        ) : (
          <button type="button" onClick={pay} disabled={pending}>
            {pending ? 'Paying…' : error ? 'Retry payment' : 'Pay'}
          </button>
        )}
      </div>
      {error ? (
        <p className="error" role="alert">
          Payment failed: {error} The share is still unpaid.
        </p>
      ) : null}
    </li>
  )
}
