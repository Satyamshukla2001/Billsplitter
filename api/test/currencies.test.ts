import { describe, expect, it } from 'vitest'
import {
  aggregateMoney,
  type CurrencyCode,
  convertToInrCents,
  formatCents,
  parseAmountToCents,
} from '../../web/src/lib/money'

const rates: Record<CurrencyCode, number> = {
  USD: 0.01,
  INR: 1,
  EUR: 0.009,
  GBP: 0.008,
  CAD: 0.014,
  AUD: 0.015,
  JPY: 1.5,
  AED: 0.039,
}

describe('currency amounts', () => {
  it('keeps same-currency totals and converts mixed totals to INR', () => {
    expect(
      aggregateMoney(
        [
          { currencyCode: 'USD', amountCents: 100 },
          { currencyCode: 'USD', amountCents: 250 },
        ],
        rates,
      ),
    ).toEqual({ currencyCode: 'USD', amountCents: 350 })
    expect(
      aggregateMoney(
        [
          { currencyCode: 'USD', amountCents: 100 },
          { currencyCode: 'INR', amountCents: 5000 },
        ],
        rates,
      ),
    ).toEqual({ currencyCode: 'INR', amountCents: 15000 })
    expect(
      aggregateMoney([
        { currencyCode: 'USD', amountCents: 100 },
        { currencyCode: 'INR', amountCents: 5000 },
      ]),
    ).toBeNull()
  })

  it('converts a foreign-currency amount to INR minor units', () => {
    expect(convertToInrCents(100, 'USD', rates)).toBe(10000)
    expect(convertToInrCents(10000, 'INR', rates)).toBe(10000)
  })

  it('uses the currency-specific number of minor units', () => {
    expect(parseAmountToCents('150', 'JPY')).toBe(150)
    expect(parseAmountToCents('150.5', 'JPY')).toBeNull()
    expect(formatCents(150, 'JPY')).toBe('¥150')
  })
})
