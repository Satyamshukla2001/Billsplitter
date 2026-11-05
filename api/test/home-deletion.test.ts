import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { call, type Member } from './helpers'

async function remove(path: string) {
  const response = await exports.default.fetch(
    new Request(`http://localhost${path}`, { method: 'DELETE' }),
  )
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe('home and member deletion', () => {
  it('deletes bills assigned only to a member, then deletes the home', async () => {
    const home = await call<{ id: string }>('POST', '/api/homes', { body: { name: 'Flat 4B' } })
    const member = await call<Member>('POST', `/api/homes/${home.body.id}/members`, {
      body: { name: 'Asha' },
    })
    await call('POST', `/api/homes/${home.body.id}/bills`, {
      body: { title: 'Internet', totalCents: 5000, memberId: member.body.id },
    })

    const removedMember = await remove(`/api/homes/${home.body.id}/members/${member.body.id}`)
    expect(removedMember.status).toBe(200)
    expect(removedMember.body).toMatchObject({ deleted: true, id: member.body.id })

    const bills = await call<{ bills: { shares: unknown[] }[] }>(
      'GET',
      `/api/homes/${home.body.id}/bills`,
    )
    expect(bills.body.bills).toEqual([])

    const removedHome = await remove(`/api/homes/${home.body.id}`)
    expect(removedHome.status).toBe(200)
    expect((await call('GET', `/api/homes/${home.body.id}`)).status).toBe(404)
  })

  it('keeps other members’ portions and recalculates bill totals after deletion', async () => {
    const home = await call<{ id: string }>('POST', '/api/homes', { body: { name: 'Flat 4B' } })
    const asha = await call<Member>('POST', `/api/homes/${home.body.id}/members`, {
      body: { name: 'Asha' },
    })
    const ben = await call<Member>('POST', `/api/homes/${home.body.id}/members`, {
      body: { name: 'Ben' },
    })
    const groceries = await call<{
      id: string
      shares: { id: string }[]
    }>('POST', `/api/homes/${home.body.id}/bills`, {
      body: { title: 'Groceries', totalCents: 77000, memberId: asha.body.id },
    })
    const ashaShareId = groceries.body.shares[0]?.id
    if (!ashaShareId) throw new Error('Groceries bill has no share')
    await env.DB.prepare('UPDATE shares SET amount_cents = ? WHERE id = ?')
      .bind(70000, ashaShareId)
      .run()
    await env.DB.prepare(
      'INSERT INTO shares (id, bill_id, member_id, home_id, amount_cents) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(crypto.randomUUID(), groceries.body.id, ben.body.id, home.body.id, 7000)
      .run()
    await call('POST', `/api/homes/${home.body.id}/bills`, {
      body: { title: 'Internet', totalCents: 5000, memberId: ben.body.id },
    })

    await remove(`/api/homes/${home.body.id}/members/${asha.body.id}`)

    const bills = await call<{ bills: { title: string; totalCents: number; shares: unknown[] }[] }>(
      'GET',
      `/api/homes/${home.body.id}/bills`,
    )
    expect(bills.body.bills).toHaveLength(2)
    expect(bills.body.bills).toContainEqual(
      expect.objectContaining({
        title: 'Internet',
        totalCents: 5000,
        shares: expect.arrayContaining([
          expect.objectContaining({ memberId: ben.body.id, amountCents: 5000, paidAt: null }),
        ]),
      }),
    )
    expect(bills.body.bills).toContainEqual(
      expect.objectContaining({
        title: 'Groceries',
        totalCents: 7000,
        shares: expect.arrayContaining([
          expect.objectContaining({ memberId: ben.body.id, amountCents: 7000, paidAt: null }),
        ]),
      }),
    )
    expect(bills.body.bills.reduce((total, bill) => total + bill.totalCents, 0)).toBe(12000)
  })

  it('deletes only the selected member and their assigned bill', async () => {
    const home = await call<{ id: string }>('POST', '/api/homes', { body: { name: 'Flat 4B' } })
    const members: Member[] = []
    for (const name of ['Asha', 'Ben', 'Chitra']) {
      const result = await call<Member>('POST', `/api/homes/${home.body.id}/members`, {
        body: { name },
      })
      members.push(result.body)
    }

    for (const [index, member] of members.entries()) {
      await call('POST', `/api/homes/${home.body.id}/bills`, {
        body: {
          title: `${member.name} groceries`,
          totalCents: (index + 1) * 1000,
          memberId: member.id,
        },
      })
    }

    const removedMember = members[2]
    if (!removedMember) throw new Error('Third member was not created')
    const removed = await remove(`/api/homes/${home.body.id}/members/${removedMember.id}`)
    expect(removed.status).toBe(200)

    const remainingMembers = await call<{ members: Member[] }>('GET', `/api/homes/${home.body.id}`)
    expect(remainingMembers.body.members.map((member) => member.name)).toEqual(['Asha', 'Ben'])

    const bills = await call<{
      bills: { title: string; totalCents: number; shares: { memberId: string }[] }[]
    }>('GET', `/api/homes/${home.body.id}/bills`)
    expect(bills.body.bills).toHaveLength(2)
    expect(bills.body.bills.map((bill) => bill.title).sort()).toEqual([
      'Asha groceries',
      'Ben groceries',
    ])
    expect(bills.body.bills.reduce((total, bill) => total + bill.totalCents, 0)).toBe(3000)
    expect(
      bills.body.bills.flatMap((bill) => bill.shares.map((share) => share.memberId)).sort(),
    ).toEqual([members[0]?.id, members[1]?.id].sort())
  })

  it('returns 404 when the member does not exist in the home', async () => {
    const home = await call<{ id: string }>('POST', '/api/homes', { body: { name: 'Flat 4B' } })
    const response = await remove(`/api/homes/${home.body.id}/members/not-a-member`)
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Member not found' })
  })
})
