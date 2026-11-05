export const CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'JPY', label: 'JPY — Japanese Yen' },
  { code: 'AED', label: 'AED — UAE Dirham' },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]['code']

export function isCurrencyCode(value: string): value is CurrencyCode {
  return CURRENCIES.some(({ code }) => code === value)
}

export function currencyFractionDigits(currency: CurrencyCode): number {
  return (
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  )
}

export function formatCents(cents: number, currency: CurrencyCode = 'USD'): string {
  const fractionDigits = currencyFractionDigits(currency)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(cents / 10 ** fractionDigits)
}

export function convertToInrCents(
  amountMinor: number,
  currency: CurrencyCode,
  rates: Record<CurrencyCode, number>,
): number {
  const amount = amountMinor / 10 ** currencyFractionDigits(currency)
  return Math.round((amount / rates[currency]) * 100)
}

export function aggregateMoney(
  amounts: { currencyCode: CurrencyCode; amountCents: number }[],
  rates?: Record<CurrencyCode, number>,
): { currencyCode: CurrencyCode; amountCents: number } | null {
  const currencies = new Set(amounts.map(({ currencyCode }) => currencyCode))
  if (currencies.size === 0) return { currencyCode: 'INR', amountCents: 0 }

  if (currencies.size === 1) {
    return {
      currencyCode: amounts[0]?.currencyCode ?? 'INR',
      amountCents: amounts.reduce((total, amount) => total + amount.amountCents, 0),
    }
  }

  if (!rates) return null
  const totalInr =
    amounts.reduce(
      (total, amount) =>
        total +
        amount.amountCents /
          10 ** currencyFractionDigits(amount.currencyCode) /
          rates[amount.currencyCode],
      0,
    ) * 100
  return { currencyCode: 'INR', amountCents: Math.round(totalInr) }
}

/**
 * Parses an amount into the currency's minor units without introducing float rounding.
 */
export function parseAmountToCents(text: string, currency: CurrencyCode = 'USD'): number | null {
  const fractionDigits = currencyFractionDigits(currency)
  const decimals = fractionDigits === 0 ? '' : `(?:\\.(\\d{1,${fractionDigits}}))?`
  const match = new RegExp(`^(\\d{1,12})${decimals}$`).exec(text.trim())
  if (!match) return null
  const dollars = Number(match[1])
  const minorUnits = Number((match[2] ?? '').padEnd(fractionDigits, '0'))
  const total = dollars * 10 ** fractionDigits + minorUnits
  return total > 0 ? total : null
}
