import type { ReactNode } from 'react'
import type { Resource } from '../lib/useResource'

export function Loading({ label }: { label: string }) {
  return (
    <p className="muted" role="status">
      {label}
    </p>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error" role="alert">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

/** Renders the right thing for each state of a Resource, so no page forgets one. */
export function Async<T>({
  resource,
  loadingLabel,
  onRetry,
  children,
}: {
  resource: Resource<T>
  loadingLabel: string
  onRetry: () => void
  children: (data: T) => ReactNode
}) {
  if (resource.status === 'loading') return <Loading label={loadingLabel} />
  if (resource.status === 'error') return <ErrorBox message={resource.message} onRetry={onRetry} />
  return <>{children(resource.data)}</>
}
