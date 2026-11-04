/**
 * Splits `totalCents` into `count` whole-cent parts that always add up to `totalCents`.
 * The remainder is handed out one cent at a time from the first part onwards,
 * so 1000 / 3 gives [334, 333, 333].
 */
export function splitCents(totalCents: number, count: number): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new RangeError('totalCents must be a positive whole number')
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError('count must be a positive whole number')
  }
  const base = Math.floor(totalCents / count)
  const remainder = totalCents % count
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0))
}
