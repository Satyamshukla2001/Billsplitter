import { describe, expect, it } from 'vitest'
import { call, createBill, createHome, type Member } from './helpers'

describe('homes and members', () => {
  it('creates a home', async () => {
    const created = await call<{ id: string; name: string }>('POST', '/api/homes', {
      body: { name: 'Flat 4B' },
    })

    expect(created.status).toBe(201)
    expect(created.body.name).toBe('Flat 4B')
    expect(created.body.id).toEqual(expect.any(String))
  })

  it('adds a member to a home', async () => {
    const home = await call<{ id: string }>('POST', '/api/homes', { body: { name: 'Flat 4B' } })
    const member = await call<Member>('POST', `/api/homes/${home.body.id}/members`, {
      body: { name: 'Asha' },
    })

    expect(member.status).toBe(201)
    expect(member.body).toMatchObject({ homeId: home.body.id, name: 'Asha' })
  })

  it('accepts names with letters and spaces, including Unicode letters', async () => {
    const home = await call<{ id: string }>('POST', '/api/homes', { body: { name: 'Flat 4B' } })
    const member = await call<Member>('POST', `/api/homes/${home.body.id}/members`, {
      body: { name: 'Asha देवी' },
    })

    expect(member.status).toBe(201)
    expect(member.body.name).toBe('Asha देवी')
  })

  it.each(['12345', 'Asha2', 'Asha!', 'Asha-Devi', 'Asha_Devi'])(
    'rejects member name %j',
    async (name) => {
      const home = await call<{ id: string }>('POST', '/api/homes', {
        body: { name: 'Flat 4B' },
      })
      const member = await call('POST', `/api/homes/${home.body.id}/members`, {
        body: { name },
      })

      expect(member.status).toBe(422)
      expect(member.body).toMatchObject({ error: expect.stringMatching(/letters and spaces/i) })
    },
  )

  it('lists every home with assigned totals grouped by currency', async () => {
    const first = await createHome(['Asha', 'Ben'])
    const second = await createHome(['Chitra'])
    await createBill(first.homeId, 1200, first.members[0]?.id, 'USD')
    await createBill(first.homeId, 900, first.members[1]?.id, 'INR')
    await createBill(second.homeId, 550, second.members[0]?.id, 'EUR')

    const response = await call<{
      homes: {
        id: string
        totalsByCurrency: { currencyCode: string; amountCents: number }[]
      }[]
    }>('GET', '/api/homes')

    expect(response.status).toBe(200)
    expect(response.body.homes.find((home) => home.id === first.homeId)?.totalsByCurrency).toEqual([
      { currencyCode: 'INR', amountCents: 900 },
      { currencyCode: 'USD', amountCents: 1200 },
    ])
    expect(response.body.homes.find((home) => home.id === second.homeId)?.totalsByCurrency).toEqual(
      [{ currencyCode: 'EUR', amountCents: 550 }],
    )
  })

  it('shows zero INR total for homes without assigned bills', async () => {
    const { homeId } = await createHome([])
    const response = await call<{
      homes: { id: string; totalsByCurrency: { currencyCode: string; amountCents: number }[] }[]
    }>('GET', '/api/homes')

    expect(response.body.homes.find((home) => home.id === homeId)?.totalsByCurrency).toEqual([
      { currencyCode: 'INR', amountCents: 0 },
    ])
  })

  it('returns 404 when the home does not exist', async () => {
    const member = await call('POST', '/api/homes/does-not-exist/members', {
      body: { name: 'Asha' },
    })

    expect(member.status).toBe(404)
  })
})
