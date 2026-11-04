import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from './api'

export type Resource<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: T }

/**
 * Loads data and exposes loading / error / success.
 * `load` must be stable (wrap it in useCallback). `reload` fetches again but keeps the
 * old data on screen until the new answer arrives, so the page does not flash.
 * A request that is cancelled (page left, or a newer one started) is ignored.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<Resource<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` only exists to re-run the effect
  useEffect(() => {
    const controller = new AbortController()
    setState((previous) => (previous.status === 'success' ? previous : { status: 'loading' }))
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'success', data })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: errorMessage(error) })
      },
    )
    return () => controller.abort()
  }, [load, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, reload }
}
