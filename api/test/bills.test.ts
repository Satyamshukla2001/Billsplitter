import { describe, expect, it, vi } from 'vitest'
import { call, createBill, createHome } from './helpers'

const testRates = {
  result: 'success',
  base_code: 'INR',
  time_last_update_utc: 'Thu, 05 Nov 2026 00:02:31 +0000',
  rates: {
    USD: 0.01,
    INR: 1,
    EUR: 0.009,
    GBP: 0.008,
    CAD: 0.014,
    AUD: 0.015,
    JPY: 1.5,
    AED: 0.039,
  },
}

describe('create a bill', () => {
  it('assigns the full amount only to the selected member', async () => {
    const { homeId, members } = await createHome(['Asha', 'Ben', 'Chitra'])

    const bill = await createBill(homeId, 3000, members[1]?.id)

    expect(bill.status).toBe(201)
    expect(bill.body.shares).toMatchObject([
      { memberId: members[1]?.id, amountCents: 3000, paidAt: null },
    ])
  })

  it('rejects a home with no members', async () => {
    const { homeId } = await createHome([])

    const bill = await createBill(homeId, 1000)

    expect(bill.status).toBe(422)
  })

  it('rejects bill titles that are not in the dropdown options', async () => {
    const { homeId, members } = await createHome(['Asha'])

    const bill = await call('POST', `/api/homes/${homeId}/bills`, {
      body: { title: 'Custom bill title', totalCents: 1000, memberId: members[0]?.id },
    })

    expect(bill.status).toBe(422)
  })

  it.each([0, -100, 10.5, '1000', null])('rejects the amount %j', async (totalCents) => {
    const { homeId, members } = await createHome(['Asha', 'Ben'])

    const bill = await call('POST', `/api/homes/${homeId}/bills`, {
      body: { title: 'Rent', totalCents, memberId: members[0]?.id },
    })

    expect(bill.status).toBe(422)
  })

  it('rejects a missing or unrelated member', async () => {
    const home = await createHome(['Asha'])
    const otherHome = await createHome(['Ben'])

    const missingMember = await call('POST', `/api/homes/${home.homeId}/bills`, {
      body: { title: 'Rent', totalCents: 1000 },
    })
    const unrelatedMember = await createBill(home.homeId, 1000, otherHome.members[0]?.id)

    expect(missingMember.status).toBe(422)
    expect(unrelatedMember.status).toBe(422)
  })

  it('stores the currency chosen for each bill', async () => {
    const { homeId, members } = await createHome(['Asha', 'Ben'])
    const bill = await createBill(homeId, 1200, members[1]?.id, 'USD')

    expect(bill.status).toBe(201)
    expect(bill.body).toMatchObject({ currencyCode: 'USD', totalCents: 1200 })

    const listed = await call<{ bills: { currencyCode: string; totalCents: number }[] }>(
      'GET',
      `/api/homes/${homeId}/bills`,
    )
    expect(listed.body.bills).toMatchObject([{ currencyCode: 'USD', totalCents: 1200 }])

    const balances = await call<{
      balances: { memberId: string; outstandingByCurrency: { currencyCode: string }[] }[]
    }>('GET', `/api/homes/${homeId}/balances`)
    expect(balances.body.balances).toMatchObject([
      { memberId: members[0]?.id, outstandingByCurrency: [] },
      {
        memberId: members[1]?.id,
        outstandingByCurrency: [{ currencyCode: 'USD' }],
      },
    ])
  })

  it('serves validated INR-based exchange rates', async () => {
    const fetchMock = vi.fn(async () => Response.json(testRates))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const rates = await call<{
        baseCode: string
        rates: { INR: number; USD: number }
        updatedAt: string
      }>('GET', '/api/exchange-rates')

      expect(rates.status).toBe(200)
      expect(rates.body).toMatchObject({
        baseCode: 'INR',
        rates: { INR: 1, USD: 0.01 },
        updatedAt: testRates.time_last_update_utc,
      })
      expect(fetchMock).toHaveBeenCalledWith(
        'https://open.er-api.com/v6/latest/INR',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reports an exchange-rate provider failure instead of returning a fake total', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unavailable', { status: 503 })),
    )
    try {
      const rates = await call<{ error: string }>('GET', '/api/exchange-rates')

      expect(rates.status).toBe(503)
      expect(rates.body.error).toMatch(/unavailable/i)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('returns 404 when the home does not exist', async () => {
    const bill = await createBill('does-not-exist', 1000)

    expect(bill.status).toBe(404)
  })
})
