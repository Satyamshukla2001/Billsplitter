import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

export type AppEnv = { Bindings: Env; Variables: { userEmail: string } }

const MAX_NAME_LENGTH = 100
const MAX_KEY_LENGTH = 255
const BILL_TITLES = ['Rent', 'Electricity', 'Water', 'Internet', 'Groceries', 'Gas'] as const

export function fail(status: 400 | 404 | 409 | 422 | 503, message: string): never {
  throw new HTTPException(status, { message })
}

/** Reads the body as a JSON object. Anything else (bad JSON, array, null) is a 400. */
export async function readJsonObject(c: Context): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return fail(400, 'Request body must be valid JSON')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return fail(400, 'Request body must be a JSON object')
  }
  return body as Record<string, unknown>
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(422, `${field} must be a non-empty string`)
  }
  const text = value.trim()
  if (text.length > maxLength) {
    return fail(422, `${field} must be at most ${maxLength} characters`)
  }
  return text
}

export const requireName = (value: unknown) => requireText(value, 'name', MAX_NAME_LENGTH)
export function requireMemberName(value: unknown): string {
  const name = requireText(value, 'name', MAX_NAME_LENGTH)
  if (!/^(?:\p{L}\p{M}*)+(?:\s+(?:\p{L}\p{M}*)+)*$/u.test(name)) {
    return fail(422, 'Member names can contain letters and spaces only')
  }
  return name
}

export function requireBillTitle(value: unknown): string {
  const title = requireText(value, 'title', 200)
  if (!BILL_TITLES.some((allowedTitle) => allowedTitle === title)) {
    return fail(422, 'Choose a bill title from the available options')
  }
  return title
}

/** Money must be a positive whole number of cents. Strings, decimals, 0 and negatives are rejected. */
export function requireTotalCents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return fail(422, 'totalCents must be a positive whole number of cents')
  }
  return value
}

export function requireIdempotencyKey(c: Context): string {
  const key = c.req.header('Idempotency-Key')?.trim()
  if (!key) return fail(400, 'Idempotency-Key header is required')
  if (key.length > MAX_KEY_LENGTH) {
    return fail(400, `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters`)
  }
  return key
}
