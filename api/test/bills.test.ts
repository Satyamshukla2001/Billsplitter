import { describe, expect, it } from 'vitest'
import { call, createBill, createHome } from './helpers'

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

  it('returns 404 when the home does not exist', async () => {
    const bill = await createBill('does-not-exist', 1000)

    expect(bill.status).toBe(404)
  })
})
