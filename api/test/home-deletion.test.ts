import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { call, type Member } from './helpers'

async function remove(path: string) {
  const response = await exports.default.fetch(
    new Request(`http://localhost${path}`, { method: 'DELETE' }),
  )
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe('home and member deletion', () => {
  it('deletes a member and their shares, then deletes the home', async () => {
    const home = await call<{ id: string }>('POST', '/api/homes', { body: { name: 'Flat 4B' } })
    const member = await call<Member>('POST', `/api/homes/${home.body.id}/members`, {
      body: { name: 'Asha' },
    })
    await call('POST', `/api/homes/${home.body.id}/bills`, {
      body: { title: 'Internet', totalCents: 5000 },
    })

    const removedMember = await remove(`/api/homes/${home.body.id}/members/${member.body.id}`)
    expect(removedMember.status).toBe(200)
    expect(removedMember.body).toMatchObject({ deleted: true, id: member.body.id })

    const bills = await call<{ bills: { shares: unknown[] }[] }>(
      'GET',
      `/api/homes/${home.body.id}/bills`,
    )
    expect(bills.body.bills[0]?.shares).toEqual([])

    const removedHome = await remove(`/api/homes/${home.body.id}`)
    expect(removedHome.status).toBe(200)
    expect((await call('GET', `/api/homes/${home.body.id}`)).status).toBe(404)
  })

  it('returns 404 when the member does not exist in the home', async () => {
    const home = await call<{ id: string }>('POST', '/api/homes', { body: { name: 'Flat 4B' } })
    const response = await remove(`/api/homes/${home.body.id}/members/not-a-member`)
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Member not found' })
  })
})
