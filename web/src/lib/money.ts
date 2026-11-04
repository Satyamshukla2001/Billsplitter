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

export function formatCents(cents: number, currency: CurrencyCode = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

/**
 * Turns a typed amount ("12", "12.5", "12.50") into whole cents.
 * It works on the text, not on floats, so 19.99 can never become 1998.999999.
 * Returns null when the text is not a positive amount with at most two decimals.
 */
export function parseAmountToCents(text: string): number | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text.trim())
  if (!match) return null
  const dollars = Number(match[1])
  const cents = Number((match[2] ?? '').padEnd(2, '0'))
  const total = dollars * 100 + cents
  return total > 0 ? total : null
}
