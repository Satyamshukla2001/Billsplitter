import { env } from 'cloudflare:test'
import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { call } from './helpers'

describe('home access control', () => {
  it('fails closed for non-local requests when Cloudflare Access is not configured', async () => {
    const response = await exports.default.fetch(new Request('https://api.example.com/api/health'))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'API access is not configured' })
  })

  it('limits home data and mutations to the owning identity', async () => {
    const homeId = crypto.randomUUID()
    const memberId = crypto.randomUUID()
    const billId = crypto.randomUUID()
    const shareId = crypto.randomUUID()
    await env.DB.batch([
      env.DB.prepare('INSERT INTO homes (id, name, owner_email) VALUES (?, ?, ?)').bind(
        homeId,
        'Private home',
        'owner@example.com',
      ),
      env.DB.prepare('INSERT INTO members (id, home_id, name) VALUES (?, ?, ?)').bind(
        memberId,
        homeId,
        'Private member',
      ),
      env.DB.prepare(
        'INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)',
      ).bind(billId, homeId, 'Private bill', 100),
      env.DB.prepare(
        'INSERT INTO shares (id, bill_id, member_id, home_id, amount_cents) VALUES (?, ?, ?, ?, ?)',
      ).bind(shareId, billId, memberId, homeId, 100),
    ])

    const listedHomes = await call<{ homes: { id: string }[] }>('GET', '/api/homes')
    expect(listedHomes.body.homes.some((home) => home.id === homeId)).toBe(false)

    const paths = [
      `/api/homes/${homeId}`,
      `/api/homes/${homeId}/bills`,
      `/api/homes/${homeId}/balances`,
    ]
    for (const path of paths) {
      expect((await call('GET', path)).status).toBe(404)
    }

    expect(
      (
        await call('POST', `/api/homes/${homeId}/members`, {
          body: { name: 'Unauthorized member' },
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await call('POST', `/api/homes/${homeId}/bills`, {
          body: { title: 'Unauthorized bill', totalCents: 100 },
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await call('POST', `/api/bills/${billId}/shares/${shareId}/pay`, {
          headers: { 'Idempotency-Key': 'unauthorized' },
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await exports.default.fetch(
          new Request(`http://localhost/api/homes/${homeId}/members/${memberId}`, {
            method: 'DELETE',
          }),
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await exports.default.fetch(
          new Request(`http://localhost/api/homes/${homeId}`, { method: 'DELETE' }),
        )
      ).status,
    ).toBe(404)
  })
})
