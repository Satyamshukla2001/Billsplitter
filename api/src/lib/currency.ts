import { fail } from './http'

export const CURRENCY_CODES = ['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'AED'] as const

export type CurrencyCode = (typeof CURRENCY_CODES)[number]

export type ExchangeRates = {
  baseCode: 'INR'
  rates: Record<CurrencyCode, number>
  updatedAt: string
}

function isCurrencyCode(value: string): value is CurrencyCode {
  return CURRENCY_CODES.some((code) => code === value)
}

export function requireCurrencyCode(value: unknown): CurrencyCode {
  if (typeof value !== 'string' || !isCurrencyCode(value)) {
    return fail(422, 'Choose a supported currency')
  }
  return value
}

export async function fetchInrExchangeRates(): Promise<ExchangeRates> {
  let response: Response
  try {
    response = await fetch('https://open.er-api.com/v6/latest/INR', {
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    throw new Error('Could not reach the exchange-rate service')
  }
  if (!response.ok) throw new Error(`Exchange-rate service returned HTTP ${response.status}`)

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Exchange-rate service returned invalid JSON')
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Exchange-rate service returned an invalid response')
  }

  const data = payload as Record<string, unknown>
  if (data.result !== 'success' || data.base_code !== 'INR' || typeof data.rates !== 'object') {
    throw new Error('Exchange-rate service did not provide INR-based rates')
  }

  const sourceRates = data.rates as Record<string, unknown>
  const rates = {} as Record<CurrencyCode, number>
  for (const code of CURRENCY_CODES) {
    const rate = sourceRates[code]
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Exchange-rate service has no valid rate for ${code}`)
    }
    rates[code] = rate
  }

  return {
    baseCode: 'INR',
    rates,
    updatedAt:
      typeof data.time_last_update_utc === 'string' ? data.time_last_update_utc : 'unknown',
  }
}
