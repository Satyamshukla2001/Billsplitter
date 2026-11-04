export type Home = { id: string; name: string }
export type Member = { id: string; homeId: string; name: string }
export type HomeDetail = Home & { members: Member[] }
export type Share = { id: string; memberId: string; amountCents: number; paidAt: string | null }
export type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}
export type Balance = { memberId: string; name: string; outstandingCents: number }

const REQUEST_TIMEOUT_MS = 10_000

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

function readErrorMessage(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const { error } = payload as { error: unknown }
    if (typeof error === 'string') return error
  }
  return null
}

/**
 * Talks to the API. It never throws anything but ApiError (or an AbortError when the
 * caller cancels), so the UI has one error type to deal with: a slow server, a dead
 * network, a 500 with an HTML body and a normal { error } answer all become a message.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (timeout.aborted) throw new ApiError('The server took too long to answer. Try again.', 0)
    throw new ApiError('Could not reach the server. Check your connection.', 0)
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // Not JSON (for example a gateway error page). Handled below.
  }

  if (!response.ok) {
    const fallback =
      response.status >= 500
        ? 'The server had a problem. Try again.'
        : `Request failed (${response.status}).`
    throw new ApiError(readErrorMessage(payload) ?? fallback, response.status)
  }
  if (payload === null) throw new ApiError('The server sent an unreadable answer.', response.status)
  return payload as T
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

export const api = {
  listHomes: (signal: AbortSignal) =>
    request<{ homes: Home[] }>('/api/homes', { signal }).then((r) => r.homes),
  createHome: (name: string) => request<Home>('/api/homes', { method: 'POST', body: { name } }),
  deleteHome: (homeId: string) =>
    request<{ deleted: true; id: string; name: string }>(
      `/api/homes/${encodeURIComponent(homeId)}`,
      {
        method: 'DELETE',
      },
    ),
  deleteMember: (homeId: string, memberId: string) =>
    request<{ deleted: true; id: string; homeId: string }>(
      `/api/homes/${encodeURIComponent(homeId)}/members/${encodeURIComponent(memberId)}`,
      { method: 'DELETE' },
    ),
  getHome: (homeId: string, signal: AbortSignal) =>
    request<HomeDetail>(`/api/homes/${encodeURIComponent(homeId)}`, { signal }),
  addMember: (homeId: string, name: string) =>
    request<Member>(`/api/homes/${encodeURIComponent(homeId)}/members`, {
      method: 'POST',
      body: { name },
    }),
  listBills: (homeId: string, signal: AbortSignal) =>
    request<{ bills: Bill[] }>(`/api/homes/${encodeURIComponent(homeId)}/bills`, { signal }).then(
      (r) => r.bills,
    ),
  createBill: (homeId: string, title: string, totalCents: number) =>
    request<Bill>(`/api/homes/${encodeURIComponent(homeId)}/bills`, {
      method: 'POST',
      body: { title, totalCents },
    }),
  getBalances: (homeId: string, signal: AbortSignal) =>
    request<{ balances: Balance[] }>(`/api/homes/${encodeURIComponent(homeId)}/balances`, {
      signal,
    }).then((r) => r.balances),
  payShare: (billId: string, shareId: string, idempotencyKey: string) =>
    request<Share>(
      `/api/bills/${encodeURIComponent(billId)}/shares/${encodeURIComponent(shareId)}/pay`,
      { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } },
    ),
}
